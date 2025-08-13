// File: /lib/modalFieldSettings.js
export const modalFieldSettings = {
  VisitModal: {
    patient: {
      hiddenFields: ["executive_id", "status"],
      readOnlyFields: ["patient_id"],
      defaultValues: {
        status: "unassigned",
      },
    },
    phlebo: {
      hiddenFields: [],
      readOnlyFields: ["patient_id", "status", "executive_id"],
      defaultValues: {
        status: "booked",
        executive_id: "self", // special placeholder handled in code
      },
    },
    admin: {
      hiddenFields: [],
      readOnlyFields: [],
      defaultValues: {},
    },
  },
};

export function getModalFieldSettings(modalName, role) {
  console.log("[getModalFieldSettings] called with modalName:", modalName, "role:", role);
  const config = modalFieldSettings[modalName];
  console.log("[getModalFieldSettings] config keys:", config ? Object.keys(config) : null);
  if (!config) return { hiddenFields: ["patient_id"], readOnlyFields: [], defaultValues: {} };
  const roleConfig = config[role];
  console.log("[getModalFieldSettings] matched role config:", roleConfig);
  return roleConfig || { hiddenFields: [], readOnlyFields: [], defaultValues: {} };
}
