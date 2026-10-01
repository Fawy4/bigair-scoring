// A throwaway public event on the hosted project, to look at the public site on a real phone (Phase 6). Never touches Arrow, EKL or Demo.
//   npm run preview:public -- create          makes "Public preview" with its own organisation and prints its address
//   npm run preview:public -- remove <code>   deletes it again (the code is the last part of the address)
// The event is a normal public event (it appears on the home page list), so remove it when you are done.
import { createClient } from "@supabase/supabase-js";
import { createPublicWorld } from "../e2e/public-world";
import { loadEnv, need } from "./env.mjs";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

async function main() {
  const [cmd, code] = process.argv.slice(2);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  if (cmd === "create") {
    const w = await createPublicWorld({ settings: { livePollSec: 5, screenRotateSec: 20 }, branding: { sponsors: [{ name: "WOO Events" }, { name: "Arrow" }] } });
    const run = w.org.run;
    // not "e2e-": the browser tests' clean-up sweeps those, and this one is for a person to look at
    await db.from("organisations").update({ name: "Public preview (delete me)", slug: `preview-${run}` }).eq("id", w.orgId);
    await db.from("events").update({ name: "Public preview", slug: `preview-${run}` }).eq("id", w.eventId);
    await db.from("heats").update({ duration_sec: 7200 }).eq("id", w.running); // stays on the water for two hours
    console.log(`Public page:  /e/preview-${run}`);
    console.log(`Big screen:   /screen/preview-${run}`);
    console.log(`Rider page:   /e/preview-${run}/riders/${w.entries[0]}`);
    console.log(`Remove with:  npm run preview:public -- remove ${run}`);
  } else if (cmd === "remove" && /^[0-9a-f]{8}$/.test(code ?? "")) {
    const { data: org } = await db.from("organisations").select("id").eq("slug", `preview-${code}`).maybeSingle();
    if (org) console.log((await db.rpc("purge_organisation", { p_org: org.id })).error?.message ?? "Removed the preview event and its organisation.");
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users.users.filter((x) => x.email?.startsWith(`e2e-${code}`))) await db.auth.admin.deleteUser(u.id);
    console.log("Removed the preview logins.");
  } else {
    console.log("Use: create | remove <code>");
  }
}
void main();
