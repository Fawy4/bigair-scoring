"use client";

import { useRef, useState } from "react";
import { uploadBrandingImage } from "@/lib/branding/upload";
import { copy } from "@/lib/ui-copy";

/** Picks and uploads one image, then hands its public address to the form. Errors stay on screen (decision 16). */
export function LogoField({
  orgId,
  purpose,
  label,
  value,
  onChange,
}: {
  orgId: string;
  purpose: string;
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadBrandingImage(orgId, purpose, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-bold">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={copy.logo.current(label)} className="h-16 max-w-[12rem] rounded border-2 border-[#111] bg-white object-contain p-1" />
        ) : (
          <span className="flex h-16 w-24 items-center justify-center rounded border-2 border-dashed border-[#111] text-sm font-semibold">{copy.logo.none}</span>
        )}
        <label className="btn cursor-pointer">
          {busy ? copy.logo.uploading : value ? copy.logo.replace : copy.logo.choose}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={copy.logo.chooseAria(label)}
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        {value ? (
          <button type="button" className="btn" onClick={() => onChange(null)} disabled={busy}>
            {copy.common.remove}
          </button>
        ) : null}
      </div>
      <p className="text-sm font-semibold">{copy.common.imageTypes}</p>
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
    </div>
  );
}
