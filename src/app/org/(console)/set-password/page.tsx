import { copy } from "@/lib/ui-copy";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: copy.setPassword.title };

export default function SetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{copy.setPassword.title}</h1>
      <p className="font-semibold">{copy.setPassword.intro}</p>
      <SetPasswordForm />
    </div>
  );
}
