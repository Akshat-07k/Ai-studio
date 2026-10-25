export interface ChatSettings {
  systemPrompt: string;
  temperature: number;
  topP: number;
  /** 0 = no limit */
  maxTokens: number;
  thinking: boolean;
}

export interface MessageStats {
  promptTokens: number;
  completionTokens: number;
  tokensPerSecond: number;
  promptPerSecond: number;
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  reasoning?: string;
  model?: string | null;
  stats?: MessageStats | null;
  finishReason?: string | null;
  stopped?: boolean;
  error?: string | null;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  settings: ChatSettings;
  messages: ChatMessage[];
}

/** Events streamed back while the model answers. */
export type ReplyEvent =
  | { type: 'user'; message: ChatMessage; chat: ChatSummary }
  | { type: 'status'; text: string }
  | { type: 'start'; messageId: string; model: string | null }
  | { type: 'reasoning'; delta: string }
  | { type: 'content'; delta: string }
  | { type: 'done'; message: ChatMessage; chat: ChatSummary }
  | { type: 'error'; error: string; status: number };
