import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { ExecutionInspectionService } from "@/simulation/execution/services/executionInspectionService";

type RouteParams = { params: Promise<{ id: string; step: string }> };

/**
 * GET /api/admin/simulation/[id]/snapshot/[step]
 *
 * Returns a complete ExecutionInspectionDTO for a given simulation run + step.
 * The service reconstructs: snapshot → trace → all artifacts → composed DTO.
 * Never returns Mongo documents.
 */
export async function GET(_req: NextRequest, props: RouteParams) {
  try {
    const { id, step } = await props.params;
    const stepNumber = parseInt(step, 10);

    if (isNaN(stepNumber) || stepNumber < 1) {
      return NextResponse.json({ error: "Step must be a positive integer" }, { status: 400 });
    }

    await connectDB();

    const service = new ExecutionInspectionService();
    const inspection = await service.getStep(id, stepNumber);

    if (!inspection) {
      return NextResponse.json(
        { error: `No snapshot found for run=${id}, step=${stepNumber}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ inspection });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retrieve snapshot" },
      { status: 500 }
    );
  }
}
