"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { StepInfo } from "@/lib/wizard/status";
import { copy } from "@/lib/ui-copy";

export function WizardRail({ eventId, eventName, status, steps }: { eventId: string; eventName: string; status: string; steps: StepInfo[] }) {
  const path = usePathname();
  const router = useRouter();
  const active = steps.find((s) => path.endsWith(`/${s.key}`))?.key ?? "event";
  const href = (key: string) => `/org/events/${eventId}/${key}`;
  const current = steps.find((s) => s.key === active);

  return (
    <aside className="no-print md:sticky md:top-4 md:w-64 md:shrink-0" aria-label={copy.wizard.railLabel}>
      <p className="text-xl font-extrabold">
        <Link href={`/org/events/${eventId}`} className="underline" data-testid="rail-dashboard">
          {eventName}
        </Link>
      </p>
      <p className="mb-3 font-semibold">{copy.wizard.status(status)}</p>

      {/* Tablet and phone: one step picker */}
      <div className="md:hidden">
        <label htmlFor="step-picker" className="mb-1 block">
          {copy.wizard.stepPicker}
        </label>
        <select id="step-picker" className="w-full" value={active} onChange={(e) => router.push(href(e.target.value))}>
          {steps.map((s) => (
            <option key={s.key} value={s.key} disabled={!s.available}>
              {s.label}
              {!s.available ? copy.wizard.coming : s.missing.length ? copy.wizard.attention : copy.wizard.done}
            </option>
          ))}
        </select>
        {current && current.missing.length > 0 ? (
          <ul className="mt-2 list-disc pl-6 font-semibold">
            {current.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Laptop: left rail */}
      <nav className="hidden flex-col gap-2 md:flex">
        {steps.map((s) => (
          <div key={s.key}>
            {s.available ? (
              <Link href={href(s.key)} aria-current={s.key === active ? "page" : undefined} className={`btn w-full !justify-start ${s.key === active ? "btn-primary" : ""}`}>
                <span aria-hidden>{s.missing.length ? "○" : "●"}</span> {s.label}
              </Link>
            ) : (
              <span className="btn w-full !cursor-default !justify-start !border-dashed opacity-70" aria-disabled="true">
                {s.label} <span className="text-xs">{copy.wizard.soon}</span>
              </span>
            )}
            {s.available && s.missing.length > 0 ? (
              <ul className="mt-1 list-disc pl-8 text-sm font-semibold" aria-label={copy.wizard.missingIn(s.label)}>
                {s.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}
