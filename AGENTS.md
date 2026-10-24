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

We test it as a **concierge pilot**: our team sends the follow-ups to landlords on the tenant's
behalf (with the tenant's approval on each one) and reads every reply by hand.

> **Hypothesis:** when Abate does the chasing, with timed written follow-ups that build up to a
> dollar figure, landlords fix repairs faster than when tenants chase on their own.

1. **What makes landlords respond.** We test two drivers separately:
   - *(a) The sender:* landlords respond to a follow-up from Abate, a company, when the tenant's own
     chasing went unanswered. *Pass:* at least half of Abate's first notices **without** a dollar
     figure get a reply, a repair date or a fix within 3 days.
   - *(b) The dollar figure:* a first notice that includes the estimated rent abatement gets a
     response more often than the same notice without it. Each case is assigned a group when it
     starts (`cases.dollar_in_notice`), balanced within each sender type, so nobody picks who gets
     it; everyone still gets the figure in the day-5 formal notice. *Pass:* responses within 3 days
     are at least 25 points more common with the figure than without.
   - Overall, we still track replies within 7 days of the first follow-up and which step got the
     first reply. With a handful of cases these are directions, not proof. A landlord letter test
     (property managers rank the four versions: Abate or tenant, with or without $) adds data.
2. **Tenants will let Abate contact their landlord for them.** They choose "Abate's team sends
   them for me", approve each draft promptly, and don't back out. *Pass:* at least 8 of 10
   testers choose Abate to send, at least 70% of drafts are approved within a day of being ready,
   and at most 1 tester pauses or switches to sending themselves. We also ask how comfortable they
   felt at the day-7 check-in.

Side signals, not pass/fail: neighbor invites, "recover this for 25%" taps, and how often the AI
(reading replies in the background only) agreed with our team. The team page shows all of these
live.

## What we are building: one flow, phone-first

1. **Start a case** (about 5 minutes): address and unit, the problems (one or more), when it started, a photo if
   they have one, when management was first told and how, follow-ups since, management's name,
   then **who sends the follow-ups** (Abate's team, or the tenant). Neither choice is
   pre-selected; the choice measures hypothesis 2. Then management's email (required if Abate
   sends), and for Abate: the tenant's email (copied on everything) and their authorization. Then
   their name, rent, an optional contact for reminders (a phone if Abate sends, since we have
   their email), and consent. Each contact is asked for once.
2. **See the building:** open HPD violations, recent complaints, the registered managing agent.
3. **See the case:** a timeline that fills itself in, the days unresolved, and the estimated
   abatement so far, labeled as an estimate, not legal advice.
4. **Each follow-up:** the app drafts it from the reviewed templates.
   - *Abate sends:* the tenant reviews (and can edit) the draft and taps **Approve and send**. It
     waits in the team's send queue; a teammate sends it from the team Gmail with the tenant CC'd
     and marks it sent. Letters are in Abate's voice ("We're writing on behalf of…").
   - *Tenant sends:* the tenant sends it from their own email (`mailto:`) and taps "I sent it".
     Letters are in the tenant's voice.
5. **Replies:** management usually replies to the team inbox; a teammate logs it on the team page
   with their reading. Tenants can paste replies they got directly; our team reads those too. The
   reading moves the case along the ladder. Tenants can correct a reading.
6. **Pause:** a tenant using Abate can pause anytime (with a reason) or switch to sending
   themselves. Both count as backing out for hypothesis 2.
7. **Invite neighbors** and the **fake door** ("we'll recover this for 25%") as before.
8. **Private case link** (no login) to come back, follow along, or mark the repair fixed.

Data: `cases` (incl. `issue_types`, most serious first, with `issue_type` as the most serious; `send_mode`, `send_authorized_at`, `tenant_email`, `paused_at`,
`pause_reason`), `photos`, `messages` (outgoing: `ready_on`, `approved_at`, `sent_at`, `sent_by`;
incoming: `classification`, `classified_by`, and the AI's shadow `ai_classification`), `events`.

**The team page** lives at `/team/<TEAM_KEY>` (a secret link, like case links): the send queue
with "Open in Gmail" and "Mark sent", replies to read, a form to log replies from the inbox,
tenants to nudge, and the live hypothesis results. Add `?test=1` to include test cases, or
`?test=only` for only them.

Concierge safety rules (keep them when changing this flow):

- A teammate **claims** a message (Open in Gmail / Copy) before sending; the claim re-checks that
  the case isn't paused or fixed and the message wasn't withdrawn, and warns if another teammate
  opened it in the last 30 minutes.
- An approval the team hasn't claimed is **withdrawn** (kept for measurement, never sent) when the
  tenant pauses, switches to sending themselves, or a new reply arrives; the tenant then gets a
  fresh draft. At most one approved, unsent message per case (a database index enforces it).
- Only the ladder's current step can be approved or sent, and never with "[add …]" blanks left.
- Our team's reading never overwrites the tenant's own reading of a reply.

## Escalation ladder

Keep the steps, their timing and their templates in one config file. The cadence is compressed
for the sprint so most cases get through several steps before Oct 29.

| Step | When, if there's no useful reply | What it says |
| --- | --- | --- |
| 1. Notice | Day 0 | The problem, when it started, when management was first told. Asks for a repair date. For the "$" group, also the estimated abatement so far. |
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

## Reading replies (concierge)

- Our team reads every reply and picks its category on the team page (or the tenant corrects it).
  That reading drives the ladder.
- The AI agent (`src/lib/agent`, Claude API with a keyword stand-in) reads each reply **in the
  background only** and stores `ai_classification` for later comparison. It never shows the tenant
  anything or changes a draft. `ABATE_REPLY_MODE=agent` switches back to the AI-driven flow for
  after the pilot.
- About 30 made-up sample replies plus `npm run score-agent` measure the agent on its own.

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

## What the team does by hand (the concierge)

- **Send approved messages** from the team Gmail (tenant CC'd), then tap "Mark sent" on the team
  page. Aim for the same day.
- **Read replies** from the team inbox and from tenants, and pick what each said on the team page.
- **Nudge tenants** listed under "Waiting on tenants" by texting (or emailing) them their case link.
- **Day-7 check-in:** ask "How comfortable were you with Abate contacting your landlord?" and
  keep the quote.
- **Building-wide cases:** if several neighbors join, the team writes a joint letter by hand.
- **Recovering money:** we talk to tenants who tap "I'm interested". No negotiation, court or
  attorney features.

## Do not build

Login, accounts or passwords; payments or fee collection; admin dashboards or settings pages
beyond the team page; SMS, WhatsApp or push notifications; anything that sends a message to a
landlord automatically (a person sends every one, after the tenant approves it);
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
- Several problems: use the most serious one's percentages (the highest range). Don't add them up;
  the percentage describes how unlivable the apartment is overall.
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
  formal notice and the "$" group's first notice may mention the warranty of habitability and the
  estimate. No other legal claims and no threats.
- **The AI reads and fills in; it doesn't advise.** It classifies replies and fills facts into
  reviewed templates. It never writes legal wording, gives advice or predicts outcomes.
- **Nothing reaches a landlord without the tenant's say-so.** Fear of retaliation is real. In
  Abate mode the tenant approves every message and can pause anytime; in self mode they send it.
- **Abate never pretends to be the tenant.** Messages our team sends are in Abate's voice, on the
  tenant's behalf, with the tenant copied. Before a letter with the warranty of habitability and a
  dollar estimate (the formal notice, or the "$" first notice) goes out under Abate's name, legal
  aid or a tenant attorney should review it.
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
- **No email or SMS service.** Our team sends from the team Gmail ("Open in Gmail" pre-fills it);
  self-send tenants use their own email app (`mailto:`). Teammates text testers from their phones.

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
- `src/app/`: pages (`/`, `/start`, `/case/[token]`, `/team/[key]`), server actions next to their
  pages, and `api/address` and `api/invite` route handlers.
- `src/lib/cases/metrics.ts`: the two hypotheses' numbers (pure, tested); the team page shows them.
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
