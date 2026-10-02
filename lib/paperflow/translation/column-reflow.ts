export interface ReflowBlock { id: string; x: number; y: number; width: number; height: number; lineHeight: number; column: number }
export interface ReflowObstacle { x: number; y: number; width: number; height: number }
export interface ReflowPlacement<T> { id: string; top: number; availableHeight: number; usedHeight: number; output: T }

/** Flow translated text within its column; large source gaps and non-prose objects are fixed obstacles. */
export function planColumnReflow<T>(blocks: ReflowBlock[], obstacles: ReflowObstacle[], pageHeight: number, layout: (block: ReflowBlock, top: number, availableHeight: number) => { usedHeight: number; output: T }): ReflowPlacement<T>[] {
  const result: ReflowPlacement<T>[] = [];
  for (const column of [...new Set(blocks.map(block => block.column))]) {
    const ordered = blocks.filter(block => block.column === column).sort((a, b) => a.y - b.y || a.x - b.x);
    let cursor = 0, previous: ReflowBlock | undefined;
    for (let index = 0; index < ordered.length; index++) {
      const block = ordered[index], next = ordered[index + 1];
      const gapBefore = previous ? block.y - (previous.y + previous.height) : Infinity;
      const breaksFlow = gapBefore > Math.max(32, block.lineHeight * 3) || obstacles.some(obstacle => previous && obstacle.y >= previous.y + previous.height && obstacle.y + obstacle.height <= block.y && obstacle.x < block.x + block.width && obstacle.x + obstacle.width > block.x);
      if (breaksFlow && cursor <= block.y) cursor = block.y;
      const top = Math.max(block.y, cursor);
      const nextGap = next ? next.y - (block.y + block.height) : Infinity;
      const gapBoundary = nextGap > Math.max(32, block.lineHeight * 3) ? block.y + block.height + Math.min(nextGap, block.lineHeight * 1.5) : pageHeight * .945;
      const obstacleBoundary = obstacles.filter(obstacle => obstacle.y >= block.y - block.lineHeight && obstacle.y < pageHeight && obstacle.x < block.x + block.width && obstacle.x + obstacle.width > block.x).reduce((limit, obstacle) => Math.min(limit, obstacle.y - block.lineHeight * .35), pageHeight * .945);
      const boundary = Math.min(gapBoundary, obstacleBoundary, pageHeight * .945);
      // Reserve readable space for later blocks before allowing an early paragraph to expand.
      // Without this, the first translated paragraph can consume the entire column.
      let reserve = 0;
      for (let later = index + 1; later < ordered.length; later++) {
        const follower = ordered[later], prior = ordered[later - 1];
        if (follower.y >= boundary || follower.y - (prior.y + prior.height) > Math.max(32, follower.lineHeight * 3)) break;
        reserve += Math.max(follower.lineHeight, follower.height * .82) + follower.lineHeight * .35;
      }
      const availableHeight = Math.max(0, boundary - top - reserve);
      const { usedHeight, output } = layout(block, top, availableHeight);
      result.push({ id: block.id, top, availableHeight, usedHeight, output });
      cursor = Math.max(top, top + Math.min(usedHeight, availableHeight) + block.lineHeight * .35);
      previous = block;
    }
  }
  return result;
}
