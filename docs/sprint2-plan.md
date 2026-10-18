# Sprint 2 plan

Updated Oct 18. Owners still need to be filled in.

**What changed since the Oct 13 plan review:** we moved from a one-off letter to Abate doing the
chasing. Sprint 1's top finding was that following up, not the first report, is the burden, and a
single letter left that burden in place. One tenant's dollar figure for a typical issue is also
small (about $120 to $310 for a broken sink for three weeks at $1,800 rent), so a single letter is
easy to ignore. The full reasoning is in `docs/decisions.md`.

## 1. Our hypothesis and the two assumptions behind it

> **Hypothesis:** when Abate does the chasing, with timed written follow-ups that build up to a
> dollar figure, landlords fix repairs faster than when tenants chase on their own.

The hypothesis holds only if both assumptions hold. The first asks whether chasing works on
landlords. The second asks whether our technology can do the chasing.

### Assumption 1: landlords respond faster to Abate's follow-ups than to the tenant's own chasing

- **Why it's risky:** the pain we heard most was follow-ups going unanswered. Only one landlord
  told us that pressure speeds repairs. If landlords ignore Abate too, chasing on tenants' behalf
  has no value.
- **How we test it:** when tenants start a case, we ask how long they've been following up. After
  Abate's first notice, we track the days until management replies, schedules the repair and
  fixes it. We also record which step got the first response, which tells us whether the formal
  notice with the dollar figure is what moved them.
- **Pass:** at least half of cases get a reply or a scheduled repair within 7 days of Abate's
  first notice, faster than the tenant's earlier wait.
- **Caveat:** only a handful of cases and no comparison group, so this is directional evidence.
  Most repairs won't be finished by Oct 29, so "repair scheduled" stands in for "fixed faster".
  First notices need to go out by Oct 22 to get a full 7 days.

### Assumption 2: the case agent can run the follow-ups

This is the technical core of Sprint 2: an AI agent that reads management's replies, decides the
next step and drafts the next follow-up for the tenant.

- **Why it's risky:** landlord replies are messy ("we'll look into it", "the super will stop by",
  silence and then a phone call). If the agent misreads them, it sends the wrong follow-up and
  tenants stop trusting it. If tenants rewrite every draft, the app hasn't taken the chasing off
  their plate.
- **How we test it:** a teammate checks every classification against the real reply. Real replies
  will be few, so we also run the agent on about 30 sample replies the team writes. The app
  records whether each draft was sent as is or edited.
- **Pass:** at least 90% of replies classified correctly, and at least 70% of drafts sent without
  editing.

### What the results tell us

| Assumption 1 | Assumption 2 | What it means |
| --- | --- | --- |
| Pass | Pass | The hypothesis holds and the agent can run it. Next: let the agent send on the tenant's approval, and test the 25% fee. |
| Pass | Fail | Chasing works, but our agent isn't good enough yet. Keep people in the loop and improve the agent before scaling. |
| Fail | Either | Even persistent written follow-ups don't move these landlords. The value has to come from stronger steps: HPD complaints, small claims, building-wide pressure. |

**Side signals, not pass/fail:** neighbor invites (interest in building-wide cases) and "help me
recover this" taps (willingness to pay 25%).

## 2. The smallest thing that tests them

One flow on a phone-first web page.

1. **Start a case** in under 5 minutes: address, issue, dates, how long they've been following
   up, rent, management contact, one photo.
2. **See the building:** open HPD violations, this season's complaints, the registered managing
   agent.
3. **See the case:** a timeline that fills itself in, and a dollar estimate that grows each day.
4. **Send each follow-up:** the agent drafts the next message on the escalation ladder (notice on
   day 0, reminder on day 3, formal notice with the dollar figure on day 5, 311 guide on day 7).
   The tenant sends it from their own email with our tracking address CC'd.
5. **Log replies:** the tenant or a teammate pastes management's reply, and the agent reads it and
   picks the next step.
6. **Invite neighbors** with the same problem, and a **fake door** for the 25% recovery service.

**The tech pieces**
- **The case agent (core):** Claude reads replies and fills in templates the team has reviewed.
- **Building intelligence:** NYC Open Data (HPD violations, HPD complaints, 311, HPD
  registrations), free and read-only.
- **Stretch:** an evidence reader that turns screenshots of texts into timeline items, and
  automatic reading of the CC inbox.

**Build order:** templates and the ladder with no AI first, then the agent, then building
intelligence. If the agent isn't ready when testing starts, teammates classify replies by hand
while it's finished.

## 3. What we fake or skip

**Done by hand**
- Nudges: a teammate texts each tester when a step is due.
- The first send: a teammate sits with each tester for the first notice.
- Checking the agent: a teammate marks each classification and draft right or wrong.
- Building-wide cases: if neighbors join, we write a joint letter by hand.
- Money recovery: we talk to whoever taps "help me".
- Case review: the Supabase dashboard, not an admin screen.
- The estimate percentages: team placeholders until legal aid or a tenant attorney checks them.

**Skipped**
- Login and accounts (a private link does the job)
- Payments
- Anything that messages a landlord by itself
- Reading tenants' own inboxes
- Filing with 311, HPD or the courts (we show tenants how)
- SMS and WhatsApp
- Building-wide case features beyond the invite link
- AI-written legal wording (the AI only fills facts into reviewed templates)
- Admin dashboard
- Translations
- Native app

