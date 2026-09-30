import { isValidTimeZone } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";

/** Platform settings. Stored as key/value rows; product_name overrides NEXT_PUBLIC_PRODUCT_NAME once set. */
export const DEFAULT_TAGLINE = "Live scoring and results for kite competitions";
export const SETTING_KEYS = ["product_name", "logo_url", "tagline", "legal_texts", "default_timezone"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface PlatformSettings {
  productName: string;
  logoUrl: string | null;
  tagline: string;
  defaultTimezone: string;
  legalTexts: { terms: string; privacy: string };
}

export interface SettingRow {
  key: string;
  value: unknown;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** What the site shows. Tolerant: a broken stored value falls back to the built-in one instead of breaking pages. */
export function resolvePlatformSettings(rows: readonly SettingRow[], env: { productName: string; timezone: string }): PlatformSettings {
  const get = (key: SettingKey) => rows.find((r) => r.key === key)?.value;
  const zone = text(get("default_timezone"));
  const legal = get("legal_texts");
  const legalObject = legal && typeof legal === "object" && !Array.isArray(legal) ? (legal as Record<string, unknown>) : {};
  const logo = text(get("logo_url"));
  return {
    productName: text(get("product_name")) || env.productName,
    logoUrl: /^https?:\/\//.test(logo) ? logo : null,
    tagline: text(get("tagline")) || DEFAULT_TAGLINE,
    defaultTimezone: zone && isValidTimeZone(zone) ? zone : env.timezone,
    legalTexts: { terms: text(legalObject.terms), privacy: text(legalObject.privacy) },
  };
}

export interface SettingsInput {
  productName: string;
  logoUrl: string | null;
  tagline: string;
  defaultTimezone: string;
  terms: string;
  privacy: string;
}
export type SettingsValidation = { ok: true; value: SettingsInput } | { ok: false; fields: Record<string, string> };

export function validatePlatformSettings(input: SettingsInput | Record<string, unknown>): SettingsValidation {
  const v = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const productName = text(v.productName);
  if (productName.length > 60) fields.productName = copy.admin.settings.validation.productName;
  const logoRaw = text(v.logoUrl);
  let logoUrl: string | null = null;
  if (logoRaw) {
    try {
      const u = new URL(logoRaw);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("protocol");
      logoUrl = u.toString();
    } catch {
      fields.logoUrl = copy.admin.settings.validation.logoUrl;
    }
  }
  const tagline = text(v.tagline).slice(0, 400) || DEFAULT_TAGLINE;
  if (text(v.tagline).length > 160) fields.tagline = copy.admin.settings.validation.tagline;
  const defaultTimezone = text(v.defaultTimezone);
  if (!defaultTimezone || !isValidTimeZone(defaultTimezone)) fields.defaultTimezone = copy.admin.settings.validation.timeZone;
  const terms = typeof v.terms === "string" ? v.terms.trim() : "";
  const privacy = typeof v.privacy === "string" ? v.privacy.trim() : "";
  if (terms.length > 20000) fields.terms = copy.admin.settings.validation.legal;
  if (privacy.length > 20000) fields.privacy = copy.admin.settings.validation.legal;
  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, value: { productName, logoUrl, tagline, defaultTimezone, terms, privacy } };
}

/** The rows to write. A blank product name or logo is stored as "not set" (null). */
export function settingsToRows(value: SettingsInput): Array<{ key: SettingKey; value: unknown }> {
  return [
    { key: "product_name", value: value.productName || null },
    { key: "logo_url", value: value.logoUrl || null },
    { key: "tagline", value: value.tagline || DEFAULT_TAGLINE },
    { key: "default_timezone", value: value.defaultTimezone },
    { key: "legal_texts", value: { terms: value.terms, privacy: value.privacy } },
  ];
}
