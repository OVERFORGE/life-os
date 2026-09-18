import React from "react";
import { AdminLayout } from "@/components/admin";

export const metadata = {
  title: "LifeOS Simulation Lab — Admin Console",
  description: "Internal engineering platform for LifeOS Kernel validation",
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
