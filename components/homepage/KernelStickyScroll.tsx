"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const phases = [
  {
    title: "Deterministic Replayability",
    desc: "Every action is logged, indexed, and replayable. Understand your past to architect your future.",
  },
  {
    title: "Adaptive Orchestration",
    desc: "The system learns your rhythms. It routes tasks based on cognitive load, not just arbitrary deadlines.",
  },
  {
    title: "Constraint Memory",
    desc: "LifeOS remembers what blocks you. It propagates repairs across your schedule before failures happen.",
  },
];

export function KernelStickyScroll() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Each .kernel-phase panel gets its own independent ScrollTrigger
      const panels = gsap.utils.toArray(".kernel-phase") as HTMLElement[];

      panels.forEach((panel) => {
        const text = panel.querySelector(".phase-text");
        const graphic = panel.querySelector(".phase-graphic");

        gsap.timeline({
          scrollTrigger: {
            trigger: panel,
            start: "top 60%",
            end: "top 20%",
            scrub: true,
          },
        })
          .fromTo(
            text!,
            { opacity: 0, y: 60 },
            { opacity: 1, y: 0, duration: 1 }
          )
          .fromTo(
            graphic!,
            { opacity: 0, scale: 0.85 },
            { opacity: 1, scale: 1, duration: 1 },
            "<"
          );

        // Fade out as it leaves
        gsap.timeline({
          scrollTrigger: {
            trigger: panel,
            start: "bottom 60%",
            end: "bottom 30%",
            scrub: true,
          },
        })
          .to(text!, { opacity: 0, y: -40, duration: 1 })
          .to(graphic!, { opacity: 0, scale: 0.9, duration: 1 }, "<");
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="relative z-10 w-full bg-transparent">
      {phases.map((phase, i) => (
        <div
          key={i}
          className="kernel-phase relative flex h-screen w-full items-center"
        >
          {/* Left Column - Text */}
          <div className="flex h-full w-1/2 flex-col justify-center pl-8 md:pl-16 lg:pl-32">
            <div className="phase-text max-w-md opacity-0">
              <h3 className="text-sm font-mono text-lifeos-red-3 tracking-[0.2em] uppercase mb-4">
                Kernel Phase {i + 1}
              </h3>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-lifeos-light-3 mb-6">
                {phase.title}
              </h2>
              <p className="text-lg md:text-xl font-light text-lifeos-light-2/70 leading-relaxed">
                {phase.desc}
              </p>
            </div>
          </div>

          {/* Right Column - Visual */}
          <div className="flex h-full w-1/2 items-center justify-center pr-8 md:pr-16 lg:pr-32">
            {i === 0 && (
              <div className="phase-graphic flex h-64 w-64 items-center justify-center opacity-0 scale-90">
                <div className="relative h-full w-full rounded-full border border-lifeos-dark-3 animate-[spin_10s_linear_infinite]">
                  <div className="absolute top-0 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lifeos-red-3 shadow-[0_0_15px_#E8414A]"></div>
                </div>
                <div className="absolute h-48 w-48 rounded-full border border-lifeos-dark-3 animate-[spin_8s_linear_infinite_reverse]"></div>
              </div>
            )}
            {i === 1 && (
              <div className="phase-graphic flex h-64 w-64 items-center justify-center opacity-0 scale-90">
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <div
                      key={j}
                      className={`h-16 w-16 border border-lifeos-dark-3 ${j === 4 ? "bg-lifeos-red-3/20 border-lifeos-red-3" : ""} transition-all duration-1000`}
                    ></div>
                  ))}
                </div>
              </div>
            )}
            {i === 2 && (
              <div className="phase-graphic flex h-64 w-64 items-center justify-center opacity-0 scale-90">
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="absolute w-full h-[1px] bg-lifeos-dark-3 rotate-45"></div>
                  <div className="absolute w-full h-[1px] bg-lifeos-dark-3 -rotate-45"></div>
                  <div className="h-12 w-12 bg-lifeos-red-3 z-10 shadow-[0_0_30px_#E8414A]"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
