# Decisions log

Newest first. One entry per decision: what we decided, why, and its status. This feeds the
portfolio and the Nov 5 memo.

## 2026-10-13: One hypothesis, two assumptions

- **Hypothesis:** a documented case with a dollar figure attached gets stalled repairs moving.
  It makes tenants escalate in writing, and it makes management respond faster than texts and
  calls do.
- **Assumption 1, tenants will act:** they document the repair and send the letter. This
  replaces the single assumption from Oct 12.
- **Assumption 2, management will respond:** the letter gets a reply or a scheduled repair within
  7 days.
- *Why:* the class asks for one hypothesis backed by two testable assumptions, and the Oct 29
  rubric asks us to prioritize efficacy. Assumption 2 is the efficacy test. The 25% fake door
  stays in the flow as a side signal, not a pass/fail test.
- *Changes to the build:* the intake asks how many times the tenant has followed up, and the team
  records when management replies.

## 2026-10-12: Starting scope for Sprint 2 (proposed, confirm Oct 13)

- **Test one assumption:** tenants with an unresolved repair, once they see what they may be
  owed, will document it and send a formal follow-up. *Why:* it was Sprint 1's open question, and
  every later step depends on it.
- **No login; private case links instead.** *Why:* a login tests nothing and adds friction for
  testers.
- **The tenant sends the letter from their own email; the team does follow-ups by hand.** *Why:*
  tenants fear retaliation, and we haven't tested trust in a third party yet. A manual process is
  enough to test the assumption.
- **The letter is a fixed template, not written by AI.** *Why:* it avoids made-up legal claims,
  and New York restricts non-lawyers from giving legal advice.
- **The paid recovery step is a fake door.** *Why:* it measures interest at the 25% fee without
  building payments or legal work.
- **Stack (decided; the team had no preference):** Next.js + TypeScript + Tailwind, Supabase,
  Vercel, Vitest, Playwright. *Why:* free tiers; one sign-in (GitHub) for every service; deploys
  a real link testers can open; the Supabase table editor doubles as our admin view; coding agents
  know this stack well. No email or SMS service: tenants send from their own email and we text
  by hand.
