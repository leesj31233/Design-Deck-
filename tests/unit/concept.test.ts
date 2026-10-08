import { describe, expect, it } from "vitest";
import { conceptSchema, validateConcept } from "@/lib/paperflow/concept/concept";

const passage = "Reburning chemistry in the upper furnace reduced NO formed in the burner zone. A 69.8% reduction was achieved at the 40% cofiring rate.";

describe("concept study", () => {
  it("keeps only quotes that occur in the passage, and bounds every list", () => {
    const concept = validateConcept({ term: "reburning", definition: "추가 fuel로 NO를 환원하는 기술이다.", inPaper: "upper furnace에서 NO를 줄인다.",
      evidence: ["Reburning chemistry in the upper furnace reduced NO", "reburning removed all NOx in every case"],
      quantities: [{ label: "저감률", value: "69.8%" }, { label: "", value: "" }], related: ["NOx", "OFA", "air staging", "char", "CH radical", "extra"], questions: ["q1", "q2", "q3", "q4"], needsMoreContext: false }, passage)!;
    expect(concept.evidence).toEqual(["Reburning chemistry in the upper furnace reduced NO"]);
    expect(concept.quantities).toEqual([{ label: "저감률", value: "69.8%" }]);
    expect(concept.related).toHaveLength(5);
    expect(concept.questions).toHaveLength(3);
  });
  it("rejects an answer without a definition and uses a strict schema", () => {
    expect(validateConcept({ inPaper: "x" }, passage)).toBeNull();
    expect(validateConcept({ definition: "Reburning is a NOx control technique.", inPaper: "It reduces NO here." }, passage)).toBeNull();
    expect(conceptSchema().format.strict).toBe(true);
  });
});
