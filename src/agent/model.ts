import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { config } from "../config.js";

const google = createGoogleGenerativeAI({ apiKey: config.geminiKey });

export function languageModel(modelId: string) {
  return google(modelId);
}
