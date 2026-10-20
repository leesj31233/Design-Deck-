import { describe, expect, it } from "vitest";
import { installStreamIteration } from "@/lib/paperflow/pdf/stream-iteration";

describe("ReadableStream async iteration shim (Safari < 26)", () => {
  it("adds for-await support where only getReader exists, and reads every chunk", async () => {
    // An engine like iPadOS 18 Safari: a ReadableStream with getReader() but no async iterator.
    const real = new ReadableStream<string>({ start(controller) { controller.enqueue("a"); controller.enqueue("b"); controller.close(); } });
    const OldStream = function OldStream() { /* stand-in constructor */ } as unknown as typeof ReadableStream;
    Object.assign(OldStream.prototype, { getReader: () => real.getReader() });
    expect(installStreamIteration({ ReadableStream: OldStream })).toBe(true);
    const stream = Object.create(OldStream.prototype) as AsyncIterable<string>;
    const seen: string[] = [];
    for await (const chunk of stream) seen.push(chunk);
    expect(seen).toEqual(["a", "b"]);
  });
  it("leaves a native implementation alone", () => {
    expect(installStreamIteration({ ReadableStream })).toBe(false);
  });
});
