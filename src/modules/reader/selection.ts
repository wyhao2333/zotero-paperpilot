export class SelectionHelper {
  /**
   * Cleans text extracted from PDF:
   * 1. Fixes broken hyphens across lines (e.g. "trans- lation" -> "translation")
   * 2. Replaces newline characters with spaces
   * 3. Collapses multiple whitespace into single space
   */
  static cleanPdfText(rawText: string): string {
    if (!rawText) return "";

    return rawText
      // Join words broken by hyphenation at line end
      .replace(/(\w+)-\s*[\r\n]+\s*(\w+)/g, "$1$2")
      // Replace single newlines within sentences with spaces
      .replace(/[\r\n]+/g, " ")
      // Collapse multiple whitespace
      .replace(/\s{2,}/g, " ")
      .trim();
  }
}
