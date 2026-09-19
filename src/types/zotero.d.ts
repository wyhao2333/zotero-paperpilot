/**
 * Zotero 7-10 Environment Type Definitions
 */

declare const Zotero: any;
declare const ChromeUtils: any;
declare const Services: any;
declare const window: any;
declare const document: any;
declare const dump: (msg: string) => void;

export interface TranslationResult {
  text: string;
  sourceText: string;
  service: string;
  fromLang?: string;
  toLang: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  domain?: string;
  selectedQuote?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  lastUpdated: number;
  messages: ChatMessage[];
}

export interface PDFChatHistory {
  schemaVersion: number;
  storageKey: string;
  attachmentID?: number;
  itemKey?: string;
  title: string;
  activeSessionId: string;
  sessions: ChatSession[];
  lastUpdated: number;
}

export interface PaperHistory {
  itemKey: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: number;
}

export type DomainType = "general" | "cs_ai" | "med_bio" | "econ_social" | "engineering" | "custom";

export interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  customHeaders?: Record<string, string>;
}
