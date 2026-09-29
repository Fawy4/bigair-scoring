import { JoinForm } from "./join-form";

export const metadata = { title: "Join as an official" };

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      <h1 className="text-3xl font-extrabold">Join as an official</h1>
      <p className="text-lg font-semibold">Judges, spotters, head judge and announcer: enter the event code and the PIN from your card. Or scan your QR code.</p>
      <JoinForm />
    </main>
  );
}
