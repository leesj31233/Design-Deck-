/** Width of `text` at font-size 1 (em units). Must match the DOM with kerning disabled. */
export type Measure = (text: string, bold: boolean, sans?: boolean) => number;

export interface Token { text: string; bold: boolean; width: number }
export interface Run { text: string; bold: boolean }
export interface BrokenLine { runs: Run[]; text: string; natural: number; spaces: number; chars: number }

const HANGUL = /[가-힣]/;
const CAPTION_LABEL = /^((?:Fig(?:ure)?s?\.?|Table|Scheme|Chart)\s*[A-Z]?\d+[a-z]?(?:[.:|])?)/;

export function tokenize(text: string, measure: Measure, boldLabel = false): Token[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const label = boldLabel ? text.trim().match(CAPTION_LABEL)?.[1].split(" ").length ?? 0 : 0;
  return words.map((word, index) => ({ text: word, bold: index < label, width: measure(word, index < label) }));
}

/**
 * Greedy Korean-aware line feeder. English words and numbers never break.
 * A Hangul word may break between syllables (no hyphen, as Korean typesetting
 * does) only when the line would otherwise be visibly loose.
 */
export class LineFeeder {
  private index = 0;
  constructor(private tokens: Token[], private measure: Measure) {}
  get done() { return this.index >= this.tokens.length; }
  get remainingText() { return this.tokens.slice(this.index).map(token => token.text).join(" "); }

  next(available: number, size: number): BrokenLine {
    const space = this.measure(" ", false) * size;
    const taken: Token[] = [];
    let used = 0;
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index], width = token.width * size, add = (taken.length ? space : 0) + width;
      if (used + add <= available + .01) { taken.push(token); used += add; this.index++; continue; }
      const room = available - used - (taken.length ? space : 0);
      const loose = !taken.length || available - used > available * .04;
      if (loose && room > size * 1.4) {
        const split = this.split(token, room / size, !taken.length);
        if (split) { used += (taken.length ? space : 0) + split[0].width * size; taken.push(split[0]); this.tokens[this.index] = split[1]; break; }
      }
      if (!taken.length) {
        // A token wider than the whole line (URL, long formula): take it anyway rather than lose text.
        const forced = this.split(token, available / size, true);
        if (forced) { taken.push(forced[0]); used += forced[0].width * size; this.tokens[this.index] = forced[1]; }
        else { taken.push(token); used += width; this.index++; }
      }
      break;
    }
    const runs: Run[] = [];
    taken.forEach((token, offset) => {
      const text = (offset ? " " : "") + token.text, last = runs.at(-1);
      if (last && last.bold === token.bold) last.text += text; else runs.push({ text, bold: token.bold });
    });
    const text = runs.map(run => run.text).join("");
    return { runs, text, natural: used, spaces: Math.max(0, taken.length - 1), chars: [...text].length };
  }

  private split(token: Token, roomEm: number, force: boolean): [Token, Token] | null {
    const chars = [...token.text];
    for (let cut = chars.length - 1; cut >= 1; cut--) {
      if (!force) {
        if (cut < 2 || !HANGUL.test(chars[cut - 1]) || !HANGUL.test(chars[cut])) continue;
        if (chars.length - cut < 2 || cut < 2) continue;
      }
      const head = chars.slice(0, cut).join(""), width = this.measure(head, token.bold);
      if (width <= roomEm) {
        const tail = chars.slice(cut).join("");
        return [{ text: head, bold: token.bold, width }, { text: tail, bold: token.bold, width: this.measure(tail, token.bold) }];
      }
    }
    return null;
  }
}

/** Fill a non-final line edge to edge: word gaps first, then a little tracking. */
export function justify(line: BrokenLine, available: number, size: number, last: boolean) {
  const extra = available - line.natural;
  if (last || extra <= 0 && extra > -size * .05) return { wordSpacing: 0, letterSpacing: 0 };
  if (extra < 0) return { wordSpacing: line.spaces ? extra / line.spaces : 0, letterSpacing: line.spaces ? 0 : extra / Math.max(1, line.chars - 1) };
  const wordSpacing = line.spaces ? Math.min(extra / line.spaces, size * .3) : 0;
  const rest = extra - wordSpacing * line.spaces;
  const letterSpacing = rest > .01 && line.chars > 1 ? Math.min(rest / (line.chars - 1), size * .06) : 0;
  return { wordSpacing, letterSpacing };
}
