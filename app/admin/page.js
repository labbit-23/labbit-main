"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const tabs = [
  { key: "visits", label: "Visits" },
  { key: "patients", label: "Patients" },
  { key: "executives", label: "Executives" },
];

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().split("T")[0];
}

// Reusable Input wrapper for labels and error display
const InputField = ({
  label,
  children,
  required = false,
  error,
  className = "",
  ...props
}) => (
  <label className={`flex flex-col text-sm mb-2 ${className}`} {...props}>
    <span className="font-semibold">
      {label} {required && <span className="text-red-500">*</span>}
    </span>
    {children}
    {error && <span className="text-red-600 text-xs mt-1">{error}</span>}
  </label>
);

// Patient Booking Form (can be adapted for patient-facing usage)
export function PatientBookingForm({ formData, setFormData, onSubmit, errors }) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-gray-50 p-6 rounded max-w-md mx-auto shadow-md"
      noValidate
    >
      <h2 className="text-xl font-semibold mb-4 text-center">Book a Visit</h2>

      <InputField
        label="Name"
        required
        error={errors.name}
      >
        <input
          type="text"
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={formData.name || ""}
          onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
          required
          placeholder="Full name"
        />
      </InputField>

      <InputField
        label="Phone"
        required
        error={errors.phone}
      >
        <input
          type="tel"
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={formData.phone || ""}
          onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
          required
          placeholder="Phone number"
          pattern="^\+?[0-9\s\-]+$"
        />
      </InputField>

      <InputField label="Date of Birth" error={errors.dob}>
        <input
          type="date"
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={formData.dob || ""}
          onChange={(e) => setFormData((f) => ({ ...f, dob: e.target.value }))}
          max={formatDate(new Date())}
        />
      </InputField>

      <InputField label="Gender" error={errors.gender}>
        <select
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={formData.gender || ""}
          onChange={(e) => setFormData((f) => ({ ...f, gender: e.target.value }))}
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </InputField>

      <InputField label="Email" error={errors.email}>
        <input
          type="email"
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={formData.email || ""}
          onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
          placeholder="Email (optional)"
        />
      </InputField>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
      >
        Submit Booking
      </button>
    </form>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("visits");

  // General states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Visits
  const [visits, setVisits] = useState([]);
  const [visitForm, setVisitForm] = useState({
    patient_id: "",
    executive_id: "",
    lab_id: "",
    visit_date: "",
    time_slot: "",
    address: "",
    status: "booked",
  });
  const [editingVisit, setEditingVisit] = useState(null);
  const [selectedVisitIds, setSelectedVisitIds] = useState(new Set());

  // Patients
  const [patients, setPatients] = useState([]);
  const [patientForm, setPatientForm] = useState({
    name: "",
    phone: "",
    dob: "",
    gender: "",
    email: "",
  });

  // Executives
  const [executives, setExecutives] = useState([]);
  const [executiveForm, setExecutiveForm] = useState({
    name: "",
    phone: "",
    status: "active",
  });

  // Labs
  const [labs, setLabs] = useState([]);

  // Validation errors
  const [visitErrors, setVisitErrors] = useState({});
  const [patientErrors, setPatientErrors] = useState({});

  // Load all data initially
  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const execs = await supabase
        .from("executives")
        .select("id, name, phone, status")
        .order("name");
      setExecutives(execs.data || []);

      const pats = await supabase
        .from("patients")
        .select("id, name, phone, dob, gender, email")
        .order("name");
      setPatients(pats.data || []);

      const vsts = await supabase
        .from("visits")
        .select(
          `
          *,
          patient:patient_id(name, phone),
          executive:executive_id(name),
          lab:lab_id(name)
          `
        )
        .order("visit_date", { ascending: false });
      setVisits(vsts.data || []);

      const labret = await supabase.from("labs").select("id, name").order("name");
      setLabs(labret.data || []);
    } catch (e) {
      console.error(e);
      setErrorMsg("Error loading data. Check console.");
    }
    setLoading(false);
  }

  // --- Helper: Validation
  function validateVisitForm(form) {
    const errors = {};
    if (!form.patient_id) errors.patient_id = "Patient is required";
    if (!form.lab_id) errors.lab_id = "Lab is required";
    if (!form.visit_date) errors.visit_date = "Date is required";
    if (!form.time_slot) errors.time_slot = "Time slot is required";
    if (!form.address) errors.address = "Address is required";
    return errors;
  }

  function validatePatientForm(form) {
    const errors = {};
    if (!form.name) errors.name = "Name is required";
    if (!form.phone) errors.phone = "Phone is required";
    return errors;
  }

  // --- Visits CRUD and handling

  async function handleVisitFormSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);

    const normalizedVisitForm = {
      ...visitForm,
      patient_id: visitForm.patient_id || null,
      executive_id: visitForm.executive_id || null,
      lab_id: visitForm.lab_id || null,
      visit_date: visitForm.visit_date || null,
      time_slot: visitForm.time_slot?.trim() || null,
      address: visitForm.address?.trim() || null,
      status: visitForm.status || "booked",
    };

    const errors = validateVisitForm(normalizedVisitForm);
    setVisitErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      if (editingVisit) {
        const { error } = await supabase
          .from("visits")
          .update(normalizedVisitForm)
          .eq("id", editingVisit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("visits").insert([normalizedVisitForm]);
        if (error) throw error;
      }

      setVisitForm({
        patient_id: "",
        executive_id: "",
        lab_id: "",
        visit_date: "",
        time_slot: "",
        address: "",
        status: "booked",
      });
      setEditingVisit(null);
      setSelectedVisitIds(new Set());
      await fetchAll();
    } catch (error) {
      setErrorMsg("Failed to save visit: " + (error.message || JSON.stringify(error)));
      console.error("Insert/update visit error:", error);
    }
    setLoading(false);
  }

  function handleVisitEdit(visit) {
    setEditingVisit(visit);
    setVisitForm({
      patient_id: visit.patient_id || "",
      executive_id: visit.executive_id || "",
      lab_id: visit.lab_id || "",
      visit_date: formatDate(visit.visit_date),
      time_slot: visit.time_slot || "",
      address: visit.address || "",
      status: visit.status || "booked",
    });
  }

  async function handleVisitDelete(visit) {
    if (!window.confirm("Delete this visit?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").delete().eq("id", visit.id);
      if (error) throw error;
      await fetchAll();
    } catch (e) {
      setErrorMsg("Failed to delete visit.");
      console.error(e);
    }
    setLoading(false);
  }

  async function handleVisitStatusChange(visit, status) {
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").update({ status }).eq("id", visit.id);
      if (error) throw error;
      await fetchAll();
    } catch (e) {
      setErrorMsg("Failed to update visit status.");
      console.error(e);
    }
    setLoading(false);
  }

  // Bulk select toggling for visits
  function toggleVisitSelection(id) {
    setSelectedVisitIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  function toggleSelectAllVisits() {
    if (selectedVisitIds.size === visits.length) setSelectedVisitIds(new Set());
    else setSelectedVisitIds(new Set(visits.map((v) => v.id)));
  }

  // --- Patients Management

  async function handlePatientFormSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);

    const errors = validatePatientForm(patientForm);
    setPatientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("patients").insert([patientForm]);
      if (error) throw error;
      setPatientForm({
        name: "",
        phone: "",
        dob: "",
        gender: "",
        email: "",
      });
      await fetchAll();
    } catch (e) {
      setErrorMsg("Failed to add patient.");
      console.error(e);
    }
    setLoading(false);
  }

  // --- Executives Management

  async function handleExecutiveFormSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.from("executives").insert([executiveForm]);
      if (error) throw error;
      setExecutiveForm({
        name: "",
        phone: "",
        status: "active",
      });
      await fetchAll();
    } catch (e) {
      setErrorMsg("Failed to add executive.");
      console.error(e);
    }
    setLoading(false);
  }

  async function handleExecutiveStatusChange(executive, status) {
    setLoading(true);
    try {
      const { error } = await supabase.from("executives").update({ status }).eq("id", executive.id);
      if (error) throw error;
      await fetchAll();
    } catch (e) {
      setErrorMsg("Failed to update executive.");
      console.error(e);
    }
    setLoading(false);
  }

  // --- UI Components ---

  const tabButton = (t) => (
    <button
      key={t.key}
      aria-selected={tab === t.key}
      role="tab"
      className={`px-4 py-2 border-b-4 font-semibold ${
        tab === t.key
          ? "border-blue-700 text-blue-700"
          : "border-transparent hover:text-blue-600"
      }`}
      onClick={() => setTab(t.key)}
    >
      {t.label}
    </button>
  );

  // Render check or cross icon based on condition
  const yesNoIcon = (bool) =>
    bool ? (
      <FiCheckCircle className="text-green-500 inline-block" aria-label="Yes" />
    ) : (
      <FiXCircle className="text-red-500 inline-block" aria-label="No" />
    );

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-4xl mb-6 font-extrabold text-center">Admin Dashboard</h1>

      <div role="tablist" className="flex space-x-4 border-b mb-6">
        {tabs.map(tabButton)}
      </div>

      {errorMsg && (
        <div className="mb-4 px-4 py-3 bg-red-100 text-red-700 rounded border border-red-400">
          {errorMsg}
        </div>
      )}

      {loading && (
        <div className="text-center text-gray-600 mb-6" role="status" aria-live="polite">
          Loading...
        </div>
      )}

      {/* Visits Tab */}
      {tab === "visits" && (
        <>
          <form
            onSubmit={handleVisitFormSubmit}
            className="mb-6 bg-white p-6 rounded shadow space-y-4"
            aria-label="Create or Edit Visit"
            noValidate
          >
            <h2 className="text-xl font-semibold mb-4">
              {editingVisit ? "Edit Visit" : "Create New Visit"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Patient"
                required
                error={visitErrors.patient_id}
              >
                <select
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-required="true"
                  value={visitForm.patient_id}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, patient_id: e.target.value }))
                  }
                >
                  <option value="">Select Patient</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone})
                    </option>
                  ))}
                </select>
              </InputField>

              <InputField label="HV Executive">
                <select
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={visitForm.executive_id}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, executive_id: e.target.value }))
                  }
                >
                  <option value="">Unassigned</option>
                  {executives.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.status})
                    </option>
                  ))}
                </select>
              </InputField>

              <InputField label="Lab" required error={visitErrors.lab_id}>
                <select
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-required="true"
                  value={visitForm.lab_id}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, lab_id: e.target.value }))
                  }
                >
                  <option value="">Select Lab</option>
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </InputField>

              <InputField label="Visit Date" required error={visitErrors.visit_date}>
                <input
                  type="date"
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-required="true"
                  value={visitForm.visit_date}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, visit_date: e.target.value }))
                  }
                  max={formatDate(new Date())}
                />
              </InputField>

              <InputField label="Time Slot" required error={visitErrors.time_slot}>
                <input
                  type="text"
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-required="true"
                  placeholder="e.g. 8:00–10:00 AM"
                  value={visitForm.time_slot}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, time_slot: e.target.value }))
                  }
                />
              </InputField>

              <InputField label="Address" required error={visitErrors.address} className="sm:col-span-2">
                <input
                  type="text"
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
                  aria-required="true"
                  value={visitForm.address}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </InputField>

              <InputField label="Status">
                <select
                  className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={visitForm.status}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {[
                    "booked",
                    "accepted",
                    "postponed",
                    "rejected",
                    "pending",
                    "in_progress",
                    "sample_picked",
                    "sample_dropped",
                  ].map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {statusOption.replace(/_/g, " ").toUpperCase()}
                    </option>
                  ))}
                </select>
              </InputField>
            </div>

            <div className="flex justify-end space-x-4">
              {editingVisit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVisit(null);
                    setVisitForm({
                      patient_id: "",
                      executive_id: "",
                      lab_id: "",
                      visit_date: "",
                      time_slot: "",
                      address: "",
                      status: "booked",
                    });
                    setVisitErrors({});
                  }}
                  className="px-4 py-2 rounded border text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white rounded px-6 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingVisit ? "Update Visit" : "Create Visit"}
              </button>
            </div>
          </form>

          {/* Visits Table */}
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="w-full table-auto border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 p-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all visits"
                      checked={selectedVisitIds.size === visits.length && visits.length > 0}
                      onChange={toggleSelectAllVisits}
                    />
                  </th>
                  <th className="border border-gray-300 p-2 text-left">Visit Code</th>
                  <th className="border border-gray-300 p-2 text-left">Date</th>
                  <th className="border border-gray-300 p-2 text-left">Time Slot</th>
                  <th className="border border-gray-300 p-2 text-left">Patient</th>
                  <th className="border border-gray-300 p-2 text-left">HV Executive</th>
                  <th className="border border-gray-300 p-2 text-left">Lab</th>
                  <th className="border border-gray-300 p-2 text-left">Status</th>
                  <th className="border border-gray-300 p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visits.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-gray-500">
                      No visits found.
                    </td>
                  </tr>
                )}
                {visits.map((v) => (
                  <tr
                    key={v.id}
                    className={selectedVisitIds.has(v.id) ? "bg-blue-50" : ""}
                  >
                    <td className="border border-gray-300 p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select visit ${v.visit_code}`}
                        checked={selectedVisitIds.has(v.id)}
                        onChange={() => toggleVisitSelection(v.id)}
                      />
                    </td>
                    <td className="border border-gray-300 p-2">{v.visit_code || "N/A"}</td>
                    <td className="border border-gray-300 p-2">{formatDate(v.visit_date)}</td>
                    <td className="border border-gray-300 p-2">{v.time_slot}</td>
                    <td className="border border-gray-300 p-2">{v.patient?.name || "Unknown"}</td>
                    <td className="border border-gray-300 p-2">
                      {v.executive?.name || (
                        <span className="italic text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="border border-gray-300 p-2">{v.lab?.name || "N/A"}</td>
                    <td className="border border-gray-300 p-2 capitalize">{v.status}</td>
                    <td className="border border-gray-300 p-2 text-center space-x-2">
                      <button
                        onClick={() => handleVisitEdit(v)}
                        className="text-blue-600 hover:underline focus:outline-none"
                        aria-label={`Edit visit ${v.visit_code}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleVisitDelete(v)}
                        className="text-red-600 hover:underline focus:outline-none"
                        aria-label={`Delete visit ${v.visit_code}`}
                      >
                        Delete
                      </button>
                      <select
                        aria-label={`Change status of visit ${v.visit_code}`}
                        className="border rounded p-1 text-sm"
                        value={v.status}
                        onChange={(e) => handleVisitStatusChange(v, e.target.value)}
                      >
                        {[
                          "booked",
                          "accepted",
                          "postponed",
                          "rejected",
                          "pending",
                          "in_progress",
                          "sample_picked",
                          "sample_dropped",
                        ].map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Patients Tab */}
      {tab === "patients" && (
        <>
          <form
            className="mb-6 bg-white p-6 rounded shadow space-y-4 max-w-lg"
            onSubmit={handlePatientFormSubmit}
            noValidate
            aria-label="Add new patient"
          >
            <h2 className="text-xl font-semibold mb-4">Add New Patient</h2>

            <InputField label="Name" required error={patientErrors.name}>
              <input
                type="text"
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={patientForm.name}
                onChange={(e) =>
                  setPatientForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </InputField>

            <InputField label="Phone" required error={patientErrors.phone}>
              <input
                type="tel"
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={patientForm.phone}
                onChange={(e) =>
                  setPatientForm((f) => ({ ...f, phone: e.target.value }))
                }
                required
              />
            </InputField>

            <InputField label="Date of Birth">
              <input
                type="date"
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={patientForm.dob}
                onChange={(e) =>
                  setPatientForm((f) => ({ ...f, dob: e.target.value }))
                }
                max={formatDate(new Date())}
              />
            </InputField>

            <InputField label="Gender">
              <select
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={patientForm.gender}
                onChange={(e) =>
                  setPatientForm((f) => ({ ...f, gender: e.target.value }))
                }
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </InputField>

            <InputField label="Email">
              <input
                type="email"
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={patientForm.email}
                onChange={(e) =>
                  setPatientForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="Optional"
              />
            </InputField>

            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Patient
            </button>
          </form>

          <div className="overflow-x-auto bg-white rounded shadow">
            <table className="w-full table-auto border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 p-2 text-left">Name</th>
                  <th className="border border-gray-300 p-2 text-left">Phone</th>
                  <th className="border border-gray-300 p-2 text-left">DOB</th>
                  <th className="border border-gray-300 p-2 text-left">Gender</th>
                  <th className="border border-gray-300 p-2 text-left">Email</th>
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      No patients found.
                    </td>
                  </tr>
                )}
                {patients.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-100">
                    <td className="border border-gray-300 p-2">{p.name}</td>
                    <td className="border border-gray-300 p-2">{p.phone}</td>
                    <td className="border border-gray-300 p-2">{formatDate(p.dob)}</td>
                    <td className="border border-gray-300 p-2 capitalize">{p.gender}</td>
                    <td className="border border-gray-300 p-2">{p.email || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Executives Tab */}
      {tab === "executives" && (
        <>
          <form
            className="mb-6 bg-white p-6 rounded shadow space-y-4 max-w-lg"
            onSubmit={handleExecutiveFormSubmit}
            noValidate
            aria-label="Add new executive"
          >
            <h2 className="text-xl font-semibold mb-4">Add New HV Executive</h2>

            <InputField label="Name" required>
              <input
                type="text"
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
                value={executiveForm.name}
                onChange={(e) =>
                  setExecutiveForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </InputField>

            <InputField label="Phone" required>
              <input
                type="tel"
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
                value={executiveForm.phone}
                onChange={(e) =>
                  setExecutiveForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </InputField>

            <InputField label="Status">
              <select
                className="border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={executiveForm.status}
                onChange={(e) =>
                  setExecutiveForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="active">Active</option>
                <option value="available">Available</option>
                <option value="inactive">Inactive</option>
              </select>
            </InputField>

            <button
              type="submit"
              disabled={loading}
              className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Executive
            </button>
          </form>

          <div className="overflow-x-auto bg-white rounded shadow">
            <table className="w-full table-auto border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 p-2 text-left">Name</th>
                  <th className="border border-gray-300 p-2 text-left">Phone</th>
                  <th className="border border-gray-300 p-2 text-left">Status</th>
                  <th className="border border-gray-300 p-2 text-left">Change Status</th>
                </tr>
              </thead>
              <tbody>
                {executives.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">
                      No executives found.
                    </td>
                  </tr>
                )}
                {executives.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-100">
                    <td className="border border-gray-300 p-2">{e.name}</td>
                    <td className="border border-gray-300 p-2">{e.phone}</td>
                    <td className="border border-gray-300 p-2 capitalize">{e.status}</td>
                    <td className="border border-gray-300 p-2">
                      <select
                        className="border rounded p-1 text-sm w-full"
                        value={e.status}
                        onChange={(ev) =>
                          handleExecutiveStatusChange(e, ev.target.value)
                        }
                      >
                        <option value="active">Active</option>
                        <option value="available">Available</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
