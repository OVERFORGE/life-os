import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WeightLog } from "@/server/db/models/WeightLog";

export async function GET() {
    try {
        const session = await getAuthSession();
        if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectDB();
        const logs = await WeightLog.find({ userId: (session!.user as any).id })
            .sort({ date: -1 })
            .limit(30)
            .lean();

        return NextResponse.json({ success: true, logs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
