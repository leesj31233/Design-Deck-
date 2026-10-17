import { describe, expect, it } from "vitest";
import { cleanPrices, priceMove } from "@/lib/paperflow/intel/prices";
import { readPack } from "@/lib/paperflow/intel/repository";

const source = { title: "Argus Biomass Markets 26-26 (free sample)", org: "Argus Media", url: "https://example.org/argus.pdf" };
const board = {
  series: [
    { id: "pks-fob-sumatra", product: "pks", name: "PKS fob 수마트라", unit: "USD/t", country: "id", points: [
      { date: "2026-07-01", value: 99.42, source, status: "verified" }, { date: "2026-06", value: 100.94, source, status: "verified" }] },
    { id: "efb-fob-my", product: "efb-pellet", name: "EFB 펠릿 fob 말레이시아", unit: "USD/t", points: [{ date: "2026-07-01", value: "137.5", source, status: "verified" }] },
    { id: "bad", product: "gold", name: "x", unit: "USD/t", points: [{ date: "2026-07-01", value: 1, source }] },
    { id: "no-source", product: "pks", name: "x", unit: "USD/t", points: [{ date: "2026-07-01", value: 1 }] }
  ]
};

describe("price board", () => {
  it("keeps known products with dated, sourced points in date order", () => {
    const clean = cleanPrices(board)!;
    expect(clean.series.map(series => series.id)).toEqual(["pks-fob-sumatra", "efb-fob-my"]);
    expect(clean.series[0].points.map(point => point.date)).toEqual(["2026-06", "2026-07-01"]);
    expect(clean.series[0].country).toBe("ID");
    expect(clean.series[1].points[0].value).toBe(137.5);
  });
  it("reads the last move within a series", () => {
    const [pks, efb] = cleanPrices(board)!.series;
    const move = priceMove(pks);
    expect(move.direction).toBe("down");
    expect(move.change).toBeCloseTo(-1.52);
    expect(move.percent).toBeCloseTo(-1.506, 2);
    expect(priceMove(efb).direction).toBe("new");
  });
  it("travels in a pack as a hidden briefing", () => {
    const pack = readPack(JSON.stringify({ items: [], prices: board }));
    expect(JSON.parse(pack.briefs!.find(brief => brief.id === "__prices__")!.body).series).toHaveLength(2);
  });
});
