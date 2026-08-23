import { google } from "@ai-sdk/google";

export const MODELS = {
  cmo: "gemini-3.7-flash",
  brandAnalyst: "gemini-2.5-pro",
  copywriter: "gemini-3.6-flash",
  copywriterImage: "gemini-3.1-flash-image",
  analyst: "gemini-2.5-flash",
  judge: "gemini-2.5-pro",
} as const;

export const model = (id: string) => google(id);
