"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { landingPath } from "@/lib/auth/landing";
import { parseLinkHash } from "@/lib/auth/link-hash";
import { copy } from "@/lib/ui-copy";

/**
 * Reads the session out of the address (after "#"), keeps it as the browser's own sign-in, and goes to the page the link was made for: the organiser's own organisation
 * (or /admin for the platform owner). An expired or already used link goes to the sign-in page with the usual explanation.
 */
export function LinkSignIn() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = new URLSearchParams(window.location.search).get("next");
    const parsed = parseLinkHash(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname + window.location.search); // the tokens do not stay in the address bar or the history
    void (async () => {
      if (parsed.kind !== "session") return router.replace("/org/login?error=expired");
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
      if (error) {
        setFailed(true);
        return router.replace("/org/login?error=expired");
      }
      const { data: platform } = await supabase.rpc("platform_session");
      const isPlatformAdmin = Boolean((platform as { role?: string | null } | null)?.role);
      router.replace(landingPath({ next, isPlatformAdmin }));
      router.refresh();
    })();
  }, [router]);
  return (
    <p role={failed ? "alert" : "status"} data-testid="link-sign-in" className="text-body font-semibold">
      {failed ? copy.login.linkExpired : copy.login.signingIn}
    </p>
  );
}
