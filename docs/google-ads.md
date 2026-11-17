# Google Ads and the $100: launch plan for the price test

Written Nov 17, 2026. What we're testing, where the $100 goes, how to set up the Google Search
campaign, and how to read the results. The price test itself is described in README.md
("Price test") and `docs/decisions.md` (Nov 10 and Nov 17).

## What the ads test

The start form already runs a freemium test: after the estimate, each tenant sees one price for the
full follow-up plan ("Buy now", a fake door: nothing is charged) or "Just the free first letter".
Ads send strangers through it. Three questions, in order:

1. **Will people use the free version?** Ad click → `/start` → case created.
2. **Will they tap Buy, and at what price?** `price_viewed` → `price_buy_tapped`, by `price_arm`.
3. **Which channel brings the people who do?** Everything above, broken down by `utm_source`.

**What $100 can and can't tell us.** At a guessed $1 to $5 a click (check Google's Keyword Planner
for real numbers), $100 buys roughly 20 to 80 clicks, and only some of them reach the price step.
With 30 people seeing a price, 6 Buy taps (20%) means the real rate is likely somewhere between
10% and 37%. That's enough to tell "almost nobody would pay" from "a real share would". It's not
enough to compare $9 with $29. So while the ads run, **show one price** (see the open decision
below).

A Buy tap on a fake door overstates real payment. Call or email the Buy tappers who created a case
(`price_choice = 'buy'` in Supabase) and ask what they expected to pay for and whether they would
have entered a card.

**Write the pass line down before launch.** For example: "At $29, at least 15% of people who see
the price tap Buy, and at least 1 in 4 people who reach `/start` from an ad create a case." Pick
the numbers as a team; don't move them after the data comes in.

## Where the $100 goes

Recommended split: **about $70 on Google Search and about $30 on flyers.**

| Channel | Cost | Why | Link tag |
| --- | --- | --- | --- |
| Google Search | ~$70 | Highest intent: people searching "no heat apartment" right now | `utm_source=google` |
| Flyers in buildings with heat complaints | ~$30 printing | `npm run heat-buildings` lists the buildings with the most 311 heat complaints this week. Same need, a fraction of the cost per person reached | `utm_source=flyer` |
| Tenant associations and organizers | Free | They already talk to our customer. Partner links are supported | `utm_source=partner-<name>` |
| Reddit (r/NYCapartments, r/AskNYC), neighborhood Facebook groups, Nextdoor | Free | Answer threads about repairs and say who we are. Read each group's rules on self-promotion first | `utm_source=reddit` and so on |
| Meta (Instagram/Facebook) ads | Optional | Cheaper clicks, lower intent. Meta may require its Housing special ad category, which limits targeting to broad areas | `utm_source=meta` |

Flyer rules:

- The QR code's link carries a batch name, never an address: `/?utm_source=flyer&utm_campaign=bx-1`.
  Keep a private note mapping batches to buildings.
- Post only where it's allowed: building boards with permission, laundromats, and shops nearby.
  Don't enter buildings uninvited.

## Google Search campaign setup

You set this up in the Google Ads web console. Nothing in the app sends data to Google.

**Account and campaign**

- Campaign type: **Search**. Goal: website traffic. Turn off the Display Network and Search Partners.
- Location: New York City (the five boroughs), set to **"Presence: people in or regularly in"**.
  Don't target by age, gender, parental status or ZIP code. Google treats some rental-related ads as
  housing ads, which can't use those, and we don't need them.
- Language: English. Ad schedule: all hours.
- Bidding: **Maximize clicks** with a maximum cost-per-click of $4. We send no conversions to
  Google (no ad pixels; see AGENTS.md), so automatic conversion bidding isn't an option.
- Budget: about $5 a day for two weeks. Stop when the $70 is spent.
- **Final URL:** the production home page (`https://<our-domain>/`).
- **Final URL suffix** (set it on each ad group, so ad groups can be told apart):
  `utm_source=google&utm_medium=cpc&utm_campaign=nov-search&utm_content=<ad-group>`, with
  `<ad-group>` being `heat`, `repairs` or `landlord`. Use plain lowercase words only, and never
  `utm_term`. Leave auto-tagging on: the app masks Google's click id.

