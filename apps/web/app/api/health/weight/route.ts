import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WeightLog } from "@/server/db/models/WeightLog";
import {
  upsertWeightLogWithOutbox,
  deleteWeightLogWithOutbox,
} from "@/features/health/services/weightLogEngine";

export async function GET() {
    try {
        const session = await getAuthSession();
        if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectDB();
        const logs = await WeightLog.find({
            userId: (session!.user as any).id,
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        })
            .sort({ date: -1 })
            .limit(30)
            .lean();

        return NextResponse.json({ success: true, logs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getAuthSession();
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { date, weight, clientMutationId, expectedVersion } = body;
        if (!date || weight === undefined) return NextResponse.json({ error: "Missing date or weight" }, { status: 400 });

        await connectDB();
        const result = await upsertWeightLogWithOutbox(userId, date, Number(weight), {
            clientMutationId: typeof clientMutationId === "string" ? clientMutationId : undefined,
            expectedVersion: typeof expectedVersion === "number" ? expectedVersion : undefined,
            source: "web.health.weight",
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error, code: result.code }, { status: result.statusCode || 500 });
        }
        return NextResponse.json({ success: true, log: result.log });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getAuthSession();
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const date = searchParams.get('date');
        if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

        await connectDB();
        const result = await deleteWeightLogWithOutbox(userId, date, {
            source: "web.health.weight.delete",
        });
        if (!result.success) {
            return NextResponse.json({ error: result.error, code: result.code }, { status: result.statusCode || 500 });
        }
        return NextResponse.json({ success: true, deleted: result.deleted });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
