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
      {/* Top Nav */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 md:px-16 lg:px-32 pt-8">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-sm border border-lifeos-red-3 rotate-45 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-lifeos-light-3 rounded-full shadow-[0_0_5px_#fff]" />
          </div>
          <span className="font-mono text-sm tracking-widest text-lifeos-light-2 font-bold uppercase">LifeOS</span>
        </div>
        <a
          href="/login"
          className="flex items-center gap-2 px-5 py-2 border border-lifeos-light-1/20 text-lifeos-light-2 font-mono text-xs tracking-[0.15em] uppercase hover:border-lifeos-red-3 hover:text-lifeos-red-3 transition-all duration-300"
        >
          Sign In
        </a>
      </div>

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
          className="text-sm md:text-base font-mono tracking-[0.05em] text-lifeos-red-3 max-w-md opacity-0 uppercase leading-relaxed mb-10"
        >
          A deterministic adaptive operating system designed to architect and
          orchestrate human performance.
        </p>
        <a
          href="/login"
          className="inline-flex items-center gap-3 px-8 py-4 bg-lifeos-red-3 text-white font-mono text-xs tracking-[0.2em] font-bold uppercase transition-all duration-300 hover:bg-white hover:text-black shadow-[0_0_30px_rgba(232,65,74,0.3)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)]"
        >
          Initialize OS →
        </a>
      </div>
    </section>
  );
}
