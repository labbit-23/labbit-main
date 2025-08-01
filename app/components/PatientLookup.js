'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Input,
  FormControl,
  FormLabel,
  Text,
  VStack,
  useToast,
  Spinner,
  Badge,
  Flex,
  HStack,
} from '@chakra-ui/react';

export default function PatientLookup({ onPatientSelected, onNewPatient }) {
  const [phone, setPhone] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const toast = useToast();

  const getPatientSource = (patient) => {
    if ('mrn' in patient) return 'Supabase';
    if ('cregno' in patient) return 'External';
    return 'Unknown';
  };

  async function handleLookup() {
    const cleanedPhone = phone.trim().replace(/\D/g, '');

    if (cleanedPhone.length !== 10) {
      toast({ title: 'Please enter a valid 10-digit phone number.', status: 'warning' });
      return;
    }

    setLoading(true);
    setNoResults(false);
    setPatients([]);
    setSelectedPatientId(null);

    try {
      const res = await fetch(`/api/patient-lookup?phone=${cleanedPhone}`);

      if (!res.ok) {
        const text = await res.text();
        toast({ title: 'Lookup failed', description: text, status: 'error' });
        setLoading(false);
        return;
      }

      const data = await res.json();

      let results = [];
      if (Array.isArray(data)) {
        results = data;
      } else if (data && Array.isArray(data.patients)) {
        results = data.patients;
      } else if (data && typeof data.patients === 'object' && data.patients !== null) {
        results = [data.patients];
      }

      if (results.length === 0) {
        setNoResults(true);
        toast({
          title: 'No patients found',
          description: 'You can add a new patient if not found.',
          status: 'info',
        });
        onPatientSelected?.(null);
      } else {
        setPatients(results);
        // Auto-select if only one patient found
        if (results.length === 1) {
          setSelectedPatientId(results[0].id);
          onPatientSelected?.(results[0]);
        }
      }
    } catch (err) {
      toast({ title: 'Lookup failed', description: err.message || 'Check console', status: 'error' });
      onPatientSelected?.(null);
    } finally {
      setLoading(false);
    }
  }

  // Handle patient card selection inside lookup
  const handlePatientSelect = (patient) => {
    if (selectedPatientId === patient.id) {
      // Unselect if the same patient is clicked again
      setSelectedPatientId(null);
      onPatientSelected?.(null);
    } else {
      setSelectedPatientId(patient.id);
      onPatientSelected?.(patient);
    }
  };

  return (
    <VStack spacing={4} align="stretch" width="100%">
      <FormControl>
        <FormLabel>Phone Number</FormLabel>
        <Input
          value={phone}
          placeholder="Enter patient phone"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          maxLength={10}
          autoFocus
          aria-label="Patient phone input"
        />
      </FormControl>

      <Button onClick={handleLookup} colorScheme="blue" isLoading={loading}>
        Lookup
      </Button>

      {loading && (
        <Flex justifyContent="center" my={3}>
          <Spinner size="lg" />
        </Flex>
      )}

      {!loading && noResults && (
        <Text color="gray.600" fontStyle="italic" textAlign="center">
          No patients found for the entered phone number.
        </Text>
      )}

      {!loading && patients.length > 0 && (
        <Box maxHeight="300px" overflowY="auto" borderWidth="1px" borderRadius="md" p={2}>
          <Text fontWeight="bold" mb={2}>
            Patients found:
          </Text>

          {patients.map((p) => {
            const key = `${p.id ?? ''}-${p.cregno ?? ''}-${p.phone ?? ''}`;
            const isSelected = selectedPatientId === p.id;

            return (
              <Box
                key={key}
                p={3}
                mb={2}
                borderWidth="2px"
                borderRadius="md"
                borderColor={isSelected ? 'green.400' : 'gray.200'}
                cursor="pointer"
                _hover={{ bg: 'gray.100' }}
                onClick={() => handlePatientSelect(p)}
                role="button"
                tabIndex={0}
                aria-label={`Select patient ${p.name || p.fname}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handlePatientSelect(p);
                }}
              >
                <Text fontWeight="semibold">
                  {p.name || `${p.fname ?? ''} ${p.lname ?? ''}`}{' '}
                  {p.mrn && <Badge colorScheme="blue">MRN: {p.mrn}</Badge>}
                  {!p.mrn && p.cregno && <Badge colorScheme="green">CREGNO: {p.cregno}</Badge>}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  DOB: {p.dob ?? '-'} | Gender: {p.gender ?? '-'}
                </Text>
                {p.address_line && (
                  <Text fontSize="sm" color="gray.600" noOfLines={1}>
                    Address: {p.address_line}
                  </Text>
                )}
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Source: {getPatientSource(p)}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Button variant="outline" colorScheme="green" onClick={() => onNewPatient?.()} mt={2}>
        Add New Patient
      </Button>
    </VStack>
  );
}
