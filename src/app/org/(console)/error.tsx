"use client";

import { RouteError } from "@/components/route-error";
import { copy } from "@/lib/ui-copy";

/** The organiser screens outside an event (event list, settings, feedback). */
export default function OrganiserError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} area="organiser" back={{ href: "/org", label: copy.crash.backOrganiser }} />;
}
