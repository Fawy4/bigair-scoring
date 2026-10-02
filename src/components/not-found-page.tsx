"use client";

import Link from "next/link";
import { BeachPage } from "@/components/beach-page";

/** A whole-page message in the design system (Daylight or Dark, as the visitor chose on this device): the product name, a title, one sentence and a link home. */
export function NotFoundPage({ product, title, body, homeLabel }: { product: string; title: string; body: string; homeLabel: string }) {
  return (
    <BeachPage testId="not-found">
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-24">
        <p className="text-small font-semibold text-beach-muted">{product}</p>
        <h1 className="text-[20px] font-semibold leading-tight">{title}</h1>
        <p className="text-body font-medium text-beach-muted">{body}</p>
        <Link href="/" className="inline-flex min-h-[var(--org-ctl)] w-fit items-center justify-center rounded-[8px] border border-beach-accent bg-beach-accent px-3 text-body font-semibold text-beach-on-accent">
          {homeLabel}
        </Link>
      </main>
    </BeachPage>
  );
}
