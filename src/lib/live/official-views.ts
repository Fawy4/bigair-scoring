import { viewPreference, type JudgeView } from "./rider-sheet";
import { spotterViewPreference, type SpotterView } from "./spotter-sheet";

/**
 * THE ONE SWITCH (0.24.0). Officials see one view only: the Rider sheet (judges, in every division, and the head judge's Score tab; spotters). The judges' Queue and the
 * spotter's Trick list stay in the code, hidden. To bring them back, change this one line to `true`: the "Rider sheet / Queue" and "Rider sheet / Trick list" switches
 * return and each phone's own choice is read again. Nothing else needs to change.
 */
export const SHOW_HIDDEN_OFFICIAL_VIEWS = false;

/**
 * The test-only path. The browser tests written before 0.24.0 drive the Queue and the Trick list, so a TEST server may reach them: it needs BOTH the server setting
 * SHOW_HIDDEN_OFFICIAL_VIEWS=1 (never set on Vercel) and this marker in the phone's own storage (a test puts it there). No address, setting or stored choice on the live
 * site can open the hidden views: without the server setting the marker is ignored.
 */
export const TEST_VIEWS_MARKER = "bigair.testViews";

/** The server setting, read in server code only (the live site never sets it). */
export const hiddenViewsTestServer = (): boolean => process.env.SHOW_HIDDEN_OFFICIAL_VIEWS === "1";

export function testPathOpen(serverFlag: boolean | undefined, storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  if (!serverFlag) return false;
  try {
    return storage?.getItem(TEST_VIEWS_MARKER) === "1";
  } catch {
    return false;
  }
}

interface Opening<V> {
  view: V;
  switchShown: boolean;
}

/** The judge's view: always the Rider sheet, unless the switch above is on or this is the test path (then the phone's own choice). */
export function judgeViewFor(i: { stored: string | null; testPath: boolean; show?: boolean }): Opening<JudgeView> {
  const open = (i.show ?? SHOW_HIDDEN_OFFICIAL_VIEWS) || i.testPath;
  return { view: open ? viewPreference.read({ getItem: () => i.stored }) : "sheet", switchShown: open };
}

/** The spotter's view: always the Rider sheet, unless the switch above is on or this is the test path. */
export function spotterViewFor(i: { stored: string | null; testPath: boolean; show?: boolean }): Opening<SpotterView> {
  const open = (i.show ?? SHOW_HIDDEN_OFFICIAL_VIEWS) || i.testPath;
  return { view: open ? spotterViewPreference.read({ getItem: () => i.stored }) : "sheet", switchShown: open };
}
