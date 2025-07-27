'use client';

import { useEffect, useState } from 'react';

export default function PhleboDashboard() {
  const [visits, setVisits] = useState([]);

  useEffect(() => {
    // Replace with Supabase API later
    setVisits([
      { id: 1, name: 'John Doe', time: '9:00 AM', location: 'Banjara Hills' },
      { id: 2, name: 'Priya Reddy', time: '11:00 AM', location: 'Kondapur' },
    ]);
  }, []);

  return (
    <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Welcome, HV Executive</h2>

      <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Today's Visits</h3>
      {visits.map(visit => (
        <div key={visit.id} style={{
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '0.75rem',
          backgroundColor: '#f9f9f9'
        }}>
          <strong>{visit.name}</strong><br />
          {visit.time} – {visit.location}
        </div>
      ))}
    </div>
  );
}
