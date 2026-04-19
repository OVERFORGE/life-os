import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

    const token = jwt.sign(
      {
        id: dbUser._id.toString(),
        email: dbUser.email,
      },
      secret,
      { expiresIn: "30d" }
    );

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