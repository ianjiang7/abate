import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CaseNotFound() {
  return (
    <Card className="mt-4 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-lavender text-ink">
        <SearchX className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">We couldn&apos;t find that case</h1>
      <p className="mt-2 leading-relaxed text-slate">Check that you copied the whole link. Private case links are long on purpose.</p>
      <ButtonLink href="/start" className="mt-5" block>
        Start a new case
      </ButtonLink>
    </Card>
  );
}
