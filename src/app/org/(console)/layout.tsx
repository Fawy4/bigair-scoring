import { Toaster } from "@/components/ui/toaster";

export const dynamic = "force-dynamic";

/** Every organiser screen: the Toaster. The frame (top bar, rail, footer) is added by the layout next to the page: `(plain)` for the lists, `events/[id]` for an event's steps. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
