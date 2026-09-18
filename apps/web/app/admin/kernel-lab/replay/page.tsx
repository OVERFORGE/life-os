"use client";

import React from "react";
import { AdminPlaceholderPage } from "@/components/admin";

export default function ReplayPlaceholderPage() {
  return (
    <AdminPlaceholderPage
      title="Deterministic Replay System"
      description="Time-travel step-by-step through historical simulation runs and inspect exact kernel state transitions."
      moduleName="Replay Harness"
    />
  );
}
