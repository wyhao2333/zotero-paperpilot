import { AIClient } from "./client";

export interface PaperMetadata {
  title: string;
  authors: string;
  year?: string | number;
  publication?: string;
  abstract?: string;
}

export class PaperDigestService {
  static async generateDigest(
    metadata: PaperMetadata,
    onChunk?: (delta: string, accumulated: string) => void
  ): Promise<string> {
    const systemPrompt = `你是一位世界级学术审稿专家。请为这篇学术论文生成一份高质量、结构严谨的【PaperPilot 精读速读报告】。
必须采用 Markdown 格式，包含以下清晰模块：

### 📌 1. 研究痛点与核心动机 (Problem & Motivation)
- 该领域目前存在哪些未解决的关键瓶颈或科学争论？
- 本文试图回答的根本科学/工程问题是什么？

### 🚀 2. 核心创新与方法论 (Key Methodology & Innovation)
- 本文提出了什么新理论、新算法、新模型或新材料/实验设计？
- 其技术路线相较于前人工作的本质突破点何在？

### 📊 3. 关键实验结论与证据支撑 (Key Findings & Evidence)
- 核心实验/实证结果如何？关键数据指标是否显著支撑了作者论点？

### ⚠️ 4. 潜在局限与未来启发 (Limitations & Future Work)
- 本文在假设、样本量、泛化性或工程实现上存在哪些边界或妥协？
- 对后续研究有何直接启发？`;

    const userContent = `论文标题：${metadata.title}
作者：${metadata.authors}
发表年份/期刊：${metadata.year || "未知"} ${metadata.publication || ""}
论文摘要：
${metadata.abstract || "（暂未提取到摘要文本，请根据标题与上下文进行解析）"}`;

    return await AIClient.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { onChunk }
    );
  }
}
