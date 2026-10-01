"use client";

import { RouteError } from "@/components/route-error";
import { copy } from "@/lib/ui-copy";

/** Covers every step of the event wizard (event, divisions, riders, officials, draw, run order, print views): the header and the step list stay, only the step shows the reason. */
export default function EventStepError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} area="organiser-step" back={{ href: "/org", label: copy.crash.backOrganiser }} />;
}
