import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { askInstructions, instructionsFrom } from "./manual";

// One text for the in-product agent and the Claude Project: docs/manual/ASK-INSTRUCTIONS.md and docs/07's "Project instructions" block.
const doc07 = readFileSync(path.join(process.cwd(), "docs", "07-BUILD-PROMPTS.md"), "utf8");

describe("the support agent's instructions", () => {
  it("are the same text in docs/07 and in docs/manual/ASK-INSTRUCTIONS.md", () => {
    const section = doc07.slice(doc07.indexOf("## Sendbook support agent"));
    const block = /\*\*Project instructions:\*\*\n````\n([\s\S]*?)\n````/.exec(section)?.[1];
    expect(block, "docs/07 has no Project instructions block").toBeTruthy();
    expect(block!.trim()).toBe(askInstructions());
  });
  it("send only the part below the header line", () => {
    expect(instructionsFrom("# Title\n\nAbout.\n\n---\n\nYou are X.\n")).toBe("You are X.");
    expect(askInstructions().startsWith("You are Sendbook's support agent.")).toBe(true);
    expect(askInstructions()).not.toContain("# Ask Sendbook — instructions");
  });
  it("tell the agent to cite the manual and never to handle PINs", () => {
    expect(askInstructions()).toContain("Manual: [title](/help#anchor)");
    expect(askInstructions()).toMatch(/Never ask for, repeat or guess a PIN/);
  });
});
