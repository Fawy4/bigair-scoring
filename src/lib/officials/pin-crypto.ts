import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * The key that locks the PINs kept for "Show PIN" and "Print cards". It never enters the database: SEAT_PIN_KEY when set,
 * otherwise derived from the service key that already exists only on the server. Server code only.
 */
export function seatPinKey(env: Record<string, string | undefined> = process.env): Buffer {
  if (env.SEAT_PIN_KEY) return createHash("sha256").update(`seat-pin-v1:key:${env.SEAT_PIN_KEY}`).digest();
  if (env.SUPABASE_SERVICE_ROLE_KEY) return createHash("sha256").update(`seat-pin-v1:service:${env.SUPABASE_SERVICE_ROLE_KEY}`).digest();
  throw new Error("No key available to protect seat PINs (set SUPABASE_SERVICE_ROLE_KEY or SEAT_PIN_KEY).");
}

/** The key, or null when the server has no key to use (callers then show a plain message instead of failing). */
export function tryPinKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  try {
    return seatPinKey(env);
  } catch {
    return null;
  }
}

/** AES-256-GCM, new random value each time: base64 of iv + tag + ciphertext. */
export function encryptPin(pin: string, key: Buffer): string {
  if (!/^\d{6}$/.test(pin)) throw new Error("A PIN has six digits.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/** The PIN, or null when the value is damaged or the key is not the one that locked it. */
export function decryptPin(blob: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(blob, "base64");
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const pin = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return /^\d{6}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
}
