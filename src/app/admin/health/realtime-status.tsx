"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/ui-copy";

/** Opens a throwaway Realtime channel and reports whether the connection came up. The word always accompanies the icon. */
export function RealtimeStatus() {
  const [state, setState] = useState<"checking" | "on" | "off">("checking");
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`admin-health-${Math.random().toString(36).slice(2)}`);
    const timer = setTimeout(() => setState((s) => (s === "checking" ? "off" : s)), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setState("on");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setState((s) => (s === "on" ? s : "off"));
    });
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);
  const text = state === "checking" ? copy.admin.health.realtimeChecking : state === "on" ? copy.admin.health.realtimeOn : copy.admin.health.realtimeOff;
  return (
    <span>
      <span aria-hidden="true">{state === "on" ? "✔ " : state === "off" ? "✖ " : "… "}</span>
      {text}
    </span>
  );
}
