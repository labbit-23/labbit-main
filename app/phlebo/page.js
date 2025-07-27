"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { FiRefreshCw } from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (date) => date.toISOString().split("T")[0];

const PhleboPage = () => {
  const [executives, setExecutives] = useState([]);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [visits, setVisits] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchExecutives = async () => {
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("executives")
        .select("id, name, status")
        .in("status", ["active", "available"]);

      if (error) throw error;
      console.log("Executives fetched:", data);
      setExecutives(data);
      setSelectedExecutive(data[0]?.id ?? null);
    } catch (error) {
      console.error("Error fetching executives:", error);
      setErrorMsg("Failed to load executives.");
    }
  };

const fetchVisits = async () => {
  if (!selectedExecutive) {
    setVisits([]);
    return;
  }
  setLoading(true);
  setErrorMsg(null);
  try {
    const { data, error } = await supabase
      .from("visits")
      .select(`
        *,
        patient:patient_id(name, phone),
        executive:executive_id(name)
      `)
      .eq("visit_date", selectedDate)
      .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);

    if(error) throw error;
    console.log("Visits fetched:", data);
    setVisits(data || []);
  } catch (error) {
    console.error("Error fetching visits:", error);
    setErrorMsg("Failed to load visits.");
    setVisits([]);
  } finally {
    setLoading(false);
  }
};

  const updateVisitStatus = async (visitId, status) => {
    try {
      const { error } = await supabase.from("visits").update({ status }).eq("id", visitId);
      if (error) throw error;
      fetchVisits();
    } catch (error) {
      console.error("Error updating visit status:", error);
      setErrorMsg("Failed to update visit status.");
    }
  };

  const assignVisit = async (visitId) => {
    try {
      const { error } = await supabase
        .from("visits")
        .update({ executive_id: selectedExecutive })
        .eq("id", visitId);
      if (error) throw error;
      fetchVisits();
    } catch (error) {
      console.error("Error assigning visit:", error);
      setErrorMsg("Failed to assign visit.");
    }
  };

  useEffect(() => {
    fetchExecutives();
  }, []);

  useEffect(() => {
    fetchVisits();
  }, [selectedExecutive, selectedDate]);

  const quickSelect = (daysOffset) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    setSelectedDate(formatDate(date));
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 border-yellow-500";
      case "in_progress":
        return "bg-blue-100 border-blue-500 animate-pulse";
      case "sample_picked":
        return "bg-green-100 border-green-500";
      case "sample_dropped":
        return "bg-purple-100 border-purple-500";
      default:
        return "bg-gray-100 border-gray-300";
    }
  };

  const assignedVisits = visits.filter(
    (v) =>
      v.executive_id &&
      v.executive_id.toString().trim() === selectedExecutive?.toString().trim()
  );
  const unassignedVisits = visits.filter((v) => v.executive_id === null);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">Welcome, HV Executive</h1>

      <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6 items-center">
        <select
          className="border border-gray-300 p-2 rounded w-60"
          value={selectedExecutive || ""}
          onChange={(e) => setSelectedExecutive(e.target.value)}
        >
          {executives.length === 0 && <option>Loading executives...</option>}
          {executives.map(({ id, name, status }) => (
            <option key={id} value={id}>
              {name} ({status})
            </option>
          ))}
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-300 p-2 rounded"
          max={formatDate(new Date())}
        />

        <div className="flex gap-2">
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
            onClick={() => quickSelect(-1)}
            aria-label="Yesterday"
          >
            Yesterday
          </button>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
            onClick={() => quickSelect(0)}
            aria-label="Today"
          >
            Today
          </button>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
            onClick={() => quickSelect(1)}
            aria-label="Tomorrow"
          >
            Tomorrow
          </button>
          <button
            onClick={fetchVisits}
            className="bg-gray-300 hover:bg-gray-400 px-3 py-1 rounded flex items-center"
            title="Refresh visits"
            aria-label="Refresh visits"
          >
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 text-red-600 font-semibold text-center">{errorMsg}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-500">Loading visits...</div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              Assigned Visits ({assignedVisits.length})
            </h2>
            {assignedVisits.length === 0 ? (
              <p className="text-center text-gray-600">No assigned visits.</p>
            ) : (
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-left">Patient</th>
                    <th className="border border-gray-300 p-2 text-left">Time Slot</th>
                    <th className="border border-gray-300 p-2 text-left">Address</th>
                    <th className="border border-gray-300 p-2 text-left">Status</th>
                    <th className="border border-gray-300 p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedVisits.map((visit) => (
                    <tr
                      key={visit.id}
                      className={getStatusStyle(visit.status)}
                      title={`Visit Status: ${visit.status}`}
                    >
                      <td className="border border-gray-300 p-2">
                        {visit.patient?.name || "Unknown Patient"}
                      </td>
                      <td className="border border-gray-300 p-2">{visit.time_slot}</td>
                      <td className="border border-gray-300 p-2 max-w-xs truncate">{visit.address}</td>
                      <td className="border border-gray-300 p-2 capitalize">{visit.status.replace(/_/g, " ")}</td>
                      <td className="border border-gray-300 p-2 space-x-1">
                        {visit.status === "pending" && (
                          <button
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-sm"
                            onClick={() => updateVisitStatus(visit.id, "in_progress")}
                            aria-label={`Start visit for ${visit.patient?.name}`}
                          >
                            Start Visit
                          </button>
                        )}
                        {visit.status === "in_progress" && (
                          <>
                            <button
                              className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-sm"
                              onClick={() => updateVisitStatus(visit.id, "sample_picked")}
                              aria-label={`Mark sample picked for ${visit.patient?.name}`}
                            >
                              Mark Picked
                            </button>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                visit.address || ""
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-gray-300 hover:bg-gray-400 text-black px-2 py-1 rounded text-sm"
                            >
                              Navigate
                            </a>
                          </>
                        )}
                        {visit.status === "sample_picked" && (
                          <button
                            className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-sm"
                            onClick={() => updateVisitStatus(visit.id, "sample_dropped")}
                            aria-label={`Mark sample dropped for ${visit.patient?.name}`}
                          >
                            Mark Dropped
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Unassigned Visits ({unassignedVisits.length})</h2>
            {unassignedVisits.length === 0 ? (
              <p className="text-center text-gray-600">No unassigned visits.</p>
            ) : (
              <div className="space-y-4">
                {unassignedVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="border-l-4 border-gray-500 bg-white p-4 rounded shadow-md text-left max-w-4xl mx-auto"
                  >
                    <p className="font-semibold text-lg">
                      {visit.patient?.name || "Unknown Patient"}
                    </p>
                    <p className="text-sm text-gray-600">{visit.time_slot}</p>
                    <p className="text-sm truncate max-w-xl">{visit.address}</p>
                    <p className="text-xs italic text-gray-700 mt-1">Status: Unassigned</p>
                    <button
                      onClick={() => assignVisit(visit.id)}
                      className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                      aria-label={`Assign visit for ${visit.patient?.name} to me`}
                    >
                      Assign to Me
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default PhleboPage;
