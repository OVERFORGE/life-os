import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { buildHealthContext } from "@/server/health/healthContextBuilder";

export async function GET() {
    try {
        const session = await getAuthSession();
        if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectDB();
        const data = await buildHealthContext((session!.user as any).id);
        return NextResponse.json({ success: true, data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
