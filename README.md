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
| `CC_EMAIL` | The team inbox CC'd on every message, e.g. a Gmail address. Each case adds `+casecode` |

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

Everything the team does by hand happens in the Supabase table editor:

- **`cases_due` view:** open cases with a step due today. Text the tenant their case link.
- **`replies_to_check` view:** replies the agent has read. Open the row in `messages` and set
  `team_verdict` to `correct` or `incorrect`. That is how we measure assumption 2.
- **`cases` table:** `help_requested_at` and `help_contact` show who tapped "I'm interested".
- **`events` table:** the funnel (case_created, draft_shown, send_confirmed, reply_logged, …).

Rows with `is_test = true` come from automated tests and are left out of both views.

## Deploy

Import the GitHub repo in Vercel, add the same environment variables (Production and Preview;
`DATABASE_URL` is only needed locally for migrations), and deploy. Every push to `main` redeploys.
Testers with an old tab open after a deploy may see an error; reloading the page fixes it.
