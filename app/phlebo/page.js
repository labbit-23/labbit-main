"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

  const fetchExecutives = async () => {
    const { data, error } = await supabase
      .from("executives")
      .select("id, name")
      .eq("status", "active");
    if (!error) {
      setExecutives(data);
      setSelectedExecutive(data[0]?.id || null);
    }
  };

  const fetchVisits = async () => {
    if (!selectedExecutive) return;
    const { data, error } = await supabase
      .from("visits")
      .select("*, patient:patient_id(name, phone)")
      .eq("visit_date", selectedDate)
      .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);
    if (!error) {
      setVisits(data);
    } else {
      console.error("Error fetching visits:", error);
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

  return (
    <div className="p-4 text-center">
      <h1 className="text-2xl font-bold mb-4">Welcome, HV Executive</h1>

      <div className="flex flex-col sm:flex-row justify-center gap-2 mb-4">
        <select
          className="border p-2 rounded"
          value={selectedExecutive || ""}
          onChange={(e) => setSelectedExecutive(e.target.value)}
        >
          {executives.map((exec) => (
            <option key={exec.id} value={exec.id}>
              {exec.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border p-2 rounded"
        />

        <div className="flex gap-2">
          <button
            className="bg-blue-500 text-white px-2 py-1 rounded"
            onClick={() => quickSelect(-1)}
          >
            Yesterday
          </button>
          <button
            className="bg-blue-500 text-white px-2 py-1 rounded"
            onClick={() => quickSelect(0)}
          >
            Today
          </button>
          <button
            className="bg-blue-500 text-white px-2 py-1 rounded"
            onClick={() => quickSelect(1)}
          >
            Tomorrow
          </button>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-2">
        {visits.length > 0 ? "Visits for Selected Date" : "No visits"}
      </h2>

      <div className="space-y-4">
        {visits
          .filter((v) => v.executive_id !== null)
          .map((visit) => (
            <div
              key={visit.id}
              className={`border-l-4 p-4 rounded shadow-md text-left max-w-md mx-auto ${getStatusStyle(
                visit.status
              )}`}
            >
              <p className="font-semibold text-lg">
                {visit.patient?.name || "Unknown Patient"}
              </p>
              <p className="text-sm text-gray-600">{visit.time_slot}</p>
              <p className="text-sm">{visit.address}</p>
              <p className="text-xs italic text-gray-700 mt-1">
                Status: {visit.status}
              </p>
            </div>
          ))}
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-2">Unassigned Visits</h2>
        <div className="space-y-4">
          {visits
            .filter((v) => v.executive_id === null)
            .map((visit) => (
              <div
                key={visit.id}
                className="border-l-4 border-gray-500 bg-white p-4 rounded shadow-md text-left max-w-md mx-auto"
              >
                <p className="font-semibold text-lg">
                  {visit.patient?.name || "Unknown Patient"}
                </p>
                <p className="text-sm text-gray-600">{visit.time_slot}</p>
                <p className="text-sm">{visit.address}</p>
                <p className="text-xs italic text-gray-700 mt-1">
                  Status: Unassigned
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default PhleboPage;
