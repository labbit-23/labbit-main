// File: /components/archive/ArchivePatientLookup.js
// Search the Shivam historical archive by MRN, name, or phone.

'use client';

import React, { useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useToast,
} from '@chakra-ui/react';

export default function ArchivePatientLookup({ onSelect }) {
  const [mrno, setMrno] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reqno, setReqno] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const search = async () => {
    if (!mrno.trim() && !name.trim() && !phone.trim() && !reqno.trim()) {
      toast({ title: 'Enter MRN, name, phone, or requisition no.', status: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (mrno.trim()) qs.set('mrno', mrno.trim());
      if (name.trim()) qs.set('name', name.trim());
      if (phone.trim()) qs.set('phone', phone.trim());
      if (reqno.trim()) qs.set('reqno', reqno.trim());
      const res = await fetch(`/api/archive/search?${qs}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || payload.error || res.statusText);
      }
      const data = await res.json();
      setResults(data.patients || []);
    } catch (err) {
      toast({ title: 'Archive search failed', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <HStack align="end" spacing={3} mb={4} flexWrap="wrap">
        <FormControl maxW="160px">
          <FormLabel fontSize="sm">MRN</FormLabel>
          <Input size="sm" value={mrno} onChange={(e) => setMrno(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">Name</FormLabel>
          <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
        </FormControl>
        <FormControl maxW="200px">
          <FormLabel fontSize="sm">Phone</FormLabel>
          <Input size="sm" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormControl>
        <FormControl maxW="180px">
          <FormLabel fontSize="sm">Requisition no.</FormLabel>
          <Input size="sm" value={reqno} onChange={(e) => setReqno(e.target.value)} />
        </FormControl>
        <Button
          size="md"
          minW="160px"
          px={6}
          colorScheme="teal"
          onClick={search}
          isLoading={loading}
        >
          Search Archive
        </Button>
      </HStack>

      {results && results.length === 0 && (
        <Text fontSize="sm" color="gray.500">No patients found in archive.</Text>
      )}
      {results && results.length > 0 && (
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th>MRN</Th><Th>Name</Th><Th>Sex</Th><Th>Phone</Th><Th>Last visit</Th><Th />
            </Tr>
          </Thead>
          <Tbody>
            {results.map((p) => (
              <Tr key={p.mrn}>
                <Td>{p.mrn}</Td>
                <Td>{p.name}</Td>
                <Td>{p.sex || '-'}</Td>
                <Td>{p.mobile || '-'}</Td>
                <Td>{p.last_visit ? String(p.last_visit).slice(0, 10) : '-'}</Td>
                <Td>
                  <Button size="xs" onClick={() => onSelect?.(p.mrn, p)}>
                    Open history
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}
