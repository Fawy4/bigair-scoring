import { Fragment, type ReactNode } from "react";

/**
 * An answer as text: paragraphs and list lines as they come, **bold** in bold, and [words](/help#anchor) as a link to the manual (only /help links
 * become links; anything else stays text). No HTML from the model is ever put on the page.
 */
export function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) =>
        line.trim() ? (
          <p key={i} className="whitespace-pre-wrap break-words">
            {inline(line)}
          </p>
        ) : null,
      )}
    </>
  );
}

function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:https?:\/\/[^\s)]+)?\/help#[A-Za-z0-9_-]+)\)/g;
  let at = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > at) out.push(<Fragment key={k++}>{line.slice(at, m.index)}</Fragment>);
    if (m[1] !== undefined) out.push(<strong key={k++}>{m[1]}</strong>);
    else
      out.push(
        <a key={k++} href={m[3].replace(/^https?:\/\/[^/]+/, "")} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
          {m[2]}
        </a>,
      );
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push(<Fragment key={k++}>{line.slice(at)}</Fragment>);
  return out;
}
