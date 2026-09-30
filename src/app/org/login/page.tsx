import { copy } from "@/lib/ui-copy";
import { LoginForm } from "./login-form";

export const metadata = { title: copy.login.title };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      <h1 className="text-3xl font-extrabold">{copy.login.title}</h1>
      {error ? (
        <p role="alert" className="rounded-lg border-2 border-[#111] p-4 text-lg font-semibold">
          {copy.common.problem(copy.login.linkFailed)}
        </p>
      ) : null}
      <LoginForm next={next} />
    </main>
  );
}
