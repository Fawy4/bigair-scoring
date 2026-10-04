/** Where the simulation's settings came from, for the panel's line: the real event's name and the time (in the event's time zone) they were copied or last refreshed. */
export function settingsFrom(input: { eventName: string | null; at: string | null; createdAt?: string | null; timezone: string }): { eventName: string; time: string } | null {
  const when = input.at ?? input.createdAt ?? null;
  if (!input.eventName || !when) return null;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(when));
  return { eventName: input.eventName, time };
}
