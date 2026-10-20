# Abate

Abate does the chasing for NYC tenants whose repairs management isn't fixing. It drafts and times
every follow-up, keeps a dated record, reads management's replies, and shows the rent abatement
the tenant may be owed.

NYU Stern BTE Capstone, Sprint 2 (Oct 8 to Oct 29, 2026). Team: Ilias, Rayhan, Ian, Omar.
The product brief for people and coding agents is [AGENTS.md](AGENTS.md); the sprint plan is in
[docs/sprint2-plan.md](docs/sprint2-plan.md) and decisions in [docs/decisions.md](docs/decisions.md).

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
| `npm test` | Unit tests (estimate, ladder, templates, agent, building data) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run e2e` | Builds the app and walks the whole tenant flow on a 375px phone screen (needs Supabase). Screenshots land in `test-results/screens/` |
| `npm run e2e:cleanup` | Deletes the cases the end-to-end test created |
| `npm run score-agent` | Scores the case agent on 36 sample replies (`-- --standin` for the stand-in). Needs a `.env.local`, even an empty copy of `.env.example` |
| `npm run heat-buildings` | Lists buildings with the most heat complaints this week, for flyering |

## Running the pilot (team)

Open the team page at `/team/<TEAM_KEY>` (bookmark it; anyone with the link can use it). It has:

- **Live results** for both hypotheses, with pass marks, plus side signals.
- **To send:** messages tenants approved. Tap "Open in Gmail" while signed in to the team Gmail
  (it fills in To, Cc, subject and body), send it, then tap "Mark sent". Aim for the same day.
- **Replies to read:** replies tenants pasted in. Pick what each one said; the tenant's next
  draft appears on their page.
- **Log a reply from the team inbox:** management usually replies to the team address. Paste the
  reply, pick the case and what it said.
- **Waiting on tenants:** who has a step to approve or a question to answer. Copy their case link
  and text it to them.

Supabase still has the raw tables (`cases`, `messages`, `events`) and views (`cases_due`,
`messages_to_send`). Add `?test=1` to the team page URL to include cases made by automated tests.

At the day-7 check-in, ask each tester "How comfortable were you with Abate contacting your
landlord?" and note the quote.

## Deploy

Import the GitHub repo in Vercel, add the same environment variables, including `TEAM_KEY` (Production and Preview;
`DATABASE_URL` is only needed locally for migrations), and deploy. Every push to `main` redeploys.
Testers with an old tab open after a deploy may see an error; reloading the page fixes it.
