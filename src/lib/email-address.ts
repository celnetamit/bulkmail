const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmailAddress(value: string) {
  const normalized = normalizeEmailAddress(value);
  return EMAIL_ADDRESS_REGEX.test(normalized);
}

