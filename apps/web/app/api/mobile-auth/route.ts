import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import { Session } from "@/server/db/models/Session";
import { parseUserAgent } from "@/server/utils/deviceDetect";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const runtime = "nodejs"; // ✅ VERY IMPORTANT (fixes Vercel issues)

type Body = {
  email?: string;
  name?: string;
  image?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const body: any = await req.json();

    if (!body.email) {
      return NextResponse.json(
        { error: "Missing email" },
        { status: 400 }
      );
    }

    await connectDB();

    let dbUser = await User.findOne({ email: body.email }).select('+password');

    // Classic Credential Sign-in
    if (body.password) {
      if (!dbUser) {
        return NextResponse.json({ error: "No account found with this email" }, { status: 401 });
      }
      
      if (!dbUser.password) {
        return NextResponse.json({ error: "This account was created via Google. Please sign in with Google or set a password in Settings." }, { status: 401 });
      }

      const isMatch = await bcrypt.compare(body.password, dbUser.password);
      if (!isMatch) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }
    } else {
      // Standard Google/Bypass Sign-In or Creation flow
      if (!dbUser) {
        dbUser = await User.create({
          name: body.name || body.email.split("@")[0],
          email: body.email,
          avatar: body.image || "",
        });
      }
    }

    const secret = process.env.NEXTAUTH_SECRET;

    if (!secret) {
      throw new Error("NEXTAUTH_SECRET not set");
    }

    const sessionId = crypto.randomUUID();

    const token = jwt.sign(
      {
        id: dbUser._id.toString(),
        email: dbUser.email,
        sessionId,
      },
      secret,
      { expiresIn: "30d" }
    );

    // Register mobile session
    try {
      const ua = req.headers.get("user-agent") || "";
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "";
        
      let deviceInfo = parseUserAgent(ua);
      
      // Override with explicit device details from React Native payload if provided
      const bodyDeviceOs = reqBody.deviceOs;
      const bodyDeviceModel = reqBody.deviceModel;

      // Ensure we explicitly flag as Mobile App since this is the mobile-auth endpoint.
      // React Native / Expo UAs are often misidentified as "Web Browser".
      if (deviceInfo.platform === "Web Browser" || bodyDeviceOs) {
        deviceInfo.platform = "Mobile App";
        deviceInfo.deviceType = "mobile";
        
        if (bodyDeviceOs && bodyDeviceOs !== "Unknown") {
          deviceInfo.os = bodyDeviceOs;
        }
        if (bodyDeviceModel && bodyDeviceModel !== "Unknown") {
          deviceInfo.browser = bodyDeviceModel; // Maps to the specific device model
        }
      }

      await Session.create({
        userId: dbUser._id,
        sessionToken: sessionId,
        lastActive: new Date(),
        ...deviceInfo,
        ipAddress: ip,
        isRevoked: false,
      });
    } catch (err) {
      console.warn("Failed to record mobile session:", err);
    }

    return NextResponse.json({
      token,
      user: {
        id: dbUser._id.toString(),
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.avatar,
      },
    });

  } catch (error: any) {
    console.error("Mobile auth error:", error);

    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}