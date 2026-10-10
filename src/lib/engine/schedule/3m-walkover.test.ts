// Console – Walkover and absent riders: a walkover heat takes no time (its line reads "Walkover"), the heats after it move up, never before a pin.
import { describe, expect, it } from "vitest";
import { computeTimetable } from "./timetable";
import { at, idOf, opts, patch, plan, row, withActuals } from "./fixtures";

const main = plan("main");
const upToH1 = () => withActuals(main, 7); // Pros R1 Heat 1 and everything before it ran to plan

describe("a walkover takes no time", () => {
  const ran = upToH1();
  const h2 = idOf("p-r1-h2");
  const plain = computeTimetable(main, ran, opts(at("15:03")));
  const wo = computeTimetable(main, patch(ran, h2, { startedAt: at("15:03"), endedAt: at("15:03"), walkover: true }), opts(at("15:03")));

  it("its line is done, reads Walkover, and starts and ends when it was given", () => {
    expect(row(wo, "p-r1-h2")).toMatchObject({ start: "15:03", end: "15:03", status: "done", walkover: true });
    expect(row(wo, "p-r1-h2").reason).toBe("Walkover at 15:03: nobody rode, so it takes no time");
  });

  it("the heat after it moves up to where Heat 2 would have started (the clock is where the last ridden heat left it)", () => {
    expect(row(wo, "p-r1-h3").start).toBe(row(plain, "p-r1-h2").start);
  });

  it("every later heat moves up by the same amount, and the day finishes earlier by Heat 2's length and break", () => {
    const delta = (id: string) => Date.parse(row(plain, id).startUtc!) - Date.parse(row(wo, id).startUtc!);
    const d = delta("p-r1-h3");
    expect(d).toBeGreaterThan(0);
    for (const id of ["p-r1-h4", "p-r2-h5", "p-r2-h6", "p-f"]) expect(delta(id)).toBe(d);
    expect(Date.parse(plain.finishUtc!) - Date.parse(wo.finishUtc!)).toBe(d);
  });

  it("it is not 'next' and not counted as left to run", () => {
    expect(row(wo, "p-r1-h3").status).toBe("next");
    expect(wo.heatsLeft).toBe(plain.heatsLeft - 1);
  });

  it("never before a pin: a pinned heat after the walkover keeps its 'not before' time", () => {
    const pinned = { ...main, anchors: { ...main.anchors, "p-r1-h3": "15:40" } };
    const t = computeTimetable(pinned, patch(ran, h2, { startedAt: at("15:03"), endedAt: at("15:03"), walkover: true }), opts(at("15:03")));
    expect(row(t, "p-r1-h3").start).toBe("15:40");
  });

  it("Hold still holds everything that has not started; the walkover keeps its time", () => {
    const held = { ...main, hold: { since: at("15:04"), reason: "wind" } };
    const t = computeTimetable(held, patch(ran, h2, { startedAt: at("15:03"), endedAt: at("15:03"), walkover: true }), opts(at("15:05")));
    expect(row(t, "p-r1-h2")).toMatchObject({ start: "15:03", status: "done", walkover: true });
    expect(row(t, "p-r1-h3").status).toBe("held");
  });
});
