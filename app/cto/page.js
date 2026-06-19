"use client";

import { useUser } from "@/app/context/UserContext";
import RequireAuth from "../../components/RequireAuth";
import CtoDashboardPage from "./CtoDashboardPage";

function roleKeyFromUser(user) {
  if (!user) return "";
  if (user.userType === "executive") {
    return String(user.executiveType || user.roleKey || "").toLowerCase().trim();
  }
  return String(user.userType || user.roleKey || "").toLowerCase().trim();
}

function CtoPageContent() {
  const { user } = useUser();
  const roleKey = roleKeyFromUser(user);

  // director_ceo sees management metrics first, director sees CTO ops
  const defaultTab = roleKey === "director_ceo" ? "management" : "cto";

  return <CtoDashboardPage defaultDashboardTab={defaultTab} />;
}

export default function CtoPage() {
  return (
    <RequireAuth roles={["director", "director_ceo"]}>
      <CtoPageContent />
    </RequireAuth>
  );
}
