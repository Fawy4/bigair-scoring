/** Keeps the screen on while a heat runs (docs/PLAN-phase-5 step 7). Re-requested when the page comes back to the front. */
export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function holdScreenAwake(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let stopped = false;
  const request = async () => {
    if (stopped || !wakeLockSupported() || document.visibilityState !== "visible") return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
    } catch {
      sentinel = null;
    }
  };
  const onVisible = () => void request();
  void request();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
  };
}
