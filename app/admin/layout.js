import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { ironOptions } from "../../lib/session";
import { cookies } from "next/headers";   // <-- Add this import

export default async function AdminLayout({ children }) {
  const cookieStore = await cookies();

  const session = await getIronSession(cookieStore, ironOptions);

const allowedAdminExecTypes = ["admin", "manager", "director"];

if (
  !session.user ||
  !(
    session.user.userType === "admin" ||
    (session.user.userType === "executive" &&
      allowedAdminExecTypes.includes(
        (session.user.executiveType || "").toLowerCase()
      ))
  )
) {
  redirect("/login");
}


  return <>{children}</>;
}
