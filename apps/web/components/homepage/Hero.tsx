"use client";

import React, { useRef, useEffect } from "react";
import gsap from "gsap";

interface HeroProps {
  isReady: boolean;
}

export function Hero({ isReady }: HeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLHeadingElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!isReady) return;

    const tl = gsap.timeline();

    // Reset styles just in case
    gsap.set([titleRef.current, subtitleRef.current, pRef.current], {
      y: 50,
      opacity: 0,
    });

    tl.to(titleRef.current, {
      y: 0,
      opacity: 1,
      duration: 1.2,
      ease: "power4.out",
    })
      .to(
        subtitleRef.current,
        {
          y: 0,
          opacity: 1,
          duration: 1.2,
          ease: "power4.out",
        },
        "-=0.9"
      )
      .to(
        pRef.current,
        {
          y: 0,
          opacity: 1,
          duration: 1.2,
          ease: "power4.out",
        },
        "-=0.9"
      );
  }, [isReady]);

  return (
    <section
      ref={containerRef}
      className="relative z-10 flex min-h-screen flex-col justify-center px-8 md:px-16 lg:px-32 max-w-[1600px] mx-auto"
    >
      <div className="max-w-4xl pt-24">
        <h1
          ref={titleRef}
          className="text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter text-lifeos-light-3 mb-4 opacity-0"
        >
          LifeOS
        </h1>
        <h2
          ref={subtitleRef}
          className="text-2xl md:text-4xl lg:text-5xl font-light tracking-tight text-lifeos-light-2 mb-8 opacity-0"
        >
          The Operating System <br /> for Human Execution.
        </h2>
        <p
          ref={pRef}
          className="text-sm md:text-base font-mono tracking-[0.05em] text-lifeos-red-3 max-w-md opacity-0 uppercase leading-relaxed"
        >
          A deterministic adaptive operating system designed to architect and
          orchestrate human performance.
        </p>
      </div>
    </section>
  );
}
