import { copy } from "@/lib/ui-copy";

export interface PanelStatus {
  name: string;
  minJudges: number;
  assigned: number;
}

/** "Pro Men needs 3 judges, 2 assigned" for every division that is short. A warning only: Start heat does the blocking later. */
export function panelShortfalls(divisions: PanelStatus[]): string[] {
  return divisions.filter((d) => d.assigned < d.minJudges).map((d) => copy.officials.shortfall(d.name, d.minJudges, d.assigned));
}
