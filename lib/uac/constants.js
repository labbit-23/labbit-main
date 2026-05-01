export const UAC_MANAGED_ROLES = [
  "director",
  "admin",
  "manager",
  "agent",
  "executive",
  "viewer",
  "integration_tester"
];

export const UAC_PERMISSION_CATALOG = [
  {
    group: "Admin",
    permissions: ["uac.view", "uac.manage"]
  },
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
    permissions: [
      "reports.setup",
      "reports.run.mis",
      "reports.run.transaction",
      "reports.logs.view",
      "reports.dispatch",
      "reports.auto_dispatch.view",
      "reports.auto_dispatch.push",
      "reports.auto_dispatch.send_to",
      "reports.auto_dispatch.pause",
      "reports.auto_dispatch.pause_all"
    ]
  },
  {
    group: "Shivam Tools",
    permissions: [
      "shivam.tools.view",
      "shivam.demographics.update",
      "shivam.demographics.update_identity",
      "shivam.pricelist.sync"
    ]
  },
  {
    group: "CTO",
    permissions: ["cto.view"]
  },
  {
    group: "Simulator",
    permissions: ["simulator.read", "simulator.send", "simulator.reset"]
  }
];

export const UAC_ALL_PERMISSION_KEYS = UAC_PERMISSION_CATALOG.flatMap((group) => group.permissions);
