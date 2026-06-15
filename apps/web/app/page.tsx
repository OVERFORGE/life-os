"use client";
import "lenis/dist/lenis.css";

import React, { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { Preloader } from "@/components/homepage/Preloader";
import { TopologyBackground } from "@/components/homepage/TopologyBackground";
import { Hero } from "@/components/homepage/Hero";
import { ProblemSection } from "@/components/homepage/ProblemSection";
import { KernelStickyScroll } from "@/components/homepage/KernelStickyScroll";
import { InterfaceCinema } from "@/components/homepage/InterfaceCinema";
import { Philosophy } from "@/components/homepage/Philosophy";
import { FinalCTA } from "@/components/homepage/FinalCTA";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function Homepage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [bootComplete, setBootComplete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  // Lenis Smooth Scrolling Setup
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    // Tell GSAP ScrollTrigger about Lenis scroll updates
    lenis.on("scroll", ScrollTrigger.update);

    // Use GSAP's ticker to drive lenis for perfect sync
    const gsapTickerFn = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(gsapTickerFn);
    gsap.ticker.lagSmoothing(0);

    // Force a layout recalculation after mounting
    const timeoutId = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      lenis.off("scroll", ScrollTrigger.update);
      gsap.ticker.remove(gsapTickerFn);
      lenis.destroy();
    };
  }, []);

  if (status === "loading" || status === "authenticated") {
    return <div className="h-screen w-full bg-lifeos-dark-1"></div>;
  }

  return (
    <main ref={containerRef} className="relative w-full bg-lifeos-dark-1 text-lifeos-light-3 selection:bg-lifeos-red-3/30 selection:text-white font-sans">
      
      {!bootComplete && (
        <Preloader onComplete={() => setBootComplete(true)} />
      )}

      {/* Persistent Animated Topology Background */}
      <TopologyBackground />

      {/* Main Content Sections */}
      <div className="relative z-10 w-full flex flex-col">
        <Hero isReady={bootComplete} />
        <ProblemSection />
        <KernelStickyScroll />
        <InterfaceCinema />
        <Philosophy />
        <FinalCTA />
      </div>
      
    </main>
  );
}
