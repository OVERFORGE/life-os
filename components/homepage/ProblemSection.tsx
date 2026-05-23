"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function ProblemSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const textGroupRef = useRef<HTMLDivElement>(null);
  const chaosRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // No pinning in ScrollTrigger! We use CSS sticky.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      // Text animation
      tl.to(".problem-line", {
        opacity: 1,
        y: 0,
        duration: 1,
        stagger: 0.5,
      });

      // Chaos fragments forming
      tl.to(
        ".chaos-fragment",
        {
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 0.1,
          duration: 2,
          ease: "power2.inOut",
        },
        "-=1"
      );

      // Fade out at the end of the sticky scroll
      tl.to(textGroupRef.current, {
        opacity: 0,
        y: -50,
        duration: 0.5,
      });
      tl.to(chaosRef.current, {
        opacity: 0,
        duration: 0.5,
      }, "<");
    },
    { scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      className="relative z-10 w-full h-[250vh] bg-transparent"
    >
      <div className="sticky top-0 flex h-screen w-full flex-col items-center justify-center overflow-hidden px-8">
        {/* Chaos background */}
        <div ref={chaosRef} className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="chaos-fragment absolute h-px bg-lifeos-red-3/40"
              style={{
                width: `${100 + i * 50}px`,
                transform: `translate(${(Math.random() - 0.5) * 400}px, ${(Math.random() - 0.5) * 400}px) rotate(${Math.random() * 90}deg)`,
                opacity: 0,
              }}
            ></div>
          ))}
        </div>

        {/* Text content */}
        <div ref={textGroupRef} className="z-10 text-center flex flex-col gap-6">
          <p className="problem-line text-2xl md:text-4xl lg:text-5xl font-light text-lifeos-light-2 opacity-0 translate-y-8">
            Modern productivity systems <span className="text-lifeos-red-3">fail</span> humans.
          </p>
          <h3 className="problem-line text-4xl md:text-6xl font-bold tracking-tighter text-lifeos-light-3 opacity-0 translate-y-8">
            We are not static systems.
          </h3>
        </div>
      </div>
    </section>
  );
}
