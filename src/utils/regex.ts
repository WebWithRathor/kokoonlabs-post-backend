// Escape user input before putting it in a RegExp, so search text is
// matched literally and can't run a slow (ReDoS) or invalid pattern.
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive "contains" search on user input, capped in length.
export const searchRegex = (value: string, maxLength = 100): RegExp =>
  new RegExp(escapeRegex(String(value).slice(0, maxLength)), 'i');
