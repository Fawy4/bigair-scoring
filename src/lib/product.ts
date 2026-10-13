/**
 * The product is called Sendbook (as on Instagram); "Big Air" stays only where it names the sport. The name still comes from NEXT_PUBLIC_PRODUCT_NAME (docs/06 §12 decision 1) and the
 * owner's platform setting can replace it, but an empty value or one of the two names used before the New look ("[PRODUCT_NAME]", "Big Air Scoring") reads as Sendbook, so an
 * environment that still carries the old name shows the right one.
 */
export const PRODUCT_DEFAULT = "Sendbook";
const OLD_NAMES = new Set(["", "[PRODUCT_NAME]", "Big Air Scoring"]);
export function productNameOf(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return OLD_NAMES.has(t) ? PRODUCT_DEFAULT : t;
}
export const PRODUCT_NAME = productNameOf(process.env.NEXT_PUBLIC_PRODUCT_NAME);
