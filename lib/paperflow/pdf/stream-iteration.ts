/**
 * PDF.js 6 reads a page's text with `for await (… of ReadableStream)`. Safari before 26 (iPadOS 18
 * and older) has ReadableStream but not its async iterator, so text extraction threw
 * "undefined is not a function": no paragraph clicks, no selection, no translation. This adds the
 * standard `values()` / `[Symbol.asyncIterator]` on top of `getReader()` where they are missing.
 * The same code is prepended to the PDF.js worker (scripts/copy-pdf-assets.mjs).
 */
export function installStreamIteration(scope: { ReadableStream?: typeof ReadableStream } = globalThis) {
  const proto = scope.ReadableStream?.prototype as (ReadableStream & { values?: unknown; [Symbol.asyncIterator]?: unknown }) | undefined;
  if (!proto || typeof proto[Symbol.asyncIterator] === "function") return false;
  const values = function (this: ReadableStream, options?: { preventCancel?: boolean }) {
    const reader = this.getReader(), preventCancel = Boolean(options?.preventCancel);
    return {
      async next() {
        try { const result = await reader.read(); if (result.done) reader.releaseLock(); return result; }
        catch (error) { reader.releaseLock(); throw error; }
      },
      async return(value?: unknown) {
        if (!preventCancel) { const cancelled = reader.cancel(value); reader.releaseLock(); await cancelled; } else reader.releaseLock();
        return { done: true as const, value };
      },
      [Symbol.asyncIterator]() { return this; }
    };
  };
  Object.defineProperty(proto, "values", { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
  return true;
}
