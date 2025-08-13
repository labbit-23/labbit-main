import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { ironOptions } from "../../lib/session";
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

  const isAllowed = session.user && roleKey === "phlebo";

  if (!isAllowed) {
    redirect("/login");
  }

  return <>{children}</>;
}
