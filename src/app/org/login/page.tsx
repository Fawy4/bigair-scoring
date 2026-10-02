import { copy } from "@/lib/ui-copy";
import { LoginForm } from "./login-form";

export const metadata = { title: copy.login.title };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-beach-ink">
      <h1 className="text-[20px] font-semibold leading-tight">{copy.login.title}</h1>
      {error ? (
        <p role="alert" className="rounded-card border border-beach-failed p-4 text-body font-semibold text-beach-failed">
          {copy.common.problem(copy.login.linkFailed)}
        </p>
      ) : null}
      <LoginForm next={next} />
    </main>
  );
}
