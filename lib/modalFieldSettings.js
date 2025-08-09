// File: /lib/modalFieldSettings.js

export const modalFieldSettings = {
  VisitModal: {
    patient: {
      hiddenFields: ["executive_id"],        // Patient should not set/select executive
      readOnlyFields: ["status", "patient_id"], // Patient cannot modify status or switch patient_id
      defaultValues: {
        status: "booked",                      // Patient visits default to 'booked' status
      },
    },
    phlebo: {
      hiddenFields: [],
      readOnlyFields: ["patient_id"],         // Phlebo cannot change patient
      defaultValues: {},
    },
    admin: {
      hiddenFields: [],
      readOnlyFields: [],
      defaultValues: {},
    },
  },

  // Other modals may go here...
};

export function getModalFieldSettings(modalName, role) {
  const config = modalFieldSettings[modalName];
  if (!config) return { hiddenFields: [], readOnlyFields: [], defaultValues: {} };
  return config[role] || { hiddenFields: [], readOnlyFields: [], defaultValues: {} };
}