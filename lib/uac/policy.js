const ROLE_PERMISSIONS = {
  director: ["*"],
  admin: [
    "patients.create",
    "patients.update",
    "visits.create",
    "visits.update",
    "quickbook.update",
    "executives.status.update",
    "whatsapp.reply",
    "reports.dispatch"
  ],
  manager: [
    "patients.create",
    "patients.update",
    "visits.create",
    "visits.update",
    "quickbook.update",
    "whatsapp.reply",
    "reports.dispatch"
  ],
  executive: ["whatsapp.reply"],
  viewer: [],
  integration_tester: ["simulator.read", "simulator.send", "simulator.reset"]
};

export function resolveRoleKey(user = {}) {
  const role = String(
    user?.roleKey || user?.executiveType || (user?.userType === "admin" ? "admin" : user?.userType) || ""
  )
    .trim()
    .toLowerCase();
  return role || "viewer";
}

export function listPermissionsForRole(roleKey = "viewer") {
  return ROLE_PERMISSIONS[String(roleKey || "").toLowerCase()] || [];
}

export function hasPermission(user, permission) {
  const granted = listPermissionsForRole(resolveRoleKey(user));
  if (granted.includes("*")) return true;
  return granted.includes(String(permission || "").trim());
}

export const UAC_POLICY = ROLE_PERMISSIONS;
