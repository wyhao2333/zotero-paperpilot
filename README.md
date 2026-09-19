# PaperPilot — Zotero 10 学术阅读辅助插件

PaperPilot 是一个面向 Zotero 10 的开源学术阅读辅助插件，提供划词翻译、AI 学术解读、选段提问、PDF 侧栏问答、全文精读和按 PDF 保存的多会话功能。

> 当前版本仅在 Zotero 10 环境中进行了实际测试。其他 Zotero 版本未验证。

PaperPilot 可以连接若干翻译服务和大模型接口，也支持配置兼容 OpenAI API 格式的自定义端点。实际可用性、响应速度和输出质量取决于所使用的服务、模型、网络环境以及 PDF 文本质量。

---

## 🌟 功能概述 (Features)

### 1. 划词翻译 (Selection Translation)
* **翻译服务选项**：提供 MyMemory、Google GTX、Bing、Youdao 等翻译选项，并支持使用已配置的大模型进行 AI 翻译。第三方免费翻译接口的可用性、限额和响应速度可能随服务商策略变化。
* **选词文本整理**：在翻译前自动清理 PDF 常见的跨行断字连字符（如 `trans- lation` $\to$ `translation`）与异常换行符。
* **上下文消歧**：AI 翻译模式下支持自动获取所在段落的局部上下文，辅助术语翻译消歧。
* **触发方式**：支持划词自动翻译（可按需开启或关闭），或通过划词后浮动的操作按钮点击触发。

### 2. 划词解读与选段提问 (Domain Interpretation & Contextual QA)
* **划词浮动菜单**：划选 PDF 文本后，在选区附近显示操作卡片，提供快捷触发选项。
* **领域 Prompt 预设**：内置 5 大学科领域解读模板，并支持在设置中自定义 Prompt 模板：
  * **通用学术 (General)**：梳理句段结构、论证逻辑与核心概念。
  * **计算机与人工智能 (CS/AI)**：拆解算法原理、数学符号、架构设计与工程约束。
  * **医学与生物生命科学 (Med/Bio)**：梳理分子靶点、通路机制、对照实验与临床意义。
  * **经济金融与人文社科 (Econ/Social)**：解析理论假设、实证计量模型、因果推断与结论启示。
  * **工程与物理科学 (Engineering)**：剖析控制方程、物理约束、边界条件与工程实现。
* **选段一键提问**：点击“提问”自动将选段作为引用带入侧边栏输入框。提问时会检索所选句段的临近原文段落，必要时结合全文相关信息供模型参考。

### 3. PDF 侧边栏伴读与多会话管理 (Reader Sidebar & Multi-Session)
* **Reader 原生面板**：作为 ItemPane 区域集成于 Zotero 10 阅读器右侧边栏。
* **按 PDF 隔离本地历史**：PaperPilot 会按 PDF 附件维度在本地保存独立会话历史，并支持一个 PDF 下创建多个会话。不同文献间互不干扰，数据保存在 Zotero 数据目录下的 PaperPilot 目录中。
* **多会话支持**：单个 PDF 下支持创建多个独立对话会话，支持新建、切换、重命名、删除及清空当前会话。
* **导出文献笔记**：支持将当前会话的问答记录导出为 Zotero 原生文献笔记。

### 4. 全文精读报告 (Paper Digest)
* **结构化梳理**：对 PDF 文本进行结构化提炼，尝试归纳研究动机、核心方法、实验结论与潜在局限。
* **自适应分析策略**：
  * **Auto（自适应）**：根据论文文本量自动选择合适策略。
  * **Single-Pass（单次直出）**：单次请求模型输出完整精读报告。
  * **Map-Reduce（并发分段）**：针对长篇论文分章节并发提炼后汇总。
* Auto 模式下，全文精读会根据 PDF 文本长度选择单次全文分析或分段汇总策略；用户也可以在设置中手动指定 Single-Pass 或 Map-Reduce。较长论文可能需要更多时间，并可能受到模型上下文长度、API 限流和网络状况影响。

### 5. 数学公式渲染 (Math Rendering)
* **侧边栏公式排版**：PaperPilot 会尝试识别并渲染 AI 回答中的常见 Markdown / LaTeX 数学表达（通过 KaTeX 输出 MathML），便于阅读数理与算法推导。
* **笔记数学兼容**：导出到 Zotero 笔记时，使用 Zotero Note 支持的富文本数学节点格式。

### 6. AI 服务配置 (AI Providers)
内置若干常见服务的配置预设：
* 智谱 GLM (`glm-4-flash`, `glm-4` 等)
* DeepSeek (`deepseek-chat` 等)
* OpenAI (`gpt-4o-mini`, `gpt-4o` 等)
* Moonshot / Kimi
* 通义千问 (Qwen)
* 硅基流动 (SiliconFlow)
* Ollama（本地模型端点）
* 自定义接口 (Custom Endpoint)：兼容 OpenAI API 请求格式的自定义端点。

> 具体模型名称、API 格式和可用性可能随服务商调整。自定义 Endpoint 是否兼容取决于其接口是否与 PaperPilot 当前请求格式匹配。

---

## 🔒 数据与隐私 (Data & Privacy)

