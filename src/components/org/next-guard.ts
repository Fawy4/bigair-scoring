/**
 * "Next saves the form first" (Phase 7a, 8a). A step with a form registers a function here; the footer's Next button runs it and only moves on when it answers true.
 * One guard at a time, in the browser only.
 */
type Guard = () => Promise<boolean> | boolean;
let current: Guard | null = null;

export function registerNextGuard(guard: Guard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

export async function runNextGuard(): Promise<boolean> {
  if (!current) return true;
  try {
    return await current();
  } catch {
    return false;
  }
}
