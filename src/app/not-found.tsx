import { NotFoundPage } from "@/components/not-found-page";
import { getProductName } from "@/lib/platform/public-settings";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.notFound.pageTitle, robots: { index: false, follow: false } };

/** Any address that does not exist: the same look as the rest of the product, with a way home. */
export default async function NotFound() {
  return <NotFoundPage product={await getProductName()} title={copy.notFound.pageTitle} body={copy.notFound.pageBody} homeLabel={copy.notFound.home} />;
}
