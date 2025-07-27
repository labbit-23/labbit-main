"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

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

export default function AdminDashboard() {
  // Tabs
  const [tab, setTab] = useState("visits");

  // General
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

  // Labs (for visit creation)
  const [labs, setLabs] = useState([]);

  // Fetch all data
  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const execs = await supabase.from("executives").select("id, name, phone, status");
      setExecutives(execs.data || []);
      const pats = await supabase.from("patients").select("id, name, phone, dob, gender, email");
      setPatients(pats.data || []);
      const vsts = await supabase
        .from("visits")
        .select(
          `*,
            patient:patient_id(name, phone),
            executive:executive_id(name),
            lab:lab_id(name)`
        )
        .order("visit_date", { ascending: false });
      setVisits(vsts.data || []);
      const labret = await supabase.from("labs").select("id, name");
      setLabs(labret.data || []);
    } catch (e) {
      setErrorMsg("Failed to load some data. See console.");
      console.error(e);
    }
    setLoading(false);
  }

  // Visits CRUD
  async function handleVisitFormSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingVisit) {
        // Update visit
        const { error } = await supabase
          .from("visits")
          .update(visitForm)
          .eq("id", editingVisit.id);
        if (error) throw error;
      } else {
        // Create new visit
        const { error } = await supabase.from("visits").insert([visitForm]);
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
      fetchAll();
    } catch (error) {
      setErrorMsg("Failed to save visit.");
      console.error(error);
    }
    setLoading(false);
  }

  function handleVisitEdit(v) {
    setEditingVisit(v);
    setVisitForm({
      patient_id: v.patient_id || "",
      executive_id: v.executive_id || "",
      lab_id: v.lab_id || "",
      visit_date: formatDate(v.visit_date),
      time_slot: v.time_slot || "",
      address: v.address || "",
      status: v.status || "booked",
    });
  }

  async function handleVisitDelete(v) {
    if (!window.confirm("Delete this visit?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").delete().eq("id", v.id);
      if (error) throw error;
      fetchAll();
    } catch (e) {
      setErrorMsg("Failed to delete visit.");
      console.error(e);
    }
    setLoading(false);
  }

  async function handleVisitStatusChange(v, status) {
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").update({ status }).eq("id", v.id);
      if (error) throw error;
      fetchAll();
    } catch (e) {
      setErrorMsg("Failed to update visit status.");
      console.error(e);
    }
    setLoading(false);
  }

  // Patients CRUD
  async function handlePatientFormSubmit(e) {
    e.preventDefault();
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
      fetchAll();
    } catch (e) {
      setErrorMsg("Failed to add patient.");
      console.error(e);
    }
    setLoading(false);
  }

  // Executives CRUD
  async function handleExecutiveFormSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("executives").insert([executiveForm]);
      if (error) throw error;
      setExecutiveForm({
        name: "",
        phone: "",
        status: "active",
      });
      fetchAll();
    } catch (e) {
      setErrorMsg("Failed to add executive.");
      console.error(e);
    }
    setLoading(false);
  }

  async function handleExecutiveStatusChange(executive, status) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("executives")
        .update({ status })
        .eq("id", executive.id);
      if (error) throw error;
      fetchAll();
    } catch (e) {
      setErrorMsg("Failed to update executive.");
      console.error(e);
    }
    setLoading(false);
  }

  // Utility
  function tabButton(t) {
    return (
      <button
        key={t.key}
        className={`px-4 py-2 border-b-2 ${
          tab === t.key ? "border-blue-600 font-bold" : "border-transparent"
        }`}
        onClick={() => setTab(t.key)}
      >
        {t.label}
      </button>
    );
  }

  // --- RENDER ---
  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Admin Dashboard</h1>
      <div className="flex gap-4 mb-6 border-b">{tabs.map(tabButton)}</div>
      {errorMsg && <div className="mb-4 text-red-600">{errorMsg}</div>}
      {loading && <div className="mb-4 text-gray-500">Loading...</div>}

      {/* Visits Tab */}
      {tab === "visits" && (
        <section>
          <h2 className="text-xl font-bold mb-2">Visits</h2>
          <form
            className="bg-gray-100 p-4 mb-6 rounded flex flex-wrap gap-4 items-end"
            onSubmit={handleVisitFormSubmit}
          >
            <div>
              <label className="block text-xs">Patient</label>
              <select
                className="border p-2 rounded"
                required
                value={visitForm.patient_id}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, patient_id: e.target.value }))
                }
              >
                <option value="">Select</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs">Executive</label>
              <select
                className="border p-2 rounded"
                value={visitForm.executive_id}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, executive_id: e.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {executives.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs">Lab</label>
              <select
                className="border p-2 rounded"
                required
                value={visitForm.lab_id}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, lab_id: e.target.value }))
                }
              >
                <option value="">Select</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs">Date</label>
              <input
                type="date"
                className="border p-2 rounded"
                required
                value={visitForm.visit_date}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, visit_date: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs">Time Slot</label>
              <input
                type="text"
                className="border p-2 rounded"
                required
                placeholder="8:00–10:00 AM"
                value={visitForm.time_slot}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, time_slot: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs">Address</label>
              <input
                type="text"
                className="border p-2 rounded"
                required
                value={visitForm.address}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs">Status</label>
              <select
                className="border p-2 rounded"
                value={visitForm.status}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="booked">Booked</option>
                <option value="accepted">Accepted</option>
                <option value="postponed">Postponed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded ml-2"
            >
              {editingVisit ? "Update Visit" : "Create Visit"}
            </button>
            {editingVisit && (
              <button
                type="button"
                className="ml-2 text-gray-700 underline"
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
                }}
              >
                Cancel
              </button>
            )}
          </form>
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-200">
                  <th>Visit Code</th>
                  <th>Date</th>
                  <th>Time Slot</th>
                  <th>Patient</th>
                  <th>Executive</th>
                  <th>Lab</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td>{v.visit_code}</td>
                    <td>{formatDate(v.visit_date)}</td>
                    <td>{v.time_slot}</td>
                    <td>{v.patient?.name}</td>
                    <td>{v.executive?.name || "Unassigned"}</td>
                    <td>{v.lab?.name}</td>
                    <td>
                      <span className="capitalize">{v.status}</span>
                    </td>
                    <td>
                      <button
                        className="text-blue-600 underline mr-2"
                        onClick={() => handleVisitEdit(v)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 underline mr-2"
                        onClick={() => handleVisitDelete(v)}
                      >
                        Delete
                      </button>
                      <select
                        className="border p-1 text-sm"
                        value={v.status}
                        onChange={(e) =>
                          handleVisitStatusChange(v, e.target.value)
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
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {visits.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-500 p-4">
                      No visits found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Patients Tab */}
      {tab === "patients" && (
        <section>
          <h2 className="text-xl font-bold mb-2">Patients</h2>
          <form
            className="bg-gray-100 p-4 mb-6 rounded flex flex-wrap gap-4 items-end"
            onSubmit={handlePatientFormSubmit}
          >
            <input
              type="text"
              className="border p-2 rounded"
              required
              placeholder="Name"
              value={patientForm.name}
              onChange={(e) =>
                setPatientForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <input
              type="text"
              className="border p-2 rounded"
              required
              placeholder="Phone"
              value={patientForm.phone}
              onChange={(e) =>
                setPatientForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
            <input
              type="date"
              className="border p-2 rounded"
              placeholder="DOB"
              value={patientForm.dob}
              onChange={(e) =>
                setPatientForm((f) => ({ ...f, dob: e.target.value }))
              }
            />
            <select
              className="border p-2 rounded"
              required
              value={patientForm.gender}
              onChange={(e) =>
                setPatientForm((f) => ({ ...f, gender: e.target.value }))
              }
            >
              <option value="">Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <input
              type="email"
              className="border p-2 rounded"
              placeholder="Email"
              value={patientForm.email}
              onChange={(e) =>
                setPatientForm((f) => ({ ...f, email: e.target.value }))
              }
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Add Patient
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-200">
                  <th>Name</th>
                  <th>Phone</th>
                  <th>DOB</th>
                  <th>Gender</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.phone}</td>
                    <td>{formatDate(p.dob)}</td>
                    <td>{p.gender}</td>
                    <td>{p.email}</td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 p-4">
                      No patients found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Executives Tab */}
      {tab === "executives" && (
        <section>
          <h2 className="text-xl font-bold mb-2">HV Executives</h2>
          <form
            className="bg-gray-100 p-4 mb-6 rounded flex flex-wrap gap-4 items-end"
            onSubmit={handleExecutiveFormSubmit}
          >
            <input
              type="text"
              className="border p-2 rounded"
              required
              placeholder="Name"
              value={executiveForm.name}
              onChange={(e) =>
                setExecutiveForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <input
              type="text"
              className="border p-2 rounded"
              required
              placeholder="Phone"
              value={executiveForm.phone}
              onChange={(e) =>
                setExecutiveForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
            <select
              className="border p-2 rounded"
              value={executiveForm.status}
              onChange={(e) =>
                setExecutiveForm((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="active">Active</option>
              <option value="available">Available</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Add Executive
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-200">
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Change Status</th>
                </tr>
              </thead>
              <tbody>
                {executives.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.phone}</td>
                    <td>{e.status}</td>
                    <td>
                      <select
                        className="border p-1 text-sm"
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
                {executives.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-gray-500 p-4">
                      No executives found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
