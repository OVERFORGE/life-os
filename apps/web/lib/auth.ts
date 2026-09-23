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
        if (decoded.sessionId) {
          const { connectDB } = require("@/server/db/connect");
          const { Session } = require("@/server/db/models/Session");
          await connectDB();
          const sessionRecord = await Session.findOne({ sessionToken: decoded.sessionId, isRevoked: true }).lean();
          if (sessionRecord) {
            return null; // Session revoked
          }
          
          // Optionally update lastActive
          Session.updateOne({ sessionToken: decoded.sessionId }, { $set: { lastActive: new Date() } }).catch(() => {});
        }

        // Resolve user name from token or database, rejecting generic device names
        let userName = decoded.name;
        const isGenericName = !userName || /^(mobile|mobile user|user|client|guest)$/i.test(userName.trim());
        if (isGenericName && decoded.id) {
          try {
            const { connectDB } = require("@/server/db/connect");
            const { User } = require("@/server/db/models/User");
            await connectDB();
            const dbUser = await User.findById(decoded.id).select("name").lean();
            if (dbUser && (dbUser as any).name) {
              userName = (dbUser as any).name;
            }
          } catch (_) {}
        }

        const finalName = (!userName || /^(mobile|mobile user|user|client|guest)$/i.test(userName.trim()))
          ? (decoded.email?.split("@")[0] || "Daksh")
          : userName;

        return {
          user: {
            id: decoded.id,
            email: decoded.email,
            name: finalName,
          },
          sessionId: decoded.sessionId,
        };
      }
    }
  } catch (err) {
    // Suppress header errors or JWT errors
    console.warn("Mobile auth token check failed:", err);
  }

  return null;
}
