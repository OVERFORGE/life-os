import React from "react";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/admin";
import { requireAdminSession } from "@/lib/adminAuth";

export const metadata = {
  title: "LifeOS Admin Console",
  description: "Internal engineering platform for LifeOS Observability & Kernel validation",
};

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    redirect("/dashboard");
  }
  return <AdminLayout>{children}</AdminLayout>;
}
