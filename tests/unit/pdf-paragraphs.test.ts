import { expect, it } from "vitest";
import { isEquationLine } from "@/lib/paperflow/translation/paragraphs";

it("keeps mathematical lines outside translatable prose", () => {
  expect(isEquationLine("k_d = D_ref / R_p (T_p + T_g) (5)")).toBe(true);
  expect(isEquationLine("C(s) + O₂(g) → CO₂(g). (4)")).toBe(true);
  expect(isEquationLine("The oxidation reaction is described as:")).toBe(false);
  expect(isEquationLine("Figure 8 shows the slag viscosity as a function of temperature.")).toBe(false);
});
