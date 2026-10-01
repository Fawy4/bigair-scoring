import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The official screens have their own font sizes (text-body, text-small, text-name, text-digit, text-timer-slim, text-timer-head; tailwind.config.ts).
// Without this, tailwind-merge takes them for text colours and drops one of two classes written side by side.
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["body", "small", "name", "digit", "timer-slim", "timer-head"] }] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
