import { copy } from "@/lib/ui-copy";
import type { FeedbackRole } from "@/lib/feedback/format";

const T = copy.ask;
const MAX = 4000;

/** The feedback note a thumb writes: the verdict, the question, the answer and the context, within the note's 4 000 characters (the answer is shortened first). */
export function askNoteBody(rating: "up" | "down", question: string, answer: string, context: string): string {
  const head = T.noteHeading(T.noteVerdict[rating]);
  const q = T.noteQuestion(question.slice(0, 1000));
  const c = T.noteContext(context.slice(0, 1200));
  const room = MAX - head.length - q.length - c.length - 3 - T.noteAnswer("").length;
  const a = answer.length > room ? `${answer.slice(0, Math.max(0, room - 1))}…` : answer;
  return [head, q, T.noteAnswer(a), c].join("\n");
}

/** A log role as a note's author role: logins keep theirs, every PIN seat is an "official". */
export function noteRole(role: string): FeedbackRole {
  return role === "owner" || role === "staff" || role === "organiser" ? role : "official";
}
