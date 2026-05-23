"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function InterfaceCinema() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        ".phone-mockup",
        { y: 150, opacity: 0, rotateX: 10 },
        {
          y: 0,
          opacity: 1,
          rotateX: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 70%",
            end: "top 30%",
            scrub: true,
          },
        }
      );

      gsap.fromTo(
        ".feature-card",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.15,
          scrollTrigger: {
            trigger: ".feature-cards-row",
            start: "top 80%",
            end: "top 50%",
            scrub: true,
          },
        }
      );

      gsap.to(".float-frag-1", {
        y: -80,
        ease: "none",
        scrollTrigger: { trigger: containerRef.current, start: "top bottom", end: "bottom top", scrub: true },
      });
      gsap.to(".float-frag-2", {
        y: -140,
        ease: "none",
        scrollTrigger: { trigger: containerRef.current, start: "top bottom", end: "bottom top", scrub: true },
      });
    },
    { scope: containerRef }
  );

  const features = [
    { label: "LIFE STATE", title: "Multi-Signal Scoring", desc: "Phase detection powered by real behavioral data." },
    { label: "ERA TRACKING", title: "Temporal Awareness", desc: "Know exactly where you are in your execution cycle." },
    { label: "GOAL LOAD", title: "Cognitive Pressure", desc: "System-wide load analysis prevents burnout before it hits." },
  ];

  return (
    <section
      ref={containerRef}
      className="relative z-10 w-full py-32 md:py-48 px-8 bg-transparent"
      style={{ perspective: "1200px" }}
    >
      {/* Header */}
      <div className="max-w-4xl mx-auto text-center mb-20 md:mb-28">
        <div className="text-xs font-mono text-lifeos-red-3 tracking-[0.3em] uppercase mb-4">Mobile Experience</div>
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-lifeos-light-3 mb-6">
          The Execution Interface
        </h2>
        <p className="text-lg md:text-xl text-lifeos-light-2/50 font-light max-w-2xl mx-auto">
          Your entire operating system, in your pocket. Calm, system-grade, intelligent.
        </p>
      </div>

      {/* Phone + Floating Fragments Container */}
      <div className="relative w-full max-w-6xl mx-auto flex items-center justify-center mb-24 md:mb-32 min-h-[600px]">
        {/* Phone Mockup */}
        <div className="phone-mockup relative z-20 opacity-0" style={{ transformStyle: "preserve-3d" }}>
          <div className="relative w-[260px] md:w-[300px] rounded-[2.5rem] border-[5px] border-[#2a2d35] bg-[#131519] shadow-[0_20px_80px_rgba(0,0,0,0.8),0_0_40px_rgba(232,65,74,0.08)] overflow-hidden">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#2a2d35] rounded-b-xl z-30"></div>

            {/* ===== Fake App UI (code-rendered, looks like the real app) ===== */}
            <div className="pt-8 pb-4 px-5 flex flex-col gap-4 text-white" style={{ fontSize: "11px" }}>
              {/* Status Bar */}
              <div className="flex items-center justify-between text-[9px] text-white/40 font-mono">
                <span>11:57</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-2 border border-white/40 rounded-sm relative"><div className="absolute inset-[1px] bg-white/40 rounded-[1px]" style={{ width: "60%" }}></div></div>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <div className="text-lifeos-red-3 text-sm">⏣</div>
                  <span className="font-bold text-base tracking-tight">Overview</span>
                </div>
                <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center text-[8px]">🔔</div>
              </div>

              {/* Life State Card */}
              <div className="rounded-xl bg-[#1c1f26] border border-white/5 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Life State</span>
                  <span className="text-[8px] font-mono bg-lifeos-red-3/20 text-lifeos-red-3 px-2 py-0.5 rounded-full">Slump</span>
                </div>
                <div className="text-lg font-bold tracking-tight">slump</div>
                <div className="text-[9px] text-white/30">Phase selected by multi-signal scoring engine.</div>
                <div className="flex gap-3 mt-1">
                  <div className="flex-1 bg-[#232730] rounded-lg p-2.5">
                    <div className="text-lifeos-red-3 font-bold text-sm">100%</div>
                    <div className="text-[8px] text-white/30 uppercase tracking-wider mt-0.5">Confidence</div>
                  </div>
                  <div className="flex-1 bg-[#232730] rounded-lg p-2.5">
                    <div className="font-bold text-sm">3</div>
                    <div className="text-[8px] text-white/30 uppercase tracking-wider mt-0.5">Insights</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-white/30 uppercase tracking-wider">
                  <span>View Trajectory</span>
                  <span>→</span>
                </div>
              </div>

              {/* Current Era Card */}
              <div className="rounded-xl bg-[#1c1f26] border border-white/5 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Current Era</span>
                  <span className="text-[8px] font-mono border border-lifeos-red-3/40 text-lifeos-red-3 px-2 py-0.5 rounded-full">Contraction</span>
                </div>
                <div className="text-base font-bold tracking-tight mt-1">The Low Tide</div>
                <div className="text-[9px] text-white/30">Low output and low internal drive</div>
                <div className="flex gap-3 mt-2">
                  <div className="bg-[#232730] rounded-lg px-3 py-2">
                    <div className="font-bold text-sm">1</div>
                    <div className="text-[8px] text-white/30 uppercase">Phases</div>
                  </div>
                  <div className="bg-lifeos-red-3/10 border border-lifeos-red-3/20 rounded-lg px-3 py-2">
                    <div className="font-bold text-sm text-lifeos-red-3">1</div>
                    <div className="text-[8px] text-white/30 uppercase">Active</div>
                  </div>
                  <div className="bg-[#232730] rounded-lg px-3 py-2">
                    <div className="font-bold text-sm">Apr 2026</div>
                    <div className="text-[8px] text-white/30 uppercase">Started</div>
                  </div>
                </div>
              </div>

              {/* Goal Load Card */}
              <div className="rounded-xl bg-[#1c1f26] border border-white/5 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Goal Load</span>
                  <span className="text-lifeos-red-3 text-xs">📈</span>
                </div>
                <div className="text-[9px] text-white/30">Jarvis system-wide goal pressure</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-white/50">Load Score</span>
                  <span className="text-[10px] font-mono font-bold">44%</span>
                </div>
                <div className="w-full h-1.5 bg-[#232730] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" style={{ width: "44%" }}></div>
                </div>
              </div>

              {/* Bottom Nav */}
              <div className="flex items-center justify-around mt-2 pt-3 border-t border-white/5">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full bg-lifeos-red-3/20 flex items-center justify-center text-lifeos-red-3 text-xs">⌂</div>
                </div>
                <div className="text-white/20 text-xs">🔧</div>
                <div className="text-white/20 text-xs">💼</div>
                <div className="text-white/20 text-xs">⚙</div>
              </div>
            </div>
          </div>

          {/* Phone glow */}
          <div className="absolute -inset-10 bg-lifeos-red-3/5 rounded-[4rem] blur-3xl -z-10 pointer-events-none"></div>
          <div className="absolute -inset-4 bg-gradient-to-b from-lifeos-red-3/10 via-transparent to-transparent rounded-[3rem] blur-2xl -z-10 pointer-events-none"></div>
        </div>

        {/* Floating UI Fragment - Left */}
        <div className="float-frag-1 hidden md:flex absolute left-[3%] top-[15%] z-10 w-56 flex-col gap-3 bg-[#161922]/90 backdrop-blur-md border border-lifeos-dark-3/60 rounded-xl shadow-2xl p-5 opacity-50 hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono text-lifeos-red-3 tracking-widest uppercase">NODE_SYNC</div>
            <div className="w-1.5 h-1.5 rounded-full bg-lifeos-red-3 animate-pulse"></div>
          </div>
          <div className="border border-lifeos-dark-3 border-dashed rounded p-3">
            <div className="w-full h-1 bg-lifeos-dark-3 rounded relative overflow-hidden">
              <div className="absolute top-0 left-0 w-3/5 h-full bg-lifeos-light-3 rounded"></div>
            </div>
          </div>
          <div className="text-[9px] font-mono text-lifeos-light-1/30">Synchronizing trajectory...</div>
        </div>

        {/* Floating UI Fragment - Right */}
        <div className="float-frag-2 hidden md:flex absolute right-[3%] bottom-[20%] z-10 w-64 flex-col gap-2 bg-[#161922]/90 backdrop-blur-xl border border-lifeos-dark-3/60 rounded-xl shadow-2xl p-5 opacity-50 hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] font-mono text-lifeos-light-1/50 tracking-widest uppercase">SYSTEM LOG</div>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e] animate-pulse"></div>
          </div>
          <div className="w-16 h-1.5 bg-lifeos-dark-3 rounded"></div>
          <div className="w-full h-1.5 bg-lifeos-dark-3 rounded"></div>
          <div className="w-3/4 h-1.5 bg-lifeos-dark-3 rounded"></div>
          <div className="w-full h-1.5 bg-lifeos-red-3/20 rounded mt-1"></div>
          <div className="text-[9px] font-mono text-lifeos-light-1/20 mt-1">&gt; era.contraction detected</div>
        </div>
      </div>

      {/* Feature Cards Row */}
      <div className="feature-cards-row max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <div
            key={i}
            className="feature-card group rounded-xl border border-lifeos-dark-3/50 bg-[#161922]/60 backdrop-blur-md p-8 hover:border-lifeos-red-3/30 hover:bg-[#161922]/80 transition-all duration-300 opacity-0"
          >
            <div className="text-[10px] font-mono text-lifeos-red-3 tracking-[0.3em] uppercase mb-4">{f.label}</div>
            <h3 className="text-xl font-bold text-lifeos-light-3 mb-3 tracking-tight group-hover:text-white transition-colors">{f.title}</h3>
            <p className="text-sm text-lifeos-light-2/50 leading-relaxed font-light">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
