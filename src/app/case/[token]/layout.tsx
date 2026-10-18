import Link from "next/link";
import { Logo } from "@/components/brand/logo";

// The case page's frame lives here (not in page.tsx) so the not-found and error screens keep the
// header, phone-width column and footer. It reads no request data, so it stays in the static shell.
export default function CaseLayout({ children }: LayoutProps<"/case/[token]">) {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <Link href="/" aria-label="Abate home" className="rounded-xl">
          <Logo />
        </Link>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate ring-1 ring-line">Private case</span>
      </header>
      {children}
      <footer className="mt-10 space-y-1 px-1 text-center text-xs leading-relaxed text-slate">
        <p>Anyone with this link can see this case, so share it carefully.</p>
        <p>Abate is an NYU Stern student pilot. Not a law firm; nothing here is legal advice.</p>
      </footer>
    </div>
  );
}
