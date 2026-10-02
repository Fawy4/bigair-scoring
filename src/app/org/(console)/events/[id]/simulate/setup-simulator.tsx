"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/lib/ui-copy";
import { enableSimulator } from "./actions";

/** A simulation event that was not made by "Run as simulation" (the Demo) is set up for the simulator once, then the page reloads. */
export function SetupSimulator({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enableSimulator(eventId).then((r) => (r.ok ? router.refresh() : setError(r.message)));
  }, [eventId, router]);
  return (
    <p className="panel font-semibold" role={error ? "alert" : "status"} data-testid="sim-setup">
      {error ?? copy.simulator.settingUp}
    </p>
  );
}
