/** A highlight on screen: its page, key and vertical position in viewport pixels. */
export interface ScreenMark { page: number; key: string; screenY: number }

/** Marks within this distance of the reading line count as "here", so pressing j again moves on. */
export const DEAD_ZONE = 6;

/** The nearest mark strictly below (1) or above (-1) the reading line, beyond the dead zone; null when there is none. */
export function nextMark(marks: ScreenMark[], line: number, direction: 1 | -1): ScreenMark | null {
  let best: ScreenMark | null = null;
  for (const mark of marks) {
    const distance = (mark.screenY - line) * direction;
    if (distance <= DEAD_ZONE) continue;
    if (!best || distance < (best.screenY - line) * direction) best = mark;
  }
  return best;
}
