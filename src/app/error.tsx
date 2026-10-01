"use client";

import { RouteError } from "@/components/route-error";
import { copy } from "@/lib/ui-copy";

/** The last net under the whole site: any page without a boundary of its own ends here. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} area="app" back={{ href: "/", label: copy.crash.backHome }} />;
}
