import type { WhitelistCheckResult } from "@/types/misc/channelWhitelist";
import { isPersonaAllowedByWhitelistStatus } from "@/utils/db/personaWhitelist";
import { isPersonaAllowedByPersonalSpotlight, type PersonalSpotlightStatus } from "@/utils/db/personalSpotlight";

export function isPersonaAllowedForTrigger(
  whitelistStatus: WhitelistCheckResult | null | undefined,
  spotlightStatus: PersonalSpotlightStatus | null | undefined,
  tomoriId: number | null | undefined,
): boolean {
  return (
    isPersonaAllowedByWhitelistStatus(whitelistStatus, tomoriId) &&
    isPersonaAllowedByPersonalSpotlight(spotlightStatus, tomoriId)
  );
}

export function filterPersonasForTrigger<T extends { tomori_id?: number | null | undefined }>(
  personas: readonly T[],
  whitelistStatus: WhitelistCheckResult | null | undefined,
  spotlightStatus: PersonalSpotlightStatus | null | undefined,
): T[] {
  return personas.filter((persona) => isPersonaAllowedForTrigger(whitelistStatus, spotlightStatus, persona.tomori_id));
}
