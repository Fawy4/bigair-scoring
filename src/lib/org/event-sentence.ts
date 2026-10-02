import { copy } from "@/lib/ui-copy";
import { eventDatesInWords } from "./event-dates";

export interface EventSentenceInput {
  name: string;
  start: string;
  end: string;
  location: string;
  timezone: string;
  lycras: boolean;
  live: boolean;
  results: boolean;
}

/** The live sentence at the top of the Event step: "Arrow Big Air · 2–4 Oct 2026 · El Gouna · times in Africa/Cairo · coloured lycras · nothing public until …". */
export function eventSentence(i: EventSentenceInput): string {
  const T = copy.eventSentence;
  const dates = i.start || i.end ? eventDatesInWords(i.start || null, i.end || null) : T.datesNotSet;
  const parts = [i.name.trim() || T.newEvent, dates];
  if (i.location.trim()) parts.push(i.location.trim());
  parts.push(T.zone(i.timezone), i.lycras ? T.lycras : T.names);
  parts.push(i.live && i.results ? T.liveAndResults : i.live ? T.liveOnly : i.results ? T.resultsOnly : T.nothingPublic);
  return parts.join(" · ");
}
