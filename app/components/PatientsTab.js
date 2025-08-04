// File: /app/components/PatientsTab.js

'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Spinner,
  useToast,
} from '@chakra-ui/react';

import PatientLookup from './PatientLookup';
import ModularPatientModal from './ModularPatientModal';
import VisitModal from './VisitModal';

export default function PatientsTab({
  fetchPatients,
  fetchVisits,
  onPatientSelected,
  selectedPatient: propSelectedPatient, // controlled prop optional
}) {
  const [internalSelectedPatient, setInternalSelectedPatient] = useState(null);
  const selectedPatient = propSelectedPatient !== undefined ? propSelectedPatient : internalSelectedPatient;

  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);

  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [isSavingVisit, setIsSavingVisit] = useState(false);

  const toast = useToast();

  const onPatientSelectionHandler = (patient) => {
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(patient);
    }
    if (onPatientSelected) {
      onPatientSelected(patient);
    }
    setEditingVisit(null);
  };

  const onOpenPatientModal = () => {
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(null);
    }
    if (onPatientSelected) {
      onPatientSelected(null);
    }
    setPatientModalOpen(true);
  };

  const onClosePatientModal = () => setPatientModalOpen(false);
  const onCloseVisitModal = () => {
    setVisitModalOpen(false);
    setEditingVisit(null);
  };

  // Prevent multiple rapid saves by disabling save button and ignoring calls when already saving
  const onPatientSave = async (savedPatient) => {
    if (isSavingPatient) return;

    setIsSavingPatient(true);
    try {
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
    } catch (error) {
      toast({
        title: 'Error saving patient',
        description: error.message,
        status: 'error',
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setIsSavingPatient(false);
    }
  };

  // Sanitize payload
  const sanitizePayload = (data) => {
    const uuidFields = ['patient_id', 'executive_id', 'lab_id', 'time_slot', 'address_id'];
    const cleaned = { ...data };
    uuidFields.forEach((field) => {
      if (cleaned[field] === '') cleaned[field] = null;
    });
    return cleaned;
  };

  const getVisitCode = async (date) => {
    const response = await fetch(`/api/generate-visit-code?date=${date}`);
    if (!response.ok) throw new Error('Failed to get visit code');
    const { visitCode } = await response.json();
    return visitCode;
  };

  const onSaveVisit = async (visitData) => {
    if (isSavingVisit) return;

    setIsSavingVisit(true);
    try {
      let payload = sanitizePayload(visitData);
      if (!payload.id) {
        payload.visit_code = await getVisitCode(payload.visit_date);
      }
      let res;
      if (payload.id) {
        res = await fetch(`/api/visits/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to save visit.');
      }
      toast({
        title: payload.id ? 'Visit updated' : 'Visit created',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onCloseVisitModal();
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

  return (
    <Box>
      <PatientLookup onPatientSelected={onPatientSelectionHandler} onNewPatient={onOpenPatientModal} />

      <HStack mt={4} spacing={4}>
        <Button colorScheme="blue" onClick={() => setPatientModalOpen(true)} disabled={!selectedPatient || isSavingPatient}>
          {isSavingPatient ? <Spinner size="sm" /> : selectedPatient && !selectedPatient.id ? 'Save Patient' : 'Modify Patient'}
        </Button>
        <Button colorScheme="green" onClick={() => setVisitModalOpen(true)} disabled={!selectedPatient || !selectedPatient.id || isSavingVisit}>
          {isSavingVisit ? <Spinner size="sm" /> : 'Book Visit'}
        </Button>
      </HStack>

      <ModularPatientModal isOpen={patientModalOpen} onClose={onClosePatientModal} onSubmit={onPatientSave} initialPatient={selectedPatient} />

      <VisitModal
        isOpen={visitModalOpen}
        onClose={onCloseVisitModal}
        onSubmit={onSaveVisit}
        patientId={selectedPatient?.id}
        patients={selectedPatient ? [selectedPatient] : []}
        visitInitialData={editingVisit}
        isLoading={isSavingVisit}
      />
    </Box>
  );
}
