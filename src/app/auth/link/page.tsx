import { copy } from "@/lib/ui-copy";
import { LinkSignIn } from "./link-sign-in";

export const metadata = { title: copy.login.title };

/** Where the e-mailed sign-in link lands. It signs the person in and sends them on; nothing else to do. */
export default function AuthLinkPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4 text-beach-ink">
      <LinkSignIn />
    </main>
  );
}
