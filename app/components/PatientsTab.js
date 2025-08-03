// File: /app/components/PatientsTab.js

'use client';

import React, { useState } from 'react';
import { Box, Button, HStack, useToast } from '@chakra-ui/react';

import PatientLookup from './PatientLookup';
import ModularPatientModal from './ModularPatientModal';
import VisitModal from './VisitModal';

export default function PatientsTab({
  fetchPatients,
  fetchVisits,
  onPatientSelected,
  selectedPatient: propSelectedPatient, // controlled prop
}) {
  // Use internal state only if no controlled prop is provided (uncontrolled mode)
  const [internalSelectedPatient, setInternalSelectedPatient] = useState(null);

  // Determine whether to use controlled or uncontrolled selectedPatient
  const selectedPatient =
    propSelectedPatient !== undefined ? propSelectedPatient : internalSelectedPatient;

  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [isSavingVisit, setIsSavingVisit] = useState(false);

  const toast = useToast();

  // Use this function to handle patient selection coming from PatientLookup or elsewhere
  const onPatientSelectedInternal = (patient) => {
    // Update internal state only if uncontrolled
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(patient);
    }
    // Always notify parent if callback is provided
    if (onPatientSelected) {
      onPatientSelected(patient);
    }
    setEditingVisit(null);
  };

  const onNewPatient = () => {
    // Clear selection to null on starting new patient creation
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(null);
    }
    if (onPatientSelected) {
      onPatientSelected(null);
    }
    setPatientModalOpen(true);
  };

  const onPatientModalClose = () => setPatientModalOpen(false);
  const onVisitModalClose = () => {
    setVisitModalOpen(false);
    setEditingVisit(null);
  };

  const onPatientModalSubmit = async (savedPatient) => {
    if (fetchPatients) await fetchPatients();
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(savedPatient);
    }
    if (onPatientSelected) {
      onPatientSelected(savedPatient);
    }
    setPatientModalOpen(false);
    toast({
      title: 'Patient saved',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  // Helper to sanitize UUID fields by converting empty string to null
  const sanitizeVisitPayload = (data) => {
    const uuidFields = ['patient_id', 'executive_id', 'lab_id', 'time_slot', 'address_id'];
    const cleaned = { ...data };
    uuidFields.forEach((field) => {
      if (cleaned[field] === '') {
        cleaned[field] = null;
      }
    });
    return cleaned;
  };

  // Handler for creating/updating visit
  const onVisitModalSubmit = async (visitData) => {
    setIsSavingVisit(true);
    try {
      const payload = sanitizeVisitPayload(visitData);
      let res;
      if (payload.id) {
        // Update visit
        res = await fetch(`/api/visits/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create visit
        res = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Visit save failed');
      }

      toast({
        title: payload.id ? 'Visit updated' : 'Visit created',
        description: 'Visit record was saved successfully.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setVisitModalOpen(false);
      setEditingVisit(null);

      if (fetchPatients) await fetchPatients();
      if (fetchVisits) await fetchVisits();
    } catch (error) {
      toast({
        title: 'Error saving visit',
        description: error.message,
        status: 'error',
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setIsSavingVisit(false);
    }
  };

  // You can add support for editing an existing visit if required:
  // const onEditVisitClick = (visit) => {
  //   setEditingVisit(visit);
  //   setVisitModalOpen(true);
  // };

  return (
    <Box>
      <PatientLookup onPatientSelected={onPatientSelectedInternal} onNewPatient={onNewPatient} />

      <HStack spacing={4} mt={4}>
        <Button colorScheme="blue" onClick={() => setPatientModalOpen(true)} isDisabled={!selectedPatient}>
          Modify Patient
        </Button>
        <Button colorScheme="green" onClick={() => setVisitModalOpen(true)} isDisabled={!selectedPatient}>
          Book Visit
        </Button>
      </HStack>

      <ModularPatientModal
        isOpen={patientModalOpen}
        onClose={onPatientModalClose}
        onSubmit={onPatientModalSubmit}
        initialPatient={selectedPatient}
      />

      <VisitModal
        isOpen={visitModalOpen}
        onClose={onVisitModalClose}
        onSubmit={onVisitModalSubmit}
        patientId={selectedPatient?.id}
        patients={selectedPatient ? [selectedPatient] : []}
        visitInitialData={editingVisit}
        isLoading={isSavingVisit}
      />
    </Box>
  );
}
