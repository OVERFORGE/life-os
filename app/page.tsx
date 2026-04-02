"use client";

import { useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Activity, Brain, Target } from "lucide-react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function Homepage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  useGSAP(
    () => {
      if (status !== "unauthenticated") return;

      // Custom Cursor Logic - Optimized for 60fps
      let requestRef: number;
      let targetX = 0;
      let targetY = 0;

      const cursorX = gsap.quickTo(cursorRef.current, "x", { duration: 0.8, ease: "power3" });
      const cursorY = gsap.quickTo(cursorRef.current, "y", { duration: 0.8, ease: "power3" });
      const dotX = gsap.quickTo(cursorDotRef.current, "x", { duration: 0.1, ease: "power3" });
      const dotY = gsap.quickTo(cursorDotRef.current, "y", { duration: 0.1, ease: "power3" });

      const onMouseMove = (e: MouseEvent) => {
        targetX = e.clientX;
        targetY = e.clientY;
        
        cursorX(targetX - 16);
        cursorY(targetY - 16);
        dotX(targetX - 4);
        dotY(targetY - 4);
        
        // 3D Parallax on mouse move for the floating cards container
        const cardsContainer = document.querySelector(".cards-container");
        if (cardsContainer) {
          const x = (targetX / window.innerWidth - 0.5) * 15;
          const y = (targetY / window.innerHeight - 0.5) * 15;
          
          gsap.to(".floating-card", {
            x: x,
            y: y,
            rotationY: x * 0.5,
            rotationX: -y * 0.5,
            duration: 1,
            ease: "power2.out",
            stagger: 0.05,
            overwrite: "auto"
          });
        }
      };

      const onMouseHover = () => gsap.to(cursorRef.current, { scale: 2.5, backgroundColor: "rgba(0, 240, 255, 0.1)", duration: 0.3 });
      const onMouseLeave = () => gsap.to(cursorRef.current, { scale: 1, backgroundColor: "transparent", duration: 0.3 });

      window.addEventListener("mousemove", onMouseMove);
      
      const links = document.querySelectorAll("button, .hover-target");
      links.forEach((link) => {
        link.addEventListener("mouseenter", onMouseHover);
        link.addEventListener("mouseleave", onMouseLeave);
      });

      // Split text for hero (manual split by word)
      const titleWords = document.querySelectorAll(".title-word");
      
      // Main Timeline
      const tl = gsap.timeline();

      // Intro Boot Sequence
      tl.to(".boot-screen", {
        opacity: 0,
        duration: 0.8,
        delay: 1.5,
        display: "none",
        ease: "power2.inOut"
      })
      .from(".nav-anim", {
        y: -30,
        opacity: 0,
        stagger: 0.1,
        duration: 1,
        ease: "power3.out"
      }, "-=0.2")
      .from(titleWords, {
        y: 80,
        opacity: 0,
        rotateX: -60,
        stagger: 0.05,
        duration: 1.2,
        ease: "back.out(1.4)",
        transformOrigin: "50% 100%"
      }, "-=0.8")
      .from(".hero-sub", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.6")
      .from(".hero-btn", {
        scale: 0.8,
        opacity: 0,
        duration: 0.8,
        ease: "elastic.out(1, 0.5)"
      }, "-=0.4")
      .from(".floating-card", {
        y: 50,
        opacity: 0,
        duration: 1,
        stagger: 0.1,
        ease: "power2.out"
      }, "-=0.8");

      // Continuous Animations (Optimized)
      gsap.to(".glow-orb-1", {
        x: 100,
        y: 50,
        scale: 1.1,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
      
      gsap.to(".glow-orb-2", {
        x: -150,
        y: 100,
        scale: 1.2,
        duration: 10,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });

      // Scroll animations
      gsap.to(".hero-section", {
        scrollTrigger: {
          trigger: ".hero-section",
          start: "top top",
          end: "bottom top",
          scrub: 1
        },
        y: 150,
        opacity: 0
      });

      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        links.forEach((link) => {
          link.removeEventListener("mouseenter", onMouseHover);
          link.removeEventListener("mouseleave", onMouseLeave);
        });
      };
    },
    { scope: container, dependencies: [status] }
  );

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative flex h-16 w-16 items-center justify-center">
             <div className="absolute h-full w-full animate-[spin_3s_linear_infinite] rounded-full border-[1px] border-dashed border-[#00f0ff]/40"></div>
             <div className="absolute h-12 w-12 animate-[spin_2s_linear_infinite_reverse] rounded-full border-[2px] border-solid border-t-[#00f0ff] border-r-transparent border-b-[#00f0ff] border-l-transparent"></div>
             <div className="h-2 w-2 rounded-full bg-white shadow-[0_0_15px_#00f0ff]"></div>
          </div>
          <div className="font-mono text-xs tracking-[0.3em] text-[#00f0ff] animate-pulse">INITIATING DATA STREAM...</div>
        </div>
      </div>
    );
  }

  const titleText = "THE OPERATING SYSTEM FOR YOUR LIFE";
  const words = titleText.split(" ");

  return (
    <div ref={container} className="relative min-h-[150vh] bg-[#030303] overflow-hidden font-sans text-white cursor-none selection:bg-[#00f0ff]/30 selection:text-white">
      
      <style>{`
        @keyframes bootprogress {
          0% { transform: scaleX(0); }
          50% { transform: scaleX(0.7); }
          100% { transform: scaleX(1); }
        }
        @keyframes scrollUp {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
      `}</style>
      
      {/* Boot Screen Overlay */}
      <div className="boot-screen fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030303]">
         <div className="w-64 space-y-4">
           <div className="flex justify-between font-mono text-xs text-[#00f0ff]/70">
             <span>SYSTEM_BOOT</span>
             <span className="animate-pulse">v2.0.4</span>
           </div>
           <div className="h-[1px] w-full bg-white/10 relative overflow-hidden">
             <div className="absolute top-0 left-0 h-full w-full bg-[#00f0ff] animate-[bootprogress_1.5s_ease-in-out_forwards]" style={{ transformOrigin: "left", transform: "scaleX(0)" }}></div>
           </div>
           
           <div className="font-mono text-[10px] text-white/30 h-10 overflow-hidden opacity-50 relative">
             <div className="absolute w-full animate-[scrollUp_1.5s_linear_forwards]">
               &gt; Loading core modules... <br/>
               &gt; Syncing realities matrix... <br/>
               &gt; Initializing neural bridge... <br/>
               &gt; Calibrating life state... <br/>
               &gt; Operational Phase 1. <br/>
               &gt; System Ready.
             </div>
           </div>
         </div>
      </div>

      {/* Custom Cursor */}
      <div ref={cursorRef} className="fixed top-0 left-0 z-[9999] h-8 w-8 rounded-full border border-[#00f0ff]/50 pointer-events-none mix-blend-screen backdrop-blur-[2px]"></div>
      <div ref={cursorDotRef} className="fixed top-0 left-0 z-[9999] h-2 w-2 rounded-full bg-[#00f0ff] shadow-[0_0_10px_#00f0ff] pointer-events-none cursor-dot"></div>

      {/* Ambient Background Glows - OPTIMIZED FOR 60FPS */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="glow-orb-1 absolute top-[-10%] left-[-10%] h-[80vh] w-[80vw] bg-[radial-gradient(ellipse_at_center,rgba(0,180,255,0.08)_0,transparent_60%)]"></div>
        <div className="glow-orb-2 absolute bottom-[-10%] right-[-10%] h-[80vh] w-[80vw] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0,transparent_60%)]"></div>
        {/* Removed mix-blend and heavy SVG noise for performance */}
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, transparent 20%, #030303 100%), linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)', backgroundSize: '100% 100%, 60px 60px, 60px 60px' }}></div>
      </div>

      {/* Modern Top-tier Navbar */}
      <nav className="relative z-50 w-full px-4 py-8 md:px-12 md:py-8 lg:py-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="nav-anim flex items-center gap-2 cursor-pointer hover-target group">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#00f0ff] group-hover:rotate-180 transition-transform duration-700">
              <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
              <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
              <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
              <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
              <circle cx="17.5" cy="17.5" r="1.5" fill="currentColor"/>
            </svg>
            <span className="text-2xl font-black tracking-tighter">LIFE<span className="text-[#00f0ff]">OS</span><span className="animate-pulse">_</span></span>
          </div>
          
          <div className="nav-anim flex gap-8 items-center">
            <span className="hover-target text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors hidden md:block cursor-pointer px-2">
              The Architecture
            </span>
            <span className="hover-target text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors hidden md:block cursor-pointer px-2">
              Telemetry
            </span>
            <button
              onClick={() => signIn("google")}
              className="hover-target group relative overflow-hidden rounded-full border border-white/20 bg-[#060606] px-6 py-3 backdrop-blur-md transition-all hover:bg-white/10 hover:border-[#00f0ff]/50 hover:shadow-[0_0_20px_rgba(0,240,255,0.2)]"
            >
              <div className="absolute inset-0 w-0 bg-gradient-to-r from-[#00f0ff]/20 to-transparent transition-all duration-300 ease-out group-hover:w-full opacity-50"></div>
              <span className="relative z-10 text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-white">LOGIN SEQUENCE</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Hero Section - Reconfigured padding and spacing to prevent squishing */}
      <main className="hero-section relative z-10 flex flex-col items-center pt-16 md:pt-24 lg:pt-32 pb-40 px-4 w-full max-w-7xl mx-auto">
        {/* Diagnostic Label */}
        <div className="nav-anim mb-16 flex items-center gap-4 hover-target">
           <div className="h-[1px] w-8 md:w-16 bg-gradient-to-r from-transparent to-[#00f0ff]/50"></div>
           <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f0ff] border border-[#00f0ff]/30 px-3 py-1 bg-[#00f0ff]/5 backdrop-blur-sm rounded-sm whitespace-nowrap">Status: Ready To Track</div>
           <div className="h-[1px] w-8 md:w-16 bg-gradient-to-l from-transparent to-[#00f0ff]/50"></div>
        </div>

        {/* Dynamic Split Title - Adjusted sizing and line-heights */}
        <h1 className="flex flex-wrap justify-center text-center gap-x-4 md:gap-x-6 gap-y-2 md:gap-y-6 w-full max-w-[95vw] lg:max-w-[1200px] mb-8">
          {words.map((word, i) => (
            <span key={i} className="title-word perspective-[1000px] inline-block">
              <span className="inline-block text-[3.5rem] sm:text-[5rem] md:text-[6.5rem] lg:text-[8rem] font-black tracking-tighter leading-[1.05] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl" 
                style={{ WebkitTextStroke: word === "LIFE" || word === "SYSTEM" ? "1px rgba(0,240,255,0.7)" : "none", color: word === "LIFE" || word === "SYSTEM" ? "transparent" : ""}}>
                {word}
              </span>
            </span>
          ))}
        </h1>

        <p className="hero-sub mt-6 md:mt-10 mb-16 max-w-3xl text-center text-base md:text-xl text-white/50 font-light leading-relaxed tracking-wider px-2">
          A hyper-personalized analytics engine for your existence. <br className="hidden md:block" />
          Quantify your habits, optimize your deep work, and monitor your physical state.
        </p>

        {/* Start Button & Call to Action */}
        <div className="hero-btn mb-32 flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border border-[#00f0ff]/20 scale-[1.3] animate-ping opacity-20 hover-target"></div>
            <button
              onClick={() => signIn("google")}
              className="hover-target group relative flex h-28 w-28 md:h-36 md:w-36 items-center justify-center rounded-full border border-white/10 bg-[#050505] backdrop-blur-xl transition-all duration-500 hover:scale-[1.05] shadow-[0_0_30px_rgba(0,0,0,0.5)] hover:shadow-[0_0_50px_rgba(0,240,255,0.4)]"
            >
              <div className="absolute inset-0 rounded-full border-[1px] border-dashed border-[#00f0ff]/40 animate-[spin_10s_linear_infinite]"></div>
              <div className="absolute inset-2 rounded-full border border-white/5 group-hover:bg-[#00f0ff]/10 bg-[#00f0ff]/0 transition-colors duration-500"></div>
              
              <div className="relative z-10 flex flex-col items-center text-white/80 group-hover:text-white transition-colors duration-500">
                 <span className="font-mono text-[10px] md:text-sm tracking-[0.2em] font-bold text-[#00f0ff]">ENGAGE</span>
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-2 transition-transform duration-500 group-hover:translate-y-1"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
              </div>
            </button>
        </div>

        {/* 3D Magnetic Parallax Cards - Improved padding and layout */}
        <div className="cards-container grid w-full grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10 pb-20 mt-10 z-20" style={{ perspective: "1500px" }}>
          
          <div className="floating-card relative group rounded-2xl border border-white/10 bg-[#080808] p-8 md:p-10 transition-all duration-300 hover:bg-[#0a0a0a] hover:border-[#00f0ff]/40 shadow-xl" style={{ transformStyle: "preserve-3d" }}>
             <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:opacity-100 group-hover:text-[#00f0ff] transition-all transform group-hover:scale-110 group-hover:rotate-12 duration-500">
               <Activity size={32} />
             </div>
             <div className="mb-8 h-12 w-12 flex text-sm font-mono items-center justify-center rounded-lg bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/30 shadow-[0_0_20px_rgba(0,240,255,0)] group-hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all">01</div>
             <h3 className="text-2xl font-bold tracking-tight mb-4 group-hover:text-[#00f0ff] transition-colors leading-tight">Physiological Telemetry</h3>
             <p className="text-sm md:text-base text-white/40 leading-relaxed font-light group-hover:text-white/60 transition-colors">Monitor sleep patterns, caloric intake, and workout intensity. Your body is a machine; track its metrics.</p>
             <div className="mt-10 h-1.5 w-full bg-white/5 overflow-hidden rounded-full">
               <div className="h-full w-2/3 bg-gradient-to-r from-[#00f0ff]/20 to-[#00f0ff] opacity-50 group-hover:opacity-100 transition-opacity"></div>
             </div>
          </div>

          <div className="floating-card relative group rounded-2xl border border-white/10 bg-[#080808] p-8 md:p-10 transition-all duration-300 hover:bg-[#0a0a0a] hover:border-blue-500/40 shadow-xl" style={{ transformStyle: "preserve-3d" }}>
             <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:opacity-100 group-hover:text-blue-400 transition-all transform group-hover:scale-110 group-hover:-rotate-12 duration-500">
               <Brain size={32} />
             </div>
             <div className="mb-8 h-12 w-12 flex text-sm font-mono items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 shadow-[0_0_20px_rgba(0,0,0,0)] group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all">02</div>
             <h3 className="text-2xl font-bold tracking-tight mb-4 group-hover:text-blue-400 transition-colors leading-tight">Cognitive Load</h3>
             <p className="text-sm md:text-base text-white/40 leading-relaxed font-light group-hover:text-white/60 transition-colors">Quantify deep work sessions, focus levels, and mental state. Understand exactly what fuels your mind.</p>
             <div className="mt-10 flex items-end gap-1.5 h-12 opacity-30 group-hover:opacity-100 transition-opacity w-full">
                {[40,70,30,90,50,80].map((h,i) => (
                  <div key={i} className="flex-1 bg-gradient-to-t from-blue-600/20 to-blue-400 rounded-t-sm hover:h-full transition-all duration-300" style={{ height: `${h}%` }}></div>
                ))}
             </div>
          </div>

          <div className="floating-card relative group rounded-2xl border border-white/10 bg-[#080808] p-8 md:p-10 transition-all duration-300 hover:bg-[#0a0a0a] hover:border-purple-400/40 shadow-xl" style={{ transformStyle: "preserve-3d" }}>
             <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:opacity-100 group-hover:text-purple-400 transition-all transform group-hover:scale-110 group-hover:rotate-12 duration-500">
               <Target size={32} />
             </div>
             <div className="mb-8 h-12 w-12 flex text-sm font-mono items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-[0_0_20px_rgba(0,0,0,0)] group-hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all">03</div>
             <h3 className="text-2xl font-bold tracking-tight mb-4 group-hover:text-purple-400 transition-colors leading-tight">Goal Alignment</h3>
             <p className="text-sm md:text-base text-white/40 leading-relaxed font-light group-hover:text-white/60 transition-colors">Phased-based detection adjusts your goals dynamically based on whether you are grinding or recovering.</p>
             <div className="mt-10 relative h-12 w-full flex items-center justify-center border border-white/5 rounded-lg bg-white/5 overflow-hidden group-hover:border-purple-500/30 transition-colors">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-full bg-purple-500/20 flex items-center shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                  <div className="h-full w-4 bg-purple-400 rounded-full group-hover:animate-[progress_2s_infinite_ease-in-out_alternate]"></div>
               </div>
             </div>
          </div>

        </div>
      </main>
    </div>
  );
}
