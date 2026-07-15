// File: /components/archive/PatientHistory.js
// Requisitions and results from the Shivam archive for one patient.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  HStack,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useToast,
} from '@chakra-ui/react';

export default function PatientHistory({ mrno }) {
  const [requisitions, setRequisitions] = useState(null);
  const [results, setResults] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (!mrno) return;
    let cancelled = false;
    (async () => {
      try {
        const [reqRes, resRes] = await Promise.all([
          fetch(`/api/archive/patient/${encodeURIComponent(mrno)}/requisitions`),
          fetch(`/api/archive/patient/${encodeURIComponent(mrno)}/results`),
        ]);
        if (!reqRes.ok) throw new Error('requisitions fetch failed');
        if (!resRes.ok) throw new Error('results fetch failed');
        const reqData = await reqRes.json();
        const resData = await resRes.json();
        if (!cancelled) {
          setRequisitions(reqData.requisitions || []);
          setResults(resData.results || []);
        }
      } catch (err) {
        if (!cancelled) {
          toast({ title: 'Archive history failed', description: err.message, status: 'error' });
          setRequisitions([]);
          setResults([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mrno, toast]);

  const byReqno = useMemo(() => {
    if (!requisitions) return [];
    const groups = new Map();
    for (const r of requisitions) {
      if (!groups.has(r.number)) {
        groups.set(r.number, {
          reqno: r.number,
          date: r.requested_at,
          doctor: r.referring_doctor || r.referring_doctor_id,
          tests: [],
        });
      }
      groups.get(r.number).tests.push(r);
    }
    return [...groups.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [requisitions]);

  const resultsByReqno = useMemo(() => {
    const m = new Map();
    for (const r of results || []) {
      if (!m.has(r.requisition_number)) m.set(r.requisition_number, []);
      m.get(r.requisition_number).push(r);
    }
    return m;
  }, [results]);

  if (!requisitions) return <Spinner size="sm" />;
  if (byReqno.length === 0) {
    return <Text fontSize="sm" color="gray.500">No archived requisitions for MRN {mrno}.</Text>;
  }

  return (
    <Accordion allowMultiple>
      {byReqno.map((g) => (
        <AccordionItem key={g.reqno}>
          <AccordionButton>
            <HStack flex="1" spacing={4} textAlign="left">
              <Text fontWeight="semibold">{g.reqno}</Text>
              <Text fontSize="sm">{String(g.date).slice(0, 10)}</Text>
              <Text fontSize="sm" color="gray.500">{g.doctor || ''}</Text>
              <Badge>{g.tests.length} tests</Badge>
            </HStack>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={3}>
            <Box mb={2}>
              {g.tests.map((t) => (
                <Badge
                  key={`${g.reqno}-${t.test_id}`}
                  mr={1} mb={1}
                  colorScheme={t.is_approved ? 'green' : 'orange'}
                >
                  {t.test_name}
                </Badge>
              ))}
            </Box>
            {(resultsByReqno.get(g.reqno) || []).length > 0 && (
              <Table size="sm">
                <Thead>
                  <Tr><Th>Parameter</Th><Th>Value</Th><Th>Unit</Th><Th>Reference</Th></Tr>
                </Thead>
                <Tbody>
                  {resultsByReqno.get(g.reqno).map((r, i) => (
                    <Tr key={i}>
                      <Td>{r.parameter}</Td>
                      <Td fontWeight="semibold">{r.value}</Td>
                      <Td>{r.unit || '-'}</Td>
                      <Td>{r.reference_text || `${r.reference_low ?? ''} - ${r.reference_high ?? ''}`}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
