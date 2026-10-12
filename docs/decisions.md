# Decisions log

Newest first. One entry per decision: what we decided, why, and its status. This feeds the
portfolio and the Nov 5 memo.

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
