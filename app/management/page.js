import RequireAuth from "../../components/RequireAuth";
import CtoDashboardPage from "../cto/CtoDashboardPage";

export default function ManagementPage() {
  return (
    <RequireAuth roles={["director_ceo", "director"]}>
      <CtoDashboardPage
        defaultDashboardTab="management"
        allowCtoTab={false}
        showCtoTools={false}
        titleBadge="Management View"
        subtitle="Executive metrics across WhatsApp dispatches, visits, and operational health"
      />
    </RequireAuth>
  );
}
