import { NotFoundPage } from "@/components/not-found-page";
import { getProductName } from "@/lib/platform/public-settings";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.notFound.eventTitle, robots: { index: false, follow: false } };

/** A private, unpublished, simulation or unknown event: one answer for all of them, so a visitor learns nothing about which it is. */
export default async function EventNotPublic() {
  return <NotFoundPage product={await getProductName()} title={copy.notFound.eventTitle} body={copy.notFound.eventBody} homeLabel={copy.notFound.home} />;
}
