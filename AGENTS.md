# Abate: brief for coding agents

Read this before doing anything in this repo. It is the team's brief for the Sprint 2 MVP
(NYU Stern BTE Capstone, Oct 8 to Oct 29, 2026). Team: Ilias, Rayhan, Ian, Omar.

## The product in one line

Abate does the chasing for NYC tenants whose repairs management isn't fixing: timed, written
follow-ups that build up to the rent abatement they may be owed, with a dated record kept along
the way.

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

## The hypothesis this MVP tests

> **Hypothesis:** when Abate does the chasing, with timed written follow-ups that build up to a
> dollar figure, landlords fix repairs faster than when tenants chase on their own.

It holds only if both assumptions hold. Every feature must help test one of them.

1. **Landlords respond faster to Abate's follow-ups than to the tenant's own chasing.** We
   compare how long management takes to reply or schedule the repair after Abate's first notice
   with how long the tenant's earlier messages went unanswered, and we record which step of the
   escalation ladder got the first response. *Pass:* at least half of cases get a reply or a
   scheduled repair within 7 days of Abate's first notice, faster than the tenant's earlier wait.
2. **The case agent can run the follow-ups.** It reads management's replies correctly and drafts
   follow-ups tenants will send as written. *Pass:* it classifies at least 90% of replies
   correctly (the team checks every real reply plus a set of sample replies), and tenants send at
   least 70% of its drafts without editing.

Side signals, not pass/fail: neighbor invites sent (interest in building-wide cases) and "help me
recover this" taps (willingness to pay the 25% fee). Not tested this sprint: whether tenants keep
going without our help.

## What we are building: one flow, phone-first

1. **Start a case** (under 5 minutes): address and unit, issue type, when it started, when
   management was first told and how, how many times they've followed up since, monthly rent,
   management name and email, at least one photo, and consent to AI processing of what they
   share.
2. **See the building:** the building's open HPD violations, recent heat and repair complaints,
   and the registered managing agent (see Building intelligence).
3. **See the case:** a timeline that fills itself in as messages go out and replies come in, the
   days unresolved, and the estimated abatement so far, labeled as an estimate, not legal advice.
