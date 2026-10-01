"use client";

import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/org/app-shell";
import { Button, type ButtonVariant } from "@/components/org/button";
import { NowNextCard, PrintCardsButton, QuickActions, ReadinessList, ShareCard, TimetableCard, WindCallSlot } from "@/components/org/dashboard-parts";
import { ShellLayoutProvider, useShellLayout, type ShellLayout } from "@/components/org/layout-context";
import { NumberField } from "@/components/org/number-field";
import { SettingRow } from "@/components/org/setting-row";
import { SelectField, Segmented, Toggle } from "@/components/org/setting-controls";
import { SettingsPanel } from "@/components/org/settings-panel";
import { StatusPill, type StatusState } from "@/components/org/status-pill";
import { StepFooter } from "@/components/org/step-footer";
import type { RailStep } from "@/components/org/step-rail";
import { PRODUCT_NAME } from "@/lib/product";
import { orgCopy } from "@/lib/ui-copy";
import { ACCOUNT, ADVANCED_SETTINGS, DEFAULT_DIALS, NOW_NEXT, ORGANISATIONS, PREVIEW_EVENT, READINESS, RUN_ORDER, SERVER_TIME, STEPS, TIMER, sentenceFor, type ScoringDials } from "@/lib/org-design/fixtures";
import { cn } from "@/lib/utils";
import type { BeachTextSize, BeachTheme } from "@/components/live/theme-switch";
import { LaptopFrame, PhoneFrame } from "./frames";
import { EmptyRiders, RidersTable } from "./riders-table";

export type FrameKind = "laptop" | "phone";
export const SECTION_IDS = ["shell", "dashboard", "riders", "settings-simple", "settings-advanced", "footer", "numbers", "buttons", "phone"] as const;

export interface PreviewPrefs {
  theme: BeachTheme;
  setTheme: (t: BeachTheme) => void;
  size: BeachTextSize;
  setSize: (s: BeachTextSize) => void;
}

const RAIL: readonly RailStep[] = STEPS.map((s) => ({ key: s.key, label: s.label, state: s.state, reason: s.reason }));
const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s.key, s.label])) as Record<string, string>;

function Section({ id, children, wide }: { id: (typeof SECTION_IDS)[number]; children: ReactNode; wide?: boolean }) {
  return (
    <section id={id} data-testid={`section-${id}`} className={cn("flex scroll-mt-20 flex-col gap-2", wide && "mx-auto w-full")}>
      <h2 className="text-[14px] font-semibold">{orgCopy.page.sections[id]}</h2>
      <p className="max-w-[80ch] text-body font-medium text-beach-muted">{orgCopy.page.notes[id]}</p>
      {children}
    </section>
  );
}

/** Draws its content in a laptop frame or a phone frame, and tells the content which layout it has. */
function Mock({ frame, children }: { frame: FrameKind; children: (layout: ShellLayout) => ReactNode }) {
  return frame === "laptop" ? (
    <LaptopFrame>
      <ShellLayoutProvider value="laptop">{children("laptop")}</ShellLayoutProvider>
    </LaptopFrame>
  ) : (
    <PhoneFrame>
      <ShellLayoutProvider value="phone">{children("phone")}</ShellLayoutProvider>
    </PhoneFrame>
  );
}

/** A page without the shell: just padded content. */
function PageBox({ children }: { children: ReactNode }) {
  const laptop = useShellLayout() === "laptop";
  return <div className={cn("flex flex-col gap-4", laptop ? "p-6" : "p-3")}>{children}</div>;
}

const PageTitle = ({ children }: { children: ReactNode }) => <h3 className="text-[20px] font-semibold leading-tight">{children}</h3>;

