type AttachmentFilenamePartOptions = {
	fallback?: string;
	maxLength?: number;
};

const NON_WORD_FILENAME_CHARS_REGEX = /[^\p{L}\p{M}\p{N}_-]+/gu;
const DUPLICATE_SEPARATOR_REGEX = /_+/g;
const LEADING_OR_TRAILING_SEPARATOR_REGEX = /^[_-]+|[_-]+$/g;
const RESERVED_FILENAME_CHARS = new Set(["<", ">", ":", "\"", "/", "\\", "|", "?", "*"]);

function replaceUnsafeFilenameChars(value: string): string {
	let sanitizedValue = "";

	for (const char of value) {
		const codePoint = char.codePointAt(0);
		if (
			codePoint === undefined ||
			codePoint <= 0x1f ||
			codePoint === 0x7f ||
			RESERVED_FILENAME_CHARS.has(char)
		) {
			sanitizedValue += " ";
			continue;
		}

		sanitizedValue += char;
	}

	return sanitizedValue;
}

function sanitizeFilenamePartValue(value: string, maxLength: number): string {
	return Array.from(
		replaceUnsafeFilenameChars(value)
			.normalize("NFKC")
			.trim()
			.replace(NON_WORD_FILENAME_CHARS_REGEX, "_")
			.replace(DUPLICATE_SEPARATOR_REGEX, "_")
			.replace(LEADING_OR_TRAILING_SEPARATOR_REGEX, ""),
	)
		.slice(0, maxLength)
		.join("");
}

export function sanitizeAttachmentFilenamePart(
	value: string,
	options?: AttachmentFilenamePartOptions,
): string {
	const maxLength = options?.maxLength ?? 50;
	const fallback = options?.fallback ?? "file";
	const sanitizedValue = sanitizeFilenamePartValue(value, maxLength);

	if (sanitizedValue.length > 0) {
		return sanitizedValue;
	}

	const sanitizedFallback = sanitizeFilenamePartValue(fallback, maxLength);
	return sanitizedFallback.length > 0 ? sanitizedFallback : "file";
}
