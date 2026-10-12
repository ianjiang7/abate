# Sprint 2 plan for the Oct 13 plan review

The five things to bring, in order. Owners and anything marked *proposed* still need the team's
sign-off.

## 1. The one assumption we are testing

> Tenants with an unresolved repair, once they see what they may be owed, will document it
> (photos and dates) and send a formal follow-up to their landlord.

**Why this one.** It's the open question Sprint 1 left us with: will tenants act while the issue
is still happening? Everything later in the chain (tracking, pressure, the estimate, a success
fee) needs a tenant who collects evidence and escalates while the problem is live. Our
interviewees chased management by text and phone, but almost none kept a record or knew about
abatements. If seeing the money doesn't change that, the business doesn't work.

**Pass marks, set before testing:**

| Metric | Pass |
| --- | --- |
| Finish a case with at least one photo | 7 of 10 |
| Send the follow-up letter (verified through the CC address) | 5 of 10 |
| Tap "help me recover this" after seeing the 25% fee | 3 of 10 |

If fewer than 3 send the letter, tenants want information rather than action, and we rethink
the product before building more.

**Second hypothesis, for the Oct 29 presentation (efficacy):** management responds faster after
a documented letter. Our landlord interview suggests it does. We measure the days from letter to
reply or fix for testers who send, through the CC inbox and check-in texts on day 3 and day 7.

## 2. The smallest thing that tests it

One flow on a phone-first web page, with the team doing follow-ups by hand behind it.

1. **Log the repair** (about 3 minutes): issue type, dates, rent, management contact, one photo.
2. **See the case:** a timeline and an estimate. "You may be owed $X to $Y so far, growing about
   $Z a day."
3. **Send the letter:** a pre-filled follow-up, sent from the tenant's own email with the team
   CC'd, then "I sent it".
4. **Fake door:** "Want us to follow up and recover this for you? 25% only if you get paid."
5. **Private case link:** come back to add a photo or mark the repair fixed.

Behind the scenes, a teammate texts each tester on day 3 and day 7 and logs any reply from
management. We count every step of the funnel, plus sends we can verify in the CC inbox.

## 3. What we fake or skip

**Faked by hand**
- The follow-up "agent": a teammate sends reminders and follow-ups.
- Money recovery: we talk to whoever taps "help me". No negotiation, court or attorney tools.
- Case review: the Supabase dashboard, not an admin screen.
- The estimate percentages: team placeholders until legal aid or a tenant attorney checks them.

**Skipped**
- Login and accounts (a private link does the job)
- Payments
- HPD and 311 building data
- Building-wide claims
- SMS and WhatsApp
- Automatic emails to landlords
- AI-written letters (a fixed template avoids made-up legal claims)
- Admin dashboard
- Translations
- Native app

## 4. Our 10 testers and how we reach them

**Who counts:** an NYC renter with a repair management hasn't fixed. At least 6 should have an
issue open right now, because the assumption is about live issues. The rest can have had one in
the last 6 months; they test logging and the estimate, but not sending. We want at least 3
rent-stabilized testers, since Sprint 1 skewed toward new renters.

| Channel | Who | Target | Owner |
| --- | --- | --- | --- |
| Sprint 1 interviewees, if we kept contact details | The ceiling-damage tenants (holes still unfixed), Jaime (lights, tile, screen door; landlord unresponsive), the 10-year tenant, the Queens family | 3 to 4 | |
| NYU friends and classmates renting off campus | Screener in group chats: "Is there a repair your landlord hasn't fixed?" Heat season began Oct 1. | 3 | |
| Online tenant communities | r/NYCapartments, r/AskNYC, neighborhood Facebook groups (check each group's rules first) | 2 | |
| Tenant groups and problem buildings | Met Council on Housing, local tenant associations, QR flyers at buildings with many open HPD violations (NYC Open Data) | 2 | |

We'll recruit about 15 to end up with 10.

**How we run each test** (watch, don't explain):
- They use their own phone and their own real issue. The only prompt: "Your landlord hasn't
  fixed X. Use this to deal with it." Then we stay quiet.
- We note where they hesitate or stop, and how long it takes them.
- Afterwards we ask three questions and write down one quote each: What did you expect the number
  to be? Would you send this letter? What almost stopped you?
- 48 hours later we check in: Did you send it? Did management respond?

**Tracking sheet columns:** # · name · channel · issue · open now? · rent-stabilized? · test date ·
case finished · photo · letter sent (verified) · tapped help · management replied (days) · best
quote.

## 5. Our tools and our brief file

- **Brief file:** `AGENTS.md` covers the customer, the need, the assumption, what we won't build,
  and how to run and test. `CLAUDE.md` imports it, so every agent reads the same brief.
  Decisions go in `docs/decisions.md`.
- **Building:** Claude Code on the team's Claude Max plan, under one teammate's account per the
  ground rules. Teammates on Codex or Cursor read the same `AGENTS.md`.
- **Stack:** Next.js, TypeScript and Tailwind; Supabase for the database and photo storage;
  Vercel for a real link; Vitest and Playwright for tests. All free tiers.
- **Process:** plan, cut, one feature per request, the agent clicks through at phone width,
  commit. A second agent reviews each change.
- **Measurement:** an events table in Supabase, a team Gmail as the CC tracking address, and a
  Google Sheet for the tester log.
- **Repo:** GitHub, with all four teammates added.

## Timeline

| When | Goal |
| --- | --- |
| Oct 13 to 15 | Confirm the plan; scaffold; logging and the estimate working |
| Fri Oct 16 | Advisor: MVP scoping. Bring the cut list and the legal question. |
| Oct 16 to 19 | Letter, fake door, deploy. First 3 tests with Sprint 1 interviewees. |
| Tue Oct 20 | Standup: the funnel from the first 3 tests |
| Oct 21 to 23 | Fix what blocked them; tests 4 to 7. Advisor on Fri Oct 23. |
| Oct 24 to 28 | Tests 8 to 10; collect quotes and numbers; rehearse; record a backup video |
| Thu Oct 29 | Present |

## To do around class

- [ ] Book the Fri Oct 16 advisor slot, send an agenda first, bring one question. Missing it
      without notice costs half a letter grade.
- [ ] Create the GitHub repo and add Ilias, Rayhan and Omar.
- [ ] One teammate buys Claude Max, emails the receipt to Anam Khalid (ak5005@stern.nyu.edu), and
      sets a reminder to cancel before the second charge.
- [ ] Re-contact Sprint 1 interviewees whose issues are still open.
- [ ] Set up the team Gmail used as the CC tracking address.
- [ ] Find someone (legal aid or a tenant attorney) to check the estimate percentages and the
      letter.

## Questions for the instructor

1. Is sending the letter a strong enough action, or should we measure something closer to
   collecting money?
2. Does a fake door for the 25% fee count as a test of willingness to pay?
3. Who could check our estimate and letter for legal-advice risk?
