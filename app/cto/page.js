import RequireAuth from "../../components/RequireAuth";
import CtoDashboardPage from "./CtoDashboardPage";

export default function CtoPage() {
  return (
    <RequireAuth roles={["director", "director_ceo"]}>
      <CtoDashboardPage defaultDashboardTab="management" />
    </RequireAuth>
  );
}
