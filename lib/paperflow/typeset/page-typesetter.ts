import type { ManifestBlock, TranslationManifest, TranslationUnit } from "../translation/manifest";
import { LineFeeder, justify, tokenize, type Measure, type Run } from "./line-breaker";

export interface Rect { x: number; y: number; width: number; height: number }
export type FlowKind = "body" | "heading" | "caption" | "cell";
export interface SetLine {
  unitId: string; kind: FlowKind; x: number; y: number; width: number; fontSize: number; lineHeight: number;
  runs: Run[]; wordSpacing: number; letterSpacing: number; bold: boolean;
  /** Set in the sans face (the source heading was sans). */
  sans?: boolean;
}
/** A typeset page in PDF points (unscaled); the reader scales it with a CSS transform. */
export interface PageLayout {
  pageIndex: number; width: number; height: number;
  lines: SetLine[]; masks: Rect[];
  /** Units actually painted on this page, with the box of their source text. */
  units: { unitId: string; box: Rect; firstLine: { x: number; y: number } }[];
  /** Units that did not fit even at the smallest allowed size (reported, never hidden). */
  unfit: string[];
  bodyScale: number;
}

interface Paragraph {
  unitId: string; text: string; indent: number; startsUnit: boolean; endsUnit: boolean; gapBefore: number; runInEnd?: string;
  /** A list item set with a hanging indent ("(1) …" out, the rest in): its own first-line and body x in pt. */
  hang?: { first: number; body: number };
}
const LIST_MARKER = /^\s*(?:\(?\d{1,2}[).]|\(?[a-z][).]|\(?[ivx]{1,4}\)|[•●▪◦–-])\s/i;
interface Flow { kind: FlowKind; blocks: ManifestBlock[]; paragraphs: Paragraph[]; areas: Rect[]; obstacles: Rect[]; size: number; pitch: number; bold: boolean; sans?: boolean; /** White space below each area the ink probe cleared. */ extra: number[]; /** May use that white space (only when the source area alone cannot hold the text). */ extended: boolean }

// Korean is set at most at the source size (so pages look alike) and down to 80%; spare room becomes leading.
// Hangul reads larger than Latin at the same point size; .97 keeps the original's breathing room.
const SIZE_RANGE: Record<FlowKind, [number, number]> = { body: [.8, .97], heading: [.85, 1], caption: [.76, .97], cell: [.62, .95] };
const FALLBACK_MIN = .5;

/** Korean text that belongs to this page when one logical paragraph spans pages. */
export function unitTextForPage(unit: TranslationUnit, translated: string, pageIndex: number): string {
  if (unit.pages.length === 1) return translated;
  const total = Object.values(unit.pageChars).reduce((sum, value) => sum + value, 0) || 1;
  let before = 0;
  for (const page of [...unit.pages].sort((a, b) => a - b)) {
    if (page === pageIndex) break;
    before += unit.pageChars[page] ?? 0;
  }
  const start = cut(translated, before / total), end = cut(translated, (before + (unit.pageChars[pageIndex] ?? 0)) / total);
  return translated.slice(start, end).trim();
}

