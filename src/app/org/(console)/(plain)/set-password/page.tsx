import { getOrgContext } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: copy.setPassword.title };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const { supabase } = await getOrgContext();
  const { data: passwordIsSet } = await supabase.rpc("has_password");
  const change = Boolean(passwordIsSet);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">{change ? copy.setPassword.changeTitle : copy.setPassword.title}</h1>
      <p className="font-semibold">{change ? copy.setPassword.changeIntro : copy.setPassword.intro}</p>
      <SetPasswordForm changing={change} />
    </div>
  );
}
