import { describe, expect, it } from "vitest";
import { agreementReport } from "./agreement";
import { hetx, landed, crashed, preset } from "@/lib/engine/scoring/fixtures";

// docs/08 §1H-4
const redAttemptsForTests = () => [
  landed(1, [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)]),
  landed(2, [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)]),
  landed(3, [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)]),
  crashed(4),
  landed(5, [hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)]),
];

describe("1H-4 agreement report", () => {
  const model = preset("kota-best3-impression");
  it("§1A: J1 0.04, J2 0.05, J3 0.03 from the panel score, no outliers", () => {
    const rep = agreementReport(model, ["J1", "J2", "J3"], redAttemptsForTests());
    expect(rep.map((r) => [r.judgeId, r.meanDistance.toFixed(2), r.outliers])).toEqual([
      ["J1", "0.04", 0],
      ["J2", "0.05", 0],
      ["J3", "0.03", 0],
    ]);
  });
  it("counts the outlier cell: 7.0 / 7.5 / 8.9 makes J3 the outlier", () => {
    const flat = (v: number) => hetx(v, v, v, v);
    const rep = agreementReport(model, ["J1", "J2", "J3"], [landed(1, [flat(7.0), flat(7.5), flat(8.9)])]);
    expect(rep.find((r) => r.judgeId === "J3")!.outliers).toBe(1);
    expect(rep.find((r) => r.judgeId === "J1")!.outliers).toBe(0);
  });
  it("a crashed attempt is not part of the average", () => {
    const rep = agreementReport(model, ["J1", "J2", "J3"], [crashed(1)]);
    expect(rep.every((r) => r.meanDistance === 0 && r.attempts === 0)).toBe(true);
  });
});
