"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, MessageCircleQuestion, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { collectAskContext } from "@/lib/ask/collect";
import { decodeLines, type Citation } from "@/lib/ask/stream";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { AnswerText } from "./answer-text";

const T = copy.ask;
const ID = /^\/(?:org\/events|head|judge|spot|screen)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** A refusal sentence from the server instead of an answer. */
  error?: boolean;
  logId?: string | null;
  cite?: Citation | null;
  rating?: "up" | "down";
  ratingError?: string;
  done?: boolean;
}

/**
 * The quiet "Ask" button and its panel: a side panel on a laptop, a bottom sheet on a phone. Hidden unless the server says this person may ask here
 * (key present, signed in or a seat of this event). `variant` matches the frame it sits in: the organiser top bar or an official's beach header.
 */
export function AskLauncher({ variant, withHelp = false, compact = false }: { variant: "org" | "beach"; withHelp?: boolean; /** A phone's top bar: Help is an icon. */ compact?: boolean }) {
  const path = usePathname();
  const eventId = ID.exec(path)?.[1] ?? null;
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/ask${eventId ? `?event=${eventId}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((r: { enabled?: boolean }) => live && setEnabled(Boolean(r.enabled)))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, [eventId]);

  const beach = variant === "beach";
  const btn = beach
    ? "inline-flex min-h-tap items-center gap-1 rounded-xl border border-beach-border bg-beach-bg px-3 text-small font-semibold text-beach-ink"
    : "inline-flex min-h-[var(--org-ctl)] items-center gap-2 rounded-[8px] border border-transparent px-3 py-1.5 text-body font-semibold text-beach-ink hover:bg-beach-surface";

  return (
    <>
      {withHelp ? (
        <a href="/help" target="_blank" rel="noopener" className={btn} data-testid="help-link-top" aria-label={compact ? T.help : undefined}>
          <BookOpen aria-hidden className="size-4" />
          {compact ? null : T.help}
        </a>
      ) : null}
      {enabled ? (
        <button type="button" className={btn} onClick={() => setOpen(true)} aria-label={T.buttonHelp} aria-haspopup="dialog" aria-expanded={open} data-testid="ask-button">
          <MessageCircleQuestion aria-hidden className="size-4" />
          {T.button}
        </button>
      ) : null}
      {open ? <AskPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AskPanel({ onClose }: { onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [turns]);

  const patchLast = useCallback((patch: (t: Turn) => Turn) => setTurns((all) => [...all.slice(0, -1), patch(all[all.length - 1])]), []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return setProblem(T.errors.empty);
    if (busy) return;
    setProblem(null);
    setBusy(true);
    const history = turns.filter((t) => !t.error && t.content).map((t) => ({ role: t.role, content: t.content }));
    setTurns((all) => [...all, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setQuestion("");
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, context: collectAskContext(), history }) });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        patchLast(() => ({ role: "assistant", content: body?.error ?? T.errors.failed, error: true, done: true }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let rest = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const r = decodeLines(rest, dec.decode(value, { stream: true }));
        rest = r.rest;
        for (const ev of r.events) {
          if (ev.type === "text") patchLast((t) => ({ ...t, content: t.content + ev.text }));
          else if (ev.type === "done") patchLast((t) => ({ ...t, logId: ev.logId, cite: ev.cite, done: true }));
          else if (ev.type === "error") patchLast((t) => ({ ...t, content: t.content || ev.message, error: !t.content, done: true }));
        }
      }
      patchLast((t) => (t.done ? t : { ...t, content: t.content || T.errors.failed, error: !t.content, done: true }));
    } catch {
      patchLast((t) => ({ ...t, content: t.content || T.errors.failed, error: !t.content, done: true }));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  async function rate(index: number, rating: "up" | "down") {
    const t = turns[index];
    if (!t?.logId || t.rating) return;
    setTurns((all) => all.map((x, i) => (i === index ? { ...x, rating, ratingError: undefined } : x)));
    const res = await fetch("/api/ask/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId: t.logId, rating }) }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setTurns((all) => all.map((x, i) => (i === index ? { ...x, rating: undefined, ratingError: body?.error ?? T.errors.ratingFailed } : x)));
    }
  }

  const big = "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border px-4 text-body font-semibold";
  return (
    <div data-no-ask data-no-learn-more className="fixed inset-0 z-[60] flex items-end justify-end bg-black/30 sm:items-stretch" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={T.panelTitle}
        data-testid="ask-panel"
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-beach-line bg-beach-bg text-beach-ink shadow-xl sm:h-full sm:max-h-none sm:w-[min(28rem,100vw)] sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <header className="flex items-center justify-between gap-2 border-b border-beach-line px-4 py-2">
          <h2 className="text-name font-semibold">{T.panelTitle}</h2>
          <div className="flex items-center gap-1">
            {turns.length ? (
              <button type="button" className="min-h-tap rounded-xl px-3 text-small font-semibold underline underline-offset-2" onClick={() => setTurns([])} disabled={busy} data-testid="ask-start-again">
                {T.startAgain}
              </button>
            ) : null}
            <button type="button" className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl" onClick={onClose} aria-label={T.close} data-testid="ask-close">
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3" aria-live="polite" data-testid="ask-conversation">
          {turns.length === 0 ? <p className="text-body font-medium text-beach-muted">{T.intro}</p> : null}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="self-end rounded-2xl bg-beach-surface px-3 py-2 text-body font-semibold" data-testid="ask-question">
                <span className="sr-only">{T.you}: </span>
                {t.content}
              </div>
            ) : (
              <div key={i} className={cn("flex flex-col gap-2 rounded-2xl border px-3 py-2 text-body", t.error ? "border-beach-crash" : "border-beach-line")} data-testid="ask-answer" data-done={t.done ? "1" : "0"}>
                <span className="sr-only">{T.sendbook}: </span>
                {t.content ? <AnswerText text={t.content} /> : <p className="text-beach-muted">{T.thinking}</p>}
                {t.error && t.done ? (
                  <a href="/help" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
                    {copy.manual.title}
                  </a>
                ) : null}
                {t.cite ? (
                  <a href={t.cite.href} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2" data-testid="ask-cite">
                    {T.cited(t.cite.title)}
                  </a>
                ) : null}
                {t.done && t.logId && !t.error ? (
                  <div className="flex flex-col gap-1 border-t border-beach-line pt-2" data-testid="ask-rating">
                    {t.rating ? (
                      <p role="status" className="text-small font-semibold">
                        {t.rating === "up" ? T.thanksRight : T.thanksWrong}
                      </p>
                    ) : (
                      <>
                        <p className="text-small font-semibold">{T.wasRight}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" className={cn(big, "border-beach-border bg-beach-bg")} onClick={() => rate(i, "up")} data-testid="ask-right">
                            <ThumbsUp aria-hidden className="size-5" />
                            {T.right}
                          </button>
                          <button type="button" className={cn(big, "border-beach-border bg-beach-bg")} onClick={() => rate(i, "down")} data-testid="ask-wrong">
                            <ThumbsDown aria-hidden className="size-5" />
                            {T.wrong}
                          </button>
                        </div>
                      </>
                    )}
                    {t.ratingError ? (
                      <p role="alert" className="text-small font-semibold">
                        {t.ratingError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ),
          )}
          <div ref={end} />
        </div>

        <form onSubmit={ask} className="flex flex-col gap-2 border-t border-beach-line px-4 py-3">
          <label htmlFor="ask-input" className="text-small font-semibold">
            {T.inputLabel}
          </label>
          <textarea
            id="ask-input"
            ref={input}
            rows={2}
            maxLength={2000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={T.placeholder}
            className="w-full rounded-xl border border-beach-border bg-beach-bg px-3 py-2 text-body text-beach-ink"
            data-testid="ask-input"
          />
          {problem ? (
            <p role="alert" className="text-small font-semibold">
              {problem}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={cn(big, "border-beach-accent bg-beach-accent text-beach-on-accent disabled:opacity-80")} data-testid="ask-send">
            {busy ? T.sending : T.send}
          </button>
          <p className="text-small font-medium text-beach-muted">{T.sentWith}</p>
        </form>
      </section>
    </div>
  );
}
