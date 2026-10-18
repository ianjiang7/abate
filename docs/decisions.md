# Decisions log

Newest first. One entry per decision: what we decided, why, and its status. This feeds the
portfolio and the Nov 5 memo.

## 2026-10-18: Abate does the chasing

- **Direction:** instead of a one-off letter, Abate runs timed, escalating follow-ups for the
  tenant. *Why:* Sprint 1's top finding was that following up is the burden, and one letter left
  it in place. A single tenant's dollar figure for a typical issue is also small (about $120 to
  $310 for a broken sink for three weeks at $1,800 rent), so one letter is easy to ignore.
- **Hypothesis:** when Abate does the chasing, with timed written follow-ups that build up to a
  dollar figure, landlords fix repairs faster than when tenants chase on their own.
- **Assumption 1, landlords respond faster to Abate than to the tenant's own chasing:** at least
  half of cases get a reply or a scheduled repair within 7 days of the first notice, faster than
  the tenant's earlier wait.
- **Assumption 2, the case agent can run the follow-ups:** at least 90% of replies classified
  correctly, and at least 70% of drafts sent without editing. *Why this one:* the estimate is
  arithmetic. Reading messy replies and drafting the right next step is the real technical risk.
- **Tech:** the case agent (Claude API, `claude-opus-5-5`, structured outputs) is the core.
  Building intelligence comes from NYC Open Data. The evidence reader and automatic inbox reading
  are stretch goals.
- **Rule changes:** the AI may classify replies and fill facts into reviewed templates (before:
  no AI letters at all). Read-only HPD and 311 data is allowed (before: no HPD integrations).
  Tenants' own inboxes stay off limits, and the tenant still presses send.
- **Cheap test of building-wide cases:** a neighbor invite link. Any joint letter is written by
  hand.
- **Escalation cadence compressed for the sprint** (days 0, 3, 5 and 7) so cases get through
  several steps before Oct 29.
- **Dropped:** the with/without dollar figure split (too few cases reach that step before Oct 29;
  we record which step got the first response instead), the court-case accuracy test, and the
  estimate as an assumption.

## 2026-10-13: Hypothesis revised: the dollar figure is what moves landlords (replaced Oct 18, above)

- **Hypothesis:** putting a dollar figure in a tenant's follow-up gets landlords to respond and
  finish repairs faster.
- **Assumption 1, landlords respond faster with a dollar figure:** tested by hand. Testers
  alternate between a letter with the dollar figure and the same letter without it.
- **Assumption 2, our app produces the figure accurately and without our help:** checked
  against about 10 real NYC court decisions, plus timing testers who enter their own case.
- *Why:* the team's hypothesis is about how landlords behave, not tenants. We are helping tenants
  send their emails by hand, so the part that has to be software in Sprint 2 is the estimate
  engine. The with/without split is what lets us credit the dollar figure rather than the letter.
- *Dropped for now:* "tenants will act on their own" (we help them) and willingness to pay (the
  fake door gives an early read).
- *Changes to the build:* each case gets a letter version, the team records reply, scheduled and
  fixed dates, and the estimate engine gets a test against real court cases.

## 2026-10-13: One hypothesis, two assumptions (replaced the same day, above)

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
