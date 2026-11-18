import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold tracking-tight">That page doesn&apos;t exist</h1>
      <p className="mt-2 text-slate">The link may be broken or mistyped.</p>
      <ButtonLink href="/" className="mt-6">
        Go to the home page
      </ButtonLink>
    </main>
  );
}
