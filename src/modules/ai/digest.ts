import { AIClient, AIRequestError } from "./client";
import { PaperContextService } from "../reader/paper-context";
import { PreferenceManager, DigestStrategyType } from "../../core/preferences";

export interface DigestOptions {
  title: string;
  authors?: string;
  attachmentID?: number;
  strategy?: DigestStrategyType;
  concurrency?: number;
  singlePassMaxChars?: number;
  onProgress?: (status: string) => void;
  onChunk?: (delta: string, accumulated: string) => void;
}

export class PaperDigestService {
  private static readonly SYSTEM_PROMPT = `你是一位顶级学术审稿专家与导师。请为该学术论文生成一份高质量、真实严谨的【PaperPilot 全文精读速读报告】。
所有总结必须严格基于提供的论文实际内容，严禁臆造任何未提及的数据、公式或结论。
报告采用 Markdown 格式，必须包含以下规范的 9 大核心模块：

### 📌 1. 研究问题与核心动机 (Problem & Motivation)
- 该领域目前存在哪些未解决的关键科学/工程瓶颈或争议？
- 本文试图回答的根本问题是什么？

### 🚀 2. 理论模型与方法架构 (Methodology & Architecture)
- 本文提出了什么新算法、模型架构、理论框架或实验方案？
- 其技术路线相较于前人工作的本质突破点何在？保留具体算法名称与关键步骤。

### 📐 3. 关键公式与数学/物理模型 (Key Formulas & Models)
- 提炼核心公式、目标函数或控制方程（若有），并简述物理/数学意义。
- 数学公式规范：行内公式统一使用 $...$，独立块公式统一使用 $$ ... $$。禁止将数学公式放入普通代码块。

### 📊 4. 实验设计与数据支撑 (Experiments & Datasets)
- 采用的核心数据集、实验基准评测或硬件/软件平台是什么？

### 📈 5. 核心实验结论与定量指标 (Key Findings & Evidence)
- 核心指标表现如何？作者的主要定量/定性结论是什么？请尽量列出具体数值或提升幅度。

### 💡 6. 本文核心创新点 (Novel Contributions)
- 总结 2-3 点最具代表性的学术/工程贡献。

### ⚠️ 7. 潜在局限与边界条件 (Limitations & Constraints)
- 本文在理论假设、泛化性、计算开销或样本量上存在哪些局限？

### 🔗 8. 与前人/同类方法的关系与对比 (Relation to Prior Work)
- 本文与经典或同类竞争方法的主要差异是什么？

### ❓ 9. 值得进一步追问与研究的问题 (Key Questions for Discussion)
- 阅读本文后最值得向作者或领域学者深入探讨的 3 个高价值问题。

格式排版要求：
1. 请勿在全文最外层包裹 markdown code fence (\`\`\`markdown ... \`\`\`)。
2. 保持论文原始技术名词与学术符号准确性。`;

