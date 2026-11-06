import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import {
  HITLGovernanceEngine,
  TamperedInterventionError,
  ExpiredInterventionError,
  InvalidInterventionStateError,
  RetiredKeyVersionError,
} from "@life-os/execution-kernel";

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const sessionUserId = (session.user as any).id;

  try {
    const body = await req.json();
    const { interventionId, response, signature, keyVersion, metadata } = body;

    // Invariant 2.1: Identity Guard: Extract userId strictly from session; reject or ignore body userId
    if (body.userId && body.userId !== sessionUserId) {
      return NextResponse.json(
        { error: "Forbidden: Identity spoofing detected. Caller cannot submit responses for another user." },
        { status: 403 }
      );
    }

    if (!interventionId || !response || !signature) {
      return NextResponse.json(
        { error: "Bad Request: interventionId, response, and signature are required." },
        { status: 400 }
      );
    }

    if (!["ACCEPTED", "REJECTED", "DISMISSED"].includes(response)) {
      return NextResponse.json(
        { error: `Bad Request: Invalid response '${response}'. Must be ACCEPTED, REJECTED, or DISMISSED.` },
        { status: 400 }
      );
    }

    const engine = HITLGovernanceEngine.getInstance();
    const updated = await engine.respondIntervention({
      interventionId,
      userId: sessionUserId,
      response,
      signature,
      keyVersion: typeof keyVersion === "number" ? keyVersion : undefined,
      metadata,
    });

    return NextResponse.json({
      success: true,
      interventionId,
      status: updated.status,
      respondedAt: updated.respondedAt,
    });
  } catch (err: any) {
    if (err instanceof TamperedInterventionError) {
      return NextResponse.json({ error: err.message, code: "TAMPERED_INTERVENTION" }, { status: 400 });
    }
    if (err instanceof RetiredKeyVersionError) {
      return NextResponse.json({ error: err.message, code: "RETIRED_KEY_VERSION" }, { status: 400 });
    }
    if (err instanceof ExpiredInterventionError) {
      return NextResponse.json({ error: err.message, code: "EXPIRED_INTERVENTION" }, { status: 409 });
    }
    if (err instanceof InvalidInterventionStateError) {
      return NextResponse.json({ error: err.message, code: "INVALID_STATE" }, { status: 409 });
    }
    if (err.statusCode === 404 || err.message?.includes("not found")) {
      return NextResponse.json({ error: err.message, code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