## 4. Our 10 testers and how we reach them

**Who counts:** an NYC renter with a repair management hasn't fixed. The chasing only works on
open issues, so at least 7 of the 10 need an issue open right now. Testers with a past issue can
still try starting a case and judge the first draft. We want at least 3 rent-stabilized testers,
since Sprint 1 skewed toward new renters.

| Channel | Who | Target | Owner |
| --- | --- | --- | --- |
| Sprint 1 interviewees, if we kept contact details | The ceiling-damage tenants (holes still unfixed), Jaime (lights, tile, screen door; landlord unresponsive), the 10-year tenant | 3 | |
| NYU friends and classmates renting off campus | Screener in group chats: "Is there a repair your landlord hasn't fixed?" Heat season began Oct 1. | 3 | |
| Buildings with active heat complaints | This week's 311 heat complaints (our building-intelligence data) show where to put QR flyers | 2 | |
| Online tenant communities and tenant groups | r/NYCapartments, r/AskNYC, neighborhood Facebook groups (check each group's rules first), Met Council on Housing, local tenant associations | 2 | |

We'll recruit about 15 to end up with 10.

**How we run each test**
- **First session, in person:** they start the case on their own phone while we stay quiet (watch,
  don't explain). We time them and note where they get stuck. Then we sit with them while they
  send the first notice.
- **Four questions afterwards,** writing down one quote each:
  - What did you expect the number to be?
  - Would you send this message as written?
  - Would you let Abate send these for you?
  - What almost stopped you?
- **After that:** we text them when each step is due. They paste any reply into the app, or
  forward it to us.

**Tracking sheet columns:** # · name · channel · issue · open now? · rent-stabilized? · test date ·
minutes to start a case · days unanswered before Abate · steps sent · drafts sent unedited /
drafts sent · step that got the first reply · days to reply · days to repair scheduled · days to
fixed · neighbor invites · tapped help · would let Abate send? · best quote.

## 5. Our tools and our brief file

- **Brief file:** `AGENTS.md` covers the customer, the need, the hypothesis, the escalation
  ladder, what we won't build, and how to run and test. `CLAUDE.md` imports it, so every agent
  reads the same brief. Decisions go in `docs/decisions.md`.
- **Building:** Claude Code on the team's Claude Max plan, under one teammate's account per the
  ground rules. Teammates on Codex or Cursor read the same `AGENTS.md`.
- **Stack:** Next.js, TypeScript and Tailwind; Supabase for the database and photo storage;
  Vercel for a real link; Vitest and Playwright for tests.
- **AI and data:** the Claude API for the case agent (billed separately from Claude Max, with a
  spending cap), and NYC Open Data for building intelligence (free).
- **Process:** plan, cut, one feature per request, the agent clicks through at phone width,
  commit. A second agent reviews each change.
- **Measurement:** events and messages in Supabase (including the agent's classifications and our
  checks), a script that scores the agent on sample replies, a team Gmail as the CC tracking
  address, and a Google Sheet for the tester log.
- **Repo:** GitHub, with all four teammates added.

## Timeline

| When | Goal |
| --- | --- |
| Oct 18 to 19 | Scaffold. Starting a case, the estimate, the ladder and the timeline work with plain templates (no AI). Deploy to Vercel. |
| Tue Oct 20 | Standup: show the flow and where recruiting stands |
| Oct 20 to 21 | Case agent and the 30 sample replies; building intelligence |
| Oct 21 to 22 | First sessions: at least 7 testers start cases and send their first notice by Oct 22 |
| Fri Oct 23 | Advisor: early reply data and agent accuracy |
| Oct 23 to 28 | Run the ladder on schedule, log replies, check the agent, finish the remaining tests; stretch goals only if ahead |
| Oct 27 to 28 | Collect quotes and numbers; rehearse; record a backup video |
| Thu Oct 29 | Present |

## To do now

- [ ] Get an Anthropic API key, set a spending cap, and put it in `.env.local`. Never paste it into
      chat or the repo.
- [ ] Create Supabase and Vercel accounts (sign in with GitHub).
- [ ] Set up the team Gmail used as the CC tracking address.
- [ ] Write about 30 made-up landlord replies, each labeled with the right category.
- [ ] Recruit: re-contact Sprint 1 interviewees whose issues are still open, post the screener, and
      pull this week's 311 heat complaints for flyering.
- [ ] Book the Fri Oct 23 advisor slot, send an agenda first, bring one question.
- [ ] Ask legal aid or a tenant attorney to look at the message templates and the estimate
      percentages.
- [ ] Add Ilias, Rayhan and Omar to the GitHub repo once we have their usernames.
- [ ] If not done yet: email the Claude Max receipt to Anam Khalid (ak5005@stern.nyu.edu) and set
      a reminder to cancel before the second charge.

## Questions for the Oct 23 advisor meeting

1. Is comparing against each tenant's earlier wait convincing enough without a comparison group?
2. Is the case agent a strong enough technical piece, or should building intelligence be the
   headline?
3. Who could review our message templates for legal-advice risk?
4. Does the 25% fake door count as a test of willingness to pay?
