/**
 * The simulator page asks the server for the status every second or two with server actions, and a click on a link in the app waits behind the actions already on their way
 * (they run one after another), so on that page the left rail and the Previous / Next buttons did nothing (Polish 3, item 4). There the browser goes to the address itself.
 */
export const needsHardNavigation = (path: string): boolean => /\/org\/events\/[^/]+\/simulate\/?$/.test(path);
