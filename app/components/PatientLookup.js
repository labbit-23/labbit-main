//app/components/PatientLookup.js

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
} from '@chakra-ui/react';

export default function PatientLookup({
  initialPhone = '',
  disablePhoneInput = false,
  onPatientSelected,
  onNewPatient,
  onPhoneChange,      // new prop
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const toast = useToast();

  // Helper to get patient source label
  const getPatientSource = (patient) => {
    if (patient.mrn) return 'Labbit';
    if (patient.external_key) return patient.labName || 'External';
    return 'Unknown';
  };

  // Helper for unique patient key
  const getPatientUniqueKey = (patient) => {
    if (patient.id) return `patientid-${patient.id}`;
    if (patient.mrn) return `mrn-${patient.mrn}`;
    if (patient.external_key) return `externalkey-${patient.external_key}`;
    return null;
  };

  // Normalise Phone number
  function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits;
}

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    setPhone(val);
    if (onPhoneChange) onPhoneChange(val);
  };

  async function handleLookup(phoneToLookup = phone) {
    const cleanedPhone = normalizePhone(phoneToLookup);
    setPhone(cleanedPhone); // <-- ensures field value updates to normalized 10-digit number
    if (onPhoneChange) onPhoneChange(cleanedPhone);
    
    if (cleanedPhone.length !== 10) {
      toast({ title: 'Please enter a valid 10-digit phone number.', status: 'warning' });
      return;
    }

    setLoading(true);
    setNoResults(false);
    setPatients([]);
    setSelectedPatientId(null);
    onPatientSelected?.(null);

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
          const uniqueKey = getPatientUniqueKey(results[0]);
          setSelectedPatientId(uniqueKey);
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

  // Auto-lookup when initialPhone changes (and is not empty)
  useEffect(() => {
    if (initialPhone) {
    const normalizedInitialPhone = normalizePhone(initialPhone);
    setPhone(normalizedInitialPhone);
    handleLookup(normalizedInitialPhone);
    }
  }, [initialPhone]);

  const handlePatientSelect = (patient, uniqueKey) => {
    if (selectedPatientId === uniqueKey) {
      setSelectedPatientId(null);
      onPatientSelected?.(null);
    } else {
      setSelectedPatientId(uniqueKey);
      onPatientSelected?.(patient);
    }
  };

  return (
    <VStack spacing={4} align="stretch" width="100%">
      {/* 
        Only render phone input and lookup button if:
        - input is NOT disabled, OR
        - phone input is empty (no phone from session yet)
      */}
      {(!disablePhoneInput || !phone) && (
        <>
          <FormControl>
            <FormLabel>Phone Number</FormLabel>
          <Input
            value={phone}
            placeholder="Enter patient phone"
            onChange={handlePhoneChange}
            autoFocus={!disablePhoneInput}
            disabled={disablePhoneInput}
            aria-label="Patient phone input"
          />

          </FormControl>

          <Button onClick={() => handleLookup()} colorScheme="blue" isLoading={loading} disabled={disablePhoneInput}>
            Lookup
          </Button>
        </>
      )}

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
            const uniqueKey = getPatientUniqueKey(p) || `${p.phone ?? ''}-${p.name ?? ''}`;
            const isSelected = selectedPatientId === uniqueKey;

            return (
              <Box
                key={uniqueKey}
                p={3}
                mb={2}
                borderWidth="2px"
                borderRadius="md"
                borderColor={isSelected ? 'green.400' : 'gray.200'}
                cursor="pointer"
                _hover={{ bg: 'gray.100' }}
                onClick={() => handlePatientSelect(p, uniqueKey)}
                role="button"
                tabIndex={0}
                aria-label={`Select patient ${p.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handlePatientSelect(p, uniqueKey);
                }}
              >
                <Text fontWeight="semibold">
                  {p.name}{' '}
                  {p.mrn ? (
                    <Badge colorScheme="blue">MRN: {p.mrn}</Badge>
                  ) : p.external_key ? (
                    <Badge colorScheme="green">External ID: {p.external_key}</Badge>
                  ) : null}
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