* **API Key 存储**：API Key 由用户自行配置，并保存在本机 Zotero 首选项中。PaperPilot 不会在源码或发布包中内置用户 API Key；当前版本未对 Zotero 首选项中的 API Key 增加独立加密层。
* **第三方接口数据传输**：使用在线 AI 服务时，相关文本会发送至用户配置的 AI Provider。翻译功能包含自动回退机制，当首选翻译服务请求失败时，选中文本可能继续发送至回退链中的其他翻译服务（例如 MyMemory 或 Google）。
* **全文精读传输范围**：在全文精读模式下，可能会将较大篇幅或全部已提取文本发送至用户配置的 AI Provider。
* **敏感数据提示**：处理敏感、未公开或涉密文献时，请根据所在机构的数据安全政策决定是否启用在线 AI 或翻译服务。

---

## ⚠️ 当前限制 (Limitations)

1. **测试范围**：当前版本仅在 Zotero 10 环境中进行了实际测试。
2. **扫描版 PDF 限制**：扫描版或未做 OCR 的 PDF 因缺少可提取的文本层，划词与全文提取功能可能受限；建议先完成文本识别。
3. **AI 生成内容的不确定性**：模型输出的分析、公式推导或解读可能存在偏差或幻觉，关键学术结论请以原文核对为准。
4. **外部服务变动**：第三方免费翻译接口或商业 AI API 可能存在临时限流、格式调整或模型弃用。
5. **分段汇总的信息损耗**：对于超长论文采用 Map-Reduce 分段汇总时，细节保留程度与提取质量受模型上下文理解能力影响。
6. **数学渲染覆盖面**：数学渲染主要覆盖常见的 Markdown/LaTeX 表达形式，无法保证识别所有模型非规范输出。
7. **窄侧栏显示**：在较窄的 Zotero Reader 右侧栏中，全文精读中的复杂列表、长公式或表格可能需要适当加宽侧栏或使用内容区域的局部横向滚动查看。

---

## 📥 安装指南 (Installation)

### 方式一：通过 GitHub Release 安装（推荐）
1. 前往 [GitHub Releases](https://github.com/wyhao2333/zotero-paperpilot/releases) 页面。
2. 下载最新发布的 `paperpilot-1.0.1.xpi` 安装包。
3. 打开 Zotero 10 客户端。
4. 点击顶部菜单：**工具 (Tools)** $\to$ **插件 (Add-ons)**。
5. 点击插件管理窗口右上角的齿轮图标 ⚙️，选择 **Install Add-on From File...**。
6. 选择下载的 `paperpilot-1.0.1.xpi`，确认安装后重启 Zotero。

### 方式二：从源码构建
需要 Node.js 环境：
```bash
# 1. 克隆代码仓库
git clone https://github.com/wyhao2333/zotero-paperpilot.git
cd zotero-paperpilot

# 2. 安装依赖
npm install

# 3. 编译并打包
npm run build
```
构建成功后，在 `build/` 目录下将生成 `zotero-paperpilot.xpi`。

---

## ⚙️ 设置说明 (Configuration)

PaperPilot 提供两处设置入口，设置内容自动双向同步：
* **全局首选项**：Zotero 顶部菜单 **编辑 (Edit)** $\to$ **设置 (Settings)** $\to$ **PaperPilot**。
* **侧边栏快速设置**：PDF 阅读器右侧 PaperPilot 伴读面板中的 **⚙️ 设置** 标签页。

可配置项包括：
* **AI 服务商 (AI Provider)**：选择要使用的服务（智谱、DeepSeek、OpenAI 等）或自定义接口。
* **API Key / Base URL / Model**：配置对应提供商的访问凭证与模型代号。
* **翻译服务 (Translation Service)**：选择默认划词翻译引擎。
* **解读领域 (Domain)**：选择阅读文献时偏好的学术领域 Prompt。
* **全文精读策略与并发**：可指定 auto、single-pass 或 map-reduce 模式，并调整并发请求数与字符限制。
* **AI 翻译上下文**：开启后，大模型翻译将结合段落上下文进行消歧。

---

## 🔧 故障排查 (Troubleshooting)

### 1. AI 问答 / 解读提示错误
* 检查配置中的 **API Key** 是否有效，账户是否有可用余额或额度。
* 检查 **Base URL** 是否完整（如包含 `/v1` 路径）。
* 检查 **Model** 名称是否与服务商支持的代号一致。
* 检查本地网络是否能正常访问该 API 服务的网络端点。

### 2. 全文精读提示无法提取文本
* 检查当前文献是否为扫描图片生成的 PDF。此类文献需要先通过 OCR 工具生成文本层，Zotero 才能提取文本。

### 3. 免费翻译服务报错或无响应
* 第三方免费接口可能存在临时并发限制或 IP 限流。可在设置中切换到其他翻译引擎，或使用已配置的 AI 模型进行翻译。

### 4. 全文精读耗时较长
* 针对篇幅较长或文字量较大的论文，Map-Reduce 策略会并发分块调用模型，多次网络请求和生成过程会消耗更多时间。可在设置中按网络与接口限额适当调整并发度。

---

## 📄 开源许可证 (License)

本项目基于 [MIT License](LICENSE) 开源发布。
