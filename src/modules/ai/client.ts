import { PreferenceManager } from "../../core/preferences";
import { AIProviderConfig } from "../../types/zotero";

export interface ChatMessagePayload {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AIClient {
  static async chat(
    messages: ChatMessagePayload[],
    options?: {
      provider?: AIProviderConfig;
      temperature?: number;
      onChunk?: (delta: string, accumulated: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    const config = options?.provider || PreferenceManager.getActiveAIConfig();
    if (!config || !config.apiKey) {
      throw new Error(`[PaperPilot] 未配置 ${config?.name || "AI"} 的 API Key，请在插件设置中填写。`);
    }

    // Sanitize base URL (ensure no trailing slash)
    const cleanBaseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.customHeaders || {}),
    };

    const isStream = typeof options?.onChunk === "function";

    const body = {
      model: config.model,
      messages,
      temperature: options?.temperature ?? config.temperature ?? 0.3,
      stream: isStream,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`[${config.name}] API 请求失败 (HTTP ${response.status}): ${errorText || response.statusText}`);
    }

    if (!isStream || !response.body) {
      const json = await response.json();
      return json.choices?.[0]?.message?.content || "";
    }

    // Handle Streaming Response (SSE)
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulated = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.slice(5).trim();

        if (dataStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            accumulated += delta;
            options?.onChunk?.(delta, accumulated);
          }
        } catch {
          // Ignore partial or non-json SSE lines
        }
      }
    }

    return accumulated;
  }
}
