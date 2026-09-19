import { AIClient } from "./client";
import { PaperContextService } from "../reader/paper-context";
import { PreferenceManager } from "../../core/preferences";

export interface DigestOptions {
  title: string;
  authors?: string;
  attachmentID?: number;
  concurrency?: number;
  onProgress?: (status: string) => void;
  onChunk?: (delta: string, accumulated: string) => void;
}

export class PaperDigestService {
  static async generateDigest(
    options: DigestOptions
  ): Promise<string> {
    const { title, authors = "未知作者", attachmentID, onProgress, onChunk } = options;

    let chunks: string[] = [];
    if (attachmentID) {
      if (onProgress) onProgress("正在从 PDF 提取全文文本...");
      chunks = await PaperContextService.getDigestContext(attachmentID);
    }

    const systemPrompt = `你是一位顶级学术审稿专家与导师。请为该学术论文生成一份高质量、真实严谨的【PaperPilot 全文精读速读报告】。
所有总结必须严格基于提供的论文实际内容，不臆造任何未提及的数据或结论。
报告采用 Markdown 格式，必须包含以下清晰规范的 9 大核心模块：

### 📌 1. 研究问题与核心动机 (Problem & Motivation)
- 该领域目前存在哪些未解决的关键科学/工程瓶颈或争议？
- 本文试图回答的根本问题是什么？

### 🚀 2. 理论模型与方法架构 (Methodology & Architecture)
- 本文提出了什么新算法、模型架构、理论框架或实验方案？
- 其技术路线相较于前人工作的本质突破点何在？

### 📐 3. 关键公式与数学/物理模型 (Key Formulas & Models)
- 提炼核心公式、目标函数或控制方程（若有），并简述物理/数学意义。

### 📊 4. 实验设计与数据支撑 (Experiments & Datasets)
- 采用的核心数据集、基准评测或实验平台是什么？

### 📈 5. 核心实验结论与指标 (Key Findings & Evidence)
- 核心指标表现如何？作者的主要定量/定性结论是什么？

### 💡 6. 本文核心创新点 (Novel Contributions)
- 总结 2-3 点最具代表性的贡献。

### ⚠️ 7. 潜在局限与边界条件 (Limitations & Constraints)
- 本文在理论假设、泛化性、计算开销或样本量上存在哪些局限？

### 🔗 8. 与前人/同类方法的关系与对比 (Relation to Prior Work)
- 本文与经典或同类竞争方法的主要差异是什么？

### ❓ 9. 值得进一步追问与研究的问题 (Key Questions for Discussion)
- 阅读本文后最值得向作者或领域学者深入探讨的 3 个高价值问题。`;

    // Case 1: No PDF text could be extracted
    if (!chunks || chunks.length === 0) {
      if (onProgress) onProgress("正在根据文献信息生成初步分析...");
      const fallbackPrompt = `论文标题：《${title}》\n作者：${authors}\n\n注意：当前未能在本地 PDF 中提取到纯文本（可能为未执行 OCR 的扫描件）。请基于标题与学术常识给出研究主题推断并提示用户补充上下文。`;
      return await AIClient.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: fallbackPrompt },
        ],
        { onChunk }
      );
    }

    // Case 2: Short / medium paper (<= 3 chunks, approx <= 6000 chars) -> Single comprehensive pass
    if (chunks.length <= 3) {
      if (onProgress) onProgress("正在综合分析论文全文...");
      const fullText = chunks.join("\n\n");
      const userContent = `论文标题：《${title}》\n作者：${authors}\n\n论文真实全文内容：\n\"\"\"\n${fullText}\n\"\"\"`;

      return await AIClient.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        { onChunk }
      );
    }

    // Case 3: Long paper -> Concurrent Map-Reduce multi-stage synthesis
    const prefs = PreferenceManager.get();
    const desiredConcurrency = options.concurrency || prefs.digestConcurrency || 3;
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

    if (onProgress) {
      onProgress(`全文共 ${chunks.length} 个片段 (划分为 ${totalParts} 部分)，启动并发精读 (并发度: ${concurrency})...`);
    }

    const partialSummaries: string[] = new Array(tasks.length);
    let completedCount = 0;

    const processTaskWithRetry = async (task: PartTask): Promise<void> => {
      const partPrompt = `请对以下论文片段（第 ${task.partIndex}/${task.totalParts} 部分）提取核心要点（研究动机、方法细节、公式、实验结果或结论）：\n\n"""\n${task.groupChunks.join("\n\n")}\n"""`;

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const partSummary = await AIClient.chat([
            {
              role: "system",
              content: "你是一位专业学术研究助手，请精炼提取所给论文选段中的关键技术细节、实验数据和方法论要点。",
            },
            { role: "user", content: partPrompt },
          ]);

          partialSummaries[task.partIndex - 1] = `【第 ${task.partIndex} 部分要点】:\n${partSummary}`;
          completedCount++;
          if (onProgress) {
            onProgress(`正在精读论文 (${completedCount}/${tasks.length} 部分完成，并发度: ${concurrency})...`);
          }
          return;
        } catch (err) {
          dump(`[PaperPilot Digest] Attempt ${attempt + 1} failed for part ${task.partIndex}: ${err}\n`);
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
          }
        }
      }

      partialSummaries[task.partIndex - 1] = `【第 ${task.partIndex} 部分要点】:\n(提炼网络超时，参考片段摘要: ${task.groupChunks[0]?.slice(0, 150)}...)`;
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

    // Final synthesis
    if (onProgress) onProgress("正在将各部分要点综合生成最终 9 大模块速读报告...");
    const synthesisUserContent = `论文标题：《${title}》\n作者：${authors}\n\n以下是从论文全文各章节提炼的核心要点：\n\n${partialSummaries.join(
      "\n\n"
    )}\n\n请严格基于上述要点，输出完整的 9 大模块【PaperPilot 全文精读速读报告】。`;

    return await AIClient.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: synthesisUserContent },
      ],
      { onChunk }
    );
  }
}
