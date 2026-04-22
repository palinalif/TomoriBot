import { GoogleGenAI } from "@google/genai";
import { log } from "@/utils/misc/logger";

export function createVertexexpressClient(apiKey: string): GoogleGenAI {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error("Vertex AI Express API key is empty");
  }

  log.info("Creating Vertex AI Express client via API key");

  return new GoogleGenAI({
    vertexai: true,
    apiKey: trimmedApiKey,
  });
}
