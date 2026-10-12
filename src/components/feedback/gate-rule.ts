/**
 * Where the Note button is never shown: the officials' own screens (spotter, judges, head judge's phone and console, observer, and the join step on the way in). It stays on
 * the organiser's own pages and on the simulator, which is an organiser's page. The big screens never have it either.
 */
const OFFICIALS = /^\/(spot|judge|head|observe|seat|screen)(\/|$)/;

export const noteButtonHidden = (path: string): boolean => OFFICIALS.test(path);
