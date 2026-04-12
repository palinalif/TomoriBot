/**
 * Split a stored prompt string into fixed-size modal text input parts.
 */
export function splitPromptIntoModalParts(
  prompt: string | null | undefined,
  partCount: number,
  partMaxLength: number,
): string[] {
  const promptValue = prompt ?? "";

  return Array.from({ length: partCount }, (_, index) =>
    promptValue.slice(index * partMaxLength, (index + 1) * partMaxLength),
  );
}

/**
 * Recombine modal prompt parts while preserving overflow continuations.
 * If a part was not filled to the modal limit, moving to the next field is
 * treated as an intentional section break unless the user already supplied
 * leading/trailing whitespace between the two parts.
 */
export function combineModalPromptParts(parts: readonly string[], partMaxLength: number, separator = "\n\n"): string {
  let combined = "";
  let previousNonEmptyPart = "";
  let previousNonEmptyIndex = -1;

  for (const [index, part] of parts.entries()) {
    if (part.length === 0) {
      continue;
    }

    if (previousNonEmptyIndex === -1) {
      combined = part;
      previousNonEmptyPart = part;
      previousNonEmptyIndex = index;
      continue;
    }

    const hasGapBetweenParts = index - previousNonEmptyIndex > 1;
    const shouldInsertSeparator =
      hasGapBetweenParts ||
      (previousNonEmptyPart.length < partMaxLength && !/\s$/.test(previousNonEmptyPart) && !/^\s/.test(part));

    combined += shouldInsertSeparator ? `${separator}${part}` : part;
    previousNonEmptyPart = part;
    previousNonEmptyIndex = index;
  }

  return combined.trim();
}
