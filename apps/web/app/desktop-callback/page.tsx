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
      <p id="auth-status" className="text-[#ECE7E3]/60 mb-10 max-w-md text-sm">
        Handing off session to LifeOS Desktop...
      </p>
      
      {/* Execute dual-channel deep link / loopback callback to pass token back */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var token = ${JSON.stringify(token)};
              var statusEl = document.getElementById("auth-status");
              
              // 1. Send token directly to Electron local loopback server (bypasses Windows protocol registration issues)
              fetch("http://127.0.0.1:3457/auth-callback?token=" + encodeURIComponent(token), { mode: "cors" })
                .then(function(res) { return res.json(); })
                .then(function() {
                  if (statusEl) {
                    statusEl.textContent = "Authenticated! Switched back to LifeOS Desktop. You can close this tab.";
                  }
                })
                .catch(function() {
                  // 2. If loopback is unreachable, fallback to protocol handler
                  if (statusEl) {
                    statusEl.textContent = "Redirecting to LifeOS Desktop via system protocol...";
                  }
                  setTimeout(function() {
                    window.location.href = "lifeos://auth?token=" + encodeURIComponent(token);
                  }, 300);
                });
            })();
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
