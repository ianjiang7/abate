"use client";

import { useActionState, useState } from "react";
import { correctReplyAction, type CaseActionState } from "@/app/case/[token]/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input } from "@/components/ui/field";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/domain/ladder";
import { REPLY_PLAIN as PLAIN } from "./reply-labels";

export function CorrectReply({ token, messageId, current, onDone }: { token: string; messageId: string; current: ReplyCategory | null; onDone?: () => void }) {
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(
    async (prev, fd) => {
      const result = await correctReplyAction(token, prev, fd);
      if (result.ok) onDone?.();
      return result;
    },
    {},
  );
  const [choice, setChoice] = useState<ReplyCategory | null>(current);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="messageId" value={messageId} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[15px] font-semibold">What did their reply say?</legend>
        {REPLY_CATEGORIES.map((c) => (
          <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[15px] ring-1 transition", choice === c.id ? "ring-2 ring-ink" : "ring-line hover:ring-periwinkle")}>
            <input type="radio" name="category" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-4 accent-[#08014E]" />
            {PLAIN[c.id]}
          </label>
        ))}
      </fieldset>
      {choice === "scheduled" ? (
        <Field label="Repair date" htmlFor={`sched-${messageId}`} error={state.errors?.scheduledFor}>
          <Input id={`sched-${messageId}`} name="scheduledFor" type="date" required />
        </Field>
      ) : null}
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <Button type="submit" block loading={pending} disabled={!choice}>
        Update my next step
      </Button>
    </form>
  );
}
