/**
 * The drawing of the home page's Sendbook background: thin orange air streams flowing left to right, low water along the bottom and one still rider, upside down in a
 * megaloop with his kite looping just below him. Drawn on a canvas, never photos. The air and the water move; the rider never does. Ported from
 * design/background/sendbook-background-reference.js (the moving kiter's code is left out).
 */

export interface SkyColours {
  wave1: string;
  wave2: string;
  wave3: string;
  air: string;
  crest: string;
  /** the rider, the kite lines and the loop's trail */
  line: string;
}

/** Where the points sit in the two pictures (pixels of the picture files) and how big each is drawn at scale 1. */
export const ANCHORS = {
  ur: 0.2917,
  uk: 0.2909,
  air: { c: [76.1, 52.8], g: [42.9, 80.8] },
  kite: { tl: [7.6, 190.9], tr: [432.7, 189.6], k0: [220.2, 190.2] },
} as const;

type Pt = [number, number];
export interface Sprite {
  image: CanvasImageSource;
  width: number;
  height: number;
}
export interface SkySprites {
  rider: Sprite;
  kite: Sprite;
}

/** The still pose: the rider at (x, y) on the screen, scaled by k. */
export interface Scene {
  x: number;
  y: number;
  k: number;
  beta: number;
  th: number;
  twist: number;
  L: number;
  rs: number;
  r: number;
  sweep: number;
  side: number;
}
export const POSE = { beta: 170, th: 198, twist: -10, L: 135, rs: 1.6, r: 46, sweep: 280, side: 1 };

const D = Math.PI / 180;
const NPT = 24;
const GR = [
  { a: 0.45, w: 0.8, v: [30, 46] },
  { a: 0.7, w: 1, v: [52, 76] },
  { a: 1, w: 1.2, v: [84, 116] },
];
/** The three water layers: depth, swell (px), wavelength, speed. The swell is 4.5, 6 and 7.5 px (a little bigger than the reference). */
const WV = [
  { f: "wave2", d: 1, A: 4.5, L: 430, c: 15 },
  { f: "wave1", d: 0.62, A: 6, L: 310, c: 21 },
  { f: "wave3", d: 0.3, A: 7.5, L: 230, c: 28 },
] as const;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rot = (x: number, y: number, a: number): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

/** The water's height: about 8% of the screen height, 40 to 76 px. */
export const waterBand = (h: number) => clamp(0.08 * h, 40, 76);

/** Everything the pose is made of, as screen points: the rider's hands (bar), the kite's centre and the trail's circle. */
function poseGeometry(q: Scene) {
  const kk = q.k;
  const s = ANCHORS.ur * kk * q.rs;
  const sk = ANCHORS.uk * kk;
  const ar = ANCHORS.air;
  const ki = ANCHORS.kite;
  const G: Pt = [q.x, q.y];
  const beta = q.beta * D;
  const cb = rot((ar.c[0] - ar.g[0]) * s, (ar.c[1] - ar.g[1]) * s, beta);
  const bar: Pt = [G[0] + cb[0], G[1] + cb[1]];
  const th = q.th * D;
  const L = q.L * kk;
  const K: Pt = [bar[0] + L * Math.cos(th), bar[1] - L * Math.sin(th)];
  const ka = 90 * D - th + q.twist * D;
  const hd: Pt = [Math.sin(ka), -Math.cos(ka)];
  const r = q.r * kk;
  const c: Pt = [K[0] - q.side * hd[1] * r, K[1] + q.side * hd[0] * r];
  const a0 = Math.atan2(K[1] - c[1], K[0] - c[0]);
  const sg = -Math.sin(a0) * hd[0] + Math.cos(a0) * hd[1] > 0 ? 1 : -1;
  return { s, sk, ar, ki, G, beta, bar, K, ka, r, c, a0, sg, sw: q.sweep * D, kk };
}

