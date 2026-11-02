/** "방금", "23분 전", "3시간 전", "어제", "3일 전", "2주 전", "한 달 전", "5개월 전", "1년 전" from an ISO time. */
export function relativeKo(iso: string | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "한 달 전" : `${months}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