**Ad groups and keywords** (phrase match, in quotes in the editor)

- `heat`: "no heat in apartment", "no heat nyc", "landlord no heat", "no hot water apartment",
  "landlord not providing heat", "how to report no heat"
- `repairs`: "landlord won't fix leak", "mold in apartment landlord", "landlord won't fix mold",
  "roaches landlord won't fix", "ceiling leak landlord"
- `landlord`: "landlord won't fix", "landlord not fixing repairs", "how to get landlord to fix",
  "rent abatement nyc", "rent reduction for repairs", "management won't fix"

**Negative keywords** (campaign level): lawyer, attorney, law firm, jobs, salary, hiring, for sale,
landlord insurance, for landlords, property management software, eviction, plumber, contractor,
space heater, boiler repair.

Check the **Search terms report** every other day and add new negatives for searches that aren't
tenants with a repair.

**Responsive search ad** (one per ad group; headlines are 30 characters or fewer, descriptions 90 or fewer)

Headlines:

- Landlord Won't Fix It?
- No Heat or Hot Water in NYC?
- Leak, Mold or Pests?
- Repair Dragging On?
- We Chase Management for You
- Stop Chasing Your Landlord
- Timed Repair Follow-Ups
- Your First Letter Is Free
- See What You May Be Owed
- Rent-Back Estimate in 2 Min
- You Approve Every Message
- A Dated Record of Every Step
- No Card, No Login
- For NYC Renters
- Student Pilot at NYU Stern

Descriptions:

- Tell us what's broken. We draft timed follow-ups, and you approve each one.
- Estimate the rent abatement you may be owed while repairs drag on. Not legal advice.
- Your first letter is free. No login. We keep a dated record of every notice and reply.
- Built for NYC tenants whose repairs management isn't fixing. Takes about 2 minutes.

Wording rules for any new line (from AGENTS.md):

- Say "may be owed" and "estimate". Never "you are owed", "get $X back" or a dollar promise.
- No legal claims, and nothing that sounds like a law firm.
- **Don't put prices or the paid plan in an ad.** Ads promote what's really available: the free
  first letter. A price in an ad that leads to "out of stock" risks Google's rule against
  advertising offers that aren't available, and it would bias the price test.

**Sitelinks (optional):** "Start my case" → `/start`, "Privacy" → `/privacy`.

## Reading the results

All in PostHog. Filter `$host` to the production domain and drop `utm_source = test`.

- **Funnel by channel:** `form_step_viewed` (`step_id` = `problems`) → `price_viewed` →
  `case_created`, by unique users, broken down by the event property `utm_source`. Add
  `utm_content` for Google's ad groups.
- **Buy rate:** the funnel in README.md ("Price test"): `price_viewed` → `price_buy_tapped`,
  broken down by `price_arm`, with attribution "All steps". Add a `utm_source` breakdown for each
  channel.
- **Google's side:** cost, clicks and the Search terms report. Cost per case created = spend ÷
  `case_created` from Google.

Cases don't store where the tenant came from (cut on Nov 10), so whether ad tenants go on to send
their first letter is read case by case on the team page, by creation time.

## Before launch

- [ ] **Decide the price for the ad run** (one arm, so the data isn't split). The Nov 16 swap in
      README.md hasn't happened: `p29` (weight 2) and `p9` (weight 1) are still live.
- [ ] **Confirm the abatement percentages** with legal aid or a tenant attorney. AGENTS.md says to
      do this before real testers see them, and ad visitors are strangers.
- [ ] **Have the letters reviewed.** If a stranger picks "Abate's team sends", the formal notice and
      the "$" first notice go out under our name. Set `FORMAL_NOTICE_REVIEWED=1` only after review.
- [ ] **Agree who handles new cases each day.** Every Abate-sent message and every reply is handled
      by hand.
- [ ] Set `TEAM_GMAIL` on Vercel, so the home page shows a contact address.
- [ ] Click the ad's final URL on a phone with `utm_source=test` and walk the form.
