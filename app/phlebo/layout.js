import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { ironOptions, isSessionValid } from "../../lib/session";
import { cookies } from "next/headers";

export default async function PhleboLayout({ children }) {
  // Get the cookie store like admin/layout.js
  const cookieStore = await cookies();

  // Use the cookie store directly here (like in admin/layout.js)
  const session = await getIronSession(cookieStore, ironOptions);

  const roleKey =
    session.user?.userType === "executive"
      ? (session.user.executiveType || "").toLowerCase()
      : session.user?.userType;

  // Must match the same validity rule as /api/me and middleware.js's idle
  // timeout (isSessionValid) -- not just "does session.user exist". Without
  // this, a session middleware.js already treats as idle-expired (e.g. one
  // reached via a client-side navigation-cache hit that skips a fresh
  // middleware pass) could still render this layout, letting YourDayView's
  // pollers spin up against an already-dead session and 401-loop.
  const isAllowed = isSessionValid(session) && roleKey === "phlebo";

  if (!isAllowed) {
    redirect("/login");
  }

  return <>{children}</>;
}
