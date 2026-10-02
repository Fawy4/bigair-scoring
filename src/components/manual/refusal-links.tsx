"use client";

import { useEffect } from "react";
import { forgetRefusals, noteRefusal } from "@/lib/ask/collect";
import { refusalFor } from "@/lib/manual/refusals";
import { copy } from "@/lib/ui-copy";

/** Where a refusal or a problem appears on the organiser screens: alerts, field problems, the reason under a grey button, toasts — and any short line of text. */
const SELECTOR = '[role="alert"], .field-error, [data-testid="disabled-reason"], [role="status"] div, p, li, span, td, strong, div, h2, h3';
const LINK_ATTR = "data-learn-more";

/** The words of an element without a "Learn more" link already in it, and without a leading ✖ / ⚠ / ✔. */
function wordsOf(el: Element): string {
  let text = "";
  el.childNodes.forEach((n) => {
    if (n instanceof Element && n.hasAttribute(LINK_ATTR)) return;
    text += n.textContent ?? "";
  });
  return text.replace(/^[\s✖⚠✔]+/, "").replace(/\s+/g, " ").trim();
}

function link(el: Element, anchor: string) {
  const a = document.createElement("a");
  a.setAttribute(LINK_ATTR, "");
  a.setAttribute("data-testid", "learn-more");
  a.href = copy.manual.href(anchor);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = copy.manual.learnMore;
  a.className = "learn-more ml-1 whitespace-nowrap font-semibold underline underline-offset-2";
  el.append(a);
}

/** Adds the links: every element showing a sentence the manual explains gets "Learn more" at its end (the innermost one, once). */
/** The last words each element was checked with, so a page whose clock ticks is not checked again and again. */
let seen = new WeakMap<Element, string>();

/** An element whose content is text only (and perhaps the link this file added): the place a sentence is shown. */
function textOnly(el: Element): boolean {
  for (const c of Array.from(el.children)) if (!c.hasAttribute(LINK_ATTR) && !["BR", "STRONG", "EM", "B", "SPAN"].includes(c.tagName)) return false;
  return true;
}

function scan(roots: Element[]) {
  const found: Array<{ el: Element; anchor: string }> = [];
  const candidates = new Set<Element>();
  for (const root of roots) {
    if (root.matches(SELECTOR)) candidates.add(root);
    root.querySelectorAll(SELECTOR).forEach((el) => candidates.add(el));
  }
  candidates.forEach((el) => {
    if (el.closest("[data-no-learn-more], [data-no-ask], .help-root, input, textarea, select, button, a")) return;
    const words = wordsOf(el);
    if (seen.get(el) === words) return;
    seen.set(el, words);
    if (!textOnly(el) && !el.matches('[role="alert"], .field-error, [data-testid="disabled-reason"]')) return;
    const existing = el.querySelector(`:scope > [${LINK_ATTR}]`);
    const hit = refusalFor(words);
    if (!hit) {
      existing?.remove();
      return;
    }
    if (existing?.getAttribute("href") === copy.manual.href(hit.anchor)) return;
    existing?.remove();
    found.push({ el, anchor: hit.anchor });
  });
  for (const f of found)
    if (!found.some((o) => o !== f && f.el.contains(o.el))) {
      link(f.el, f.anchor);
      // Ask Sendbook sends the latest one as "the last refusal sentence shown on this page"
      noteRefusal(wordsOf(f.el));
    }
}

/**
 * Puts a "Learn more" link after every refusal sentence on the organiser screens, pointing at its row in the manual's errors page. One watcher per
 * page instead of a change in every screen: the sentences come from ui-copy.ts, so recognising them by their words is exact.
 */
export function RefusalLinks() {
  useEffect(() => {
    seen = new WeakMap();
    forgetRefusals();
    // only what changed is checked again (a ticking clock changes one text, not the page)
    let pending = new Set<Element>();
    let queued = false;
    const run = () => {
      queued = false;
      const roots = [...pending].filter((el) => el.isConnected);
      pending = new Set();
      scan(roots);
    };
    scan([document.body]);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        if (el && !el.hasAttribute(LINK_ATTR)) pending.add(el);
      }
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(run);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
