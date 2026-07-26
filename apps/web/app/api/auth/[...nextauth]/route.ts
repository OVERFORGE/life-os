import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        token: { label: "Deep Link Token", type: "text" }
      },
      async authorize(credentials) {
        // Deep Link OAuth Handshake
        if (credentials?.token) {
          const secret = process.env.NEXTAUTH_SECRET || "fallback-secret-key-12345";
          let decoded: any;
          try {
            decoded = jwt.verify(credentials.token, secret);
          } catch (e) {
            throw new Error("Invalid token");
          }
          if (decoded && decoded.email) {
            await connectDB();
            const user = await User.findOne({ email: decoded.email });
            if (user) {
              return {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                image: user.avatar,
              };
            }
          }
          throw new Error("Invalid deep link token");
        }

        // Standard Email/Password
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing credentials");
        }
        await connectDB();
        const user = await User.findOne({ email: credentials.email }).select("+password");
        
        if (!user) {
          throw new Error("No account found with this email");
        }
        if (!user.password) {
          throw new Error("This account was created via Google. Please sign in with Google.");
        }
        
        const isMatch = await bcrypt.compare(credentials.password, user.password);
        if (!isMatch) {
          throw new Error("Invalid password");
        }
        
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.avatar,
        };
      }
    })
  ],

  callbacks: {
    async signIn({ user }) {
      await connectDB();

      const existing = await User.findOne({ email: user.email });

      if (!existing) {
        await User.create({
          name: user.name,
          email: user.email,
          avatar: user.image,
        });
      }

      return true;
    },

    async session({ session }) {
      await connectDB();

      const dbUser = await User.findOne({ email: session.user?.email });

      if (dbUser && session.user) {
        (session.user as any).id = dbUser._id.toString();
      }

      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
