import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium text-brand">404</p>
        <h1 className="mt-1 text-lg font-semibold">This record or page does not exist</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-muted-foreground underline underline-offset-4">Go to dashboard</Link>
      </div>
    </main>
  );
}
