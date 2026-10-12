# Abate: brief for coding agents

Read this before doing anything in this repo. It is the team's brief for the Sprint 2 MVP
(NYU Stern BTE Capstone, Oct 8 to Oct 29, 2026). Team: Ilias, Rayhan, Ian, Omar.

## The product in one line

Abate helps NYC tenants document a repair that management isn't fixing, keep pressure on
management, and see the rent abatement they may be owed.

## Customer and need

**Initial customer segment:** rent-stabilized NYC tenants in buildings run by large management
companies who are living with a serious, unresolved repair right now (no heat or hot water,
leaks, mold, pests). Our Sprint 2 testers will be broader: any NYC renter with a repair that is
dragging on.

**Job to be done:** "When a serious repair drags on, I want to get it fixed without chasing
management, so I can live normally and get back the rent I overpaid."

**What Sprint 1 taught us** (13 tenant interviews, 1 landlord interview):

- Following up, not the first report, is the real burden. Tenants chase management again and
  again with no clear progress.
- Most tenants had never heard of a rent abatement. The one who had has lawyer parents.
- Tenants pay or suffer instead: a Queens family paid for their own sink repair after 3 weeks of
  unanswered calls and emails; a tenant spent 4 months of winter with a window that wouldn't
  close; a sewage-damaged ceiling still has holes after repeated messages.
- A landlord told us informed tenants and compensation emails would get repairs done faster.
- In their words: "We had green water in our bathroom sink for a week before the landlord even
  responded to us."

**Background:** under New York's warranty of habitability (Real Property Law §235-b), tenants can
recover part of the rent they paid while conditions were unlivable. NYC small claims habitability
judgments we found range from about $1,700 to $4,700. HPD fines go to the city, not the tenant.

## The one assumption this MVP tests

> Tenants with an unresolved repair, once they see what they may be owed, will document it
> (photos and dates) and send a formal follow-up to their landlord.

If this is wrong, nothing downstream works: no evidence, no pressure on the landlord, no claim,
no fee. Every feature must help test it. Target with 10 testers: at least 7 finish a case with a
photo, at least 5 send the letter, at least 3 ask us to help recover the money.

## What we are building: one flow, phone-first

1. **Log the repair:** issue type, when it started, when management was first told and how,
   monthly rent, address and unit, management name and email, at least one photo.
2. **See the case:** a timeline (started, reported, days unresolved) and an estimated abatement
   range so far, clearly labeled as an estimate, not legal advice.
3. **Take the next step:** a pre-filled follow-up letter to management. The tenant sends it from
   their own email (a `mailto:` link that CCs the team's tracking address) or copies it, then taps
   "I sent it".
4. **Fake door:** "Want us to follow up and recover this for you? We take 25% only if you get
   paid." It captures a phone number or email. Nothing is automated behind it.
5. **Private case link** (no login) so the tenant can come back, add a photo or note, or mark the
   repair fixed.

Every step records an event so we can count the funnel (case started, case created, photo
added, estimate viewed, letter opened, send clicked, send confirmed, help requested, marked
fixed).

Data stays small: `cases`, `photos`, `events`. Case links use a long random token.

## What the team fakes by hand

- **The follow-up agent:** a teammate texts the tenant reminders and drafts further follow-ups
  manually. No automated emails or texts.
- **Recovering money:** we talk to tenants who tap "help me". No negotiation, court or attorney
  features.
- **Reviewing cases:** the team uses the Supabase dashboard. No admin UI.

## Do not build

Login, accounts or passwords; payments or fee collection; admin dashboards; settings pages;
notifications, SMS or WhatsApp; anything that emails a landlord automatically; HPD, 311 or
Who Owns What integrations; building-wide or group claims; small claims or DHCR filing; native
apps; translations; AI-generated letters. If a task seems to need one of these, stop and ask.

## Abatement estimate

Keep all of the math and the percentage table in one file (for example `lib/estimate.ts`) with
unit tests.

- Daily rent = monthly rent × 12 / 365.
- Days = from the date management was first told (notice) until the fix date, or today if still
  unfixed.
- Range = daily rent × days × low % to daily rent × days × high %, rounded to the nearest $10.
- While unfixed, also show roughly how much the range grows per day.

Starting percentages. **These are team placeholders, not legal standards.** Confirm them with a
tenant attorney or legal aid before real testers see them.

| Issue type | % of rent |
| --- | --- |
| No heat (Oct 1 to May 31) or no hot water | 20 to 50 |
| Sewage, major leak, ceiling damage | 20 to 40 |
| Mold | 10 to 30 |
| Pests (rodents, roaches, bedbugs) | 10 to 30 |
| Broken window, door or lock | 10 to 25 |
| Plumbing (sink, toilet, drain) | 10 to 25 |
| Electrical or lights | 5 to 20 |
| Other or minor | 0 to 10 |

## Guardrails

- **Not legal advice.** New York restricts non-lawyers from giving legal advice. Say "may be
  owed" and "estimate", never "you are owed" or "you will get". Show a short disclaimer on the
  estimate and the letter. The letter states facts, requests the repair by a date, and may mention
  the warranty of habitability. No other legal claims and no threats.
- **The tenant presses send.** Fear of retaliation is real. Nothing reaches a landlord unless the
  tenant sends it themselves.
- **Privacy.** Tenants share their address, rent, photos and landlord. Collect only what the flow
  needs. Keep the photo bucket private. Never log personal data. Never put real tenant data in the
  repo, seeds or tests; use made-up data.
- **Secrets** live in `.env.local`, which is never committed. `.env.example` lists variable names
  only.

## Stack

- **Next.js** (App Router) with TypeScript and Tailwind CSS.
- **Supabase:** Postgres for cases and events, and a private Storage bucket for photos. The team
  reviews cases in the Supabase table editor.
- **Vercel** deploys from GitHub on every push to `main`, so testers open a real link on their
  phones.
- **Vitest** for the estimate math; **Playwright** for one phone-size test of the whole flow.
- **No email or SMS service.** The tenant's own email app sends the letter (`mailto:`), and
  teammates text testers from their own phones.

## How to run and test

No app code exists yet. The first build task scaffolds the app and must replace this section
with the real commands (install, dev server, tests, deploy) and the env variable names.

## How to work here

- **Plan before code.** Propose a short plan, then cut anything that doesn't test the assumption.
  One feature per request.
- **Know what done looks like** before starting: the goal, the check, and what to leave out.
- **Check your own work.** Run the app and click through the flow in a browser at phone width
  (375px) before calling a task done. Test the estimate math.
- **Small commits.** Commit each step once it works. If something goes wrong, roll back instead of
  patching on top.
- **Keep it boring.** Few dependencies, plain server actions or route handlers, no state
  libraries.
- **Log decisions.** Add scope cuts, stack changes and assumption changes to
  `docs/decisions.md` with the date and the reason. It feeds our portfolio and the Nov 5 memo.
- **Explain in plain language.** Every teammate must be able to explain every part of the app
  without AI on Nov 5.

## Key dates

Oct 13 plan review · Oct 16 advisor (MVP scoping) · Oct 20 standup · Oct 23 advisor (refinement
and user testing) · Oct 29 five-minute live demo, with 10 user tests done.
