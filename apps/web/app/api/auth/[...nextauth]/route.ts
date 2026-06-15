import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
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
