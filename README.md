# PaperPilot (Zotero 7–10 伴读插件)

> 🚀 **PaperPilot (文献领航员)** —— 极简、高效、专注的 Zotero 7–10 原生学术阅读助手。  
> 融合 **划词翻译**、**多领域专业 AI 解读与提问**、**全文精读与会话持久化**，彻底摒弃商业插件的臃肿设计。

---

## 🌟 核心特性 (Features)

### 1. 划词多引擎翻译 (Selection Translation)
* **免配置免费源**：开箱即用集成 **Google GTX 免费轻量接口** 与 **Bing 翻译**，零配置、零门槛、毫秒级响应。
* **高质量 AI 学术翻译**：支持接入大模型进行学术直译与润色，保持术语规范与论文式表达。
* **选词智能清洗**：自动剔除 PDF 常见的跨行连字符（如 `trans- lation` $\to$ `translation`）与异常换行符。
* **灵活触发模式**：支持划词自动翻译（可开启/关闭）或点击浮动菜单即时弹出翻译卡片。

### 2. 划词深度解读与一键提问 (Domain-Specific Interpretation & QA)
* **划词浮动菜单**：划选 PDF 文本后即刻在选区上方呈现 `[🌐 翻译]` `[💡 解读]` `[❓ 提问]` 微型操作栏。
* **5 大预置领域学术 Prompt（可自由切换）**：
  * 🌐 **通用学术 (General)**：面向跨学科阅读，重点剖析语句学术主干、论证逻辑与核心概念。
  * 💻 **计算机与人工智能 (CS/AI)**：重点拆解算法原理、数学符号含义、模型架构设计与工程瓶颈。
  * 🧬 **医学与生物生命科学 (Med/Bio)**：重点梳理分子靶点、生化反应通路、实验对照设计与临床意义。
  * 📈 **经济金融与人文社科 (Econ/Social)**：重点解析理论假设、计量实证模型（DID/IV等）、因果推断与政策启示。
  * ⚙️ **工程与物理科学 (Engineering)**：重点拆解物理法则、控制方程、工况极限与工程实现。
  * 🛠️ **自定义领域模板**：可在设置中自定义个性化 Prompt 模板。
* **选段一键追问**：点击 `[❓ 提问]` 自动将选段带入上下文并引用，用户随时键入疑问直接与 AI 探讨。

### 3. 全文精读速读与多轮对话 (Full-text Copilot & Chat Persistence)
* **PDF 常驻侧边栏**：无缝内嵌于 Zotero 阅读器右侧边栏。
* **一键全文精读报告 (Paper Digest)**：自动提取当前论文元数据与核心文本，结构化提炼：
  * 📌 研究痛点与动机
  * 🚀 核心创新与方法论
  * 📊 关键实验结论与证据
  * ⚠️ 潜在局限与未来启发
* **论文维度会话持久化**：对话历史自动按文献 `item.key` 保存于本地，下次重开该 PDF 自动恢复历史问答！
* **一键导出为 Zotero 笔记**：一键将整场对话或精读卡片存为该文献的官方子笔记（Child Note）。

### 4. 广泛的 AI 模型与接口兼容性
* **全面支持国内/国际主流大模型**：
  * 🇨🇳 **智谱清言 (GLM)**：预置 `glm-4-flash` / `glm-4` 官方接口
  * 🇨🇳 **DeepSeek**：预置 `deepseek-chat` 官方极速接口
  * 🇨🇳 **月之暗面 (Moonshot / Kimi)**、**通义千问 (Qwen)**、**硅基流动 (SiliconFlow)**
  * 🌐 **OpenAI (ChatGPT)**：`gpt-4o-mini` / `gpt-4o`
  * 💻 **本地离线模型 (Ollama)**：支持本地无网络运行
  * 🛠️ **自定义 API 接口**：支持任意兼容 OpenAI 规范的中转网关、反向代理或企业内网端点。

---

## 🛠️ 构建与安装指南 (Build & Install)

### 1. 编译与打包
本项目基于现代 **TypeScript + esbuild** 构建：

```bash
# 1. 安装构建依赖
npm install

# 2. 编译并打包为 XPI 安装包
npm run build
```

构建成功后，将在 `build/` 目录下生成 `zotero-paperpilot.xpi` 文件。

### 2. 安装至 Zotero 10 / 7
1. 打开 Zotero 桌面端（已测试完美支持 Zotero 10.0.3 及 Zotero 7 全系列）。
2. 点击顶部菜单：**工具 (Tools)** $\to$ **附加组件 (Plugins / Add-ons)**。
3. 点击附加组件管理器右上角的 ⚙️ 齿轮图标，选择 **Install Add-on From File... (从文件安装附加组件)**。
4. 选择生成的 `build/zotero-paperpilot.xpi`，确认安装并重启 Zotero。
5. 打开任意 PDF 文献，即可在划选文本时体验浮动菜单，或在右侧边栏展开 **PaperPilot** 伴读面板！

---

## 📂 项目结构 (Directory Structure)

```text
zotero-paperpilot/
├── AGENT.md                        # 项目安全条例
├── manifest.json                   # Zotero 7–10 清单 (strict_max_version: 10.*)
├── bootstrap.js                    # 插件引导入口
├── package.json                    # 依赖清单
├── tsconfig.json                   # TypeScript 配置
├── esbuild.js                      # 构建与 XPI 打包脚本
├── addon/
│   ├── icon.svg                    # 矢量图标
│   └── style.css                   # 浮动条与侧边栏样式
├── src/
│   ├── index.ts                    # 插件入口与生命周期
│   ├── core/                       # 首选项、持久化存储、事件总线
│   ├── modules/
│   │   ├── translator/             # Google GTX、Bing、AI 翻译分发
│   │   ├── ai/                     # OpenAI 通用客户端、5大领域提示词、全文速读
│   │   ├── reader/                 # 划词选区文本清洗、浮动操作条
│   │   └── sidebar/                # 右侧边栏交互面板、多轮对话视图、笔记导出
│   └── types/                      # Zotero 类型声明
└── test/
    └── test-services.js            # 核心网络与服务验证脚本
```

---

## 📄 开源许可证
MIT License
