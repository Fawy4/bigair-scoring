/** The big screen's two colour modes. Dark: white on a dark ground (the default). Day: dark text on a light ground, for full sun. */
export type ScreenMode = "dark" | "day";

export const SCREEN_MODE_KEY = "bigair-screen-mode";
/** The control appears on mouse move or tap and goes away again after this long, so the screen stays clean. */
export const SCREEN_CONTROL_MS = 3000;

export const parseScreenMode = (value: unknown, fallback: ScreenMode): ScreenMode => (value === "dark" || value === "day" ? value : fallback);
export const otherMode = (m: ScreenMode): ScreenMode => (m === "dark" ? "day" : "dark");
