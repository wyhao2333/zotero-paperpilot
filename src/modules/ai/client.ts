import { PreferenceManager } from "../../core/preferences";
import { AIProviderConfig } from "../../types/zotero";

export interface ChatMessagePayload {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AIRequestError extends Error {
  status?: number;
  retryable: boolean;

  constructor(message: string, status?: number, retryable?: boolean) {
    super(message);
    this.name = "AIRequestError";
    this.status = status;
    if (typeof retryable === "boolean") {
      this.retryable = retryable;
    } else if (typeof status === "number") {
      this.retryable = [429, 502, 503, 504].includes(status);
    } else {
      this.retryable = true;
    }
  }
}

export class AIClient {
  static async chat(
    messages: ChatMessagePayload[],
    options?: {
      provider?: AIProviderConfig;
      temperature?: number;
      onChunk?: (delta: string, accumulated: string) => void;
    }
  ): Promise<string> {
    const config = options?.provider || PreferenceManager.getActiveAIConfig();
    const isOllama = config?.id === "ollama";

    if (!config || (!config.apiKey && !isOllama)) {
      throw new AIRequestError(`[PaperPilot] 未配置 ${config?.name || "AI"} 的 API Key，请在插件设置中填写。`, 401, false);
    }

    // Sanitize base URL (ensure no trailing slash)
    const cleanBaseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...(config.customHeaders || {}),
    };

    const isStream = typeof options?.onChunk === "function";

    // Fallback / standard non-streaming caller via Zotero.HTTP.request
    const callNonStreaming = async (): Promise<string> => {
      const body = JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? config.temperature ?? 0.3,
        stream: false,
      });

      if (typeof Zotero !== "undefined" && Zotero.HTTP?.request) {
        let xhr: any;
        try {
          xhr = await Zotero.HTTP.request("POST", endpoint, {
            headers,
            body,
            responseType: "json",
            timeout: 60000,
          });
        } catch (netErr: any) {
          throw new AIRequestError(`[${config.name}] 网络请求异常: ${netErr?.message || netErr}`, undefined, true);
        }

        if (xhr && xhr.status >= 200 && xhr.status < 300) {
          const json = xhr.response || (xhr.responseText ? JSON.parse(xhr.responseText) : null);
          const content = json?.choices?.[0]?.message?.content || "";
          if (options?.onChunk && content) {
            options.onChunk(content, content);
          }
          return content;
        } else {
          const statusNum = typeof xhr?.status === "number" ? xhr.status : parseInt(xhr?.status, 10);
          const validStatus = isNaN(statusNum) ? undefined : statusNum;
          let errorMsg = `HTTP ${validStatus || "unknown"}`;
          try {
            const errJson = xhr?.response || (xhr?.responseText ? JSON.parse(xhr.responseText) : null);
            if (errJson?.error?.message) {
              errorMsg = errJson.error.message;
            } else if (xhr?.responseText) {
              errorMsg = xhr.responseText.slice(0, 200);
            }
          } catch (e) {}
          throw new AIRequestError(`[${config.name}] API 请求失败 (${errorMsg})`, validStatus);
        }
      } else {
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers,
            body,
          });
        } catch (netErr: any) {
          throw new AIRequestError(`[${config.name}] 网络请求异常: ${netErr?.message || netErr}`, undefined, true);
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          throw new AIRequestError(`[${config.name}] API 请求失败 (HTTP ${response.status}): ${errText.slice(0, 200)}`, response.status);
        }
        const json = await response.json();
        const content = json?.choices?.[0]?.message?.content || "";
        if (options?.onChunk && content) {
          options.onChunk(content, content);
        }
        return content;
      }
    };

    // Attempt streaming only if environment supports fetch, ReadableStream, and TextDecoder
    const canAttemptStream =
      isStream &&
      typeof fetch === "function" &&
      typeof TextDecoder !== "undefined";

    if (!canAttemptStream) {
      return await callNonStreaming();
    }

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let totalChars = 0;
    let receivedAnyDelta = false;

    dump("[PaperPilot AI] request started\n");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options?.temperature ?? config.temperature ?? 0.3,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AIRequestError(`[${config.name}] API 请求失败 (HTTP ${response.status}): ${errorText.slice(0, 200)}`, response.status);
      }

      if (!response.body || typeof (response.body as any).getReader !== "function") {
        // Fallback to non-streaming if ReadableStream getReader is unavailable
        dump("[PaperPilot] ReadableStream.getReader not available, falling back to non-streaming...\n");
        return await callNonStreaming();
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();

          if (dataStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content || "";
            if (delta) {
              if (!receivedAnyDelta) {
                receivedAnyDelta = true;
                firstTokenTime = Date.now();
                dump(`[PaperPilot AI] first token after ${firstTokenTime - startTime}ms\n`);
              }
              totalChars += delta.length;
              accumulated += delta;
              options?.onChunk?.(delta, accumulated);
            }
          } catch {
            // Ignore partial or non-json SSE lines
          }
        }
      }

      const totalTime = Date.now() - startTime;
      dump(`[PaperPilot AI] stream finished after ${totalTime}ms\n`);
      dump(`[PaperPilot AI] total chars=${totalChars}\n`);

      return accumulated;
    } catch (streamErr: any) {
      if (receivedAnyDelta) {
        dump(`[PaperPilot AI] Streaming interrupted after receiving ${totalChars} chars: ${streamErr.message || streamErr}\n`);
        throw new AIRequestError(`Streaming interrupted after receiving partial response: ${streamErr.message || streamErr}`, streamErr?.status, true);
      }
      dump(`[PaperPilot] Streaming failed before tokens: ${streamErr.message || streamErr}. Downgrading to non-streaming...\n`);
      return await callNonStreaming();
    }
  }
}