/** Proportional cut that prefers a sentence end, then a word gap. */
function cut(text: string, ratio: number) {
  if (ratio <= 0) return 0;
  if (ratio >= 1) return text.length;
  const target = Math.round(text.length * ratio), window = Math.max(12, Math.round(text.length * .08));
  let best = -1;
  for (const match of text.matchAll(/[.!?](?:["”’)\]])?\s/g)) {
    const at = match.index! + match[0].length;
    if (Math.abs(at - target) <= window && (best < 0 || Math.abs(at - target) < Math.abs(best - target))) best = at;
  }
  if (best >= 0) return best;
  for (let offset = 0; offset < text.length; offset++) {
    if (text[target + offset] === " ") return target + offset + 1;
    if (text[target - offset] === " ") return target - offset + 1;
  }
  return target;
}

function px(block: ManifestBlock, page: { width: number; height: number }) {
  return block.lines.map(line => ({ x: line.x * page.width, y: line.y * page.height, width: line.width * page.width, height: line.height * page.height }));
}

/** Text regions of a block: a paragraph that wraps a figure is not one rectangle. */
/** How a table cell sat in its box: centred cells (headers, short labels) stay centred in Korean. */
function cellAlignment(block: ManifestBlock) {
  const cell = block.cell!;
  const across = Math.abs(block.x + block.width / 2 - cell.x - cell.width / 2) < cell.width * .08 && block.width < cell.width * .85 && block.x - cell.x > cell.width * .04;
  const down = Math.abs(block.y + block.height / 2 - cell.y - cell.height / 2) < cell.height * .15 && block.height < cell.height * .75;
  return { across, down };
}

function blockRegions(block: ManifestBlock, page: { width: number; height: number }): Rect[] {
  // A table cell may use its whole box between the rules, and nothing outside it.
  if (block.role === "TABLE" && block.cell) {
    const cell = block.cell, top = cellAlignment(block).down ? cell.y : Math.min(block.y, cell.y + cell.height * .5);
    return [{ x: cell.x * page.width, y: top * page.height, width: cell.width * page.width, height: (cell.y + cell.height - top) * page.height }];
  }
  const lines = px(block, page), regions: Rect[] = [];
  const columnLeft = (block.column?.left ?? block.x) * page.width;
  // A full-width table can pull the detected gutter off the real one: a paragraph of three or more
  // justified lines, or one that ends left of the page middle, already shows where its column ends.
  const ownRight = Math.max(...lines.map(line => line.x + line.width)), detectedRight = (block.column?.right ?? block.x + block.width) * page.width;
  const columnRight = (lines.length >= 3 || ownRight < page.width * .52) && detectedRight > ownRight + page.width * .015 ? ownRight + page.width * .005 : detectedRight;
  for (const [index, line] of lines.entries()) {
    const left = index === 0 && lines.length > 1 ? Math.min(line.x, lines[1].x) : line.x;
    const previous = regions.at(-1);
    if (previous && Math.abs(left - previous.x) < 4 && line.y >= previous.y) {
      previous.width = Math.max(previous.width, line.x + line.width - previous.x);
      previous.height = Math.max(previous.height, line.y + line.height - previous.y);
    } else regions.push({ x: left, y: line.y, width: line.x + line.width - left, height: line.height });
  }
  for (const region of regions) {
    // A table cell keeps exactly its own box.
    if (block.role === "TABLE") continue;
    if (block.role === "HEADING") { region.width = Math.max(region.width, columnRight - region.x); continue; }
    // Justified columns reach the column edge; a short last line must not shrink the measure.
    if (region.width > (columnRight - columnLeft) * .55 || region.x + region.width > columnRight - (block.fontSize ?? 9) * 8) region.width = Math.max(region.width, columnRight - region.x);
  }
  return regions;
}

function intersects(a: Rect, b: Rect) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }

function subtract(rect: Rect, obstacle: Rect): Rect[] {
  if (!intersects(rect, obstacle)) return [rect];
  const left = Math.max(rect.x, obstacle.x), right = Math.min(rect.x + rect.width, obstacle.x + obstacle.width);
  const top = Math.max(rect.y, obstacle.y), bottom = Math.min(rect.y + rect.height, obstacle.y + obstacle.height);
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: top - rect.y },
    { x: rect.x, y: bottom, width: rect.width, height: rect.y + rect.height - bottom },
    { x: rect.x, y: top, width: left - rect.x, height: bottom - top },
    { x: right, y: top, width: rect.x + rect.width - right, height: bottom - top }
  ].filter(part => part.width > .5 && part.height > .5);
}

const median = (values: number[]) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; };

