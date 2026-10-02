"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { shareLink, shareText } from "@/lib/officials/share";
import { copy } from "@/lib/ui-copy";
import type { IssuedPin } from "./actions";

const T = copy.officials;

/** The PIN in full, in a large box, with Copy, a WhatsApp share link and (for on-the-spot joining) a single-use QR code. */
export function PinBox({ issued, eventName, onClose }: { issued: IssuedPin; eventName: string; onClose: () => void }) {
  const [copied, setCopied] = useState<"pin" | "message" | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const message = shareText({ eventName, seatName: issued.seatName, joinUrl: issued.joinUrl, pin: issued.pin });

  useEffect(() => {
    let live = true;
    if (issued.qrUrl) QRCode.toDataURL(issued.qrUrl, { margin: 1, width: 220 }).then((u) => live && setQr(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [issued.qrUrl]);

  async function copyText(text: string, what: "pin" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-beach-line bg-beach-bg p-5" aria-labelledby="pin-box-h" data-testid="pin-box">
      <h2 id="pin-box-h" className="text-2xl font-semibold">
        {T.pinBoxHeading(issued.seatName)}
      </h2>
      <p className="font-semibold">{T.roles[issued.role] ?? issued.role}</p>
      <p className="select-all text-center font-mono text-6xl font-semibold tracking-[0.3em]" data-testid="pin-digits" aria-label={`PIN ${issued.pin.split("").join(" ")}`}>
        {issued.pin}
      </p>
      <p className="font-semibold">{T.pinBoxNote}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => copyText(issued.pin, "pin")} data-testid="pin-copy">
          {copied === "pin" ? T.pinCopied : T.copyPin}
        </button>
        <a className="btn" href={shareLink(message)} target="_blank" rel="noopener noreferrer" data-testid="pin-share">
          {T.shareLink}
        </a>
        <button type="button" className="btn" onClick={() => copyText(message, "message")}>
          {copied === "message" ? T.shareCopied : T.copyShare}
        </button>
      </div>
      <p className="font-semibold">{T.joinAddressLine(issued.joinUrl)}</p>
      {qr ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={T.qrCaption} width={160} height={160} />
          <p className="font-semibold">{T.qrCaption}</p>
        </div>
      ) : null}
      <div>
        <button type="button" className="btn" onClick={onClose} data-testid="pin-box-close">
          {T.pinBoxClose}
        </button>
      </div>
    </section>
  );
}
