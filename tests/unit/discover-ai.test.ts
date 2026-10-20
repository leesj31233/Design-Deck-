import { describe, expect, it } from "vitest";
import { planParams, validateBriefs, validatePlan } from "@/lib/paperflow/scholar/discover-ai";

describe("추천 논문 AI search", () => {
  it("turns a plan into OpenAlex filters and keeps years sane", () => {
    const plan = validatePlan({ search: "biochar soil carbon", from: 2024, to: 3000, openAccess: true, review: true, sort: "cited", explain: "최근 리뷰" }, "fallback");
    expect(plan.to).toBeUndefined();
    const params = planParams(plan);
    expect(params.filter).toBe("from_publication_date:2024-01-01,is_oa:true,type:review,has_abstract:true");
    expect(params.sort).toBe("cited_by_count:desc");
    expect(validatePlan(null, "plain words").search).toBe("plain words");
  });
  it("keeps briefs only for the papers asked", () => {
    expect(validateBriefs({ papers: [{ id: "W1", titleKo: "제목", oneLine: "한 줄" }, { id: "W9", titleKo: "x", oneLine: "" }] }, ["W1"])).toEqual([{ id: "W1", titleKo: "제목", oneLine: "한 줄" }]);
  });
});
