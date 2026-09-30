"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { FEEDBACK_TAGS } from "@/lib/feedback/format";
import { copy } from "@/lib/ui-copy";
import { feedbackEligible, noteContext, saveNote, type NoteContext } from "./actions";

const T = copy.feedback;
const MAX_SHOT = 5 * 1024 * 1024;

type Recognition = { start: () => void; stop: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/**
 * The floating "Note" button for signed-in owners and organisers (never for officials or the public): type or dictate, choose a kind,
 * optionally attach or paste a screenshot. The page, event, division, heat and who is writing are saved with the note.
 */
export function FeedbackButton() {
  const path = usePathname();
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<NoteContext | null>(null);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<(typeof FEEDBACK_TAGS)[number]>("bug");
  const [shot, setShot] = useState<File | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const speechAvailable = typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  // only a signed-in owner or organiser gets the button (visitors and PIN sessions cost one local cookie check)
  useEffect(() => {
    const supabase = createClient();
    let live = true;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.is_anonymous) return live && setEligible(false);
      const r = await feedbackEligible().catch(() => ({ eligible: false }));
      if (live) setEligible(r.eligible);
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void check());
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function openPanel() {
    setOpen(true);
    setSaved(false);
    setError(null);
    const params = new URLSearchParams(window.location.search);
    const division = params.get("division");
    const heat = params.get("heat") ?? /\/heat\/([0-9a-f-]{36})/.exec(path)?.[1] ?? null;
    const r = await noteContext({ path, division: division && /^[0-9a-f-]{36}$/.test(division) ? division : null, heat });
    setCtx(r.ok ? r.context : null);
  }

  function close() {
    recognition.current?.stop();
    setOpen(false);
  }

  function takeImage(file: File | null | undefined) {
    setShotError(null);
    if (!file) return setShot(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setShotError(T.screenshotNotImage);
    if (file.size > MAX_SHOT) return setShotError(T.screenshotTooBig);
    setShot(file);
  }

  function toggleDictation() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-GB";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text) setBody((b) => `${b}${b && !/\s$/.test(b) ? " " : ""}${text.trim()}`);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      let screenshotPath: string | null = null;
      if (shot) {
        const ext = shot.type === "image/png" ? "png" : shot.type === "image/webp" ? "webp" : "jpg";
        screenshotPath = `${ctx.folder}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await createClient().storage.from("feedback").upload(screenshotPath, shot, { contentType: shot.type });
        if (upErr) throw new Error(T.failed);
      }
      const params = new URLSearchParams(window.location.search);
      const division = params.get("division");
      const heat = params.get("heat") ?? /\/heat\/([0-9a-f-]{36})/.exec(path)?.[1] ?? null;
      const r = await saveNote({ path, division: division && /^[0-9a-f-]{36}$/.test(division) ? division : null, heat, body, tag, screenshotPath });
      if (!r.ok) throw new Error(r.error);
      setSaved(true);
      setBody("");
      setShot(null);
    } catch (err) {
      setError((err as Error).message || T.failed);
    }
    setBusy(false);
  }

  if (!eligible) return null;
  return (
    <div className="org-console no-print" style={{ background: "transparent" }}>
      {!open ? (
        <button
          type="button"
          onClick={openPanel}
          aria-label={T.buttonHelp}
          data-testid="note-button"
          className="fixed bottom-4 right-4 z-50 flex h-14 min-w-14 items-center justify-center rounded-full border-4 border-[#111] bg-[#ffe14d] px-5 text-lg font-extrabold text-[#111] shadow-lg"
        >
          {T.button}
        </button>
      ) : (
        <div
          role="dialog"
          aria-label={T.panelTitle}
          data-testid="note-panel"
          className="fixed bottom-4 right-4 z-50 flex max-h-[90vh] w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-lg border-4 border-[#111] bg-white p-4 text-[#111] shadow-xl"
          onPaste={(e) => {
            const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
            if (item) takeImage(item.getAsFile());
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">{T.panelTitle}</h2>
            <button type="button" className="btn" onClick={close} data-testid="note-close">
              {T.cancel}
            </button>
          </div>
          {saved ? (
            <p role="status" className="text-lg font-bold" data-testid="note-saved">
              {T.saved}
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label htmlFor="note-body" className="font-bold">
                {T.bodyLabel}
              </label>
              <textarea id="note-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={T.bodyPlaceholder} maxLength={4000} className="w-full" />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn" onClick={toggleDictation} disabled={!speechAvailable} aria-pressed={listening} data-testid="note-dictate">
                  {listening ? `● ${T.dictateStop}` : T.dictate}
                </button>
                {!speechAvailable ? <span className="text-sm font-semibold">{T.dictateUnavailable}</span> : null}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="note-tag" className="font-bold">
                  {T.tagLabel}
                </label>
                <select id="note-tag" value={tag} onChange={(e) => setTag(e.target.value as typeof tag)}>
                  {FEEDBACK_TAGS.map((t) => (
                    <option key={t} value={t}>
                      {T.tags[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="note-shot" className="font-bold">
                  {T.screenshot}
                </label>
                <input id="note-shot" type="file" accept="image/png,image/jpeg,image/webp" data-testid="note-shot" onChange={(e) => takeImage(e.target.files?.[0])} />
                <p className="text-sm font-semibold">{T.screenshotHelp}</p>
                {shot ? (
                  <p className="font-bold" data-testid="note-shot-attached">
                    {T.screenshotAttached(shot.name || "image")}{" "}
                    <button type="button" className="underline" onClick={() => setShot(null)}>
                      {T.screenshotRemove}
                    </button>
                  </p>
                ) : null}
                {shotError ? <p role="alert" className="font-bold">{copy.common.problem(shotError)}</p> : null}
              </div>
              {ctx ? (
                <div className="rounded border-2 border-[#111] p-2 text-sm font-semibold" data-testid="note-context">
                  <p className="font-bold">{T.context}</p>
                  <p>{T.contextPage(ctx.pageLabel)}</p>
                  {ctx.eventName ? <p>{T.contextEvent(ctx.eventName)}</p> : null}
                  {ctx.divisionName ? <p>{T.contextDivision(ctx.divisionName)}</p> : null}
                  {ctx.heatLabel ? <p>{T.contextHeat(ctx.heatLabel)}</p> : null}
                  <p>{T.contextRole(T.roles[ctx.role] ?? ctx.role)}</p>
                </div>
              ) : null}
              {error ? <p role="alert" className="font-bold">{copy.common.problem(error)}</p> : null}
              <button type="submit" className="btn btn-primary" disabled={busy || !ctx || body.trim().length === 0} data-testid="note-send">
                {busy ? T.sending : T.send}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
