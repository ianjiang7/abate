"use client";

import { Bookmark, Check, Copy, HandHeart, MessageCircle, Share2, Users } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { helpAction, trackAction, type CaseActionState } from "@/app/case/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Notice } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

// Count a case view once per page session; Next re-runs effects when a hidden page is shown again
// and refresh() re-renders the case after every action.
const viewed = new Set<string>();

export function TrackView({ token, next }: { token: string; next: string }) {
  useEffect(() => {
    if (viewed.has(token)) return;
    viewed.add(token);
    void trackAction(token, "case_viewed", { next });
  }, [token, next]);
  return null;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      return true;
    } catch {
      return false;
    }
  };
  return { copied, copy };
}

/** Shown right after a case is created: the private link is the only way back. */
export function SaveLinkCard({ token }: { token: string }) {
  const { copied, copy } = useCopy();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const url = () => `${window.location.origin}/case/${token}`;
  // Drop ?new=1 so the card doesn't come back on the next refresh.
  const forget = () => window.history.replaceState(window.history.state, "", window.location.pathname);

  return (
    <Card tone="lavender" className="animate-rise">
      <CardHeader icon={<Bookmark className="size-5" />} title="Save your private link" subtitle="It's the only way back to your case. There's no account or password." />
      <div className="grid grid-cols-2 gap-2.5">
        <Button
          type="button"
          onClick={async () => {
            if (await copy(url())) {
              void trackAction(token, "link_copied", {});
              forget();
            }
          }}
          icon={copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void trackAction(token, "link_copied", { via: "sms" });
            forget();
            window.location.href = `sms:?&body=${encodeURIComponent(`My Abate case: ${url()}`)}`;
          }}
          icon={<MessageCircle className="size-4" aria-hidden="true" />}
        >
          Text me
        </Button>
      </div>
      <button
        type="button"
        onClick={() => {
          forget();
          setHidden(true);
        }}
        className="mt-3 w-full py-1.5 text-sm font-semibold text-slate"
      >
        I&apos;ve saved it
      </button>
    </Card>
  );
}

export function InviteCard({ token, code }: { token: string; code: string }) {
  const { copied, copy } = useCopy();
  const share = async () => {
    const url = `${window.location.origin}/start?invite=${code}`;
    const text = "Our building has repair problems too. Abate helps you push management to fix them, with a dated record. It takes about 2 minutes:";
    void trackAction(token, "neighbor_invited", { via: "share" in navigator ? "share" : "copy" });
    if (navigator.share) {
      try {
        await navigator.share({ title: "Abate", text, url });
        return;
      } catch {
        // cancelled or unsupported; fall back to copying
      }
    }
    await copy(`${text} ${url}`);
  };

  return (
    <Card>
      <CardHeader icon={<Users className="size-5" />} title="Neighbors dealing with this too?" subtitle="Problems like heat and leaks rarely hit just one apartment. Several tenants asking in writing is harder to ignore." />
      <Button type="button" variant="secondary" block onClick={share} icon={copied ? <Check className="size-5" aria-hidden="true" /> : <Share2 className="size-5" aria-hidden="true" />}>
        {copied ? "Invite link copied" : "Invite a neighbor"}
      </Button>
      <p className="mt-3 text-xs text-slate">They get their own private case. We only share your building&apos;s street address, never your apartment or details.</p>
    </Card>
  );
}

/** Fake door: interest in a paid recovery service. Nothing is charged or automated. */
export function HelpCard({ token, requested, emphasize }: { token: string; requested: boolean; emphasize: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(helpAction.bind(null, token), {});

  if (requested || state.ok) {
    return (
      <Card tone="good">
        <CardHeader icon={<Check className="size-5" />} title="Thanks, we'll be in touch" subtitle="Someone from the Abate team will reach out within two days. Nothing is charged while we pilot." />
      </Card>
    );
  }

  return (
    <Card emphasis={emphasize}>
      <CardHeader icon={<HandHeart className="size-5" />} title="Want us to recover this for you?" subtitle="We handle the follow-ups and push for the rent credit you may be owed. You pay 25% of what you get, and only if you get paid." />
      {!open ? (
        <Button
          type="button"
          block
          variant={emphasize ? "primary" : "secondary"}
          onClick={() => {
            setOpen(true);
            void trackAction(token, "help_opened", {});
          }}
        >
          I&apos;m interested
        </Button>
      ) : (
        <form action={formAction} className="space-y-3">
          <Field label="Best phone or email to reach you" htmlFor="help-contact" error={state.errors?.contact}>
            <Input id="help-contact" name="contact" required maxLength={120} autoComplete="tel" />
          </Field>
          {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
          <Button type="submit" block loading={pending}>
            Ask the team to reach out
          </Button>
          <p className="text-xs text-slate">This is a pilot. We&apos;ll talk it through with you first, and nothing is charged.</p>
        </form>
      )}
    </Card>
  );
}
