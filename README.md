# Abate

Abate does the chasing for NYC tenants whose repairs management isn't fixing. It drafts and times
every follow-up, keeps a dated record, reads management's replies, and shows the rent abatement
the tenant may be owed.

NYU Stern BTE Capstone, Sprint 2 (Oct 8 to Oct 29, 2026). Team: Ilias, Rayhan, Ian, Omar.
The product brief for people and coding agents is [AGENTS.md](AGENTS.md); the sprint plan is in
[docs/sprint2-plan.md](docs/sprint2-plan.md) and decisions in [docs/decisions.md](docs/decisions.md).


## Current flow (November 17)

Tenants send every letter from their own email. Free includes the first letter and an abatement
estimate; Full adds timed follow-ups, pasted replies with dates and team review, case history, and
the 311 guide. Buy and Upgrade unlock Full for the pilot without a charge. Existing cases are
grandfathered into Full. The sender step is gone; signup step IDs are now `problems`, `told`, `rent`,
`price`, `address`. Initial `price_choice` remains unchanged after upgrading; inspect `plan_tier`,
`upgraded_at`, and the `plan_upgraded` event for upgrades. Do not pool the new funnel with the old
concierge experiment described in the historical runbook below.

**Release requirement:** apply `supabase/migrations/20261117000000_self_send_plans.sql` with this
code release using `npm run db:push`. It grants Full to existing cases, withdraws every unsent
approval, and makes sending tenant-only. New cases default to Free. Never run the old team send
queue during the transition. No live migration or deployment is performed by local tests.

Estimates display the average of the low/high estimates and omit daily growth. The app waits 7
calendar days from notice (1 for no heat/hot water) before showing an amount; this is a display
policy, not a legal eligibility test. Once shown, all days from notice remain in the calculation.
Research and limitations are in `docs/decisions.md`.

Landing-page placeholders live in `public/images/placeholder-*.jpg`, referenced by
`src/components/home/photo-carousel.tsx`. Replace them with permission-cleared client images and
keep the assets’ documented provenance current. The carousel supports pause and reduced motion.

## Run it locally

You need Node 20.9 or newer.

```bash
npm install
```

Create `.env.local` in the project root (it is gitignored, never commit it) with:

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret key (or legacy `service_role`) |
| `DATABASE_URL` | Supabase → Connect → Session pooler URI, with the database password filled in |
| `ANTHROPIC_API_KEY` | console.anthropic.com. Optional: without it, replies are read by a built-in stand-in |
| `CC_EMAIL` | The team inbox CC'd on messages tenants send themselves, e.g. a Gmail address. Each case adds `+casecode` |
| `TEAM_KEY` | A long random secret (24+ characters). The team page lives at `/team/<TEAM_KEY>` |
| `TEAM_GMAIL` | The team Gmail address we send from. "Open in Gmail" opens that account even if a teammate is signed in to several (falls back to `CC_EMAIL`) |
| `FORMAL_NOTICE_REVIEWED` | Set to `1` once legal aid or a tenant attorney has reviewed the formal notice; until then the send queue warns before each one |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog → Project settings → Project API key (`phc_…`; it is public, browsers get it). Optional: without it no analytics load, and `npm run e2e` always runs without it |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` for a US PostHog project (`https://eu.i.posthog.com` for EU) |

Set up the database tables once (and again after adding a migration):

```bash
npm run db:push
```

Then start the app at http://localhost:3000:

```bash
npm run dev
```

