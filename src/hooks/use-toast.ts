"use client";

import * as React from "react";

/** Small confirmations only (decision 16): errors and anything that must be read stay on screen, not in a toast. */
export interface ToastItem {
  id: number;
  title: string;
  description?: string;
}

const AUTO_CLOSE_MS = 4000;
let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<(list: ToastItem[]) => void>();

function emit() {
  for (const l of listeners) l(items);
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(input: { title: string; description?: string }) {
  const id = nextId++;
  items = [...items, { id, ...input }].slice(-3);
  emit();
  setTimeout(() => dismissToast(id), AUTO_CLOSE_MS);
  return id;
}

export function useToast() {
  const [list, setList] = React.useState<ToastItem[]>(items);
  React.useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return { toasts: list, toast, dismiss: dismissToast };
}
