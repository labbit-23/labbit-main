"use client";

import RequireAuth from "@/components/RequireAuth";
import ReportDispatchWorkspace from "@/components/report-dispatch/ReportDispatchWorkspace";
import { useUser } from "@/app/context/UserContext";

function roleKey(user) {
  return String(user?.executiveType || user?.roleKey || user?.userType || "")
    .trim()
    .toLowerCase();
}

export default function CollectionCentreReportDispatchPage() {
  const { user } = useUser();
  const role = roleKey(user);

  return (
    <RequireAuth roles={["b2b", "logistics", "admin", "manager", "director"]}>
      <ReportDispatchWorkspace
        dispatchMode="scoped"
        userRole={role || "b2b"}
      />
    </RequireAuth>
  );
}