export interface TypesetInput {
  manifest: TranslationManifest; pageIndex: number; measure: Measure;
  /** Korean text by unit id; units absent here stay in the original language. */
  translations: ReadonlyMap<string, string>;
  /**
   * True when the rendered page has ink inside `rect` (pt). Text may only grow into white
   * space this probe has checked: figures, charts and logos are images the text layer cannot see.
   * Without a probe the layout never grows below the source text.
   */
  inkAt?: (rect: Rect) => boolean;
}

export function typesetPage({ manifest, pageIndex, measure, translations, inkAt }: TypesetInput): PageLayout {
  const page = manifest.pages[pageIndex];
  const blocks = manifest.blocks.filter(block => block.pageIndex === pageIndex).sort((a, b) => a.readingOrder - b.readingOrder);
  const units = new Map(manifest.units.map(unit => [unit.id, unit]));
  const shown = (block: ManifestBlock) => block.translatable && block.unitId !== undefined && translations.has(block.unitId);
  const empty: PageLayout = { pageIndex, width: page.width, height: page.height, lines: [], masks: [], units: [], unfit: [], bodyScale: 1 };
  if (!blocks.some(shown)) return empty;

  // Fixed artwork: equations, tables, figure labels, and any text left in English.
  const obstacles = blocks.filter(block => !shown(block) && block.exclusionReason !== "glyph-noise" && block.role !== "HEADER" && block.role !== "FOOTER")
    .flatMap(block => px(block, page).map(line => ({ x: line.x - 1.5, y: line.y - line.height * .2, width: line.width + 3, height: line.height * 1.35 })));
  // Pictures the page draws (photos, figure bitmaps) are fixed artwork too: translated text never covers them.
  for (const image of page.images ?? []) obstacles.push({ x: image.x * page.width - 2, y: image.y * page.height - 2, width: image.width * page.width + 4, height: image.height * page.height + 4 });

  // 1. Flows: headings and captions stand alone; prose flows until a heading or an equation.
  const flows: Flow[] = [];
  let body: Flow | null = null;
  for (const block of blocks) {
    if (!shown(block)) {
      if (block.role === "EQUATION" || block.role === "HEADING" || block.role === "TITLE" || block.role === "BODY" || block.role === "ABSTRACT") body = null;
      continue;
    }
    const kind: FlowKind = block.role === "HEADING" ? "heading" : block.role === "CAPTION" ? "caption" : block.role === "TABLE" ? "cell" : "body";
    if (kind !== "body") { flows.push({ kind, blocks: [block], paragraphs: [], areas: [], obstacles: [], size: 0, pitch: 0, bold: kind === "heading", sans: kind === "heading" && block.fontFamily === "sans-serif", extra: [], extended: true }); body = kind === "heading" ? null : body; continue; }
    if (!body) { body = { kind, blocks: [], paragraphs: [], areas: [], obstacles: [], size: 0, pitch: 0, bold: false, extra: [], extended: true }; flows.push(body); }
    body.blocks.push(block);
  }

  // 2. Paragraphs, geometry and source metrics for every flow.
  for (const flow of flows) {
    const sizes = flow.blocks.map(block => block.fontSize ?? 9), pitches = flow.blocks.map(block => block.pitch ?? (block.fontSize ?? 9) * 1.2);
    flow.size = median(sizes); flow.pitch = Math.max(flow.size * 1.12, median(pitches));
    const byUnit = new Map<string, ManifestBlock[]>();
    for (const block of flow.blocks) byUnit.set(block.unitId!, [...(byUnit.get(block.unitId!) ?? []), block]);
    let previousBottom = -Infinity;
    for (const [unitId, unitBlocks] of byUnit) {
      const unit = units.get(unitId)!, first = unitBlocks[0];
      const startsUnit = unit.blockIds[0] === first.id, endsUnit = unit.blockIds.at(-1) === unitBlocks.at(-1)!.id;
      const gap = first.y * page.height - previousBottom;
      const firstX = first.lines[0].x * page.width, bodyX = first.lines.length > 1 ? Math.min(...first.lines.slice(1).map(line => line.x)) * page.width : firstX;
      const hang = startsUnit && LIST_MARKER.test(first.text) && bodyX - firstX > flow.size * .6 && bodyX - firstX < flow.size * 4 ? { first: firstX, body: bodyX } : undefined;
      flow.paragraphs.push({ unitId, text: unitTextForPage(unit, translations.get(unitId)!, pageIndex), indent: startsUnit ? first.indent ?? 0 : 0, startsUnit, endsUnit, gapBefore: startsUnit && !(first.indent ?? 0) && gap > flow.pitch * .9 && gap < flow.pitch * 3 ? flow.pitch * .5 : 0, hang });
      previousBottom = Math.max(...unitBlocks.map(block => (block.y + block.height) * page.height));
    }
    const regions = flow.blocks.flatMap(block => blockRegions(block, page));
    // Merge regions that continue the same column so paragraph gaps are usable space.
    for (const region of regions) {
      const previous = flow.areas.at(-1);
      if (previous && Math.abs(previous.x - region.x) < 4 && Math.abs(previous.x + previous.width - region.x - region.width) < 8 && region.y >= previous.y && region.y - (previous.y + previous.height) < flow.pitch * 2.2) {
        previous.height = region.y + region.height - previous.y; previous.width = Math.max(previous.width, region.width);
      } else flow.areas.push({ ...region });
    }
    flow.obstacles = obstacles;
  }

  // 3. Let the last area of a column segment use the white space below it.
  const occupied = blocks.filter(block => block.exclusionReason !== "glyph-noise").flatMap(block => px(block, page));
  for (const flow of flows.filter(flow => flow.kind !== "cell")) for (const area of flow.areas) {
    const below = occupied.filter(line => line.y > area.y + area.height + .5 && line.x < area.x + area.width && line.x + line.width > area.x).map(line => line.y);
    const limit = Math.min(page.height * .945, ...below.map(value => value - flow.pitch * .25), area.y + area.height + flow.pitch * (flow.kind === "heading" ? 0 : 1.6));
    // Walk down in half-line steps and stop at the first ink: a figure, a rule or a footer logo.
    let bottom = area.y + area.height;
    if (inkAt) {
      const step = flow.pitch * .5;
      while (bottom + step <= limit && !inkAt({ x: area.x, y: bottom + flow.pitch * .12, width: area.width, height: step })) bottom += step;
    }
    flow.extra[flow.areas.indexOf(area)] = Math.max(0, bottom - area.y - area.height);
  }

  // 4. Run-in headings share their first line with the paragraph that follows.
  const headingLines = new Map<string, { y: number; right: number }>();

  const lines: SetLine[] = [], unfit: string[] = [];
  const setFlow = (flow: Flow, scale: number, leading = 1, commit = false) => {
    const size = flow.size * scale, pitch = flow.pitch * scale * leading, out: SetLine[] = [];
    const faceMeasure: Measure = flow.sans ? (text, bold) => measure(text, bold, true) : measure;
    let area = 0, y = flow.areas[0]?.y ?? 0, overflow = false;
    let placed: { x: number; width: number; y: number } | null = null;
    const slot = (): { x: number; width: number; y: number } | null => {
      for (let guard = 0; guard < 400; guard++) {
        const current = flow.areas[area];
        if (!current) return null;
        // Moving into the next area (a list item's hanging indent, the full-width part under a
        // wrapped figure) must still keep one full line of spacing from the line above.
        if (placed && placed.x < current.x + current.width && placed.x + placed.width > current.x && y < placed.y + pitch * .98) y = placed.y + pitch * .98;
        const allowance = flow.extended ? flow.extra[area] ?? 0 : Math.min(flow.extra[area] ?? 0, pitch * .3);
        if (y + size > current.y + current.height + allowance + size * .2) { area++; y = flow.areas[area]?.y ?? 0; continue; }
        const band: Rect = { x: current.x, y: y + pitch * .05, width: current.width, height: size * 1.05 };
        const hits = flow.obstacles.filter(obstacle => intersects(band, obstacle));
        if (!hits.length) return { x: current.x, width: current.width, y };
        let free = [{ from: current.x, to: current.x + current.width }];
        for (const hit of hits) free = free.flatMap(range => [{ from: range.from, to: Math.min(range.to, hit.x - 1) }, { from: Math.max(range.from, hit.x + hit.width + 1), to: range.to }]).filter(range => range.to - range.from > 1);
        const widest = free.sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
        // A heading may share its line with another heading or label; prose needs at least half the measure.
        if (widest && widest.to - widest.from >= current.width * (flow.kind === "heading" ? .2 : .5)) return { x: widest.from, width: widest.to - widest.from, y };
        y = Math.max(...hits.map(hit => hit.y + hit.height)) + 0.5;
      }
      return null;
    };
    flow.paragraphs.forEach((paragraph, index) => {
      if (index && paragraph.startsUnit) y += paragraph.gapBefore * scale;
      const feeder = new LineFeeder(tokenize(paragraph.text, faceMeasure, flow.kind === "caption"), faceMeasure);
      let first = true;
      while (!feeder.done) {
        const place = slot();
        if (!place) { overflow = true; return; }
        let x = place.x, width = place.width;
        const runIn = first && paragraph.startsUnit ? headingLines.get(flow.blocks.find(block => block.unitId === paragraph.unitId)!.id) : undefined;
        if (runIn) { x = Math.max(x, runIn.right + size * .3); width = place.x + place.width - x; }
        else if (first && paragraph.indent) { x += paragraph.indent * scale; width -= paragraph.indent * scale; }
        // A list item keeps its own hanging indent wherever its Korean lines land in the list:
        // the source lines under it may belong to a neighbouring item with the other indent.
        else if (paragraph.hang && Math.abs(place.x - paragraph.hang.first) < paragraph.hang.body - paragraph.hang.first + size * 2) {
          const target = first ? paragraph.hang.first : paragraph.hang.body;
          if (target >= place.x - size * 4) { width = place.x + place.width - target; x = target; }
        }
        const broken = feeder.next(width, size), last = feeder.done;
        // Table cells and headings are set flush left: justifying a short cell line spreads its letters apart.
        const spacing = justify(broken, width, size, last || flow.kind === "heading" || flow.kind === "cell");
        if (commit && broken.runs.length) out.push({ unitId: paragraph.unitId, kind: flow.kind, x, y: place.y, width, fontSize: size, lineHeight: pitch, runs: broken.runs, bold: flow.bold, sans: flow.sans, ...spacing });
        placed = { x, width, y: place.y };
        y = place.y + pitch; first = false;
      }
    });
    return { overflow, lines: out, spare: area < flow.areas.length ? flow.areas.slice(area).reduce((sum, rect, offset) => sum + (offset ? rect.height : Math.max(0, rect.y + rect.height - y)), 0) : 0 };
  };

  const fit = (flow: Flow, low: number, high: number) => {
    if (!setFlow(flow, high).overflow) return high;
    if (setFlow(flow, low).overflow) return null;
    let a = low, b = high;
    for (let step = 0; step < 7; step++) { const middle = (a + b) / 2; if (setFlow(flow, middle).overflow) b = middle; else a = middle; }
    return a;
  };

  // Headings first: their real width decides where a run-in paragraph starts.
  for (const flow of flows.filter(flow => flow.kind === "heading")) {
    const block = flow.blocks[0];
    // A long translated heading shrinks rather than losing its last words.
    const scale = fit(flow, ...SIZE_RANGE.heading) ?? fit(flow, FALLBACK_MIN, SIZE_RANGE.heading[0]) ?? FALLBACK_MIN;
    const result = setFlow(flow, scale, 1, true);
    lines.push(...result.lines);
    if (result.overflow) unfit.push(block.unitId!);
    const last = result.lines.at(-1);
    if (last) {
      const width = last.runs.reduce((sum, run) => sum + measure(run.text, true, flow.sans) * last.fontSize, 0) + last.wordSpacing * Math.max(0, last.runs.map(run => run.text).join("").split(" ").length - 1);
      // The paragraph runs in on the heading's last line (a long run-in heading wraps).
      const lastLine = block.lines.at(-1) ?? block;
      const follower = blocks.find(other => other.readingOrder > block.readingOrder && shown(other) && other.role !== "HEADING" && Math.abs(other.y - lastLine.y) * page.height < (block.fontSize ?? 9) * .4);
      if (follower) headingLines.set(follower.id, { y: last.y, right: last.x + width });
    }
  }

  // Text of one flow must never run onto a line that belongs to another block (a heading,
  // a caption, the next paragraph group). A run-in heading is handled by `headingLines`.
  const runInHeads = new Map<string, string>();
  for (const [followerId] of headingLines) {
    const follower = blocks.find(block => block.id === followerId), head = follower && [...blocks].reverse().find(block => block.readingOrder < follower.readingOrder && block.role === "HEADING");
    if (head) runInHeads.set(followerId, head.id);
  }
  for (const flow of flows.filter(flow => flow.kind !== "heading")) {
    const own = new Set(flow.blocks.map(block => block.id));
    const skip = new Set(flow.blocks.map(block => runInHeads.get(block.id)).filter(Boolean));
    const others = blocks.filter(block => shown(block) && !own.has(block.id) && !skip.has(block.id)).flatMap(block => px(block, page)).map(line => ({ x: line.x - 1, y: line.y - line.height * .1, width: line.width + 2, height: line.height * 1.2 }));
    flow.obstacles = [...obstacles, ...others];
  }

  const bodyFlows = flows.filter(flow => flow.kind === "body");
  // One body size per page: the smallest scale at which every prose flow fits in the normal range.
  // A flow that cannot fit even at 80% (usually a cramped fragment) gets its own smaller size
  // instead of shrinking every other paragraph on the page.
  // Fit inside the original text area first; only a flow that cannot fit there may use the white space below.
  const fits = bodyFlows.map(flow => { flow.extended = false; const tight = fit(flow, .86, SIZE_RANGE.body[1]); if (tight !== null) return tight; flow.extended = true; return fit(flow, ...SIZE_RANGE.body); });
  const normal = fits.filter((value): value is number => value !== null);
  const bodyScale = normal.length ? Math.floor(Math.min(...normal) * 50) / 50 : SIZE_RANGE.body[0];
  bodyFlows.forEach((flow, index) => {
    const scale = fits[index] === null ? fit(flow, FALLBACK_MIN, SIZE_RANGE.body[0]) ?? FALLBACK_MIN : bodyScale;
    // Spread leftover space as looser leading so a column ends where the original did
    // instead of leaving a white block before the next heading.
    let leading = 1;
    const probe = setFlow(flow, scale);
    if (!probe.overflow && probe.spare > flow.pitch * scale) {
      for (const candidate of [1.2, 1.16, 1.12, 1.08, 1.05, 1.025]) if (!setFlow(flow, scale, candidate).overflow) { leading = candidate; break; }
    }
    const result = setFlow(flow, scale, leading, true);
    lines.push(...result.lines);
    if (result.overflow) unfit.push(...flow.paragraphs.map(paragraph => paragraph.unitId));
  });

  // A table reads in one type size: the largest every cell takes, but never below 75% because of one
  // long cell; a cell that cannot fit at that size gets its own smaller one.
  const cellFlows = flows.filter(flow => flow.kind === "cell");
  cellFlows.forEach(flow => { flow.extended = false; });
  const ownFit = new Map(cellFlows.map(flow => [flow, fit(flow, ...SIZE_RANGE.cell) ?? fit(flow, .45, SIZE_RANGE.cell[0]) ?? .45]));
  const tableScale = Math.max(.75, Math.min(SIZE_RANGE.cell[1], ...ownFit.values()));
  for (const flow of flows.filter(flow => flow.kind === "caption" || flow.kind === "cell")) {
    const range = SIZE_RANGE[flow.kind];
    const scale = flow.kind === "cell" ? Math.min(ownFit.get(flow)!, tableScale) : fit(flow, ...range) ?? fit(flow, .45, range[0]) ?? .45;
    const result = setFlow(flow, scale, 1, true);
    const block = flow.blocks[0];
    if (flow.kind === "cell" && block.cell && result.lines.length) {
      const { across, down } = cellAlignment(block), cell = block.cell;
      if (across) for (const line of result.lines) {
        const natural = line.runs.reduce((sum, run) => sum + measure(run.text, run.bold || line.bold, flow.sans) * line.fontSize, 0);
        if (natural < line.width) { line.x += (line.width - natural) / 2; line.width = natural + .5; }
      }
      if (down) {
        const first = result.lines[0], last = result.lines.at(-1)!;
        const middle = (first.y + last.y + last.fontSize) / 2, target = (cell.y + cell.height / 2) * page.height;
        const shift = Math.max(cell.y * page.height - first.y, Math.min((cell.y + cell.height) * page.height - last.y - last.fontSize, target - middle));
        for (const line of result.lines) line.y += shift;
      }
    }
    lines.push(...result.lines);
    if (result.overflow) unfit.push(block.unitId!);
  }

  // Masks hide only the source lines that now carry Korean text, never artwork.
  const artwork = blocks.filter(block => !shown(block) && block.exclusionReason !== "glyph-noise").flatMap(block => px(block, page));
  // A table cell's mask stays inside its box: the table's own rules are never painted over.
  const clip = (rect: Rect, block: ManifestBlock): Rect => {
    if (block.role !== "TABLE" || !block.cell) return rect;
    const x0 = Math.max(rect.x, block.cell.x * page.width), y0 = Math.max(rect.y, block.cell.y * page.height), x1 = Math.min(rect.x + rect.width, (block.cell.x + block.cell.width) * page.width), y1 = Math.min(rect.y + rect.height, (block.cell.y + block.cell.height) * page.height);
    return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  };
  const masks = blocks.filter(shown).flatMap(block => [...px(block, page), ...(block.extraMasks ?? []).map(box => ({ x: box.x * page.width, y: box.y * page.height + box.height * page.height * .1, width: box.width * page.width, height: box.height * page.height * .8 }))].map(line => clip({ x: line.x - 1, y: line.y - line.height * .22, width: line.width + 2, height: line.height * 1.5 }, block)))
    .flatMap(mask => artwork.reduce<Rect[]>((parts, art) => parts.flatMap(part => subtract(part, art)), [mask]));
  const unitBoxes = new Map<string, Rect>();
  for (const block of blocks.filter(shown)) {
    const box = { x: block.x * page.width, y: block.y * page.height, width: block.width * page.width, height: block.height * page.height }, prior = unitBoxes.get(block.unitId!);
    unitBoxes.set(block.unitId!, prior ? { x: Math.min(prior.x, box.x), y: Math.min(prior.y, box.y), width: Math.max(prior.x + prior.width, box.x + box.width) - Math.min(prior.x, box.x), height: Math.max(prior.y + prior.height, box.y + box.height) - Math.min(prior.y, box.y) } : box);
  }
  return {
    pageIndex, width: page.width, height: page.height, lines, masks, unfit: [...new Set(unfit)], bodyScale,
    units: [...unitBoxes].map(([unitId, box]) => { const first = lines.find(line => line.unitId === unitId); return { unitId, box, firstLine: first ? { x: first.x + first.width, y: first.y } : { x: box.x + box.width, y: box.y } }; })
  };
}
