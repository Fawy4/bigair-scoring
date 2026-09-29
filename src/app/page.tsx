import Link from "next/link";

export default function Home() {
  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "[PRODUCT_NAME]";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-4">
      <h1 className="text-3xl font-bold">{productName}</h1>
      <p className="text-lg text-muted-foreground">Build OK</p>
      <nav className="mt-4 flex flex-col gap-3">
        <Link href="/join" className="flex h-14 items-center justify-center rounded-md border-2 border-[#111] px-8 text-lg font-bold">Officials: join with a PIN</Link>
        <Link href="/org/login" className="flex h-14 items-center justify-center rounded-md border-2 border-[#111] px-8 text-lg font-bold">Organiser sign in</Link>
      </nav>
    </main>
  );
}
