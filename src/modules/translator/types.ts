export interface TranslateOptions {
  from?: string;
  to: string;
  context?: string;
  attachmentID?: number;
  onProgress?: (msg: string, partialText?: string) => void;
}

export interface ITranslatorService {
  id: string;
  name: string;
  translate(text: string, options: TranslateOptions): Promise<string>;
}
