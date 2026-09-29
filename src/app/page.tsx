export default function Home() {
  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "[PRODUCT_NAME]";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-4">
      <h1 className="text-3xl font-bold">{productName}</h1>
      <p className="text-lg text-muted-foreground">Build OK</p>
    </main>
  );
}
