export interface TranslateOptions {
  from?: string;
  to: string;
}

export interface ITranslatorService {
  id: string;
  name: string;
  translate(text: string, options: TranslateOptions): Promise<string>;
}
