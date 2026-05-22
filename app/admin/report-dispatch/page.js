"use client";

import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { useUser } from "@/app/context/UserContext";
import ReportDispatchWorkspace from "@/components/report-dispatch/ReportDispatchWorkspace";

function roleKey(user) {
  return String(user?.executiveType || user?.roleKey || user?.userType || "")
    .trim()
    .toLowerCase();
}

export default function ReportDispatchPage() {
  const { user } = useUser();
  const role = roleKey(user);
  const scopedMode = role === "b2b" || role === "logistics";
  const searchParams = useSearchParams();
  const initialMonitorFilter = searchParams.get("monitor_filter") || "";

  return (
    <RequireAuth roles={["admin", "manager", "director", "b2b", "logistics"]}>
      <ReportDispatchWorkspace
        dispatchMode={scopedMode ? "scoped" : "admin"}
        userRole={role || "admin"}
        initialMonitorFilter={initialMonitorFilter}
      />
    </RequireAuth>
  );
}
