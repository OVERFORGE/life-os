import { requireAdminSession } from "@/lib/adminAuth";
import { NextResponse } from "next/server";

export async function GET() {
  const adminAuth = await requireAdminSession();
  if (!adminAuth.ok) return adminAuth.response;
  return NextResponse.json(
    {
      status: 501,
      message: "Not Implemented — Phase 1.1 Foundation Placeholder",
      module: "SimulationScenario API",
    },
    { status: 501 }
  );
}

export async function POST() {
  const adminAuth = await requireAdminSession();
  if (!adminAuth.ok) return adminAuth.response;
  return NextResponse.json(
    {
      status: 501,
      message: "Not Implemented — Phase 1.1 Foundation Placeholder",
      module: "SimulationScenario API",
    },
    { status: 501 }
  );
}
