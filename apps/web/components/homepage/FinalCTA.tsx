"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { signIn } from "next-auth/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function FinalCTA() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 70%",
          end: "top 30%",
          scrub: 1,
        },
      });

      tl.from(".cta-content", { 
        opacity: 0, 
        y: 100, 
        duration: 1 
      });
      
      tl.to(".bg-topology-fake", { scale: 0, opacity: 1, duration: 1 }, 0);
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="relative z-10 w-full min-h-screen flex flex-col items-center justify-between bg-transparent overflow-hidden pt-32">
      
      {/* Fake Topology converging animation layer */}
      <div className="bg-topology-fake absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 flex items-center justify-center opacity-0 pointer-events-none">
         <div className="w-[150vw] h-[150vw] rounded-full border border-lifeos-red-3/10 absolute"></div>
         <div className="w-[100vw] h-[100vw] rounded-full border border-lifeos-red-3/15 absolute"></div>
         <div className="w-[50vw] h-[50vw] rounded-full border border-lifeos-red-3/20 absolute"></div>
      </div>

      <div className="cta-content z-10 flex-1 flex flex-col items-center justify-center text-center max-w-5xl px-8 w-full mt-16 md:mt-32">
        
        {/* Minimal High-End Logo */}
        <div className="mb-16 relative flex items-center justify-center w-16 h-16 group cursor-pointer">
          <div className="absolute inset-0 border border-lifeos-red-3 rounded-sm rotate-45 transition-transform duration-700 group-hover:rotate-90"></div>
          <div className="absolute inset-0 border border-lifeos-light-3/20 rounded-sm -rotate-45 transition-transform duration-700 group-hover:-rotate-90"></div>
          <div className="w-2 h-2 bg-lifeos-red-3 z-10 shadow-[0_0_20px_#E8414A] transition-transform duration-300 group-hover:scale-[2]"></div>
        </div>

        <h2 className="text-5xl md:text-7xl lg:text-[6rem] font-bold tracking-tighter text-lifeos-light-3 mb-8 leading-none">
          Build a system<br/>
          <span className="text-lifeos-light-1/40">that remembers how you execute.</span>
        </h2>

        <div className="flex flex-col sm:flex-row gap-8 w-full sm:w-auto mt-12 relative z-20 items-center">
          <button
            onClick={() => signIn("google")}
            className="group relative flex items-center justify-center px-10 py-4 bg-lifeos-red-3 text-white font-mono text-xs tracking-[0.2em] font-bold uppercase transition-all duration-300 hover:bg-white hover:text-black shadow-[0_0_30px_rgba(232,65,74,0.3)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)]"
          >
            <span>Initialize OS</span>
          </button>

          <button
            className="group relative flex items-center justify-center px-10 py-4 border-b border-lifeos-light-1/30 bg-transparent text-lifeos-light-1/50 font-mono text-xs tracking-[0.2em] uppercase transition-all duration-300 hover:border-lifeos-red-3 hover:text-lifeos-red-3"
          >
            <span>Read Manifesto</span>
          </button>
        </div>
      </div>

      {/* Premium SaaS Footer */}
      <footer className="relative w-full z-10 border-t border-lifeos-dark-3/30 bg-[#0f1115]/90 backdrop-blur-md mt-32">
        <div className="max-w-7xl mx-auto px-8 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3 opacity-80 hover:opacity-100 transition-opacity">
             <div className="w-5 h-5 rounded-sm border border-lifeos-red-3 rotate-45 flex items-center justify-center">
               <div className="w-1.5 h-1.5 bg-lifeos-light-3 rounded-full shadow-[0_0_5px_#fff]"></div>
             </div>
             <span className="font-mono text-sm tracking-widest text-lifeos-light-2 font-bold uppercase">LifeOS</span>
          </div>
          
          <div className="flex gap-8 text-[11px] font-mono tracking-widest text-lifeos-light-1/50 uppercase">
             <span className="hover:text-lifeos-light-3 cursor-pointer transition-colors">Manifesto</span>
             <span className="hover:text-lifeos-light-3 cursor-pointer transition-colors">Architecture</span>
             <span className="hover:text-lifeos-light-3 cursor-pointer transition-colors">Telemetry</span>
          </div>

          <div className="text-[10px] font-mono tracking-widest text-lifeos-light-1/30 uppercase">
            &copy; 2026 The Executioners. All Rights Reserved.
          </div>
        </div>
      </footer>
    </section>
  );
}
