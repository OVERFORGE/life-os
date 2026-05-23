"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        onComplete();
      },
    });

    // Initial state
    gsap.set(textRef.current, { opacity: 0, y: 20 });
    gsap.set(progressRef.current, { scaleX: 0, transformOrigin: "left" });

    // Boot sequence
    tl.to(textRef.current, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: "power3.out",
    })
      .to(
        progressRef.current,
        {
          scaleX: 1,
          duration: 1.5,
          ease: "power2.inOut",
        },
        "-=0.5"
      )
      .to(
        textRef.current,
        {
          opacity: 0,
          y: -20,
          duration: 0.8,
          ease: "power3.in",
        },
        "+=0.2"
      )
      .to(
        containerRef.current,
        {
          opacity: 0,
          duration: 1,
          ease: "power2.inOut",
        },
        "-=0.4"
      );

    return () => {
      tl.kill();
    };
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-lifeos-dark-1"
    >
      <div className="w-64">
        <div
          ref={textRef}
          className="flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-lifeos-light-2 mb-4"
        >
          <span>System_Init</span>
          <span className="text-lifeos-red-3">v3.0.0</span>
        </div>
        <div className="h-[1px] w-full bg-lifeos-dark-3">
          <div
            ref={progressRef}
            className="h-full w-full bg-lifeos-red-3"
          ></div>
        </div>
      </div>
    </div>
  );
}
