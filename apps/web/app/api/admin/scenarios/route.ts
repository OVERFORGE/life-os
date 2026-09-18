import { NextResponse } from "next/server";

export async function GET() {
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
  return NextResponse.json(
    {
      status: 501,
      message: "Not Implemented — Phase 1.1 Foundation Placeholder",
      module: "SimulationScenario API",
    },
    { status: 501 }
  );
}
