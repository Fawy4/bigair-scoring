import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The font size (in px, from `max` down to `min`) at which `text` fits on one line in the width of `box`. Used for the trick name in the spotter's box when the box is not being typed in:
 * the real box keeps its 16 px text (an iPhone zooms into any box under 16 px at the moment it is tapped) and a copy of the name, shrunk to fit, is drawn over it.
 */
export function useFitFontSize(text: string, enabled: boolean, box: RefObject<HTMLElement | null>, min = 12, max = 16): number {
  const [px, setPx] = useState(max);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !enabled) return;
    const measure = () => {
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:inherit;font-size:${max}px`;
      probe.textContent = text;
      el.appendChild(probe);
      const natural = probe.getBoundingClientRect().width;
      probe.remove();
      const avail = el.clientWidth;
      // one line while it fits at `min` or more; below that it stays at `min` (the caller lets it wrap to a second line)
      setPx(natural <= avail || avail <= 0 ? max : Math.max(min, Math.floor(((max * avail) / natural) * 2) / 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, enabled, box, min, max]);
  return enabled ? px : max;
}

/**
 * Shrinks the text of `box` (its font size, down to `min` px) until it fits in `lines` lines: the judge's trick name wraps to two lines, and a name that still does not fit shrinks the same way.
 * `watch` is what the text depends on (it is measured again when it changes or when the box's width does).
 */
export function useShrinkToLines(box: RefObject<HTMLElement | null>, watch: string, lines = 2, min = 12, lineHeight = 1.25): void {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize) || 14;
      const max = size;
      while (size > min && el.scrollHeight > Math.ceil(size * lineHeight * lines) + 1) {
        size = Math.max(min, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
      if (size === max) el.style.fontSize = "";
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [box, watch, lines, min, lineHeight]);
}
