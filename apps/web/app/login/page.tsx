import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen w-full bg-[#111113] flex items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient background warmth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#D98B2B]/5 rounded-full blur-[140px] pointer-events-none" />
      <LoginForm />
    </main>
  );
}
