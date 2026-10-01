"use client";

import { RouteError } from "@/components/route-error";
import { copy } from "@/lib/ui-copy";

/** The public event pages (live scores, ladders, timetable, registration). */
export default function PublicEventError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} area="public-event" back={{ href: "/", label: copy.crash.backHome }} />;
}
