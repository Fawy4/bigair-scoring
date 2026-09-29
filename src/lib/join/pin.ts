import { randomBytes, randomInt } from "node:crypto";

/** What a person types ("482 913", "482-913") reduced to digits. */
export function normalizePin(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Six random digits, zero-padded. `random` is injectable for tests. Server code only. */
export function generatePin(random: (max: number) => number = (max) => randomInt(0, max)): string {
  return String(random(1_000_000)).padStart(6, "0");
}

/** Single-use QR token (URL-safe). Only its hash is stored. Server code only. */
export function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}

export function joinUrl(baseUrl: string, slug: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/e/${slug}/join?t=${token}`;
}
