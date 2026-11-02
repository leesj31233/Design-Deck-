import { describe, expect, it } from "vitest";
import { fixTerminology, polishKorean } from "@/lib/paperflow/translation/research-style";

describe("terminology guard", () => {
  it("replaces literal coinages with the English term and keeps particles", () => {
    expect(fixTerminology("보일러 메쉬는 계산 효율성을 위해 조정하였다. 보일러 메쉬의 크기")).toBe("Boiler mesh는 계산 효율성을 위해 조정하였다. Boiler mesh의 크기");
    expect(fixTerminology("숯탄 연소와 복사 전송 방정식, 동소각 비율")).toBe("Char 연소와 radiative transfer 방정식, 혼소 비율");
    expect(fixTerminology("메시지는 그대로 둔다")).toBe("메시지는 그대로 둔다");
  });
  it("still turns polite endings declarative", () => {
    expect(polishKorean("메쉬를 사용합니다.")).toBe("Mesh를 사용한다.");
  });
});
