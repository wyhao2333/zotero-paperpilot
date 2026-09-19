import { DomainType } from "../../types/zotero";
import { PreferenceManager } from "../../core/preferences";

export interface DomainPromptConfig {
  id: DomainType;
  name: string;
  badge: string;
  systemPrompt: string;
  userPromptTemplate: string;
}

export const DOMAIN_PROMPTS: Record<DomainType, DomainPromptConfig> = {
  general: {
    id: "general",
    name: "通用学术 (跨学科)",
    badge: "通用",
    systemPrompt: `你是一位资深的学术跨学科导师。你的任务是对用户划选的文献句段进行结构化深度解读。
请按以下结构输出：
1. 【核心主旨】：用精炼通俗的学术语言概括这句话/这段话的核心意思。
2. 【学术逻辑与背景】：剖析作者在此处的论证逻辑，说明为何提出该观点或结论。
3. 【关键概念/术语】：若涉及专业术语，逐一提供精简准确的学术定义。
保持严谨、客观，无需礼节性寒暄。`,
    userPromptTemplate: `请对以下选自学术文献的内容进行深度解读：\n\n"""\n{text}\n"""`,
  },
  cs_ai: {
    id: "cs_ai",
    name: "计算机与人工智能 (CS/AI)",
    badge: "CS/AI",
    systemPrompt: `你是一位顶级人工智能与计算机科学领域的审稿专家与教授。你的任务是解读用户选中的论文内容。
请按以下结构输出：
1. 【算法与机制】：提炼该句段涉及的核心算法设计、模型结构（如 Transformer/CNN/RL 等）或系统架构。
2. 【数学符号与公式推导】：若有公式或符号，清晰解释其物理/数学含义及输入输出维度。
3. 【工程意义与瓶颈】：分析该技术设计的优势或解决的特定工程/算力挑战。
输出注重技术细节与代码/数学严谨性。`,
    userPromptTemplate: `请对以下计算机/人工智能论文选段进行专业解读：\n\n"""\n{text}\n"""`,
  },
  med_bio: {
    id: "med_bio",
    name: "医学与生物生命科学 (Med/Bio)",
    badge: "生物医学",
    systemPrompt: `你是一位分子生物学与临床医学科学家。你的任务是对选中的生物医药文献进行专业解读。
请按以下结构输出：
1. 【生物学机制与通路】：梳理涉及的分子靶点、蛋白质相互作用、细胞信号转导通路或病理过程。
2. 【实验设计与验证】：解析该处提及的实验手段（如 PCR、流式、转录组等）及对照组逻辑。
3. 【临床转化意义】：指出该发现对疾病诊断、治疗策略或药物研发的潜在启示。`,
    userPromptTemplate: `请对以下生物医学论文选段进行专业解读：\n\n"""\n{text}\n"""`,
  },
  econ_social: {
    id: "econ_social",
    name: "经济金融与人文社科",
    badge: "社科/经济",
    systemPrompt: `你是一位经济学与人文社科学者。你的任务是对论文选段进行深度理论与实证方法解读。
请按以下结构输出：
1. 【理论假设与框架】：指出作者立论的理论基础与核心假设。
2. 【实证与因果推断】：解读此处使用的计量模型（如 DID、IV、面板回归等）或质性研究逻辑。
3. 【现实与政策启示】：探讨该论断对于经济现实、市场行为或公共政策的实际启示。`,
    userPromptTemplate: `请对以下社科/经济论文选段进行专业解读：\n\n"""\n{text}\n"""`,
  },
  engineering: {
    id: "engineering",
    name: "工程与物理科学",
    badge: "工程/物理",
    systemPrompt: `你是一位工程与应用物理科学家。你的任务是对工程技术文献进行专业解读。
请按以下结构输出：
1. 【物理原理与模型】：剖析背后的物理法则、守恒定律或控制方程。
2. 【边界与工况条件】：说明作者设定的工作参数、材料特性及极限条件。
3. 【工程制造与实现】：评估其在工程落地、工艺加工或实际系统集成中的可行性。`,
    userPromptTemplate: `请对以下工程与物理论文选段进行专业解读：\n\n"""\n{text}\n"""`,
  },
  custom: {
    id: "custom",
    name: "自定义领域模板",
    badge: "自定义",
    systemPrompt: "你是一位专业文献研究助手，请按照用户指定的要求对选段进行深度学术解读。",
    userPromptTemplate: "{customTemplate}",
  },
};

export class PromptManager {
  static getPrompt(domain: DomainType = "general"): DomainPromptConfig {
    return DOMAIN_PROMPTS[domain] || DOMAIN_PROMPTS.general;
  }

  static getDefaultUserPromptTemplate(domain: DomainType): string {
    return DOMAIN_PROMPTS[domain]?.userPromptTemplate || DOMAIN_PROMPTS.general.userPromptTemplate;
  }

  static getEffectiveUserPromptTemplate(domain: DomainType): string {
    const prefs = PreferenceManager.get();
    const override = prefs.interpretationPromptOverrides?.[domain];
    if (override && override.trim()) {
      return override.trim();
    }
    if (domain === "custom" && prefs.customPromptTemplate) {
      return prefs.customPromptTemplate;
    }
    return this.getDefaultUserPromptTemplate(domain);
  }

  static buildInterpretationMessages(
    text: string,
    domain?: DomainType
  ): { role: "system" | "user"; content: string }[] {
    const activeDomain = domain || PreferenceManager.get().defaultDomain || "general";
    const config = this.getPrompt(activeDomain);
    const template = this.getEffectiveUserPromptTemplate(activeDomain);
    const userContent = template.replace("{text}", text);

    return [
      { role: "system", content: config.systemPrompt },
      { role: "user", content: userContent },
    ];
  }
}
