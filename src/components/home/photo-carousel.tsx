"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useState, type CSSProperties } from "react";
import styles from "@/app/home.module.css";

// Replace these local placeholder assets with permission-cleared client photos.
const PHOTOS = ["apartment", "building", "interior", "building", "apartment", "interior"];
export function PhotoCarousel() {
  const [paused, setPaused] = useState(false);
  return <>
    <div className={styles.carousel} data-paused={paused} aria-hidden="true">
      {PHOTOS.map((photo, index) => <div className={styles.photo} key={index} style={{ "--delay": `${index * -8}s` } as CSSProperties}>
        <Image src={`/images/placeholder-${photo}.jpg`} alt="" fill sizes="(max-width: 600px) 112px, 180px" priority={index < 3} />
      </div>)}
    </div>
    <div className={styles.carouselControls}>
      <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Play photo carousel" : "Pause photo carousel"} aria-pressed={paused}>
        {paused ? <Play size={15} /> : <Pause size={15} />} <span>{paused ? "Play" : "Pause"}</span>
      </button>
    </div>
  </>;
}
