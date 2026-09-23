export function validateUsername(value) {
  const normalized = String(value || '').normalize('NFKC');
  if (!normalized || normalized !== normalized.trim()) return 'Do not start or end with a space.';

  const parts = normalized.split(' ');
  if (parts.length > 2 || parts.some(part => !part)) return 'Use no spaces, or one before an emoji.';
  if (Array.from(parts[0]).length < 3) return 'Use at least 3 characters.';

  if (parts[1]) {
    const hasEmoji = /\p{Extended_Pictographic}/u.test(parts[1]);
    const invalid = /[^\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/u.test(parts[1]);
    if (!hasEmoji || invalid) return 'After the space, use emoji only.';
  }

  if (Array.from(normalized).length > 80) return 'Username is too long.';
  return null;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function normalizeMessage(value, limit = 4000) {
  return String(value || '').normalize('NFKC').trim().slice(0, limit);
}

export function validateModerationMinutes(value) {
  if (value == null || value === '') return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 43_200 ? minutes : null;
}
