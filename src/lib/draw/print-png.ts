import { BODY_MM, BOX, FOOTER_MM, HEADER_MM, MARGIN_MM, PAGE_MM, type PrintHeader, type PrintPage, type PrintSheet } from "./print-sheet";
import { copy } from "@/lib/ui-copy";

const T = copy.draw.sheet;

/** Pixels per millimetre of the picture: 8 px/mm makes the A4 page 2376 × 1680 px, sharp enough to read on a phone. */
export const PX_PER_MM = 8;

export const pngSize = () => ({ width: Math.round(PAGE_MM.w * PX_PER_MM), height: Math.round(PAGE_MM.h * PX_PER_MM) });

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Writes `text` in at most `maxW` pixels: the end is cut with "…" rather than running over the next thing. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

/** Draws one page of the sheet: the same boxes as the printed page (print-sheet-view.tsx), in pixels. */
export async function drawDrawPng(page: PrintPage, header: PrintHeader, hasTimes: boolean): Promise<Blob> {
  const { width, height } = pngSize();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const mm = (v: number) => v * PX_PER_MM;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // head: logo, event, division · date, status and page
  let textX = mm(MARGIN_MM);
  const logo = header.logoUrl ? await loadImage(header.logoUrl) : null;
  if (logo) {
    const h = mm(18);
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, textX, mm(MARGIN_MM) + (mm(HEADER_MM) - h) / 2, w, h);
    textX += w + mm(5);
  }
  const rightX = width - mm(MARGIN_MM);
  ctx.textAlign = "right";
  ctx.font = `700 ${mm(3.6)}px sans-serif`;
  ctx.fillText(header.status, rightX, mm(MARGIN_MM) + mm(10));
  if (page.of > 1) ctx.fillText(T.page(page.index, page.of), rightX, mm(MARGIN_MM) + mm(15));
  ctx.textAlign = "left";
  const maxText = rightX - mm(60) - textX;
  ctx.font = `800 ${mm(9)}px sans-serif`;
  ctx.fillText(fit(ctx, header.eventName, maxText), textX, mm(MARGIN_MM) + mm(11));
  ctx.font = `700 ${mm(5)}px sans-serif`;
  ctx.fillText(fit(ctx, [header.divisionName, header.date].filter(Boolean).join(" · "), maxText), textX, mm(MARGIN_MM) + mm(18));

  // body
  const em = mm(page.mmPerEm);
  const originX = mm(MARGIN_MM) + (mm(BODY_MM.w) - page.widthEm * em) / 2;
  const originY = mm(MARGIN_MM + HEADER_MM);
  for (const col of page.columns) {
    const cx = originX + col.x * em;
    ctx.fillStyle = "#111111";
    ctx.font = `800 ${1.25 * em}px sans-serif`;
    const name = col.part ? `${col.name} · ${T.part(col.part.index, col.part.of)}` : col.name;
    ctx.fillText(name, cx, originY + 1.2 * em);
    ctx.font = `700 ${0.75 * em}px sans-serif`;
    ctx.fillText(col.summary, cx, originY + 2.1 * em);
    for (const h of col.heats) {
      const x = cx;
      const y = originY + h.y * em;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x, y, h.w * em, h.h * em, 0.6 * em);
      ctx.fill();
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 0.14 * em;
      ctx.stroke();
      ctx.fillStyle = "#111111";
      ctx.font = `800 ${em}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(h.title, x + 0.5 * em, y + 1.25 * em);
      if (h.time) {
        ctx.textAlign = "right";
        ctx.fillText(h.time, x + (h.w - 0.5) * em, y + 1.25 * em);
        ctx.textAlign = "left";
      }
      for (const s of h.seats) {
        const sy = y + s.y * em;
        ctx.fillStyle = "#111111";
        ctx.font = `800 ${0.8 * em}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(s.number), x + (BOX.rowIndent + BOX.numberW / 2) * em, sy + 1.1 * em);
        ctx.textAlign = "left";
        let nameX = x + (BOX.rowIndent + BOX.numberW + 0.2) * em;
        if (s.tag) {
          const tx = x + (BOX.rowIndent + BOX.numberW) * em;
          const ty = sy + 0.12 * em;
          const th = (BOX.seat - 0.24) * em;
          ctx.fillStyle = s.tag.hex ?? "#ffffff";
          roundRect(ctx, tx, ty, BOX.tagW * em, th, 0.3 * em);
          ctx.fill();
          ctx.strokeStyle = "#111111";
          ctx.lineWidth = (s.tag.outlined || !s.tag.hex ? 0.12 : 0.06) * em;
          ctx.stroke();
          ctx.fillStyle = s.tag.ink;
          ctx.font = `800 ${0.8 * em}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(fit(ctx, s.tag.text, (BOX.tagW - 0.4) * em), tx + (BOX.tagW * em) / 2, sy + 1.12 * em);
          ctx.textAlign = "left";
          nameX = tx + (BOX.tagW + 0.4) * em;
        }
        ctx.fillStyle = "#111111";
        ctx.font = `${s.kind === "rider" ? 700 : 800} ${s.kind === "empty" ? "italic " : ""}${0.92 * em}px sans-serif`;
        ctx.fillText(fit(ctx, s.text, x + (h.w - 0.4) * em - nameX), nameX, sy + 1.12 * em);
      }
    }
  }
  if (hasTimes) {
    ctx.fillStyle = "#111111";
    ctx.font = `italic 700 ${mm(3.4)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(T.estimates, mm(MARGIN_MM), height - mm(MARGIN_MM - FOOTER_MM / 4));
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}

/** One picture per page of the sheet. */
export async function drawDrawPngs(sheet: PrintSheet, header: PrintHeader): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const page of sheet.pages) out.push(await drawDrawPng(page, header, sheet.hasTimes));
  return out;
}
