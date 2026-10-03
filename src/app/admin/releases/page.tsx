import { StatusPill } from "@/components/org/status-pill";
import { renderMarkdown } from "@/lib/manual/markdown";
import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { attempt } from "@/lib/platform/safe";
import { requireAdmin } from "@/lib/platform/session";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { loadReleases, loadReleaseStatus, progressLine } from "@/lib/releases/load";
import { compareVersions, releaseProgress, type Release } from "@/lib/releases/releases";
import { copy } from "@/lib/ui-copy";
import { ReleaseChecks } from "./release-checks";

export const metadata = { title: copy.admin.releases.heading };

const REPO = "https://github.com/Fawy4/bigair-scoring";
const C = copy.admin.releases;
/** The first version written under the release rule (CLAUDE.md rule 10). */
const FIRST_UNDER_RULE = "0.10.0";

/** Markdown of the releases file as HTML: the file is in the repository, written by the team, and escaped by the renderer. */
const md = (src: string) => renderMarkdown(src, { idPrefix: "release-md-", link: (h) => h, image: (i) => i }).html;
/** One line of Markdown without its paragraph. */
const inlineMd = (src: string) => md(src).replace(/^<p>([\s\S]*)<\/p>\s*$/, "$1");
const MD_CLASS = "text-body [&_code]:rounded [&_code]:bg-beach-surface [&_code]:px-1 [&_li]:mt-1 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5";

export default async function ReleasesPage() {
  const { supabase, role } = await requireAdmin();
  const { defaultTimezone } = (await attempt("Platform settings", getPlatformSettings, { defaultTimezone: "Africa/Cairo" } as Awaited<ReturnType<typeof getPlatformSettings>>)).value;
  const releases = loadReleases();
  const status = await loadReleaseStatus(supabase);
  const ticks = status?.ticks ?? [];
  const signoffs = status?.signoffs ?? [];
  const when = (iso: string) => formatWhen(iso, defaultTimezone);
  const current = releaseProgress(PRODUCT_VERSION, releases ?? [], ticks, signoffs);

  const entry = (r: Release) => {
    const p = releaseProgress(r.version, releases ?? [], ticks, signoffs);
    const isCurrent = r.version === PRODUCT_VERSION;
    return (
      <section key={r.version} id={r.anchor} data-testid={`release-${r.version}`} aria-labelledby={`${r.anchor}-h`} className={`scroll-mt-20 rounded-card border bg-beach-bg ${isCurrent ? "border-beach-accent" : "border-beach-line"}`}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-beach-line px-4 py-3">
          <h2 id={`${r.anchor}-h`} className="text-[18px] font-semibold">
            {r.version} <span className="font-medium text-beach-muted">— {r.date}</span>
          </h2>
          <span className="flex flex-wrap items-center gap-3 text-body font-semibold">
            {r.pr ? (
              <a href={`${REPO}/pull/${r.pr}`} target="_blank" rel="noopener noreferrer" className="underline">
                {C.pr(r.pr)}
              </a>
            ) : null}
            {p.tested ? <StatusPill state="done" /> : null}
          </span>
        </header>
        <div className="flex flex-col gap-4 p-4">
          {r.problems.length ? (
            <p role="alert" className="field-error">
              {C.entryProblems(r.version, r.problems.join("; "))}
            </p>
          ) : null}
          <div>
            <h3 className="text-[14px] font-semibold text-beach-muted">{C.changedHeading}</h3>
            <div className={MD_CLASS} dangerouslySetInnerHTML={{ __html: md(r.changed) }} />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-beach-muted">{C.testHeading}</h3>
            {r.checks.length ? (
              <>
                <p data-testid="release-progress" className="text-body font-semibold">
                  {progressLine(p)}
                  {p.tested ? ` · ${C.testedBy(p.tested.by ?? C.someone, when(p.tested.at))}` : ""}
                </p>
                <ReleaseChecks
                  version={r.version}
                  canTick={role === "owner"}
                  tested={Boolean(p.tested)}
                  checks={r.checks.map((c) => {
                    const t = ticks.find((x) => x.version === r.version && x.key === c.key);
                    return { key: c.key, html: inlineMd(c.text), ticked: t ? C.tickedBy(t.by ?? C.someone, when(t.at)) : null };
                  })}
                />
              </>
            ) : (
              <p className="text-body text-beach-muted">{r.nothingToTest ? C.nothingToTest : C.noChecks}</p>
            )}
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-beach-muted">{C.knownHeading}</h3>
            <div className={MD_CLASS} dangerouslySetInnerHTML={{ __html: md(r.knownIssues) }} />
          </div>
        </div>
      </section>
    );
  };

  const list = releases ?? [];
  // "Earlier versions": the backfilled entries without checks (merged before the releases file); everything from 0.10.0 on stays in the main list
  const newer = list.filter((r) => r.version === PRODUCT_VERSION || r.checks.length > 0 || compareVersions(r.version, FIRST_UNDER_RULE) <= 0);
  const older = list.filter((r) => !newer.includes(r));

  return (
    <main className="flex flex-col gap-6">
      <h1>{C.heading}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{C.intro}</p>
      {role === "owner" ? null : <p className="rounded-card border border-beach-line p-4 text-body font-semibold">{copy.admin.ownerOnly}</p>}
      <div data-testid="release-current" className="rounded-card border border-beach-line bg-beach-surface px-4 py-3">
        <p className="text-[18px] font-semibold">{C.currentLabel(PRODUCT_VERSION)}</p>
        <p className="text-body font-semibold">
          {progressLine(current)}
          {current.tested ? ` · ${C.testedBy(current.tested.by ?? C.someone, when(current.tested.at))}` : ""}
        </p>
        <p className="text-small text-beach-muted">{C.currentHint}</p>
      </div>
      {releases === null ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(C.fileProblem)}
        </p>
      ) : null}
      {status === null ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(C.statusProblem)}
        </p>
      ) : null}
      {newer.map(entry)}
      {older.length ? (
        <>
          <h2 className="text-2xl font-semibold">{C.olderHeading}</h2>
          {older.map(entry)}
        </>
      ) : null}
    </main>
  );
}
