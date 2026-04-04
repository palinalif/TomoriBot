import type { TomoriState } from "@/types/db/schema";

export function resolveEffectiveOpenRouterModelCodename(tomoriState: TomoriState): string {
  if (tomoriState.llm.llm_provider !== "openrouter") {
    return tomoriState.llm.llm_codename;
  }

  if (tomoriState.llm.llm_codename === "other-model" && tomoriState.config.other_model_codename) {
    return tomoriState.config.other_model_codename;
  }

  return tomoriState.llm.llm_codename;
}

export function isOpenRouterGeminiModelCodename(modelCodename: string): boolean {
  return modelCodename.toLowerCase().startsWith("google/gemini");
}

export function resolveEffectiveOpenRouterSeesYouTube(tomoriState: TomoriState): boolean {
  if (tomoriState.llm.llm_provider !== "openrouter") {
    return tomoriState.llm.sees_youtube;
  }

  if (tomoriState.llm.sees_youtube) {
    return true;
  }

  return isOpenRouterGeminiModelCodename(resolveEffectiveOpenRouterModelCodename(tomoriState));
}