/** The box the whole figure (rider, kite and loop trail) covers on the screen, so it can be centred in its place. */
export function figureBounds(q: Scene, sprites: Pick<SkySprites, "rider" | "kite">) {
  const g = poseGeometry(q);
  const pts: Pt[] = [];
  const corners = (sp: Sprite, anchor: readonly number[], at: Pt, ang: number, scale: number) => {
    for (const [cx, cy] of [
      [0, 0],
      [sp.width, 0],
      [sp.width, sp.height],
      [0, sp.height],
    ]) {
      const p = rot((cx - anchor[0]) * scale, (cy - anchor[1]) * scale, ang);
      pts.push([at[0] + p[0], at[1] + p[1]]);
    }
  };
  corners(sprites.rider, g.ar.g, g.G, g.beta, g.s);
  corners(sprites.kite, g.ki.k0, g.K, g.ka, g.sk);
  for (let i = 0; i <= 40; i++) {
    const b = g.a0 - g.sg * g.sw * (i / 40);
    pts.push([g.c[0] + g.r * Math.cos(b), g.c[1] + g.r * Math.sin(b)]);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

interface Particle {
  g: number;
  x: number;
  y: number;
  sp: number;
  acc: number;
  h: number[];
}

export function createSky(ctx: CanvasRenderingContext2D, sprites: SkySprites, col: SkyColours) {
  let W = 0;
  let H = 0;
  let dpr = 1;
  let vs = 1;
  let P: Particle[] = [];
  let scene: Scene | null = null;
  let seed = 20261013;
  function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const surf = (i: number, x: number, t: number) => {
    const w = WV[i];
    const ph = ((x - w.c * t) * 2 * Math.PI) / w.L;
    return H - w.d * waterBand(H) + w.A * Math.sin(ph) + 0.45 * w.A * Math.sin(ph * 1.89 + 1.3 + t * 0.7);
  };

  /* air particles: thin streaks that follow a slowly changing airflow */
  function spawn(p: Particle, anywhere: boolean) {
    const v = GR[p.g].v;
    p.x = anywhere ? rnd() * W : -10 - rnd() * 90;
    p.y = H * (0.05 + rnd() * 0.78);
    p.sp = (v[0] + rnd() * (v[1] - v[0])) * vs;
    p.h.length = 0;
    p.acc = 0;
    return p;
  }
  const flow = (x: number, y: number, t: number) => 0.3 * Math.sin(y / 220 + t * 0.22) + 0.18 * Math.sin(x / 380 - t * 0.15) + 0.1 * Math.sin((x + 1.7 * y) / 150 + t * 0.5);
  function stepAir(dt: number, t: number) {
    for (const p of P) {
      const a = flow(p.x, p.y, t);
      p.x += Math.cos(a) * p.sp * dt;
      p.y += Math.sin(a) * p.sp * dt;
      p.acc += dt;
      if (p.h.length === 0 || p.acc >= 0.04) {
        p.acc = 0;
        p.h.push(p.x, p.y);
        if (p.h.length > 2 * NPT) p.h.splice(0, 2);
      } else {
        p.h[p.h.length - 2] = p.x;
        p.h[p.h.length - 1] = p.y;
      }
      if (p.x > W + 40 || p.y < -40 || p.y > H + 40) spawn(p, false);
    }
  }
  function resize(w: number, h: number, r: number) {
    const keep = P.length > 0 && Math.abs(w - W) < 2 && Math.abs(h - H) < 150;
    W = w;
    H = h;
    dpr = r;
    vs = clamp(Math.sqrt(W / 1200), 0.6, 1.1);
    if (keep) return;
    const n = Math.round(clamp((W * H) / 9500, 50, 170));
    P = [];
    for (let i = 0; i < n; i++) P.push(spawn({ g: i % 3, x: 0, y: 0, sp: 0, acc: 0, h: [] }, true));
    for (let i = 0; i < 45; i++) stepAir(1 / 30, i / 30);
  }
  function drawAir() {
    ctx.lineCap = "butt";
    ctx.strokeStyle = col.air;
    for (let g = 0; g < 3; g++) {
      for (let j = 1; j < NPT; j++) {
        ctx.beginPath();
        let any = false;
        for (const p of P) {
          if (p.g !== g) continue;
          const i = (p.h.length >> 1) - NPT + j;
          if (i < 1) continue;
          ctx.moveTo(p.h[2 * i - 2], p.h[2 * i - 1]);
          ctx.lineTo(p.h[2 * i], p.h[2 * i + 1]);
          any = true;
        }
        if (!any) continue;
        const xx = j / (NPT - 1);
        ctx.globalAlpha = GR[g].a * Math.pow(Math.sin(Math.PI * xx), 0.9) * (0.4 + 0.6 * xx);
        ctx.lineWidth = GR[g].w;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* low, gentle water */
  function drawWaves(t: number) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, surf(i, x, t));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = col[WV[i].f];
      ctx.fill();
    }
    ctx.beginPath();
    for (let x = 0; x <= W + 8; x += 8) {
      const y = surf(2, x, t);
      if (x) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = col.crest;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function sprite(sp: Sprite, anchor: readonly number[], at: Pt, ang: number, s: number) {
    ctx.save();
    ctx.translate(at[0], at[1]);
    ctx.rotate(ang);
    ctx.drawImage(sp.image, -anchor[0] * s, -anchor[1] * s, sp.width * s, sp.height * s);
    ctx.restore();
  }

  /* a still moment: the rider upside down in a megaloop, the kite looping just below him */
  function drawPose(q: Scene) {
    const g = poseGeometry(q);
    ctx.strokeStyle = col.line;
    ctx.lineCap = "butt";
    const N = 40;
    for (let i = 0; i < N; i++) {
      const f0 = i / N;
      const f1 = (i + 1) / N;
      const b0 = g.a0 - g.sg * g.sw * f0;
      const b1 = g.a0 - g.sg * g.sw * f1;
      ctx.globalAlpha = 0.55 * Math.pow(1 - f0, 1.4);
      ctx.lineWidth = (0.6 + 1.4 * (1 - f0)) * g.kk;
      ctx.beginPath();
      ctx.moveTo(g.c[0] + g.r * Math.cos(b0), g.c[1] + g.r * Math.sin(b0));
      ctx.lineTo(g.c[0] + g.r * Math.cos(b1), g.c[1] + g.r * Math.sin(b1));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 0.7 * g.kk;
    ctx.beginPath();
    for (const n of ["tl", "tr"] as const) {
      const p = rot((g.ki[n][0] - g.ki.k0[0]) * g.sk, (g.ki[n][1] - g.ki.k0[1]) * g.sk, g.ka);
      ctx.moveTo(g.K[0] + p[0], g.K[1] + p[1]);
      ctx.lineTo(g.bar[0], g.bar[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    sprite(sprites.kite, g.ki.k0, g.K, g.ka, g.sk);
    sprite(sprites.rider, g.ar.g, g.G, g.beta, g.s);
  }

  /** One picture: the air and the water at time t (seconds), then the rider where the scene puts him. dt is the time since the last picture (0 for a still one). */
  function render(t: number, dt: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    stepAir(dt, t);
    drawAir();
    drawWaves(t);
    if (scene) drawPose(scene);
  }
  return {
    resize,
    render,
    setScene(q: Scene | null) {
      scene = q;
    },
  };
}
