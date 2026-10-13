import type { MetadataRoute } from "next";
import { getProductName } from "@/lib/platform/public-settings";
import { PRODUCT_NAME } from "@/lib/product";

/** The name under the icon when the app is added to a phone's home screen: the product's name (Sendbook), as in the browser tab. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name: string = PRODUCT_NAME;
  try {
    name = await getProductName();
  } catch {
    // the settings are not needed for the name
  }
  return { name, short_name: name, start_url: "/", display: "browser", background_color: "#ffffff", theme_color: "#111111" };
}
