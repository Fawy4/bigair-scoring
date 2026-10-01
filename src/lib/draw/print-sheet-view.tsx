import { PAGE_MM, MARGIN_MM, HEADER_MM, BODY_MM, BOX, type PrintHeader, type PrintPage, type PrintSheet, type PrintTag } from "./print-sheet";
import { copy } from "@/lib/ui-copy";

const T = copy.draw.sheet;

/** A lycra colour as the real colour AND its name: the colour is forced to print, the name survives a black-and-white printer. */
function Tag({ tag }: { tag: PrintTag }) {
  return (
    <span
      data-testid="print-tag"
      data-hex={tag.hex ?? ""}
      className="print-exact"
      style={{
        position: "absolute",
        left: `${BOX.rowIndent + BOX.numberW}em`,
        top: "0.12em",
        width: `${BOX.tagW}em`,
        height: `${BOX.seat - 0.24}em`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tag.hex ?? "#ffffff",
        color: tag.ink,
        border: tag.outlined || !tag.hex ? "0.12em solid #111" : "0.06em solid #111",
        borderRadius: "0.3em",
        fontWeight: 800,
        fontSize: "0.8em",
        letterSpacing: "0.02em",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      {tag.text}
    </span>
  );
}

function PageView({ page, header, hasTimes }: { page: PrintPage; header: PrintHeader; hasTimes: boolean }) {
  const subtitle = [header.divisionName, header.date].filter(Boolean).join(" · ");
  return (
    <section
      className="print-sheet-page"
      data-testid="print-page"
      style={{ width: `${PAGE_MM.w}mm`, height: `${PAGE_MM.h}mm`, padding: `${MARGIN_MM}mm`, boxSizing: "border-box", background: "#fff", color: "#111", position: "relative", overflow: "hidden" }}
    >
      <header style={{ height: `${HEADER_MM}mm`, display: "flex", alignItems: "center", gap: "5mm" }}>
        {header.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the event's own logo, a plain image on paper
          <img src={header.logoUrl} alt="" style={{ height: "18mm", width: "auto" }} />
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 data-testid="print-title" style={{ fontSize: "9mm", lineHeight: 1.05, fontWeight: 800 }}>
            {header.eventName}
          </h1>
          <p data-testid="print-subtitle" style={{ fontSize: "5mm", fontWeight: 700 }}>
            {subtitle}
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: "3.6mm", fontWeight: 700 }}>
          <p>{header.status}</p>
          {page.of > 1 ? <p>{T.page(page.index, page.of)}</p> : null}
        </div>
      </header>
      <div style={{ height: `${BODY_MM.h}mm`, display: "flex", justifyContent: "center" }}>
        <div data-testid="print-ladder" style={{ position: "relative", width: `${page.widthEm}em`, height: `${page.heightEm}em`, fontSize: `${page.mmPerEm}mm`, lineHeight: 1.2 }}>
          {page.columns.map((col, ci) => (
            <div key={ci} data-testid="print-round" data-round={col.round} style={{ position: "absolute", left: `${col.x}em`, top: 0, width: `${col.w}em`, height: `${col.h}em` }}>
              <div style={{ height: `${BOX.colHead}em` }}>
                <h2 style={{ fontSize: "1.25em", fontWeight: 800, lineHeight: 1.1 }}>
                  {col.name}
                  {col.part ? <span style={{ fontSize: "0.7em", fontWeight: 700 }}> · {T.part(col.part.index, col.part.of)}</span> : null}
                </h2>
                <p style={{ fontSize: "0.75em", fontWeight: 700 }}>{col.summary}</p>
              </div>
              {col.heats.map((h) => (
                <div key={h.uid} data-testid="print-heat" style={{ position: "absolute", left: 0, top: `${h.y}em`, width: `${h.w}em`, height: `${h.h}em`, border: "0.14em solid #111", borderRadius: "0.6em", boxSizing: "border-box", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.25em 0.5em 0", height: `${BOX.heatHead}em`, fontWeight: 800, fontSize: "1em" }}>
                    <span data-testid="print-heat-title">{h.title}</span>
                    {h.time ? <span data-testid="print-heat-time">{h.time}</span> : null}
                  </div>
                  {h.seats.map((s) => (
                    <div key={s.number} data-testid="print-seat" data-kind={s.kind} style={{ position: "absolute", left: 0, right: 0, top: `${s.y}em`, height: `${BOX.seat}em` }}>
                      <span style={{ position: "absolute", left: `${BOX.rowIndent}em`, width: `${BOX.numberW}em`, top: "0.22em", fontSize: "0.8em", fontWeight: 800, textAlign: "center" }}>{s.number}</span>
                      {s.tag ? <Tag tag={s.tag} /> : null}
                      <span
                        style={{
                          position: "absolute",
                          left: `${BOX.rowIndent + BOX.numberW + (s.tag ? BOX.tagW + 0.4 : 0.2)}em`,
                          right: "0.4em",
                          top: "0.2em",
                          fontSize: "0.92em",
                          fontWeight: s.kind === "rider" ? 700 : 800,
                          fontStyle: s.kind === "empty" ? "italic" : "normal",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.text}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <footer style={{ position: "absolute", left: `${MARGIN_MM}mm`, right: `${MARGIN_MM}mm`, bottom: `${MARGIN_MM - 2}mm`, fontSize: "3.4mm", fontWeight: 700, fontStyle: "italic" }}>{hasTimes ? T.estimates : ""}</footer>
    </section>
  );
}

/** The printed draw: one A4 landscape page per `PrintPage`, forced to print in colour. */
export function PrintSheetView({ sheet, header }: { sheet: PrintSheet; header: PrintHeader }) {
  return (
    <div className="print-sheet" data-testid="print-sheet">
      {sheet.pages.map((p) => (
        <PageView key={p.index} page={p} header={header} hasTimes={sheet.hasTimes} />
      ))}
    </div>
  );
}
