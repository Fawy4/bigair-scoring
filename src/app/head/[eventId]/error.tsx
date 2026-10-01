"use client";

import { RouteError } from "@/components/route-error";
import { copy } from "@/lib/ui-copy";

/** If this live screen fails, the person sees a one-line reason and a way back instead of "Application error". */
export default function HeadError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} area="head" back={{ href: "/join", label: copy.crash.backJoin }} />;
}
