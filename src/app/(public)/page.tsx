import Link from "next/link";
import { ArrowRight, Check, Plus, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PhotoCarousel } from "@/components/home/photo-carousel";
import styles from "./home.module.css";

const FAQ = [
  ["What is a rent abatement?", "It’s a reduction in rent for a period when serious conditions affected your apartment. You may be able to recover part of the rent you paid. Our estimate is a starting point, not a guarantee or legal advice."],
  ["Does Abate contact my landlord?", "No. We prepare the drafts; you review, edit, and send each one from your own email. Management replies to you. With the full plan, paste those replies into your private case page for our team to review."],
  ["What do I get for free?", "Your abatement estimate and your first repair letter. The full plan adds timed follow-up drafts, saved replies with team review, a dated case history, and a 311 guide. You can choose it during signup or upgrade later. Prices are being tested: no card is collected and nothing is charged during the pilot."],
  ["My problem just started. Can I still use Abate?", "Yes. Start with a written repair request. We wait 7 days after management was told before displaying an estimate, or 1 day for no heat or hot water. That is our display policy, not a legal waiting period. Urgent problems should be reported right away."],
  ["Who is behind Abate?", "We’re Ilias, Rayhan, Ian, and Omar, four students at NYU Stern. Interviews with NYC renters showed us how much work it takes to keep following up. We built Abate to make the next letter—and the record behind it—easier to manage. We’re not lawyers or a law firm."],
];

export default function Home() {
  return <div className={styles.home}>
    <header className={styles.header}>
      <Link href="/" aria-label="Abate home" className={styles.brand}><Logo /></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#plans">Our plans</a><a href="#story">Tenant story</a></nav>
      <Link className={styles.button} href="/start">Start my case <ArrowUpRight size={18} /></Link>
    </header>
    <main>
      <section className={styles.hero}>
        <PhotoCarousel />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>FOR NEW YORK CITY RENTERS</p>
          <h1>Better days.<br /><span>Better living.</span></h1>
          <p className={styles.heroDescription}>Repair still not fixed? Turn the follow-up into a plan.<br className={styles.desktopBreak} /> Get a letter ready to send and see the rent you may be owed.</p>
          <Link href="/start" className={styles.button}>Start my case <ArrowRight size={19} /></Link>
          <p className={styles.micro}>Free first letter. No account. No card.</p>
        </div>
      </section>

      <section id="story" className={`${styles.story} ${styles.container}`}>
        <div className={styles.storyIntro}><p className={styles.eyebrow}>A LITTLE LESS RENT. A LOT OF RELIEF.</p><h2>A win for Marissa.<br />And her roommates.</h2></div>
        <div className={styles.storyResult}><span>$1,000</span><p>off their apartment’s total rent<br />for one month</p></div>
        <div className={styles.storyText}><p>Marissa and her roommates live in an East Village walk-up. When they faced a broken window and mold, Abate helped them get a rent abatement.</p><p className={styles.storyNote}>One household’s result. Outcomes vary; an abatement is not guaranteed.</p><a href="#how-it-works">See how Abate works <ArrowRight size={18} /></a></div>
      </section>

      <section id="how-it-works" className={`${styles.how} ${styles.container}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>LESS GUESSWORK. A CLEAR NEXT STEP.</p><h2>Your home deserves<br />a follow-through.</h2><p>You know what’s broken. We help you put it in writing—and keep moving.</p></div>
        <ol className={styles.steps}>
          <li><span>01</span><div><h3>Tell us what’s going on.</h3><p>Share the problem, when management heard about it, and your rent. See an estimate before you share your name or address.</p></div></li>
          <li><span>02</span><div><h3>Make your first letter count.</h3><p>A clear draft with your details and a request for a repair date. Check it, make it yours, and send it from your email.</p></div></li>
          <li><span>03</span><div><h3>Know what comes next.</h3><p>Choose the full plan for timed follow-ups. Save management’s replies for our team to review, with your case history in one place.</p></div></li>
        </ol>
      </section>

      <section id="plans" className={styles.plansSection}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>START SMALL. KEEP GOING IF YOU NEED TO.</p><h2>Your repair. Your plan.</h2><p>You’re always the sender. Choose how much help you want along the way.</p></div>
          <div className={styles.plans}>
            <article className={styles.plan}><p className={styles.eyebrow}>THE FIRST STEP</p><h3>Free</h3><p>Put the problem in writing.</p><ul><li><Check />Abatement estimate</li><li><Check />Your first repair letter</li><li><Check />Private link to return to your case</li></ul><Link href="/start" className={styles.outlineButton}>Start with the free letter <ArrowRight size={18} /></Link><p className={styles.planNote}>Follow-ups and reply tracking require the full plan.</p></article>
            <article className={`${styles.plan} ${styles.fullPlan}`}><p className={styles.eyebrow}>THE FOLLOW-THROUGH</p><h3>Full plan</h3><p>Keep your next move ready.</p><ul><li><Check />Everything in Free</li><li><Check />Timed reminder and formal-notice drafts</li><li><Check />Saved replies, reviewed by our team</li><li><Check />Dated case history and 311 guide</li></ul><Link href="/start" className={styles.button}>Explore the full plan <ArrowRight size={18} /></Link><p className={styles.planNote}>Choose Buy during signup or upgrade from your case.</p></article>
          </div>
          <p className={styles.pilotNote}>We’re testing prices during our student pilot. Your offer appears after your estimate. No payment details are collected and nothing is charged.</p>
          <p className={styles.safetyNote}>Need to report an urgent repair? <a href="https://portal.311.nyc.gov/" target="_blank" rel="noreferrer">NYC 311 is always free <ArrowUpRight size={14} /></a></p>
        </div>
      </section>

      <section className={`${styles.faq} ${styles.container}`} id="questions"><div><p className={styles.eyebrow}>GOOD QUESTIONS.</p><h2>Let’s clear<br />a few things up.</h2></div><div>{FAQ.map(([q, a]) => <details key={q}><summary>{q}<Plus size={20} /></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.finalCta}><p className={styles.eyebrow}>A BETTER NEXT STEP STARTS HERE.</p><h2>Let’s get it in writing.</h2><Link href="/start" className={styles.button}>Start my case <ArrowRight size={18} /></Link><p>About two minutes. Your first letter is free.</p></section>
    </main>
    <footer className={`${styles.footer} ${styles.container}`}><div><Logo /><p>Made for renters. Built in New York.</p></div><p>A student pilot by Ilias, Rayhan, Ian, and Omar at NYU Stern.<br />Not a law firm. Estimates are not legal advice.</p><Link href="/privacy">Privacy <ArrowUpRight size={15} /></Link></footer>
  </div>;
}
