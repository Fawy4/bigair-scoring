"use client";

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { dismissToast, useToast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";

/** Mounted on organiser screens only. Each toast carries an icon and a word, never colour alone. */
export function Toaster() {
  const { toasts } = useToast();
  return (
    <ToastProvider duration={4000}>
      {toasts.map((t) => (
        <Toast key={t.id} open onOpenChange={(open) => !open && dismissToast(t.id)} className="border-2 border-[#111]">
          <div className="grid gap-1">
            <ToastTitle className="text-base font-bold">{copy.common.toastDone(t.title)}</ToastTitle>
            {t.description ? <ToastDescription className="text-base font-semibold">{t.description}</ToastDescription> : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
