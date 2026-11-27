import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export interface AdminSessionResult {
  authorized: true;
  userId: string;
  email: string;
  name?: string;
}

export function getAllowedAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const allowlist = getAllowedAdminEmails();
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/**
 * Fail-closed admin session guard for all /admin/** and /api/admin/** routes.
 * Dev override requires explicit ALLOW_DEV_ADMIN_BYPASS=true AND NODE_ENV !== "production"
 * AND a valid authenticated session.
 */
export async function requireAdminSession(): Promise<
  { ok: true; session: AdminSessionResult } | { ok: false; response: NextResponse }
> {
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id;
  const email = (session?.user as any)?.email as string | undefined;

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized: Admin authentication required." },
        { status: 401 }
      ),
    };
  }

  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_ADMIN_BYPASS === "true";

  if (!devBypass && !isAdminEmailAllowed(email)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Account is not in ADMIN_EMAILS allowlist." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    session: {
      authorized: true,
      userId: String(userId),
      email: email || "",
      name: (session?.user as any)?.name,
    },
  };
}
