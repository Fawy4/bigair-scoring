export interface ConfigRow {
  name: string;
  /** What breaks when it is missing. */
  needed: string;
  required: boolean;
  present: boolean;
}

const NAMES: Array<{ name: string; needed: string; required: boolean }> = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", needed: "every page that reads the database", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", needed: "every page that reads the database (the publishable key)", required: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", needed: "inviting organisers, removing logo files when deleting, and building the demo draw (the secret key)", required: true },
  { name: "NEXT_PUBLIC_PRODUCT_NAME", needed: "the built-in product name (optional: platform settings can override it)", required: false },
  { name: "NEXT_PUBLIC_DEFAULT_TZ", needed: "the built-in default time zone (optional: falls back to Africa/Cairo)", required: false },
  { name: "NEXT_PUBLIC_SITE_URL", needed: "links in emails when the request address is unknown (optional)", required: false },
  { name: "ANTHROPIC_API_KEY", needed: "Ask Sendbook, the in-product assistant (optional: without it the Ask button is hidden)", required: false },
];

/** Which settings exist. Only names and yes/no are ever returned, never a value. */
export function checkServerConfig(env: Record<string, string | undefined>): ConfigRow[] {
  return NAMES.map((n) => ({ ...n, present: Boolean(env[n.name]?.trim()) }));
}
