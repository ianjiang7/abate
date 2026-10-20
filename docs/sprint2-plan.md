# Sprint 2 plan

Updated Oct 20. Owners still need to be filled in.

**What changed since the Oct 13 plan review:** we moved from a one-off letter to Abate doing the
chasing (Oct 18), and then to a **concierge pilot** (Oct 20): our team sends each follow-up on the
tenant's behalf, with their approval, and reads every reply. Details are in `docs/decisions.md`.

## 1. Our hypothesis and the two we're testing

> **Hypothesis:** when Abate does the chasing, with timed written follow-ups that build up to a
> dollar figure, landlords fix repairs faster than when tenants chase on their own.

### Hypothesis 1: landlords respond faster to Abate's follow-ups

- **Why it's risky:** the pain we heard most was follow-ups going unanswered, and only one
  landlord told us pressure works. Letters now come from Abate, a third party, which could be
  taken more seriously or ignored.
- **How we test it:** when tenants start a case, they tell us when they first told management.
  After our first follow-up goes out, the app timestamps management's first reply, the repair
  date and the fix, and which step got the first response.
- **Pass:** at least half of cases get a reply or a scheduled repair within 7 days of the first
  follow-up.
- **Caveat:** a handful of cases and no comparison group, so this is directional. First
  follow-ups need to go out by Oct 22.

### Hypothesis 2: tenants will let Abate contact their landlord for them

- **Why it's risky:** Sprint 1 left this open ("Would they trust a third party with their
  landlord?"), and fear of retaliation is real. If tenants won't hand it over, the product has to
  stay a reminder tool.
- **How we test it:** the start form asks who should send the follow-ups, with neither option
  pre-selected. Tenants who pick Abate approve each draft; they can pause anytime (with a reason)
  or switch to sending themselves. At the day-7 check-in we ask how comfortable they felt.
- **Pass:** at least 8 of 10 choose Abate to send, at least 70% of drafts are approved within a
  day of being ready, and at most 1 tester pauses or switches.

### What the results tell us

| Hypothesis 1 | Hypothesis 2 | What it means |
| --- | --- | --- |
| Pass | Pass | Abate doing the chasing works and tenants want it. Next: automate sending and reading, and test the 25% fee. |
| Pass | Fail | The chasing works, but tenants want to send it themselves. Build Abate as a reminder-and-drafting tool. |
| Fail | Pass | Tenants trust us, but letters alone don't move landlords. Lean on stronger steps: HPD complaints, small claims, building-wide pressure. |
| Fail | Fail | Rethink the product before building more. |

**Side signals:** neighbor invites, "recover this for 25%" taps, and how often the AI (reading
replies in the background) agreed with our team. The team page shows all of it live.

## 2. The smallest thing that tests them

One flow on a phone-first web page, plus a team page that runs the concierge.

1. **Start a case** in about 5 minutes: address, issue, dates, rent, management contact, a
   photo, and **who sends the follow-ups** (Abate's team, or the tenant).
2. **See the building** (HPD violations, complaints, managing agent) and **the case** (timeline
   and a growing estimate).
3. **Each follow-up** on the ladder (notice day 0, reminder day 3, formal notice with the dollar
   figure day 5, 311 guide day 7): the tenant approves the draft, and our team sends it from the
   team Gmail with the tenant copied. Self-send tenants send it from their own email.
4. **Replies:** we log replies that reach the team inbox; tenants paste ones they got directly.
   Our team reads each one and the next draft follows.
5. **Pause** anytime, invite neighbors, and the 25% fake door.

**The team page** (`/team/<TEAM_KEY>`): the send queue, replies to read, a form for inbox
replies, tenants to nudge, and live results for both hypotheses.

## 3. What we fake or skip

**Done by hand**
- Sending: a teammate sends each approved message from the team Gmail and marks it sent.
- Reading replies: a teammate reads every reply and picks what it said on the team page.
- Nudges: a teammate texts each tester when a step is ready to approve.
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
- **First session, in person:** they start the case on their own phone while we stay quiet. We
  time them and note where they hesitate, especially at "Who should send the follow-ups?". If
  they pick Abate, they approve the first notice; we send it from the team Gmail that day.
- **Questions afterwards,** one quote each: What did you expect the number to be? Why did you pick
  who sends? What almost stopped you?
- **Day 3 and day 7:** we text them when a step is ready to approve. At day 7 we ask: "How
  comfortable were you with Abate contacting your landlord?"

**Tracking sheet columns:** # · name · channel · issue · open now? · rent-stabilized? · test date ·
minutes to start a case · who sends · comfort (day 7) · paused or switched (why) · best quote. The
team page computes the timing and approval numbers, so the sheet only needs what the app can't
see.

## 5. Our tools and our brief file

- **Brief file:** `AGENTS.md` covers the customer, the need, the hypothesis, the escalation
  ladder, what we won't build, and how to run and test. `CLAUDE.md` imports it, so every agent
  reads the same brief. Decisions go in `docs/decisions.md`.
- **Building:** Claude Code on the team's Claude Max plan, under one teammate's account per the
  ground rules. Teammates on Codex or Cursor read the same `AGENTS.md`.
- **Stack:** Next.js, TypeScript and Tailwind; Supabase for the database and photo storage;
  Vercel for a real link; Vitest and Playwright for tests.
- **AI and data:** the Claude API reads replies in the background only, so we can compare it
  with our team after the pilot; NYC Open Data for building records (free).
- **Process:** plan, cut, one feature per request, the agent clicks through at phone width,
  commit. A second agent reviews each change.
- **Measurement:** the team page computes both hypotheses' numbers live from Supabase; a Google
  Sheet holds what the app can't see (comfort quotes, why they picked who sends).
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

- [ ] Add `TEAM_KEY` to Vercel (copy it from `.env.local`) and bookmark the team page.
- [ ] Optional: an Anthropic API key with a spending cap, so the background AI comparison uses
      Claude instead of the keyword stand-in.
- [ ] Create Supabase and Vercel accounts (sign in with GitHub).
- [ ] Set up the team Gmail we send from, and sign in to it on the laptops you send from.
- [ ] Ask legal aid or a tenant attorney about the formal notice going out under Abate's name.
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
2. Is a concierge pilot with a working app (intake, building records, ladder, team queue) enough
   of a technical piece, or should we also demo the background AI comparison?
3. Who could review our message templates, especially the formal notice we now send under
   Abate's name, for legal-advice risk?
4. Does the 25% fake door count as a test of willingness to pay?
