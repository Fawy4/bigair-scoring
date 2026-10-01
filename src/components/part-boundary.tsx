"use client";

import { Component, type ReactNode } from "react";
import { copy } from "@/lib/ui-copy";

const C = copy.crash;

/**
 * Wraps one part of a page (the run order, the timetable): if it fails, that part shows one line with the reason and a retry, and everything
 * around it keeps working. `what` is a name from `copy.crash.parts`.
 */
export class PartBoundary extends Component<{ what: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.what}] part error`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" data-testid="part-error" className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[#111] bg-[#fde68a] p-3 text-[#111]">
        <p className="min-w-0 flex-1 basis-64 text-base font-bold">{C.part(this.props.what, error.message || "unknown")}</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="min-h-[56px] rounded-xl border-2 border-[#111] bg-white px-4 font-bold">
          {C.partRetry}
        </button>
      </div>
    );
  }
}
