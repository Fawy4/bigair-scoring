import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { PRODUCT_NAME } from "@/lib/product";
import { DEFAULT_TAGLINE, resolvePlatformSettings, type PlatformSettings, type SettingRow } from "./settings";

export const SETTINGS_TAG = "platform-settings";
const ENV = { productName: PRODUCT_NAME, timezone: process.env.NEXT_PUBLIC_DEFAULT_TZ || "Africa/Cairo" };

/** Read through the public function with the publishable key, so it needs no login and can be cached for everybody. */
const load = unstable_cache(
  async (): Promise<PlatformSettings> => {
    try {
      const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { data, error } = await anon.rpc("public_platform_settings");
      if (error || !data || typeof data !== "object") throw new Error("settings unavailable");
      const s = data as Record<string, unknown>;
      const rows: SettingRow[] = ["product_name", "logo_url", "tagline", "default_timezone", "legal_texts"].map((key) => ({ key, value: s[key] }));
      return resolvePlatformSettings(rows, ENV);
    } catch {
      // The site must keep working when the settings cannot be read: fall back to the built-in values.
      return resolvePlatformSettings([], ENV);
    }
  },
  ["platform-settings"],
  { tags: [SETTINGS_TAG], revalidate: 60 },
);

/** Product name, logo, tagline, default time zone and legal texts. A product name set by the owner overrides NEXT_PUBLIC_PRODUCT_NAME everywhere. */
export const getPlatformSettings = load;
export const getProductName = async () => (await load()).productName;
export { DEFAULT_TAGLINE };
