/**
 * Ensure every non-empty line starts with "- ".
 * @param {string} value
 */
export function formatDailyUpdateBullets(value) {
  if (!value) return "";
  return value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^[-*•]\s+/.test(trimmed)) {
        return `- ${trimmed.replace(/^[-*•]\s+/, "")}`;
      }
      if (/^[-*•]$/.test(trimmed)) return "- ";
      return `- ${trimmed}`;
    })
    .join("\n");
}
