import type { ExportRow } from "@/lib/engine/schedule";
import { copy } from "@/lib/ui-copy";

export interface PngColumn {
  key: keyof ExportRow;
  title: string;
  width: number;
  align: "left" | "right" | "center";
}

/** The columns of the noticeboard layout, as the spreadsheet: Division / Session / Start / Duration / End / Break (Warm-up only when used). */
export function pngColumns(showWarmUp: boolean): PngColumn[] {
  const T = copy.runOrder.export;
  const cols: PngColumn[] = [
    { key: "division", title: T.division, width: 220, align: "left" },
    { key: "session", title: T.session, width: 340, align: "left" },
  ];
  if (showWarmUp) cols.push({ key: "warmUp", title: T.warmUp, width: 110, align: "center" });
  cols.push(
    { key: "start", title: T.start, width: 110, align: "center" },
    { key: "duration", title: T.duration, width: 120, align: "center" },
    { key: "end", title: T.end, width: 110, align: "center" },
    { key: "break", title: T.break, width: 100, align: "center" },
  );
  return cols;
}

export interface PngLayout {
  width: number;
  height: number;
  rowHeight: number;
  headerTop: number;
  tableTop: number;
  columns: Array<PngColumn & { x: number }>;
}

/** Sizes of the picture: pure, so it is tested without a canvas. */
export function pngLayout(rowCount: number, showWarmUp: boolean): PngLayout {
  const pad = 40;
  const cols = pngColumns(showWarmUp);
  let x = pad;
  const columns = cols.map((c) => {
    const placed = { ...c, x };
    x += c.width;
    return placed;
  });
  const rowHeight = 44;
  const headerTop = pad;
  const tableTop = headerTop + 120;
  return { width: x + pad, height: tableTop + rowHeight * (rowCount + 1) + 90, rowHeight, headerTop, tableTop, columns };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Draws the timetable for WhatsApp and the noticeboard: event logo, title, the six-column table, and "Times are estimates and update
 * live". A logo that cannot be loaded never stops the export.
 */
export async function drawTimetablePng(input: { title: string; subtitle: string; rows: ExportRow[]; showWarmUp: boolean; logoUrl: string | null; finish: string | null }): Promise<Blob> {
  const T = copy.runOrder.export;
  const layout = pngLayout(input.rows.length, input.showWarmUp);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "#111111";
  let textX = 40;
  const logo = input.logoUrl ? await loadImage(input.logoUrl) : null;
  if (logo) {
    const h = 80;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, 40, layout.headerTop, w, h);
    textX = 40 + w + 24;
  }
  ctx.font = "bold 40px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(input.title, textX, layout.headerTop);
  ctx.font = "600 26px sans-serif";
  ctx.fillText(input.subtitle, textX, layout.headerTop + 52);
  if (input.finish) ctx.fillText(T.finish(input.finish), textX, layout.headerTop + 86);

  const cell = (text: string, col: PngColumn & { x: number }, y: number, bold: boolean) => {
    ctx.font = `${bold ? "bold" : "600"} 22px sans-serif`;
    ctx.textAlign = col.align === "left" ? "left" : "center";
    const cx = col.align === "left" ? col.x + 8 : col.x + col.width / 2;
    ctx.fillText(text, cx, y + 10, col.width - 16);
  };
  // header
  ctx.fillStyle = "#111111";
  ctx.fillRect(40, layout.tableTop, layout.width - 80, layout.rowHeight);
  ctx.fillStyle = "#ffffff";
  for (const col of layout.columns) cell(col.title, col, layout.tableTop, true);
  // rows
  input.rows.forEach((row, i) => {
    const y = layout.tableTop + layout.rowHeight * (i + 1);
    ctx.fillStyle = row.kind === "heat" ? (i % 2 ? "#f3f4f6" : "#ffffff") : "#fde68a";
    ctx.fillRect(40, y, layout.width - 80, layout.rowHeight);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1;
    ctx.strokeRect(40, y, layout.width - 80, layout.rowHeight);
    ctx.fillStyle = "#111111";
    for (const col of layout.columns) cell(String(row[col.key] ?? ""), col, y, col.key === "start");
  });
  ctx.textAlign = "left";
  ctx.font = "italic 600 22px sans-serif";
  ctx.fillText(T.estimates, 40, layout.tableTop + layout.rowHeight * (input.rows.length + 1) + 30);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}
