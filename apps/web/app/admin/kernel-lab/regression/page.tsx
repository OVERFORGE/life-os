"use client";

import React from "react";
import { AdminPlaceholderPage } from "@/components/admin";

export default function RegressionPlaceholderPage() {
  return (
    <AdminPlaceholderPage
      title="Regression Testing Console"
      description="Run automated regression test matrices against kernel baseline snapshots before production deployment."
      moduleName="Regression Engine"
    />
  );
}
