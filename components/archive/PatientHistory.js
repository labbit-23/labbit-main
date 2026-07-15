// File: /components/archive/PatientHistory.js
// Requisitions and results from the Shivam archive for one patient.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Spinner,
  Stack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useToast,
} from '@chakra-ui/react';

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeReferenceHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return stripTags(raw);
  }

  const doc = new DOMParser().parseFromString(raw, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => node.remove());
  doc.body.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || attr.name !== 'class') node.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

function ReferenceText({ row }) {
  const reference = row.reference_text || `${row.reference_low ?? ''} - ${row.reference_high ?? ''}`.trim();
  if (!reference || reference === '-') return <Text fontSize="xs" color="gray.400">-</Text>;
  return (
    <Box
      fontSize="10px"
      lineHeight="1.25"
      color="gray.400"
      sx={{
        '& p': { margin: 0 },
        '& div': { margin: 0 },
        '& br': { display: 'block', content: '""', marginTop: '1px' },
      }}
      dangerouslySetInnerHTML={{ __html: safeReferenceHtml(reference) }}
    />
  );
}

export default function PatientHistory({ mrno }) {
  const [requisitions, setRequisitions] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedByReqno, setSelectedByReqno] = useState({});
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
          setSelectedByReqno({});
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

  const rowsForTest = (reqno, testName) => {
    const target = String(testName || '').trim().toLowerCase();
    return (resultsByReqno.get(reqno) || []).filter((row) => (
      String(row.test_name || '').trim().toLowerCase() === target
    ));
  };

  if (!requisitions) return <Spinner size="sm" />;
  if (byReqno.length === 0) {
    return <Text fontSize="sm" color="gray.500">No archived requisitions for MRN {mrno}.</Text>;
  }

  return (
    <Stack spacing={3}>
      {byReqno.map((g) => (
        <Box key={g.reqno} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3}>
          <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} gap={2} direction={{ base: 'column', md: 'row' }}>
            <Box>
              <Text fontWeight="semibold" fontSize="sm">{String(g.date).slice(0, 10)}</Text>
              <Text fontSize="xs" color="gray.500">
                {g.doctor || 'Archive visit'}{g.reqno ? ` · ${g.reqno}` : ''}
              </Text>
            </Box>
            <Text fontSize="xs" color="gray.400">{g.tests.length} tests</Text>
          </Flex>

          <HStack mt={3} spacing={2} flexWrap="wrap">
            {g.tests.map((t) => {
              const selected = selectedByReqno[g.reqno] === t.test_name;
              const count = rowsForTest(g.reqno, t.test_name).length;
              return (
                <Button
                  key={`${g.reqno}-${t.test_id}`}
                  size="xs"
                  h="24px"
                  variant={selected ? 'solid' : 'outline'}
                  colorScheme={t.is_approved ? 'teal' : 'orange'}
                  onClick={() => setSelectedByReqno((prev) => ({
                    ...prev,
                    [g.reqno]: selected ? null : t.test_name,
                  }))}
                >
                  {t.test_name}{count ? ` (${count})` : ''}
                </Button>
              );
            })}
          </HStack>

          {selectedByReqno[g.reqno] && (
            <Box mt={3}>
              <Divider mb={3} />
              <HStack justify="space-between" mb={2}>
                <Text fontSize="sm" fontWeight="700">{selectedByReqno[g.reqno]}</Text>
                <HStack spacing={1}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const index = g.tests.findIndex((t) => t.test_name === selectedByReqno[g.reqno]);
                      const next = g.tests[(index - 1 + g.tests.length) % g.tests.length];
                      setSelectedByReqno((prev) => ({ ...prev, [g.reqno]: next?.test_name || null }));
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const index = g.tests.findIndex((t) => t.test_name === selectedByReqno[g.reqno]);
                      const next = g.tests[(index + 1) % g.tests.length];
                      setSelectedByReqno((prev) => ({ ...prev, [g.reqno]: next?.test_name || null }));
                    }}
                  >
                    Next
                  </Button>
                </HStack>
              </HStack>
              {rowsForTest(g.reqno, selectedByReqno[g.reqno]).length > 0 ? (
                <Table size="sm">
                  <Thead>
                    <Tr><Th>Parameter</Th><Th>Value</Th><Th>Unit</Th><Th>Reference</Th></Tr>
                  </Thead>
                  <Tbody>
                    {rowsForTest(g.reqno, selectedByReqno[g.reqno]).map((r, i) => (
                      <Tr key={i}>
                        <Td fontSize="sm">{r.parameter}</Td>
                        <Td fontWeight="semibold" fontSize="sm">{r.value}</Td>
                        <Td fontSize="sm" color="gray.600">{r.unit || '-'}</Td>
                        <Td maxW="320px"><ReferenceText row={r} /></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              ) : (
                <Text fontSize="sm" color="gray.500">No component results for this test.</Text>
              )}
            </Box>
          )}
        </Box>
      ))}
    </Stack>
  );
}
