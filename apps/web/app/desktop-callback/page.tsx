import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import jwt from "jsonwebtoken";

export default async function DesktopCallbackPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#161618] text-white">
        <p>Authentication failed. Please try again.</p>
      </div>
    );
  }

  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret-key-12345";
  const token = jwt.sign({ id: (session.user as any).id, email: session.user.email }, secret, { expiresIn: '5m' });

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[#161618] text-white font-sans text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-[rgba(232,65,74,0.1)] border border-[rgba(232,65,74,0.3)] flex items-center justify-center mb-6">
         <div className="w-8 h-8 rounded-full bg-[#E8414A]"></div>
      </div>
      <h1 className="text-2xl font-bold mb-4 tracking-wider uppercase">Authentication Successful</h1>
      <p className="text-[#ECE7E3]/60 mb-10 max-w-md text-sm">
        You are now securely logged into LifeOS. You may close this browser window and return to the application.
      </p>
      
      {/* Execute deep link to pass token back to Tauri */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            setTimeout(function() {
              window.location.href = "lifeos://auth?token=${token}";
            }, 500);
          `,
        }}
      />
      
      <a 
        href={`lifeos://auth?token=${token}`}
        className="px-6 py-3 bg-[#1F2023] border border-[#2A2B2F] rounded-xl text-white font-bold text-sm hover:bg-[#2A2B2F] transition-colors"
      >
        Click here if not redirected automatically
      </a>
    </div>
  );
}
