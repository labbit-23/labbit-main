// File: /components/archive/ArchiveTrends.js
// Component-wise numeric history from the archive (last N visits), tabular.
// Graphical rendering reuses the labit-py trend report pipeline separately.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  Badge,
  Box,
  Switch,
  FormControl,
  FormLabel,
  HStack,
} from '@chakra-ui/react';
import ParameterTrendChart from './ParameterTrendChart';

function outOfRange(row) {
  const v = Number(row.value);
  if (Number.isNaN(v)) return false;
  if (row.reference_high != null && v > Number(row.reference_high)) return true;
  if (row.reference_low != null && v < Number(row.reference_low)) return true;
  return false;
}

export default function ArchiveTrends({ mrno, initialTableView = false }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [showTable, setShowTable] = useState(Boolean(initialTableView));

  useEffect(() => {
    setShowTable(Boolean(initialTableView));
  }, [initialTableView, mrno]);

  useEffect(() => {
    if (!mrno) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/archive/patient/${encodeURIComponent(mrno)}/trends?visits=24`);
      const data = res.ok ? await res.json() : { trends: [] };
      if (!cancelled) setRows(data.trends || []);
    })();
    return () => { cancelled = true; };
  }, [mrno]);

  const byComponent = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) {
      const key = r.parameter;
      if (!key) continue;
      if (filter && !key.toLowerCase().includes(filter.toLowerCase())) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)));
    }
    return m;
  }, [rows, filter]);

  const parameterOptions = useMemo(() => {
    return Array.from(new Set((rows || []).map((row) => row.parameter).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, [rows]);

  if (!rows) return <Spinner size="sm" />;
  if (rows.length === 0) {
    return <Text fontSize="sm" color="gray.500">No numeric trend data in archive for MRN {mrno}.</Text>;
  }

  return (
    <>
      <HStack mb={3} spacing={6}>
        <HStack spacing={2} align="center">
          <Input
            size="sm"
            maxW="300px"
            list="archive-trend-parameters"
            placeholder="Filter parameter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <datalist id="archive-trend-parameters">
            {parameterOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {filter ? (
            <Button size="sm" variant="ghost" onClick={() => setFilter('')}>
              Clear
            </Button>
          ) : null}
        </HStack>
        <FormControl display="flex" alignItems="center" w="auto">
          <FormLabel htmlFor="trend-table-view" mb="0" fontSize="sm">
            Table view
          </FormLabel>
          <Switch id="trend-table-view" size="sm" isChecked={showTable} onChange={(e) => setShowTable(e.target.checked)} />
        </FormControl>
      </HStack>
      {byComponent.size === 0 && (
        <Text fontSize="sm" color="gray.500" mb={3}>No matching numeric parameters.</Text>
      )}
      {[...byComponent.entries()].map(([parameter, list]) => {
        const chartPoints = list.map((r) => ({
          date: String(r.requested_at).slice(0, 10),
          value: Number(r.value),
          outOfRange: outOfRange(r),
        }));
        const refLow = list[0].reference_low != null ? Number(list[0].reference_low) : null;
        const refHigh = list[0].reference_high != null ? Number(list[0].reference_high) : null;
        return (
          <Box key={parameter} mb={4}>
            {!showTable && (
              <ParameterTrendChart
                name={parameter}
                unit={list[0].unit}
                refLow={refLow}
                refHigh={refHigh}
                points={chartPoints}
              />
            )}
            {showTable && (
              <>
                <Text fontWeight="semibold" fontSize="sm" mb={1}>
                  {parameter}{' '}
                  <Text as="span" color="gray.500" fontWeight="normal">
                    ({list[0].unit || 'no units'} · ref {list[0].reference_text || `${refLow ?? '?'}–${refHigh ?? '?'}`})
                  </Text>
                </Text>
                <Table size="sm" variant="striped">
                  <Thead>
                    <Tr>
                      {list.map((r, i) => (
                        <Th key={i} fontSize="10px" color="gray.500">{String(r.requested_at).slice(0, 10)}</Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>
                    <Tr>
                      {list.map((r, i) => (
                        <Td key={i} fontSize="11px" color="gray.500" py={1.5}>
                          {outOfRange(r)
                            ? <Badge colorScheme="red" fontSize="10px">{r.value}</Badge>
                            : String(r.value)}
                        </Td>
                      ))}
                    </Tr>
                  </Tbody>
                </Table>
              </>
            )}
          </Box>
        );
      })}
    </>
  );
}
