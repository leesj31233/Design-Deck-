/** Keep the embedded PDF face for Latin terms; supply Hangul in the same genre. */
export function paperFontStack(source: string) {
  const serif = /(?:^|[,\s])serif\b/i.test(source) || /times|roman|stix|georgia|cambria|palatino/i.test(source);
  const embedded = source.replace(/(?:,\s*)?(?:sans-serif|serif|monospace)\s*$/i, "").trim().replace(/,$/, "");
  const korean = serif ? '"Noto Serif KR", "Batang", "AppleMyungjo", serif' : '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  return embedded ? `${embedded}, ${korean}` : korean;
}

export function koreanFontStack(source: string) {
  return /(?:^|[,\s])serif\b/i.test(source) || /times|roman|stix|georgia|cambria|palatino/i.test(source)
    ? '"Noto Serif KR", "Batang", "AppleMyungjo", serif'
    : '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
}

// A PDF subset can have a zero-width space: use its face only for Latin glyphs.
export function paperFontRuns(text: string) {
  return (text.match(/[A-Za-z0-9][A-Za-z0-9.,%°ε_+−/\-]*|[^A-Za-z0-9]+/gu) ?? []).map(value => ({ text: value, latin: /^[A-Za-z0-9]/.test(value) }));
}
