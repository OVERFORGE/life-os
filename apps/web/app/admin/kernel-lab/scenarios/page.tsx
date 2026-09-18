"use client";

import React from "react";
import { AdminPlaceholderPage } from "@/components/admin";

export default function ScenariosPlaceholderPage() {
  return (
    <AdminPlaceholderPage
      title="Simulation Scenarios"
      description="Configure initial environmental conditions, scheduled events, and challenge scenarios."
      moduleName="Scenarios Engine"
    />
  );
}
