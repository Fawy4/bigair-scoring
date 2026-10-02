"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { createDemoOrganisation } from "./actions";

const c = copy.admin.demo;

/** Shown to owners only while no demo organisation exists. One confirmation, then the demo appears in the list. */
export function DemoPanel() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="demo-h">
      <h2 id="demo-h" className="text-2xl font-semibold">
        {c.heading}
      </h2>
      <p className="font-semibold">{c.text}</p>
      <ConfirmButton
        label={pending ? c.creating : c.button}
        question={c.question}
        confirmLabel={c.yes}
        cancelLabel={c.cancel}
        pending={pending}
        onConfirm={() =>
          start(async () => {
            setError(null);
            const res = await createDemoOrganisation();
            if (res.ok) toast({ title: c.created, description: c.pins });
            else setError(res.error);
            router.refresh();
          })
        }
      />
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
    </section>
  );
}
