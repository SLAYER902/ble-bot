export type AITextRequest = Readonly<{
  prompt: string;
  maxOutputTokens: number;
  systemInstruction: string;
}>;
export type AITextResponse = Readonly<{
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}>;
export type AISummaryRequest = Readonly<{ content: string; maxOutputTokens: number }>;
export type AISummaryResponse = Readonly<{ text: string }>;
export type AIHealthStatus = Readonly<{ ready: boolean; detail: string }>;

export interface AIProvider {
  generateText(input: AITextRequest): Promise<AITextResponse>;
  summarize(input: AISummaryRequest): Promise<AISummaryResponse>;
  healthCheck(): Promise<AIHealthStatus>;
}