  static async generateDigest(options: DigestOptions): Promise<string> {
    const globalStart = Date.now();
    const { title, authors = "未知作者", attachmentID, onProgress, onChunk } = options;

    const prefs = PreferenceManager.get();
    let text = "";
    let chunks: string[] = [];

    if (attachmentID) {
      if (onProgress) onProgress("正在从 PDF 提取全文文本...");
      const doc = await PaperContextService.getDocument(attachmentID);
      text = doc.text || "";
      chunks = doc.chunks || [];
    }

    const fullChars = text.length;

    // Determine strategy
    const requestedStrategy = options.strategy || prefs.digestStrategy || "auto";
    const maxSinglePass = options.singlePassMaxChars || prefs.digestSinglePassMaxChars || 48000;
    let actualStrategy: "single-pass" | "map-reduce" = "single-pass";

    if (requestedStrategy === "single-pass") {
      actualStrategy = "single-pass";
    } else if (requestedStrategy === "map-reduce") {
      actualStrategy = "map-reduce";
    } else {
      actualStrategy = fullChars <= maxSinglePass ? "single-pass" : "map-reduce";
    }

    dump(`[PaperPilot Digest] strategy=${actualStrategy}\n`);
    dump(`[PaperPilot Digest] fullChars=${fullChars}\n`);

    // Case 1: No PDF text extracted
    if (!text || fullChars === 0) {
      if (onProgress) onProgress("正在根据文献元数据生成初步分析...");
      const fallbackPrompt = `论文标题：《${title}》\n作者：${authors}\n\n注意：当前未能在本地 PDF 中提取到纯文本（可能为未执行 OCR 的扫描件）。请基于标题与学术常识给出研究主题推断并提示用户补充上下文。`;
      return await AIClient.chat(
        [
          { role: "system", content: this.SYSTEM_PROMPT },
          { role: "user", content: fallbackPrompt },
        ],
        { onChunk }
      );
    }

    // Case 2: Single Pass Digest
    if (actualStrategy === "single-pass") {
      if (onProgress) onProgress(`全文共 ${fullChars} 字符，采用 Single-Pass 全文精读模式...`);
      const userContent = `论文标题：《${title}》\n作者：${authors}\n\n【论文完整全文内容】:\n"""\n${text}\n"""\n\n请严格基于提供的论文全文，输出完整的 9 大模块【PaperPilot 全文精读速读报告】。`;

      const synthStart = Date.now();
      const result = await AIClient.chat(
        [
          { role: "system", content: this.SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        { onChunk }
      );
      const synthDuration = Date.now() - synthStart;
      const totalDuration = Date.now() - globalStart;
      dump(`[PaperPilot Digest] synthesis=${synthDuration}ms\n`);
      dump(`[PaperPilot Digest] total=${totalDuration}ms\n`);
      return result;
    }

    // Case 3: Concurrent Map-Reduce Digest
    const desiredConcurrency = options.concurrency || prefs.digestConcurrency || 4;
    const concurrency = Math.max(1, Math.min(10, desiredConcurrency));

    const groupSize = 3;
    interface PartTask {
      partIndex: number;
      totalParts: number;
      groupChunks: string[];
    }

    const tasks: PartTask[] = [];
    const totalParts = Math.ceil(chunks.length / groupSize);
    for (let i = 0; i < chunks.length; i += groupSize) {
      const groupChunks = chunks.slice(i, i + groupSize);
      const partIndex = Math.floor(i / groupSize) + 1;
      tasks.push({ partIndex, totalParts, groupChunks });
    }

    dump(`[PaperPilot Digest] tasks=${tasks.length}\n`);
    dump(`[PaperPilot Digest] concurrency=${concurrency}\n`);

    if (onProgress) {
      onProgress(`全文共 ${chunks.length} 个片段 (划分为 ${totalParts} 部分)，启动并发精读 (并发度: ${concurrency})...`);
    }

    const partialSummaries: string[] = new Array(tasks.length);
    let completedCount = 0;
    let failedCount = 0;
    const mapStageStart = Date.now();

    const isRetryableError = (err: any): boolean => {
      if (err instanceof AIRequestError) {
        if (err.status && [400, 401, 403].includes(err.status)) return false;
        return err.retryable;
      }
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes("401") || msg.includes("403") || msg.includes("api key") || msg.includes("未配置")) return false;
      return true;
    };

    const processTaskWithRetry = async (task: PartTask): Promise<void> => {
      const partStart = Date.now();
      const partPrompt = `请对以下论文选段（第 ${task.partIndex}/${task.totalParts} 部分）进行结构化核心要点提取。
必须严格遵循以下结构提取事实，若该部分未涉及某项，请明确注明 "NOT PRESENT"，严禁猜测：

- SECTION / TOPIC: 该片段涉及的章节或主题
- MOTIVATION: 该部分针对的问题或背景
- METHOD DETAILS: 涉及的方法、模型算法或实现细节
- FORMULAS: 关键数学公式或推导 (使用 $...$ 或 $$ ... $$)
- EXPERIMENT / DATASET: 实验平台、数据集或评估方法
- QUANTITATIVE RESULTS: 具体的量化指标、数据与实验结论
- CONTRIBUTIONS: 该部分提出的创新点或主要发现
- LIMITATIONS: 作者说明的局限或假设
- IMPORTANT TERMINOLOGY: 核心术语与定义

选段内容如下：
"""
${task.groupChunks.join("\n\n")}
"""`;

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const partSummary = await AIClient.chat([
            {
              role: "system",
              content: "你是一位专业学术审稿专家，请严格提取所给论文选段中的技术细节与事实，杜绝无根据臆造。",
            },
            { role: "user", content: partPrompt },
          ]);

          partialSummaries[task.partIndex - 1] = `【第 ${task.partIndex} 部分结构化要点】:\n${partSummary}`;
          completedCount++;
          const partDuration = Date.now() - partStart;
          dump(`[PaperPilot Digest] part=${task.partIndex} duration=${partDuration}ms\n`);
          if (onProgress) {
            onProgress(`正在精读论文 (${completedCount}/${tasks.length} 部分完成，并发度: ${concurrency})...`);
          }
          return;
        } catch (err: any) {
          dump(`[PaperPilot Digest] Attempt ${attempt + 1} failed for part ${task.partIndex}: ${err?.message || err}\n`);
          if (!isRetryableError(err)) {
            break;
          }
          if (attempt < 2) {
            const backoffMs = (attempt + 1) * 1000 + Math.floor(Math.random() * 200);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }

      // If task exhausted retries: use raw chunk excerpt as fallback (up to 5500 chars)
      failedCount++;
      const rawText = task.groupChunks.join("\n\n");
      const rawExcerpt = rawText.slice(0, 5500);
      partialSummaries[task.partIndex - 1] = `【第 ${task.partIndex} 部分 (RAW FALLBACK - 提炼网络超时，直接保留核心原文)】:\n"""\n${rawExcerpt}\n"""`;
      completedCount++;
      if (onProgress) {
        onProgress(`正在精读论文 (${completedCount}/${tasks.length} 部分完成，并发度: ${concurrency})...`);
      }
    };

    let taskCursor = 0;
    const worker = async () => {
      while (taskCursor < tasks.length) {
        const currentTask = tasks[taskCursor++];
        await processTaskWithRetry(currentTask);
      }
    };

    const workerCount = Math.min(concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    const mapStageDuration = Date.now() - mapStageStart;
    dump(`[PaperPilot Digest] mapStage=${mapStageDuration}ms\n`);

    // Guard: if failure ratio exceeds 20%, abort instead of generating fake report
    if (tasks.length > 0 && failedCount / tasks.length > 0.2) {
      throw new Error(`[PaperPilot Digest] 并发请求失败过多 (${failedCount}/${tasks.length} 部分超时)，建议在设置中降低并发度后重试。`);
    }

    // Prepare Anchor Context (First 1-2 chunks for Intro/Abstract, Last 1-2 chunks for Conclusion)
    const anchorHead = chunks.slice(0, 2).join("\n\n");
    const anchorTail = chunks.length > 2 ? chunks.slice(-2).join("\n\n") : "";

    const anchorContextBlock = `【论文开头锚点原文 (包含摘要与导论)】:\n"""\n${anchorHead}\n"""\n\n` +
      (anchorTail ? `【论文结尾锚点原文 (包含结论与讨论)】:\n"""\n${anchorTail}\n"""\n\n` : "");

    // Final synthesis
    if (onProgress) onProgress("正在将各部分结构化要点与锚点原文综合生成 9 大模块速读报告...");
    const synthStart = Date.now();

    const synthesisUserContent = `论文标题：《${title}》\n作者：${authors}\n\n` +
      anchorContextBlock +
      `【各章节提取的核心结构化要点汇总】:\n\n${partialSummaries.join("\n\n")}\n\n` +
      `请严格综合上述要点与锚点原文，输出完整规范的 9 大核心模块【PaperPilot 全文精读速读报告】。`;

    const finalReport = await AIClient.chat(
      [
        { role: "system", content: this.SYSTEM_PROMPT },
        { role: "user", content: synthesisUserContent },
      ],
      { onChunk }
    );

    const synthesisDuration = Date.now() - synthStart;
    const totalDuration = Date.now() - globalStart;
    dump(`[PaperPilot Digest] synthesis=${synthesisDuration}ms\n`);
    dump(`[PaperPilot Digest] total=${totalDuration}ms\n`);

    return finalReport;
  }
}
