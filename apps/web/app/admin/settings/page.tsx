"use client";

import React from "react";
import { AdminPlaceholderPage } from "@/components/admin";

export default function SettingsPlaceholderPage() {
  return (
    <AdminPlaceholderPage
      title="Admin Console Settings"
      description="Configure environment variables, lab security parameters, API key rotation, and seed defaults."
      moduleName="Admin Configuration"
    />
  );
}
