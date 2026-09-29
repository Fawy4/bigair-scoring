import { LoginForm } from "./login-form";

export const metadata = { title: "Organiser sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      <h1 className="text-3xl font-extrabold">Organiser sign in</h1>
      {error ? (
        <p role="alert" className="rounded-lg border-2 border-[#111] p-4 text-lg font-semibold">
          ✖ That sign-in link did not work. It may have expired, or it was opened in a different browser than the one you asked from. Ask for a new one below.
        </p>
      ) : null}
      <LoginForm next={next} />
    </main>
  );
}
