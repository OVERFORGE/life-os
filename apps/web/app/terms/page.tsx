import React from "react";
import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service — Life OS",
  description: "Terms of Service for Life OS",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#161618] text-[#ECE7E3] px-6 py-12 flex justify-center">
      <div className="max-w-3xl w-full space-y-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#9BA1A6] hover:text-[#FFFDFC] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#E8414A]/10 border border-[#E8414A]/30 text-[#E8414A]">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#FFFDFC]">Terms of Service</h1>
            <p className="text-xs text-[#9BA1A6] mt-0.5">Last updated: September 2026</p>
          </div>
        </div>

        <div className="p-6 bg-[#1F2023] border border-[#2A2B2F] rounded-2xl space-y-6 text-sm leading-relaxed text-[#ECE7E3]">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">1. Acceptance of Terms</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              By accessing or using Life OS, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">2. Description of Service</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              Life OS provides personal productivity, task management, calendar integration, and AI-assisted workflows. Services are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis for personal and pre-alpha testing use.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">3. Third-Party Integrations</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              Life OS allows users to optionally connect third-party services, including Google Workspace and Spotify. You retain ownership of your third-party account data, and you may disconnect third-party services at any time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">4. Limitation of Liability</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              Life OS and its developers shall not be liable for any indirect, incidental, or consequential damages resulting from your use of or inability to use the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">5. Contact Information</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              Questions regarding these Terms of Service can be directed to:{" "}
              <a
                href="mailto:dkdakshkhurana@gmail.com"
                className="text-[#E8414A] underline hover:text-[#D62C35] font-mono"
              >
                dkdakshkhurana@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
