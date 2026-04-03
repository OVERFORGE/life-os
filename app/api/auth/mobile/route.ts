import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  try {
    const { email, name, image } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }
    
    await connectDB();
    
    let dbUser = await User.findOne({ email });
    
    if (!dbUser) {
      dbUser = await User.create({
        name: name || email.split('@')[0],
        email: email,
        avatar: image || "",
      });
    }

    const customToken = jwt.sign(
      { id: dbUser._id.toString(), email: dbUser.email },
      process.env.NEXTAUTH_SECRET || "fallback-secret-key-12345",
      { expiresIn: "30d" }
    );

    return NextResponse.json({
      token: customToken,
      user: {
        id: dbUser._id.toString(),
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.avatar
      }
    });

  } catch (error) {
    console.error("Mobile auth error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
