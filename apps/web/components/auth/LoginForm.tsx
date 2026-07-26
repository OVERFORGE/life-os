"use client";

import React, { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // If running in Tauri, listen for deep links
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      import('@tauri-apps/plugin-deep-link').then(({ onOpenUrl }) => {
        onOpenUrl(async (urls) => {
          try {
            const url = new URL(urls[0]);
            if (url.protocol === "lifeos:") {
              const token = url.searchParams.get("token");
              if (token) {
                setLoading(true);
                const res = await signIn("credentials", {
                  redirect: false,
                  token: token
                });
                
                if (res?.error) {
                  setErrorMsg(res.error);
                  setLoading(false);
                } else {
                  window.location.href = "/dashboard";
                }
              }
            }
          } catch (e) {
            console.error("Failed to parse deep link", e);
          }
        }).catch(console.error);
      });
    }
  }, []);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.toLowerCase().trim(),
        password,
      });

      if (res?.error) {
        setErrorMsg(res.error);
        setLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        // Use production Vercel URL so auth goes through the hosted backend,
        // making the desktop app shareable (not tied to localhost).
        const productionUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        await openUrl(productionUrl + "/desktop-login");
        // Keep loading true while waiting for deep link
      } catch (e: any) {
        console.error("Failed to open browser", e);
        setErrorMsg("Failed to open external browser: " + (e?.message || String(e)));
        setLoading(false);
      }
    } else {
      signIn("google", { callbackUrl: "/dashboard" });
    }
  };

  return (
    <div className="w-full max-w-[400px] flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-20 h-20 rounded-2xl bg-[rgba(232,65,74,0.1)] border border-[rgba(232,65,74,0.3)] flex items-center justify-center mb-6">
        <div className="relative w-14 h-14">
          <Image
            src="/icon.png"
            alt="LifeOS Logo"
            fill
            className="object-contain drop-shadow-[0_0_15px_rgba(232,65,74,0.5)]"
          />
        </div>
      </div>

      <div className="flex flex-row items-baseline justify-center mb-2">
        <h1 className="text-4xl font-bold tracking-widest text-[#FFFDFC] uppercase">Life</h1>
        <h1 className="text-4xl font-bold tracking-widest text-[#ECE7E3]/50 uppercase">OS</h1>
      </div>

      <p className="text-xs text-[#ECE7E3]/50 text-center mb-10 tracking-[0.2em] uppercase font-semibold">
        Personal Analytics Engine
      </p>

      {errorMsg && (
        <div className="w-full bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg mb-6 text-center">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleCredentialsLogin} className="w-full mb-6">
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-xl px-4 py-3.5 text-[#FFFDFC] text-sm mb-3 focus:outline-none focus:border-[rgba(232,65,74,0.5)] transition-colors placeholder-[#ECE7E3]/50"
          autoCapitalize="none"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-xl px-4 py-3.5 text-[#FFFDFC] text-sm mb-4 focus:outline-none focus:border-[rgba(232,65,74,0.5)] transition-colors placeholder-[#ECE7E3]/50"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 flex items-center justify-center rounded-xl bg-[#E8414A] border border-[#D62C35] hover:bg-[#ff4b55] transition-colors disabled:opacity-70"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-[#FFFDFC] font-bold text-sm">Sign In</span>
          )}
        </button>
      </form>

      <div className="flex flex-row items-center w-full mb-6">
        <div className="flex-1 h-[1px] bg-[#2A2B2F]" />
        <span className="text-[#ECE7E3]/50 text-xs px-4 font-medium">OR</span>
        <div className="flex-1 h-[1px] bg-[#2A2B2F]" />
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handleGoogleLogin}
        className="w-full h-12 flex items-center justify-center rounded-xl bg-[#FFFDFC] hover:bg-[#f0f0f0] transition-colors disabled:opacity-70"
      >
        <span className="text-[#161618] font-semibold text-sm">
          Sign In with Google
        </span>
      </button>
    </div>
  );
}
