"use client";

import { useEffect, useRef } from "react";

/**
 * The home page's Sendbook background (drawn on a canvas behind the page, never photos): thin orange air streams, low water along the bottom and one still rider.
 * The air and the water move; the rider does not. It starts only after the page has been shown (the page and its words never wait for it), takes no room in the layout,
 * keeps to Daylight / Dark (read from the page's own colour variables), shows one still picture with "reduce motion", pauses in a hidden tab and draws at most at 2× sharpness.
 * The rider sits in the page's `[data-home-sky-slot]` box: to the right of the wordmark on a laptop, in a band under it on a phone, and scrolls away with the page.
 */
export function HomeSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    const home = cv?.closest<HTMLElement>(".home");
    const ctx = cv?.getContext("2d");
    if (!cv || !home || !ctx) return;
    let stopped = false;
    let teardown = () => {};
    const boot = async () => {
      const [engine, rider, kite] = await Promise.all([import("./home-sky-engine"), loadImage("/home-sky/rider.png"), loadImage("/home-sky/kite.png")]);
      if (stopped) return;
      teardown = run(cv, home, ctx, engine, rider, kite);
    };
    // after the page is visible: wait for the page to finish loading, then for an idle moment
    const go = () => {
      if (!stopped) void boot().catch(() => {});
    };
    const later = () => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 300));
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    return () => {
      stopped = true;
      window.removeEventListener("load", later);
      teardown();
    };
  }, []);
  return <canvas ref={canvasRef} className="home-sky-canvas" aria-hidden />;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

type Engine = typeof import("./home-sky-engine");

/** Silhouette in one colour: only the picture's outline (its transparency) is kept. */
function tinted(img: HTMLImageElement, colour: string) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d");
  if (x) {
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

function run(cv: HTMLCanvasElement, home: HTMLElement, ctx: CanvasRenderingContext2D, E: Engine, riderImg: HTMLImageElement, kiteImg: HTMLImageElement) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let sky: ReturnType<typeof E.createSky> | null = null;
  let sprites: { rider: { image: CanvasImageSource; width: number; height: number }; kite: { image: CanvasImageSource; width: number; height: number } };
  let raf = 0;
  let last = 0;
  let pending = 0;
  let viewW = 0;
  let viewH = 0;

  const css = (n: string) => getComputedStyle(home).getPropertyValue(n).trim();
  const build = () => {
    const ink = css("--sky-kiter");
    sprites = {
      rider: { image: tinted(riderImg, ink), width: riderImg.naturalWidth, height: riderImg.naturalHeight },
      kite: { image: tinted(kiteImg, css("--sky-kite")), width: kiteImg.naturalWidth, height: kiteImg.naturalHeight },
    };
    sky = E.createSky(ctx, sprites, { wave1: css("--sky-wave1"), wave2: css("--sky-wave2"), wave3: css("--sky-wave3"), air: css("--sky-air"), crest: css("--sky-crest"), line: ink });
    viewW = 0; // the new picture needs its size and air again
    fit();
  };
  /** Canvas size follows the screen, at most 2× sharp; the rider is put in his box. */
  const fit = () => {
    if (!sky) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = Math.min(2, window.devicePixelRatio || 1);
    if (w !== viewW || h !== viewH || cv.width !== Math.round(w * r)) {
      cv.width = Math.round(w * r);
      cv.height = Math.round(h * r);
      viewW = w;
      viewH = h;
      sky.resize(w, h, r);
    }
    place();
  };
  /** The rider is centred in his box at the biggest size that fits it; a box with no room (hidden) means no rider. */
  const place = () => {
    const slot = document.querySelector<HTMLElement>("[data-home-sky-slot]");
    const box = slot?.getBoundingClientRect();
    if (!sky || !box || box.width < 40 || box.height < 40) {
      sky?.setScene(null);
      return;
    }
    const probe = { ...E.POSE, x: 0, y: 0, k: 1 };
    const b = E.figureBounds(probe, sprites);
    const k = Math.min(1.3, Math.max(0.5, Math.min(box.width / (b.maxX - b.minX), box.height / (b.maxY - b.minY))));
    const cx = ((b.minX + b.maxX) / 2) * k;
    const cy = ((b.minY + b.maxY) / 2) * k;
    sky.setScene({ ...probe, k, x: box.left + box.width / 2 - cx, y: box.top + box.height / 2 - cy });
  };

  const still = () => {
    place();
    sky?.render(1.5, 0);
  };
  const frame = (ts: number) => {
    const t = ts / 1000;
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    place();
    sky?.render(t, dt);
    raf = window.requestAnimationFrame(frame);
  };
  const start = () => {
    window.cancelAnimationFrame(raf);
    raf = 0;
    if (reduce.matches) still();
    else if (!document.hidden) {
      last = window.performance.now() / 1000;
      raf = window.requestAnimationFrame(frame);
    }
  };
  /** Resize and scroll can come many times a frame: one redraw per frame is enough. */
  const soon = (f: () => void) => {
    if (pending) return;
    pending = window.requestAnimationFrame(() => {
      pending = 0;
      f();
    });
  };
  const onResize = () =>
    soon(() => {
      fit();
      if (reduce.matches) still();
    });
  const onScroll = () => {
    if (reduce.matches) soon(still);
  };
  const onVisible = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    } else start();
  };
  const onTheme = () => {
    build();
    start();
  };

  build();
  start();
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  reduce.addEventListener("change", start);
  const watch = new MutationObserver(onTheme);
  watch.observe(home, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    window.cancelAnimationFrame(raf);
    window.cancelAnimationFrame(pending);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisible);
    reduce.removeEventListener("change", start);
    watch.disconnect();
  };
}
