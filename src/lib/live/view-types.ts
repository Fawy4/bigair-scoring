/** Shapes the live screens draw (the /design page fills them from fixtures, the real screens from the database). */
import type { LabelModel } from "@/lib/identification/rider-label";

export interface SheetAttempt {
  seq: number;
  trick: string;
  direction: "left" | "right" | null;
  status: "landed" | "crashed" | "pending";
  myScoreLabel: string | null;
  counted: boolean;
}

export interface RiderSheetModel {
  name: string;
  label: LabelModel;
  attempts: SheetAttempt[];
  left: number;
  right: number;
  counter: string;
}

export interface LiveRider {
  id: string;
  label: LabelModel;
  attempts: number;
  max: number;
}
