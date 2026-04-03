import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { headers } from "next/headers";
import jwt from "jsonwebtoken";

export async function getAuthSession() {
  const session = await getServerSession(authOptions);
  
  if (session?.user && (session.user as any).id) {
    return session;
  }

  // Fallback to Mobile JWT Token
  try {
    const headerList = await headers();
    const authHeader = headerList.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || "fallback-secret-key-12345") as any;
      
      if (decoded && decoded.id) {
        return {
          user: {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name || "Mobile User"
          }
        };
      }
    }
  } catch (err) {
    // Suppress header errors or JWT errors
    console.warn("Mobile auth token check failed:", err);
  }

  return null;
}