4. **Send each follow-up:** the case agent drafts the next message from the escalation ladder.
   The tenant sends it as is or edits it in the app, sends it from their own email (a `mailto:`
   link that CCs the case's tracking address), then taps "I sent it".
5. **Log replies:** the tenant taps "Management replied" and pastes the reply. Teammates paste
   replies that arrive in the CC inbox. The agent classifies each reply and moves the case along
   the ladder.
6. **Invite neighbors:** "Know a neighbor with the same problem?" shares a link that starts a case
   at the same building. We count invites and the cases they start.
7. **Fake door:** "Want us to recover this for you? We take 25% only if you get paid." It captures
   a phone number or email. Nothing is automated behind it.
8. **Private case link** (no login) to come back, follow along, or mark the repair fixed.

Every step records an event: case started, case created, photo added, building viewed, draft
shown, draft edited, send clicked, send confirmed, reply logged, neighbor invited, help requested,
marked fixed.

Data stays small: `cases`, `photos`, `messages` (every follow-up and reply, with the agent's
classification and the team's check), `events`. Case links use a long random token. A case stores
the dates management first replied, scheduled the repair and fixed it.

**Build order:** (1) start a case, estimate, ladder and timeline with plain templates and no AI;
deploy. (2) The case agent. (3) Building intelligence. (4) Stretch goals. If the agent isn't ready
when testing starts, run the ladder with teammates classifying replies by hand.

## Escalation ladder

Keep the steps, their timing and their templates in one config file. The cadence is compressed
for the sprint so most cases get through several steps before Oct 29.

| Step | When, if there's no useful reply | What it says |
| --- | --- | --- |
| 1. Notice | Day 0 | The problem, when it started, when management was first told. Asks for a repair date. |
| 2. Reminder | Day 3 | No response yet. Asks again for a date. |
| 3. Formal notice | Day 5 | Restates the timeline, includes the estimated abatement so far and the building's open violation count, and may mention the warranty of habitability. |
| 4. 311 guide | Day 7 | Shows the tenant how to file a 311 complaint themselves. We never file it. |

A reply changes the path:

| The agent reads the reply as | Next step |
| --- | --- |
| Acknowledged, no date | Ask for a specific date |
| Repair scheduled | Confirm the date; check in the day after |
| Needs access to the unit | Help the tenant offer access times |
| Disputes or refuses | Formal notice, then the 311 guide |
| Says it's fixed | Ask the tenant to confirm; if yes, mark fixed and show the fake door |
| Unclear | Flag for a teammate |

## The case agent

- Calls the Claude API through the official TypeScript SDK (`@anthropic-ai/sdk`), model
  `claude-opus-5-5`, with structured outputs.
- For each reply it returns a category from the table above, a one-line summary, any date
  mentioned, and the suggested next step.
- For each draft it picks the template for the next step and fills in facts only: dates, what
  management said, the estimate. Legal wording comes only from templates the team has reviewed.
- Every classification and draft is saved on its message so a teammate can mark it right or wrong.
  That is how we measure assumption 2.
- Keep about 30 sample replies the team writes (made up, no real data) with the correct
  category, plus a script that runs the agent on them and reports accuracy.

## Building intelligence

- Turn the address into a building ID (BBL or BIN) with NYC Planning's free GeoSearch geocoder,
  then read NYC Open Data: HPD violations, HPD complaints, 311 service requests, and HPD
  registration contacts. No approval needed. Check dataset IDs and field names against the live
  API before relying on them.
- Show open violations by class, heat and repair complaints this season, the registered managing
  agent, and how long complaints at this building usually stay open.
- Read-only. Cache results per building instead of calling the APIs on every page view.

## Stretch, only after everything above works

- **Evidence reader:** tenants upload screenshots of their texts and emails with management, and
  Claude reads them into dated timeline items the tenant confirms. Screenshots stay in the private
  bucket.
- **Inbox reading:** read the team's CC inbox automatically (Gmail API, one plus-address per case)
  instead of teammates pasting replies.

## What the team does by hand

- **Nudges:** a teammate texts the tenant when a step is due. A saved Supabase query lists cases
  with a step due today.
- **First send:** a teammate sits with each tester while they send the first notice.
- **Checking the agent:** a teammate marks each classification and draft right or wrong in
  Supabase.
- **Building-wide cases:** if several neighbors join, the team writes a joint letter by hand.
- **Recovering money:** we talk to tenants who tap "help me". No negotiation, court or attorney
  features.
- **Reviewing cases:** the Supabase dashboard. No admin UI.

## Do not build

Login, accounts or passwords; payments or fee collection; admin dashboards or settings pages;
SMS, WhatsApp or push notifications; anything that sends a message to a landlord by itself;
access to tenants' own email inboxes; filing anything with 311, HPD or the courts; portfolio-wide
landlord analytics; building-wide case features beyond the invite link; native apps; translations;
AI-written legal wording. If a task seems to need one of these, stop and ask.

## Abatement estimate

Keep all of the math and the percentage table in one file (for example `lib/estimate.ts`) with
unit tests. It feeds the case page and the formal notice.

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
  estimate and every message. Messages state facts and ask for the repair by a date; only the
  formal notice may mention the warranty of habitability. No other legal claims and no threats.
- **The AI reads and fills in; it doesn't advise.** It classifies replies and fills facts into
  reviewed templates. It never writes legal wording, gives advice or predicts outcomes.
- **The tenant presses send.** Fear of retaliation is real. Nothing reaches a landlord unless the
  tenant sends it themselves.
- **Privacy.** Tenants share their address, rent, photos, messages and landlord. Collect only what
  the flow needs. Tell testers that what they share is processed by an AI service, and get their
  consent when they start a case. Keep the photo bucket private. Never log personal data. Never put
  real tenant data in the repo, seeds or tests; use made-up data. Delete tester data after the
  sprint.
- **Secrets** (including `ANTHROPIC_API_KEY`) live in `.env.local`, which is never committed.
  `.env.example` lists variable names only. Set a spending cap on the Anthropic key.

## Stack

- **Next.js** (App Router) with TypeScript and Tailwind CSS.
- **Supabase:** Postgres for cases, messages and events, and a private Storage bucket for photos.
  The team reviews cases in the Supabase table editor.
- **Vercel** deploys from GitHub on every push to `main`, so testers open a real link on their
  phones.
- **Claude API** (`@anthropic-ai/sdk`, `claude-opus-5-5`) for the case agent. It's billed
  separately from the team's Claude Max plan.
- **NYC GeoSearch and NYC Open Data** for building intelligence. No key needed at our volume.
- **Vitest** for the estimate math and the ladder logic; **Playwright** for one phone-size test of
  the whole flow; a script that scores the agent on the sample replies.
- **No email or SMS service.** The tenant's own email app sends each message (`mailto:`), and
  teammates text testers from their own phones.

## How to run and test

Setup, env variables and every command are in [README.md](README.md). In short:
`npm run dev` (app at http://localhost:3000), `npm test`, `npm run typecheck`, `npm run lint`,
`npm run e2e` (full tenant flow at 375px against a production build; needs Supabase),
`npm run db:push` (apply `supabase/migrations`), `npm run score-agent`.

Code map:

- `src/lib/domain/`: pure logic with tests (dates in New York time, estimate, ladder, templates,
  mailto). No I/O.
- `src/lib/cases/`: the data layer (`repo.ts`), operations (`service.ts`), validation and the
  view helpers for the case page. Server-only.
- `src/lib/agent/`: the case agent (Claude reader, stand-in reader, guardrails).
- `src/lib/building/`: NYC GeoSearch and Open Data, cached in `building_cache`.
- `src/app/`: pages (`/`, `/start`, `/case/[token]`), server actions next to their pages, and
  `api/address` and `api/invite` route handlers.
- `src/components/`: UI. Design tokens (Sprint 1 indigo palette, Work Sans) live in
  `src/app/globals.css`.

Next.js 16 with `cacheComponents` is not the Next.js most models remember: the case page reads data
inside `<Suspense>`, actions call `refresh()` after mutations, and nothing reads the clock during
prerender. Read the bundled docs in `node_modules/next/dist/docs/` before changing rendering.

## How to work here

- **Plan before code.** Propose a short plan, then cut anything that doesn't test the
  assumptions. One feature per request.
- **Know what done looks like** before starting: the goal, the check, and what to leave out.
- **Check your own work.** Run the app and click through the flow in a browser at phone width
  (375px) before calling a task done. Test the estimate math and the ladder.
- **Small commits.** Commit each step once it works. If something goes wrong, roll back instead of
  patching on top.
- **Keep it boring.** Few dependencies, plain server actions or route handlers, no state
  libraries.
- **Log decisions.** Add scope cuts, stack changes and assumption changes to
  `docs/decisions.md` with the date and the reason. It feeds our portfolio and the Nov 5 memo.
- **Explain in plain language.** Every teammate must be able to explain every part of the app
  without AI on Nov 5.

## Key dates

Oct 20 standup · Oct 22 first notices out, so cases get 7 days · Oct 23 advisor (refinement and
user testing) · Oct 29 five-minute live demo, with 10 user tests done.