## Checks

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (estimate, ladder, templates, agent, address lookup) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run e2e` | Builds the app and walks the whole tenant flow on a 375px phone screen (needs Supabase). Screenshots land in `test-results/screens/` |
| `npm run e2e:cleanup` | Deletes the cases the end-to-end test created |
| `npm run score-agent` | Scores the case agent on 36 sample replies (`-- --standin` for the stand-in). Needs a `.env.local`, even an empty copy of `.env.example` |
| `npm run heat-buildings` | Lists buildings with the most heat complaints this week, for flyering |

## Running the pilot (team)

Open the team page at `/team/<TEAM_KEY>` (bookmark it; anyone with the link can use it). It has:

- **Live results** for both hypotheses, with pass marks, plus side signals. Hypothesis 1 is split
  into the sender (Abate's notice without $) and the dollar figure (first notices with $ vs
  without), measured in the 3 days after the first notice. Each case shows its group.
- **To send:** messages tenants approved. "Open in Gmail" (or "Copy") first re-checks the case, so a
  page left open can't send something the tenant has since paused, and tells you if a teammate
  already opened it. Gmail opens in the team inbox with To, Cc, subject and body filled in. Send it,
  then tap "Mark sent". Aim for the same day. Watch the warnings: tenant edits, replies that came in
  after approval, and the formal notice's legal check. Add a missing management email right there.
- **Replies to read:** replies tenants pasted in. Pick what each one said; the tenant's next
  draft appears on their page.
- **Log a reply from the team inbox:** management usually replies to the team address. Paste the
  reply, pick the case and what it said.
- **Waiting on tenants:** who has a step to approve or a question to answer. Copy their case link
  and text it to them.

Supabase still has the raw tables (`cases`, `messages`, `events`) and views (`cases_due`,
`messages_to_send`). Add `?test=1` to the team page URL to include cases made by automated tests,
or `?test=only` to see only those.

At the day-7 check-in, ask each tester "How comfortable were you with Abate contacting your
landlord?" and note the quote.

## Price test

The start form shows one price for the full follow-up plan, right after the estimate. It's a fake
door: nothing is ever charged. The prices ("arms"), how often each is shown, and the copy live in
`src/lib/domain/pricing.ts`. Each browser keeps the price it was given while that price is still
being tested.

- **Ad and partner links** look like `/?utm_source=google&utm_medium=cpc&utm_campaign=nov-price`.
  Use plain lowercase words only (hyphens are fine). Partners use `utm_source=partner-<name>`
  (for example `partner-bronx`), and the team's own clicks use `utm_source=test`. Never add
  `utm_term`: search words can describe a tenant's problem, so the app drops them anyway.
- **The Buy rate is read in PostHog**, not on the team page. Make a funnel of `price_viewed` →
  `price_buy_tapped`, counted by unique users, broken down by `price_arm`, with breakdown
  attribution set to **All steps** (so the view and the Buy must carry the same price; the
  default, first touch, would credit a browser's later Buy at a new price to its old one). For
  the split by ad source, break down by the event property `utm_source`: the app keeps the tag
  from the ad link for the whole tab, even if the tenant taps Start before PostHog has loaded.
  Don't use `$session_entry_utm_source`, which misses those fast tappers.
- **Leave out test traffic:** filter `$host` to the production domain only (this drops localhost
  and Vercel previews) and drop events whose `utm_source` is `test`.
- **Free** means reaching the next step (`form_step_viewed` with `step_id` `sender`) without
  tapping Buy; anyone else who saw a price left at the price step. Price events carry only
  `price_arm` (plus the tab's ad tags, which every event carries), and there is no Free event. The team page's "Buy · $N" tiles count only tenants
  who went on to create a case.
- **Signup funnel:** the price step shifts the step numbers (who sends is now step 5 of 6), so
  the dashboard's `form_step_viewed` steps should match on `step_id` (`problems`, `told`, `rent`,
  `price`, `sender`, `address`) or the title, not `step`. Events from before the price step went
  live have no `step_id`, so use the title for funnels that reach back past it.
- **Nov 16 swap (runbook):**
  1. In `pricing.ts`, set `p9`'s weight to 0 and one of `p49`, `p19` or `p29_fixed` to 1. Change
     nothing else: never edit an arm's text or reuse its id (add a new arm instead).
  2. Run `npm test`; it checks the arms.
  3. Push to `main` (Vercel deploys it).
  4. Add a PostHog annotation at the deploy time naming the new arms.
  5. Compare $29 with $9 using a date range that ends at the annotation, and the new arm using
     one that starts there. A browser that was shown $9 gets a new price the next time it reaches
     the price step.

## Deploy

Import the GitHub repo in Vercel, add the same environment variables, including `TEAM_KEY` (Production and Preview;
`DATABASE_URL` is only needed locally for migrations), and deploy. Every push to `main` redeploys.
Testers with an old tab open after a deploy may see an error; reloading the page fixes it.
