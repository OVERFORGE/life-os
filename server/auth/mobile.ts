import jwt from "jsonwebtoken";
import { User } from "@/server/db/models/User";
import { connectDB } from "@/server/db/connect";

export async function getMobileSession(req: Request) {
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || "fallback-secret-key-12345") as { id: string; email: string };
    
    await connectDB();
    const dbUser = await User.findById(decoded.id).lean();
    if (!dbUser) return null;

    return { user: { id: dbUser._id.toString(), email: dbUser.email, name: dbUser.name } };
  } catch (err) {
    return null;
  }
}
