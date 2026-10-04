/** Why "Skip to end of heat" cannot act right now (null: it can). Pure: the server reads the rows, this decides. */
export type SkipRefusal = "noHeat" | "inYellow" | "paused" | null;

export function skipRefusal(input: { state: string; heats: ReadonlyArray<{ status: string; armed: boolean }> }): SkipRefusal {
  if (input.heats.some((h) => h.status === "running") && input.state !== "paused") return null;
  if (input.state === "paused" && input.heats.some((h) => h.status === "running" || h.status === "paused")) return "paused";
  if (input.heats.some((h) => h.status === "paused")) return "paused";
  if (input.heats.some((h) => h.status === "scheduled" && h.armed)) return "inYellow";
  return "noHeat";
}
