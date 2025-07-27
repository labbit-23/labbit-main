'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PhleboPage() {
  const [executives, setExecutives] = useState([]);
  const [selectedExecId, setSelectedExecId] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch executives
  useEffect(() => {
    const fetchExecutives = async () => {
      const { data, error } = await supabase
        .from('executives')
        .select('id, name, phone')
        .order('name');
      if (!error) setExecutives(data);
    };
    fetchExecutives();
  }, []);

  // Fetch visits for selected executive
  useEffect(() => {
    const fetchVisits = async () => {
      if (!selectedExecId) return;
      setLoading(true);

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const { data, error } = await supabase
        .from('visits')
        .select('id, time_slot, address, patient_id')
        .eq('executive_id', selectedExecId)
        .eq('visit_date', today)
        .order('time_slot');

      if (error) {
        console.error(error);
        setVisits([]);
      } else {
        // For each visit, fetch patient name
        const enriched = await Promise.all(
          data.map(async (visit) => {
            const { data: patientData } = await supabase
              .from('patients')
              .select('name')
              .eq('id', visit.patient_id)
              .single();

            return {
              ...visit,
              patient_name: patientData?.name || 'Unknown',
            };
          })
        );
        setVisits(enriched);
      }

      setLoading(false);
    };

    fetchVisits();
  }, [selectedExecId]);

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>HV Executive Dashboard</h2>

      {/* Executive dropdown */}
      <label htmlFor="exec-select">Select Executive:</label>
      <select
        id="exec-select"
        value={selectedExecId || ''}
        onChange={(e) => setSelectedExecId(e.target.value)}
        style={{ margin: '0.5rem 0', padding: '0.5rem', width: '100%' }}
      >
        <option value="" disabled>
          -- Choose Executive --
        </option>
        {executives.map((exec) => (
          <option key={exec.id} value={exec.id}>
            {exec.name} ({exec.phone})
          </option>
        ))}
      </select>

      {/* Visits */}
      {loading ? (
        <p>Loading visits...</p>
      ) : visits.length === 0 ? (
        <p>No visits today.</p>
      ) : (
        visits.map((visit) => (
          <div
            key={visit.id}
            style={{
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <strong>{visit.patient_name}</strong>
            <p>{visit.time_slot}</p>
            <p>{visit.address}</p>
          </div>
        ))
      )}
    </div>
  );
}
