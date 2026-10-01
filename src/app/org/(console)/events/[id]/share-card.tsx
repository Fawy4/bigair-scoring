"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { copy } from "@/lib/ui-copy";

/** A link with a Copy button and its QR code, for the officials' join page and the public event page. */
export function ShareCard({ title, text, url, testId }: { title: string; text: string; url: string; testId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 240 }).then((d) => live && setQr(d)).catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <section className="panel flex flex-wrap items-center gap-4" data-testid={testId} aria-label={title}>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
        <img src={qr} alt={copy.dashboard.qrLabel(title)} width={120} height={120} className="border-2 border-[#111]" />
      ) : (
        <span className="h-[120px] w-[120px] border-2 border-dashed border-[#111]" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-lg font-extrabold">{title}</h3>
        <p className="font-semibold">{text}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-bold underline" data-testid={`${testId}-link`}>
          {url}
        </a>
        <div>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? copy.dashboard.copied : copy.dashboard.copyLink}
          </button>
        </div>
      </div>
    </section>
  );
}
