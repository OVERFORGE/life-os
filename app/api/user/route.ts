import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const authenticate = (req: Request) => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;
    const decoded: any = jwt.verify(token, secret);
    return decoded.id;
  } catch (error) {
    return null;
  }
};

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    console.log("AUTH HEADER:", authHeader);
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized - missing header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    
    let userId = null;
    try {
      const secret = process.env.NEXTAUTH_SECRET;
      if (!secret) return NextResponse.json({ error: "No secret" }, { status: 500 });
      const decoded: any = jwt.verify(token, secret);
      userId = decoded.id;
    } catch (err: any) {
      console.log("JWT VERIFY ERR:", err.message);
      return NextResponse.json({ error: "Unauthorized - bad token" }, { status: 401 });
    }
    
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const user = await User.findById(userId).select('+password');

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      gender: user.gender,
      age: user.age,
      weight: user.weight,
      height: user.height,
      heightUnit: user.heightUnit,
      hasPassword: !!user.password,
    });
  } catch (error: any) {
    console.error("User fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = authenticate(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    await connectDB();
    
    // We explicitly exclude email modification here natively for safety without complex verification flows
    const updatePayload: any = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.avatar !== undefined) updatePayload.avatar = body.avatar;
    if (body.gender !== undefined) updatePayload.gender = body.gender;
    if (body.age !== undefined) updatePayload.age = Number(body.age);
    if (body.weight !== undefined) updatePayload.weight = Number(body.weight);
    if (body.height !== undefined) updatePayload.height = Number(body.height);
    if (body.heightUnit !== undefined) updatePayload.heightUnit = body.heightUnit;
    
    const user = await User.findById(userId).select('+password');
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Handle password updating separately if provided
    let needsSave = false;
    for (const key in updatePayload) {
      if (user[key] !== updatePayload[key]) {
        user[key] = updatePayload[key];
        needsSave = true;
      }
    }

    if (body.password && body.password.length >= 6) {
      // If the user already has a password, we must strictly verify it first
      if (user.password) {
        if (!body.oldPassword) {
          return NextResponse.json({ error: "Missing old password for validation" }, { status: 400 });
        }
        
        const isMatch = await bcrypt.compare(body.oldPassword, user.password);
        if (!isMatch) {
          return NextResponse.json({ error: "Incorrect old password" }, { status: 401 });
        }
      }
      
      user.password = body.password;
      needsSave = true;
    }

    if (needsSave) {
      await user.save();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("User update error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
