import type { Identifiers } from "@/lib/riders/identifiers";

export type EntryStatus = "registered" | "confirmed" | "withdrawn" | "no_show" | "declined";

export interface EntryRow {
  id: string;
  riderId: string;
  seed: number | null;
  status: EntryStatus;
  source: string;
  identifiers: Identifiers;
  declineReason: string | null;
  createdAt: string;
  first: string;
  last: string;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  sponsor: string | null;
  photoUrl: string | null;
  /** A link a person can open: the external address, or a short-lived link for a stored photo. */
  photoLink: string | null;
}

export interface OrgRider {
  id: string;
  first: string;
  last: string;
  email: string | null;
  nationality: string | null;
}

export interface DivisionInfo {
  id: string;
  name: string;
  hasOwnScheme: boolean;
  drawLocked: boolean;
  shuffleSeed: number | null;
}

export const fullName = (r: { first: string; last: string }) => `${r.first} ${r.last}`.trim();
