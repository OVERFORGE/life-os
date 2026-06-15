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

export async function POST(req: Request) {
    try {
        const session = await getAuthSession();
        const userId = (session?.user as any)?.id;
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { date, weight } = body;
        if (!date || weight === undefined) return NextResponse.json({ error: "Missing date or weight" }, { status: 400 });

        await connectDB();
        await WeightLog.findOneAndUpdate(
            { userId, date },
            { weight: Number(weight) },
            { upsert: true, new: true }
        );
        return NextResponse.json({ success: true });
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
        await WeightLog.findOneAndDelete({ userId, date });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
