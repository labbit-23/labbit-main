//app/phlebo/layout.js

import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { ironOptions } from "../../lib/session";
import { cookies } from "next/headers";

export default async function PhleboLayout({ children }) {
  const cookieStore = await cookies();
  const session = await getIronSession(cookieStore, ironOptions);

  const roleKey =
    session.user?.userType === "executive"
      ? (session.user.executiveType || "").toLowerCase()
      : session.user?.userType;

  const isAllowed = session.user && roleKey === "phlebo";

  if (!isAllowed) {
    redirect("/login");
  }

  return children;
}
