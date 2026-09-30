import { copy } from "@/lib/ui-copy";
import { JoinForm } from "./join-form";

export const metadata = { title: copy.join.title };

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      <h1 className="text-3xl font-extrabold">{copy.join.title}</h1>
      <p className="text-lg font-semibold">{copy.join.intro}</p>
      <JoinForm />
    </main>
  );
}
