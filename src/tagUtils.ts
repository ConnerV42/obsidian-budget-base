const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF]/g;
const WHITESPACE_RUN = /\s+/g;

export function normalizeTag(tag: string): string {
  const sanitized = tag
    .replace(INVISIBLE_CHARS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim();

  if (!sanitized) return 'Item';
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1).toLowerCase();
}

export function normalizeTagColorMap(
  tagColors: Record<string, string> | undefined
): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!tagColors) return normalized;

  for (const [tag, color] of Object.entries(tagColors)) {
    normalized[normalizeTag(tag)] = color;
  }

  return normalized;
}
