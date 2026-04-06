import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import jwt from "jsonwebtoken";

export const runtime = "nodejs"; // ✅ VERY IMPORTANT (fixes Vercel issues)

type Body = {
  email?: string;
  name?: string;
  image?: string;
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

    let dbUser = await User.findOne({ email: body.email });

    if (!dbUser) {
      dbUser = await User.create({
        name: body.name || body.email.split("@")[0],
        email: body.email,
        avatar: body.image || "",
      });
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