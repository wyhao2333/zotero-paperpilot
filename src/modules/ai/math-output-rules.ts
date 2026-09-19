/**
 * PaperPilot Shared Math Output Specification for AI Prompts.
 * Enforces standard LaTeX delimiters ($...$ and $$...$$) across all model generation paths.
 */
export const MATH_OUTPUT_RULES = `
【数学公式与变量输出规范】:
1. 凡是涉及变量、向量、矩阵、上下标、求和、积分、期望、概率、集合或数学方程式，必须使用标准 LaTeX 数学定界符排版：
   - 行内数学公式统一使用 $...$（例如 $x_k \\in \\mathbb{R}^n$、$Q_k = \\mathbb{E}[w_k w_k^T]$）
   - 独立块公式统一使用 $$...$$（例如 $$x_{k+1} = A_k x_k + B_k u_k + w_k$$）
2. 严禁以纯文本形式裸写需要数学排版的符号或表达式（如禁止裸写 x_k、R^n、E[w_k w_k^T]、P_{k|k-1}）。
3. 严禁将数学公式放入普通代码块 (\`\`\` 或 \`\`\`latex)。仅真正的编程代码（Python/C++等）才允许使用代码块。
`.trim();
