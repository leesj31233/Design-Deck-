import type { Box } from "../pdf/pdf-adapter";

/** Normalized (0–1) rectangle on the page. */
export interface Region { x: number; y: number; width: number; height: number }

const normalize = (box: Box, width: number, height: number): Region => ({ x: box.x / width, y: box.y / height, width: box.width / width, height: box.height / height });
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * Ruled tables, from the page's own strokes: three or more horizontal rules that share their left
 * and right ends (a booktabs or grid table), or two that vertical rules join (a boxed table, a
 * shaded table panel). A single rule (a running-head line) or a page frame is not a table.
 */
export function tableRegions(rules: Box[], width: number, height: number, prose: (band: Region) => boolean = () => false): Region[] {
  // Grid cells draw their own borders: narrow columns give short segments, kept when vertical rules close them.
  const horizontal = rules.filter(rule => rule.height <= 1.5 && rule.width >= width * .03).sort((a, b) => a.y - b.y);
  const vertical = rules.filter(rule => rule.width <= 1.5 && rule.height >= 12);
  const groups: Box[][] = [];
  for (const rule of horizontal) {
    const group = groups.find(members => { const first = members[0]; return Math.abs(first.x - rule.x) < 15 && Math.abs(first.x + first.width - rule.x - rule.width) < 15; });
    if (group) { if (!group.some(member => Math.abs(member.y - rule.y) < 2)) group.push(rule); } else groups.push([rule]);
  }
  // A running-head rule, the table's rules and a footer rule can share their ends: body prose between
  // two rules means they belong to different things, so the group splits there.
  const runs: Box[][] = [];
  for (const group of groups) {
    let run: Box[] = [];
    for (const rule of group) {
      const previous = run.at(-1);
      if (previous && prose(normalize({ x: Math.min(previous.x, rule.x), y: previous.y, width: Math.max(previous.width, rule.width), height: rule.y - previous.y }, width, height))) { runs.push(run); run = []; }
      run.push(rule);
    }
    runs.push(run);
  }
  const regions: Region[] = [];
  for (const group of runs) {
    if (group.length < 2) continue;
    const x0 = Math.min(...group.map(rule => rule.x)), x1 = Math.max(...group.map(rule => rule.x + rule.width));
    const y0 = Math.min(...group.map(rule => rule.y)), y1 = Math.max(...group.map(rule => rule.y + rule.height));
    if (y1 - y0 < 18 || y1 - y0 > height * .88) continue;
    // Vertical borders may be one segment per row: add up how much of each edge they cover.
    const cover = (x: number) => vertical.filter(rule => Math.abs(rule.x - x) < 3).reduce((sum, rule) => sum + overlap(rule.y, rule.y + rule.height, y0, y1), 0);
    const inner = vertical.filter(rule => rule.x > x0 + 3 && rule.x < x1 - 3 && overlap(rule.y, rule.y + rule.height, y0, y1) > (y1 - y0) * .5).length;
    const joined = Number(cover(x0) > (y1 - y0) * .5) + Number(cover(x1) > (y1 - y0) * .5) + inner;
    const narrow = x1 - x0 < width * .15;
    if (narrow ? joined >= 2 && group.length >= 3 : group.length >= 3 || joined >= 2) regions.push(normalize({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, width, height));
  }
  // A grid draws each column's borders as its own segments: side-by-side strips over the same rows are one table.
  for (let merged = true; merged;) {
    merged = false;
    for (let a = 0; a < regions.length && !merged; a++) for (let b = a + 1; b < regions.length && !merged; b++) {
      const p = regions[a], q = regions[b];
      const rows = overlap(p.y, p.y + p.height, q.y, q.y + q.height), gap = Math.max(p.x, q.x) - Math.min(p.x + p.width, q.x + q.width);
      if (rows >= Math.min(p.height, q.height) * .6 && gap <= .015) {
        const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
        regions[a] = { x, y, width: Math.max(p.x + p.width, q.x + q.width) - x, height: Math.max(p.y + p.height, q.y + q.height) - y };
        regions.splice(b, 1); merged = true;
      }
    }
  }
  return regions.filter(region => region.x > -.01 && region.y > -.01 && region.x + region.width < 1.01 && region.y + region.height < 1.01);
}

/**
 * Pictures the translated text must not cover. A full-page background, a scan, or an image the
 * page's own text is printed on (a coloured panel) is not an obstacle.
 */
export function figureRegions(images: Box[], width: number, height: number, text: Region[]): Region[] {
  return images.map(image => normalize(image, width, height)).filter(image => {
    const area = image.width * image.height;
    if (area < .004 || area > .6) return false;
    const covered = text.reduce((sum, box) => sum + overlap(box.x, box.x + box.width, image.x, image.x + image.width) * overlap(box.y, box.y + box.height, image.y, image.y + image.height), 0);
    return covered < area * .15;
  });
}

export const centerInside = (box: Region, region: Region, margin = .004) => {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  return cx > region.x - margin && cx < region.x + region.width + margin && cy > region.y - margin && cy < region.y + region.height + margin;
};
