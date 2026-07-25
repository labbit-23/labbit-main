// File: /components/archive/PatientRadiology.js
// Radiology/pathology findings text from the Shivam archive for one patient
// (diagnotech.radresults, RTF-stripped server-side). Read-only, plain text —
// no header/footer render, no PDF, no print button.

'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';

export default function PatientRadiology({ mrno }) {
  const [reports, setReports] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (!mrno) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/archive/patient/${encodeURIComponent(mrno)}/radiology-reports`);
        if (!res.ok) throw new Error('radiology-reports fetch failed');
        const data = await res.json();
        if (!cancelled) setReports(data.radiology_reports || []);
      } catch (err) {
        if (!cancelled) {
          toast({ title: 'Archive radiology failed', description: err.message, status: 'error' });
          setReports([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mrno, toast]);

  if (!reports) return <Spinner size="sm" />;
  if (reports.length === 0) {
    return <Text fontSize="sm" color="gray.500">No archived radiology/pathology reports for MRN {mrno}.</Text>;
  }

  return (
    <Stack spacing={3}>
      {reports.map((r, i) => (
        <Box key={`${r.requisition_number}-${i}`} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3}>
          <Text fontWeight="semibold" fontSize="sm">
            {String(r.requested_at || '').slice(0, 10)} · {r.test_name || 'Report'}
          </Text>
          <Text fontSize="xs" color="gray.500" mb={2}>
            {r.requisition_number}
          </Text>
          {r.findings_text ? (
            <Text fontSize="sm" whiteSpace="pre-wrap">{r.findings_text}</Text>
          ) : (
            <Text fontSize="sm" color="gray.400">No findings text available for this report.</Text>
          )}
        </Box>
      ))}
    </Stack>
  );
}
