"use client";

import { MessageSquareReply, X } from "lucide-react";
import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { replyAction, type CaseActionState } from "@/app/case/[token]/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToday } from "@/lib/client/use-today";

/** "Management replied" button plus a bottom sheet to paste the reply. */
export function ReplyButton({ token, variant = "secondary", label = "Management replied" }: { token: string; variant?: "primary" | "secondary" | "ghost"; label?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);

  // Next hides pages instead of unmounting them; close the sheet so it can't come back half-open.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  const open = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };

  return (
    <>
      <Button type="button" variant={variant} block onClick={open} icon={<MessageSquareReply className="size-5" aria-hidden="true" />}>
        {label}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="reply-title"
        className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-rise sm:m-auto sm:max-w-md"
        // Reset the form after closing, so the next open starts empty (and focus isn't lost mid-open).
        onClose={() => setFormKey((k) => k + 1)}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <ReplyForm key={formKey} token={token} onDone={() => dialogRef.current?.close()} />
      </dialog>
    </>
  );
}

function ReplyForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(replyAction.bind(null, token), {});
  const today = useToday();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mx-auto w-full max-w-md rounded-t-[1.75rem] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[var(--shadow-lift)] sm:rounded-[1.75rem]">
      <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-periwinkle-soft sm:hidden" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="reply-title" className="text-xl font-bold tracking-tight">
            What did management say?
          </h2>
          <p className="mt-1 text-sm text-slate">Paste their text or email. Our team reads it and sets up your next step.</p>
        </div>
        <button type="button" onClick={onDone} aria-label="Close" className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-lavender">
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-5 space-y-5">
        {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
        <Field label="Their reply" htmlFor="reply-text" error={state.errors?.text}>
          <Textarea id="reply-text" name="text" rows={6} required maxLength={8000} autoFocus placeholder={"e.g. “Hi, we've let the super know and he'll come by to take a look.”"} aria-invalid={Boolean(state.errors?.text)} />
        </Field>
        <Field label="When did you get it?" htmlFor="reply-date" error={state.errors?.receivedOn}>
          <Input id="reply-date" name="receivedOn" type="date" defaultValue={today} key={today} max={today || undefined} />
        </Field>
        <Button type="submit" size="lg" block loading={pending}>
          {pending ? "Sending it to our team…" : "Send it to our team"}
        </Button>
      </div>
    </form>
  );
}
