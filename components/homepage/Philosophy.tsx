"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function Philosophy() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const statements = gsap.utils.toArray(".phil-statement") as HTMLElement[];

      statements.forEach((statement) => {
        const text = statement.querySelector(".phil-text");
        const lines = statement.querySelectorAll(".phil-line");
        const metadata = statement.querySelector(".phil-meta");

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: statement,
            start: "top 75%",
            end: "bottom 40%",
            scrub: 1,
          },
        });

        tl.fromTo(
          lines,
          { scaleX: 0, opacity: 0 },
          { scaleX: 1, opacity: 1, duration: 1, ease: "power2.inOut", transformOrigin: "left" }
        )
        .fromTo(
          metadata,
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.5 },
          "-=0.5"
        )
        .fromTo(
          text,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 1.5, ease: "power3.out" },
          "-=0.5"
        );
      });
    },
    { scope: containerRef }
  );

  const data = [
    { text: "Humans are not static systems.", meta: "AXIOM_01" },
    { text: "Stability is systems design.", meta: "AXIOM_02" },
    { text: "Execution can be architected.", meta: "AXIOM_03" },
    { text: "Memory should shape orchestration.", meta: "AXIOM_04" }
  ];

  return (
    <section ref={containerRef} className="relative z-10 w-full py-48 md:py-64 px-8 md:px-16 lg:px-32 bg-transparent flex flex-col items-center gap-64 max-w-[1600px] mx-auto">
      {data.map((item, i) => (
        <div key={i} className="phil-statement relative w-full max-w-5xl flex flex-col items-start text-left">
          {/* Top structural line */}
          <div className="w-full flex items-center mb-12 opacity-0 phil-line">
            <div className="h-[1px] w-12 bg-lifeos-red-3/50 mr-4"></div>
            <div className="h-[1px] flex-1 bg-lifeos-dark-3"></div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-16 w-full">
             <div className="phil-meta opacity-0 text-xs font-mono tracking-[0.3em] text-lifeos-red-3 uppercase md:w-32 shrink-0 md:pt-4">
               {item.meta}
             </div>
             <h2 className="phil-text opacity-0 text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-lifeos-light-3 leading-[1.1]">
               {item.text}
             </h2>
          </div>

          {/* Bottom structural line */}
          <div className="w-full flex items-center mt-12 opacity-0 phil-line" style={{ transformOrigin: "right" }}>
            <div className="h-[1px] flex-1 bg-lifeos-dark-3"></div>
            <div className="h-[1px] w-24 bg-lifeos-red-3/30 ml-4"></div>
          </div>
        </div>
      ))}
    </section>
  );
}
