import React from "react";
import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Life OS",
  description: "Life OS Privacy Policy and Google API Services User Data Disclosure",
};

export default function PrivacyPage() {
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
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#FFFDFC]">Privacy Policy</h1>
            <p className="text-xs text-[#9BA1A6] mt-0.5">Last updated: September 2026</p>
          </div>
        </div>

        <div className="p-6 bg-[#1F2023] border border-[#2A2B2F] rounded-2xl space-y-6 text-sm leading-relaxed text-[#ECE7E3]">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">1. Overview</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              Life OS is a personal AI operating system designed to unify your tasks, calendar, documents, and wellness data into a unified, secure dashboard. We respect your privacy and process all external service data strictly to provide AI-assisted insights and automated productivity workflows for you.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">2. Google API Services User Data Policy</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              Life OS&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E8414A] underline hover:text-[#D62C35]"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <div className="p-4 bg-[#18191B] border border-[#2A2B2F] rounded-xl text-xs space-y-2 text-[#9BA1A6]">
              <p>
                <strong className="text-[#FFFDFC]">Limited Use Disclosure:</strong> We strictly access Google Calendar, Drive, Gmail, Tasks, Contacts, and Google Fit APIs only upon your explicit authorization to render your schedule, retrieve requested documents, and provide biometric summaries.
              </p>
              <p>
                We do not sell your personal data or use your Google Workspace data for serving advertisements.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">3. Data Storage &amp; Security</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              All credentials, OAuth access tokens, and refresh tokens are encrypted at rest using AES-256 encryption. Authentication tokens are exclusively used to make direct, authenticated API requests to the respective service providers on your behalf.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">4. Your Rights &amp; Revoking Access</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              You can disconnect any integration or delete stored credentials at any time in{" "}
              <strong className="text-[#FFFDFC]">Settings &gt; Connections</strong>. Disconnecting immediately removes access and clears stored tokens from our database. You can also revoke access directly in your Google Account security settings.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-[#FFFDFC]">5. Contact Us</h2>
            <p className="text-xs text-[#9BA1A6] leading-relaxed">
              If you have any questions about this Privacy Policy or your data, contact the developer at:{" "}
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
