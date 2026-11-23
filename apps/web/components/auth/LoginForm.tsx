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
    // If running in desktop, listen for deep links
    if (typeof window !== "undefined" && window.lifeosDesktop?.onDeepLink) {
      const unsubscribe = window.lifeosDesktop.onDeepLink(async (rawUrl: string) => {
        try {
          const url = new URL(rawUrl);
          if (url.protocol === "lifeos:") {
            const token = url.searchParams.get("token");
            if (token) {
              setLoading(true);
              const res = await signIn("credentials", {
                redirect: false,
                token: token,
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
      });
      return () => {
        if (typeof unsubscribe === "function") unsubscribe();
      };
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

    if (typeof window !== "undefined" && window.lifeosDesktop?.openExternal) {
      try {
        const { openExternalUrl } = await import("@/lib/desktopBridge");
        const appUrl =
          typeof window !== "undefined" && window.location.origin
            ? window.location.origin
            : "http://localhost:3456";
        await openExternalUrl(`${appUrl}/desktop-login`);
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
    <div className="w-full max-w-[420px] bg-[#17171A] border border-[#23242A] rounded-2xl p-8 shadow-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
      {/* Brand Emblem */}
      <div className="w-16 h-16 rounded-2xl bg-[#D98B2B]/10 border border-[#D98B2B]/25 flex items-center justify-center mb-5 shadow-lg shadow-[#D98B2B]/5">
        <div className="relative w-10 h-10">
          <Image
            src="/icon.png"
            alt="LifeOS Logo"
            fill
            className="object-contain drop-shadow-[0_0_12px_rgba(217,139,43,0.35)]"
          />
        </div>
      </div>

      <div className="flex flex-row items-baseline justify-center mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">LifeOS</h1>
      </div>

      <p className="text-[11px] text-[#85827A] text-center mb-8 tracking-[0.16em] uppercase font-mono font-medium">
        Personal Execution Operating System
      </p>

      {errorMsg && (
        <div className="w-full bg-[#DE4343]/10 border border-[#DE4343]/30 text-[#E85656] text-xs p-3 rounded-xl mb-5 text-center">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleCredentialsLogin} className="w-full mb-5 space-y-3">
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5 ml-1">
            Account Email
          </label>
          <input
            type="email"
            placeholder="arjun@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-4 py-3 text-[#F7F5F0] text-sm focus:outline-none focus:border-[#D98B2B] focus:ring-1 focus:ring-[#D98B2B]/40 transition-all placeholder-[#85827A]/60"
            autoCapitalize="none"
            required
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5 ml-1">
            Vault Key / Password
          </label>
          <input
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-4 py-3 text-[#F7F5F0] text-sm focus:outline-none focus:border-[#D98B2B] focus:ring-1 focus:ring-[#D98B2B]/40 transition-all placeholder-[#85827A]/60"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 mt-2 flex items-center justify-center rounded-xl bg-[#D98B2B] hover:bg-[#E59B3C] active:bg-[#C47B22] text-[#111113] font-semibold text-sm transition-all shadow-md shadow-[#D98B2B]/20 disabled:opacity-60 cursor-pointer"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-[#111113]/30 border-t-[#111113] rounded-full animate-spin" />
          ) : (
            <span>Sign In</span>
          )}
        </button>
      </form>

      <div className="flex flex-row items-center w-full mb-5">
        <div className="flex-1 h-[1px] bg-[#23242A]" />
        <span className="text-[#85827A] text-[11px] px-3 font-mono font-medium">OR</span>
        <div className="flex-1 h-[1px] bg-[#23242A]" />
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handleGoogleLogin}
        className="w-full h-11 flex items-center justify-center gap-2.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] hover:border-[#32343D] text-[#F7F5F0] text-sm font-medium transition-all disabled:opacity-60 cursor-pointer mb-6"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="text-[11px] text-[#85827A] font-mono flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#6B8E7B]" />
        <span>AES-256 Vault Encryption • 100% Sovereign</span>
      </div>
    </div>
  );
}
