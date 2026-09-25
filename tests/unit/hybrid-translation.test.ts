import { expect, it } from "vitest";
import { protectTerms } from "@/lib/paperflow/translation/hybrid";

it("keeps engineering phrases, acronyms and units in English while restoring translated grammar", () => {
  const protectedSource = protectTerms("The biomass co-firing model predicts higher heat flux at 20 MW with DPM.");
  expect(protectedSource.protectedText).not.toContain("heat flux");
  expect(protectedSource.terms).toContain("biomass co-firing");
  expect(protectedSource.terms).toContain("20 MW");
  expect(protectedSource.protectedText).toContain("The ");
  expect(protectedSource.protectedText).toContain("model predicts higher");
  const restored = protectedSource.restore("ZZZTERM0ZZZ 조건에서 ZZZTERM1ZZZ와 ZZZTERM2ZZZ를 측정했습니다.");
  expect(restored).not.toContain("ZZZTERM");
  expect(restored).toContain("biomass co-firing");
});
