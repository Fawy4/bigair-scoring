// Applies the project's auth settings through the Management API (decision 9, docs/05 §12).
//   node scripts/configure-auth.mjs [--site-url https://production.example] [--with-template]
// --with-template installs the token-hash magic-link email (Supabase allows it only with custom SMTP).
// Never prints secrets. Idempotent.
import { readFileSync } from "node:fs";
import { loadEnv, need } from "./env.mjs";

loadEnv();
need(["SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]);
const arg = process.argv.indexOf("--site-url");
const site = arg > -1 ? process.argv[arg + 1].replace(/\/$/, "") : null;

const allow = ["http://localhost:3000/**", "https://*.vercel.app/**"];
if (site) allow.push(`${site}/**`);

const body = {
  external_anonymous_users_enabled: true,
  uri_allow_list: allow.join(","),
  ...(process.argv.includes("--with-template")
    ? { mailer_subjects_magic_link: "Your sign-in link for the Big Air scoring system", mailer_templates_magic_link_content: readFileSync("supabase/auth/magic-link.html", "utf8") }
    : {}),
  ...(site ? { site_url: site } : {}),
};
const url = `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/config/auth`;
const headers = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };
const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
if (!res.ok) {
  console.error(`FAILED: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const cfg = await (await fetch(url, { headers })).json();
console.log({
  anonymous_sign_ins: cfg.external_anonymous_users_enabled,
  redirect_allow_list: cfg.uri_allow_list,
  site_url: cfg.site_url,
  magic_link_template_uses_token_hash: String(cfg.mailer_templates_magic_link_content).includes("TokenHash"),
});
