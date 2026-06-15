import { NextResponse } from "next/server";
import { runAutomation } from "@/server/automation/automationEngine";
import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * POST /api/automation/run
 * Triggered by Mobile App wake, Web Dashboard load, or external CRON.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        
        // 1. Authenticate (optional fallback for CRON if secret is passed, but usually requires session)
        const session = await getServerSession(authOptions);
        let userId = session?.user?.id;

        // CRON Bypass
        const body = await req.clone().json().catch(() => ({}));
        if (!userId && body?.cronSecret === process.env.CRON_SECRET && body?.userId) {
            userId = body.userId;
        }

        if (!userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        // 2. Fire Engine
        const result = await runAutomation(userId);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("API Automation Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
