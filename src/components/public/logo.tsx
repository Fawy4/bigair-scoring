import Image from "next/image";

const STORAGE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

/**
 * A logo or sponsor picture at a fixed height. Pictures from the project's own storage are shrunk by Next (modern formats, only the size the phone needs); anything
 * else is a plain lazy image with its size stated, so the page never jumps.
 */
export function Logo({ src, alt, height, maxWidth = 160, priority = false }: { src: string; alt: string; height: number; maxWidth?: number; priority?: boolean }) {
  let host = "";
  try {
    host = new URL(src).hostname;
  } catch {
    return null;
  }
  const style = { height, width: "auto", maxWidth, objectFit: "contain" as const };
  if (STORAGE_HOST && host === STORAGE_HOST) return <Image src={src} alt={alt} width={maxWidth * 2} height={height * 2} sizes={`${maxWidth}px`} priority={priority} style={style} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} height={height} loading={priority ? "eager" : "lazy"} decoding="async" style={style} />;
}
