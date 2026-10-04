"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/org/button";
import { OrgCard } from "@/components/org/org-card";
import { QR_COLOURS } from "@/lib/org-design/qr";
import { copy } from "@/lib/ui-copy";

/** A link with a Copy button and its QR code, for the officials' join page and the public event page. */
export function ShareCard({ title, text, url, testId }: { title: string; text: string; url: string; testId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    // the QR library is loaded after the page is on screen, so it is not part of the page's first download
    import("qrcode")
      .then((m) => m.default.toDataURL(url, { margin: 1, width: 240, color: QR_COLOURS }))
      .then((d) => live && setQr(d))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <OrgCard title={title} testId={testId}>
      <div className="flex flex-wrap items-center gap-4">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
          <img src={qr} alt={copy.dashboard.qrLabel(title)} width={120} height={120} className="rounded-[8px]" />
        ) : (
          <span className="size-[120px] rounded-[8px] border border-dashed border-beach-border" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
          <p className="text-small font-medium text-beach-muted">{text}</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-body font-semibold underline" data-testid={`${testId}-link`}>
            {url}
          </a>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={copied ? Check : Copy}
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
            </Button>
            <Button variant="quiet" icon={ExternalLink} href={url}>
              {copy.dashboard.openLink}
            </Button>
          </div>
        </div>
      </div>
    </OrgCard>
  );
}
