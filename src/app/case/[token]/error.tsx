"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Reloading (rather than retrying in place) also recovers tabs left open across a deploy,
// whose server action IDs no longer exist.
export default function CaseError() {
  return (
    <Card className="mt-4 text-center">
      <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 leading-relaxed text-slate">Your case is safe. Reload the page and try again.</p>
      <Button type="button" className="mt-5" block onClick={() => window.location.reload()} icon={<RotateCcw className="size-4" aria-hidden="true" />}>
        Reload the page
      </Button>
    </Card>
  );
}
