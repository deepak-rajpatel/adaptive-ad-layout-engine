/** "Edited 5 min ago" style label for saved-work timestamps. */
export function editedAgo(iso: string, now = Date.now()): string {
  const seconds = (now - Date.parse(iso)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "Edited just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Edited ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Edited yesterday";
  if (days < 7) return `Edited ${days} days ago`;
  return `Edited ${new Date(iso).toLocaleDateString()}`;
}
