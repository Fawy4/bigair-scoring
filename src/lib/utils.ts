import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The official screens have their own font sizes (text-pad-digit, text-rider-name, text-timer; tailwind.config.ts).
// Without this, tailwind-merge takes them for text colours and drops one of two classes written side by side.
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["pad-digit", "rider-name", "timer"] }] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