function ShellMock({ layout, active, onActive, prefs, footer, children }: { layout: ShellLayout; active: string; onActive: (k: string) => void; prefs: PreviewPrefs; footer?: ReactNode; children: ReactNode }) {
  return (
    <AppShell
      layout={layout}
      productName={PRODUCT_NAME}
      organisations={ORGANISATIONS}
      currentOrganisationId={ORGANISATIONS[0].id}
      event={{ name: PREVIEW_EVENT.name, dates: PREVIEW_EVENT.dates, status: PREVIEW_EVENT.status, publicUrl: PREVIEW_EVENT.publicUrl }}
      steps={RAIL}
      activeStep={active}
      onStep={onActive}
      footer={footer}
      account={{
        email: ACCOUNT.email,
        preferences: (
          <>
            <Segmented label={orgCopy.page.theme} value={prefs.theme} onChange={prefs.setTheme} options={[["day", orgCopy.page.day], ["dark", orgCopy.page.dark]]} />
            <Segmented label={orgCopy.page.textSize} value={prefs.size} onChange={prefs.setSize} options={[["normal", orgCopy.page.normal], ["large", orgCopy.page.large]]} />
          </>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}

const STEP_ORDER = ["event", "divisions", "riders", "officials", "draw", "schedule", "golive"] as const;
function footerFor(key: string, go: (k: string) => void, sticky?: boolean) {
  const i = STEP_ORDER.indexOf(key as (typeof STEP_ORDER)[number]);
  const prev = i > 0 ? STEP_ORDER[i - 1] : null;
  const next = i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null;
  return <StepFooter sticky={sticky} previous={prev ? { label: STEP_LABEL[prev], onClick: () => go(prev) } : undefined} next={next ? { label: STEP_LABEL[next], onClick: () => go(next) } : undefined} />;
}

function RidersPage() {
  return (
    <>
      <div>
        <PageTitle>{orgCopy.riders.title}</PageTitle>
        <p className="text-body font-medium text-beach-muted">{orgCopy.riders.stepIntro}</p>
      </div>
      <RidersTable maxHeight="420px" />
    </>
  );
}

function StepNotInPreview({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <PageTitle>{label}</PageTitle>
      <p className="text-body font-medium text-beach-muted">{orgCopy.page.notes.shell}</p>
    </div>
  );
}

// ---- 1. the event shell, the Riders step open
function ShellSection({ frame, prefs }: { frame: FrameKind; prefs: PreviewPrefs }) {
  const [active, setActive] = useState("riders");
  return (
    <Section id="shell">
      <Mock frame={frame}>
        {(layout) => (
          <ShellMock layout={layout} active={active} onActive={setActive} prefs={prefs} footer={footerFor(active, setActive, layout === "phone")}>
            {active === "riders" ? <RidersPage /> : active === "golive" ? <StepNotInPreview label={STEP_LABEL.golive} /> : <StepNotInPreview label={STEP_LABEL[active]} />}
          </ShellMock>
        )}
      </Mock>
    </Section>
  );
}

// ---- 2. the Go live dashboard
function Dashboard({ layout, held, setHold }: { layout: ShellLayout; held: boolean; setHold: (v: boolean) => void }) {
  const laptop = layout === "laptop";
  return (
    <>
      <PageTitle>{STEP_LABEL.golive}</PageTitle>
      <div className={cn("grid items-start gap-4", laptop ? "grid-cols-2" : "grid-cols-1")}>
        <ReadinessList checks={READINESS} />
        <NowNextCard now={NOW_NEXT.now.label} timerText={TIMER.text} serverTime={SERVER_TIME} next={NOW_NEXT.next} after={NOW_NEXT.after} held={held} />
        <WindCallSlot />
        <QuickActions runningHeat={NOW_NEXT.now.label} held={held} onHold={() => setHold(true)} onResume={() => setHold(false)} />
        <div className={laptop ? "col-span-2" : undefined}>
          <TimetableCard rows={RUN_ORDER} />
        </div>
        <ShareCard testId="share-join" title={orgCopy.dashboard.joinTitle} note={orgCopy.dashboard.joinNote} url={PREVIEW_EVENT.joinUrl} />
        <ShareCard testId="share-public" title={orgCopy.dashboard.publicTitle} note={orgCopy.dashboard.publicNote} url={PREVIEW_EVENT.publicUrl} />
        <div className={laptop ? "col-span-2" : undefined}>
          <PrintCardsButton />
        </div>
      </div>
    </>
  );
}

function DashboardSection({ frame, prefs }: { frame: FrameKind; prefs: PreviewPrefs }) {
  const [held, setHold] = useState(false);
  const [active, setActive] = useState("golive");
  return (
    <Section id="dashboard">
      <Mock frame={frame}>
        {(layout) => (
          <ShellMock layout={layout} active={active} onActive={setActive} prefs={prefs} footer={footerFor(active, setActive, layout === "phone")}>
            {active === "golive" ? <Dashboard layout={layout} held={held} setHold={setHold} /> : active === "riders" ? <RidersPage /> : <StepNotInPreview label={STEP_LABEL[active]} />}
          </ShellMock>
        )}
      </Mock>
    </Section>
  );
}

// ---- 3. the dense table
function RidersSection({ frame }: { frame: FrameKind }) {
  return (
    <Section id="riders">
      <Mock frame={frame}>
        {() => (
          <PageBox>
            <PageTitle>{orgCopy.riders.title}</PageTitle>
            <RidersTable maxHeight="440px" initialSelected={["rider-2", "rider-5", "rider-11"]} editingId="rider-3" />
            <div className="flex flex-col gap-2">
              <p className="text-small font-semibold text-beach-muted">{orgCopy.riders.emptyLabel}</p>
              <EmptyRiders />
            </div>
          </PageBox>
        )}
      </Mock>
    </Section>
  );
}

// ---- 4 and 5. the Scoring panel, Simple and Advanced
function ScoringPanel({ defaultAdvancedOpen, tag }: { defaultAdvancedOpen: boolean; tag: string }) {
  const [d, setD] = useState<ScoringDials>(DEFAULT_DIALS);
  const [advanced, setAdvanced] = useState<Record<string, number | boolean>>(() => Object.fromEntries(ADVANCED_SETTINGS.map((s) => [s.id, s.value])));
  const t = orgCopy.settings.dials;
  const a = orgCopy.settings.advanced;
  const set = <K extends keyof ScoringDials>(key: K, value: ScoringDials[K]) => setD((prev) => ({ ...prev, [key]: value }));
  return (
    <SettingsPanel
      testId={`panel-${tag}`}
      sentenceTestId={`model-sentence-${tag}`}
      title={orgCopy.settings.panelTitle}
      sentence={sentenceFor(d)}
      loadMenu={{ builtIn: [...orgCopy.settings.builtInNames], mine: [...orgCopy.settings.mineNames] }}
      advancedCount={ADVANCED_SETTINGS.length}
      defaultAdvancedOpen={defaultAdvancedOpen}
      simple={
        <>
          <SettingRow id={`${tag}-bestN`} label={t.bestN.label} explanation={t.bestN.explanation} example={t.bestN.example}>
            <NumberField label={t.bestN.label} value={d.bestN} min={1} max={10} unit={t.bestN.unit} onChange={(v) => set("bestN", v)} />
          </SettingRow>
          <SettingRow id={`${tag}-attempts`} label={t.attempts.label} explanation={t.attempts.explanation} example={t.attempts.example}>
            <NumberField label={t.attempts.label} value={d.attempts} min={1} max={20} unit={t.attempts.unit} onChange={(v) => set("attempts", v)} />
          </SettingRow>
          <SettingRow id={`${tag}-judges`} label={t.judges.label} explanation={t.judges.explanation} example={t.judges.example}>
            <NumberField label={t.judges.label} value={d.judges} min={1} max={9} unit={t.judges.unit} onChange={(v) => set("judges", v)} />
          </SettingRow>
          <SettingRow id={`${tag}-aggregate`} label={t.aggregate.label} explanation={t.aggregate.explanation} example={t.aggregate.example}>
            <SelectField label={t.aggregate.label} value={d.aggregate} onChange={(v) => set("aggregate", v)} options={Object.entries(orgCopy.settings.aggregateOptions) as Array<[ScoringDials["aggregate"], string]>} />
          </SettingRow>
          <SettingRow id={`${tag}-impression`} label={t.impression.label} explanation={t.impression.explanation} example={t.impression.example}>
            <Toggle label={t.impression.label} checked={d.impressionOn} onChange={(v) => set("impressionOn", v)} onText={orgCopy.settings.on} offText={orgCopy.settings.off} />
          </SettingRow>
          {d.impressionOn ? (
            <SettingRow id={`${tag}-impressionMax`} label={t.impressionMax.label} explanation={t.impressionMax.explanation} example={t.impressionMax.example}>
              <NumberField label={t.impressionMax.label} value={d.impressionMax} min={1} max={20} unit={t.impressionMax.unit} onChange={(v) => set("impressionMax", v)} />
            </SettingRow>
          ) : null}
        </>
      }
      advanced={ADVANCED_SETTINGS.map((s) => {
        const text = a[s.id];
        return (
          <SettingRow key={s.id} id={`${tag}-${s.id}`} label={text.label} explanation={text.explanation} example={text.example}>
            {s.kind === "toggle" ? (
              <Toggle label={text.label} checked={advanced[s.id] as boolean} onChange={(v) => setAdvanced((p) => ({ ...p, [s.id]: v }))} onText={orgCopy.settings.on} offText={orgCopy.settings.off} />
            ) : (
              <NumberField label={text.label} value={advanced[s.id] as number} min={s.min} max={s.max ?? 100} step={s.step} unit={"unit" in text ? text.unit : undefined} onChange={(v) => setAdvanced((p) => ({ ...p, [s.id]: v }))} />
            )}
          </SettingRow>
        );
      })}
    />
  );
}

function SettingsSection({ frame, advanced }: { frame: FrameKind; advanced: boolean }) {
  return (
    <Section id={advanced ? "settings-advanced" : "settings-simple"}>
      <Mock frame={frame}>
        {() => (
          <PageBox>
            <ScoringPanel defaultAdvancedOpen={advanced} tag={advanced ? "advanced" : "simple"} />
          </PageBox>
        )}
      </Mock>
    </Section>
  );
}

// ---- 6. Previous / Next
function FooterSection() {
  const box = "overflow-hidden rounded-card border border-beach-line";
  const d = orgCopy.footerDemo;
  return (
    <Section id="footer">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-beach-muted">{d.step2}</p>
          <div className={box}>
            <StepFooter previous={{ label: d.labels.event }} next={{ label: d.labels.riders }} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-beach-muted">{d.step6}</p>
          <div className={box}>
            <StepFooter previous={{ label: d.labels.draw }} next={{ label: "Go live" }} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-beach-muted">{d.step7}</p>
          <div className={box}>
            <StepFooter previous={{ label: d.labels.schedule }} />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ---- 7. number boxes: today, new (right) and the earlier idea (centred)
function NumbersSection({ frame }: { frame: FrameKind }) {
  const n = orgCopy.numbers;
  const [v, setV] = useState({ one: 4, two: 12, three: 120, decimal: 0.5 });
  const rows = [
    { key: "one", label: n.one, min: 1, max: 9, step: 1, unit: n.units.riders },
    { key: "two", label: n.two, min: 1, max: 30, step: 1, unit: n.units.min },
    { key: "three", label: n.three, min: 1, max: 999, step: 1, unit: n.units.riders },
    { key: "decimal", label: n.decimal, min: 0, max: 10, step: 0.5, unit: n.units.points },
  ] as const;
  return (
    <Section id="numbers">
      <Mock frame={frame}>
        {(layout) => (
          <PageBox>
            <div className={cn("grid gap-4", layout === "laptop" ? "grid-cols-3" : "grid-cols-1")}>
              {(["today", "right", "centre"] as const).map((kind) => (
                <div key={kind} className="flex flex-col gap-3 rounded-card border border-beach-line p-4">
                  <p className="text-small font-semibold text-beach-muted">{n[kind]}</p>
                  {rows.map((r) => (
                    <div key={r.key} className="flex flex-col gap-1">
                      <span className="text-body font-semibold">{r.label}</span>
                      {kind === "today" ? (
                        // Today's look, kept only for the comparison: full width, left-aligned, a heavy frame (the old console style).
                        <input type="number" aria-label={`${r.label} (today)`} defaultValue={v[r.key]} style={{ width: "100%", minHeight: 48, borderWidth: 2, borderStyle: "solid", borderColor: "var(--beach-ink)", borderRadius: 6, padding: "0 12px", textAlign: "left", background: "var(--beach-bg)", color: "var(--beach-ink)" }} />
                      ) : (
                        <NumberField label={`${r.label} (${kind})`} value={v[r.key]} min={r.min} max={r.max} step={r.step} unit={r.unit} align={kind === "right" ? "end" : "center"} onChange={(x) => setV((p) => ({ ...p, [r.key]: x }))} />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </PageBox>
        )}
      </Mock>
    </Section>
  );
}

// ---- 8. buttons and pills
function ButtonsSection({ frame }: { frame: FrameKind }) {
  const b = orgCopy.buttons;
  const variants: ButtonVariant[] = ["primary", "secondary", "quiet", "danger"];
  const states: StatusState[] = ["done", "attention", "not_started", "live", "held", "draft", "published"];
  return (
    <Section id="buttons">
      <Mock frame={frame}>
        {(layout) => (
          <PageBox>
            <div className={cn("grid gap-4", layout === "laptop" ? "grid-cols-2" : "grid-cols-1")}>
              <div className="flex flex-col gap-3 rounded-card border border-beach-line p-4">
                <p className="text-small font-semibold text-beach-muted">{b.enabled}</p>
                <div className="flex flex-wrap items-start gap-2">
                  {variants.map((v) => (
                    <Button key={v} variant={v}>
                      {b[v]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-card border border-beach-line p-4">
                <p className="text-small font-semibold text-beach-muted">{b.disabled}</p>
                <div className="flex flex-wrap items-start gap-4">
                  {variants.map((v) => (
                    <Button key={v} variant={v} disabled disabledReason={b.reasons[v]}>
                      {b[v]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className={cn("flex flex-col gap-3 rounded-card border border-beach-line p-4", layout === "laptop" && "col-span-2")}>
                <p className="text-small font-semibold text-beach-muted">
                  {b.states} · {b.pillsNote}
                </p>
                <div className="flex flex-wrap gap-2">
                  {states.map((s) => (
                    <StatusPill key={s} state={s} />
                  ))}
                </div>
              </div>
            </div>
          </PageBox>
        )}
      </Mock>
    </Section>
  );
}

// ---- 9. one organiser page on a phone, always a phone
function PhoneSection({ prefs }: { prefs: PreviewPrefs }) {
  const [active, setActive] = useState("riders");
  return (
    <Section id="phone">
      <PhoneFrame>
        <ShellLayoutProvider value="phone">
          <ShellMock layout="phone" active={active} onActive={setActive} prefs={prefs} footer={footerFor(active, setActive, true)}>
            {active === "riders" ? <RidersPage /> : <StepNotInPreview label={STEP_LABEL[active]} />}
          </ShellMock>
        </ShellLayoutProvider>
      </PhoneFrame>
      <p className="text-small font-medium text-beach-muted">{orgCopy.phoneNote}</p>
    </Section>
  );
}

/** Every section of the preview, in order. The frame (Laptop or Phone) applies to all but the last, which is always a phone. */
export function PreviewSections({ frame, prefs }: { frame: FrameKind; prefs: PreviewPrefs }) {
  return (
    <>
      <ShellSection frame={frame} prefs={prefs} />
      <DashboardSection frame={frame} prefs={prefs} />
      <RidersSection frame={frame} />
      <SettingsSection frame={frame} advanced={false} />
      <SettingsSection frame={frame} advanced />
      <FooterSection />
      <NumbersSection frame={frame} />
      <ButtonsSection frame={frame} />
      <PhoneSection prefs={prefs} />
    </>
  );
}
