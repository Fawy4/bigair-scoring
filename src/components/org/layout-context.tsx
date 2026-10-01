"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

/** The two layouts of the organiser screens. The preview forces one per frame; the real shell (7a-1) asks the viewport with `useViewportLayout`. */
export type ShellLayout = "laptop" | "phone";

const LayoutContext = createContext<ShellLayout>("laptop");
export const ShellLayoutProvider = LayoutContext.Provider;
export const useShellLayout = (): ShellLayout => useContext(LayoutContext);

const QUERY = "(min-width: 1024px)";
const subscribe = (onChange: () => void) => {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};

/** Laptop from 1024 px wide, phone below. The server render assumes laptop. */
export function useViewportLayout(): ShellLayout {
  return useSyncExternalStore(subscribe, () => (window.matchMedia(QUERY).matches ? "laptop" : "phone"), () => "laptop");
}
