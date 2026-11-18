"use client";

import { RotateCcw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Reloading also recovers a tab left open across a deploy, whose server action IDs no longer exist.
export default function AppError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-slate">Reload the page and try again.</p>
      <Button type="button" className="mt-6" onClick={() => window.location.reload()} icon={<RotateCcw className="size-4" aria-hidden="true" />}>
        Reload the page
      </Button>
    </main>
  );
}
