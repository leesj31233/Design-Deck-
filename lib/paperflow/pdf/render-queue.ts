import { lowMemoryDevice } from "../device";

interface Job { element: Element; run: () => Promise<void>; signal: AbortSignal; done: () => void; /** Added to the distance: thumbnails wait for the pages. */ penalty: number }
const queue: Job[] = [];
let running = 0;

/** Distance from the element to the middle of the screen: the page being read draws first. */
function distance(element: Element) {
  const box = element.getBoundingClientRect(), middle = window.innerHeight / 2;
  return box.bottom < middle ? middle - box.bottom : box.top > middle ? box.top - middle : 0;
}

function next() {
  const limit = lowMemoryDevice() ? 1 : 2;
  while (running < limit && queue.length) {
    // Aborted jobs (pages scrolled away) are dropped; the nearest page goes next.
    for (let at = queue.length - 1; at >= 0; at--) if (queue[at].signal.aborted) queue.splice(at, 1)[0].done();
    if (!queue.length) return;
    let best = 0, bestDistance = Infinity;
    queue.forEach((job, at) => { const d = distance(job.element) + job.penalty; if (d < bestDistance) { bestDistance = d; best = at; } });
    const job = queue.splice(best, 1)[0];
    running++;
    void job.run().catch(() => undefined).finally(() => { running--; job.done(); next(); });
  }
}

/**
 * Page drawing goes through one queue: at most two pages draw at once (one on a low-memory device),
 * nearest to the middle of the screen first, so opening a paper shows the page being read before the
 * pages prepared around it.
 */
export function scheduleRender(element: Element, run: () => Promise<void>, signal: AbortSignal, background = false) {
  return new Promise<void>(resolve => { queue.push({ element, run, signal, done: resolve, penalty: background ? 100_000 : 0 }); next(); });
}
