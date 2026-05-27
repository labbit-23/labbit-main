import RequireAuth from "../../components/RequireAuth";
import CtoDashboardPage from "./CtoDashboardPage";

export default function CtoPage() {
  return (
    <RequireAuth roles={["director"]}>
      <CtoDashboardPage />
    </RequireAuth>
  );
}
