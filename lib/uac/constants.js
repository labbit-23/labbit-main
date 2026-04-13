export const UAC_MANAGED_ROLES = [
  "director",
  "admin",
  "manager",
  "executive",
  "viewer",
  "integration_tester"
];

export const UAC_PERMISSION_CATALOG = [
  {
    group: "Patients",
    permissions: ["patients.create", "patients.update", "patients.update_identity"]
  },
  {
    group: "Visits",
    permissions: ["visits.create", "visits.update"]
  },
  {
    group: "Quick Bookings",
    permissions: ["quickbook.update"]
  },
  {
    group: "Executives",
    permissions: ["executives.status.update"]
  },
  {
    group: "WhatsApp",
    permissions: ["whatsapp.reply"]
  },
  {
    group: "Reports",
    permissions: ["reports.dispatch"]
  },
  {
    group: "Simulator",
    permissions: ["simulator.read", "simulator.send", "simulator.reset"]
  }
];

export const UAC_ALL_PERMISSION_KEYS = UAC_PERMISSION_CATALOG.flatMap((group) => group.permissions);
