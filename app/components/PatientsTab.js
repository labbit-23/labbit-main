// File: /app/components/PatientsTab.js

'use client';

import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  HStack, 
  useToast 
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
  // Internal state for patient selection when uncontrolled
  const [internalSelectedPatient, setInternalSelectedPatient] = useState(null);

  // Handle controlled vs uncontrolled selected patient
  const selectedPatient = propSelectedPatient !== undefined 
    ? propSelectedPatient 
    : internalSelectedPatient;

  // Modals visibility state
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);

  // State for editing a visit
  const [editingVisit, setEditingVisit] = useState(null);
  
  // Loading state for saving visit
  const [isSaving, setIsSaving] = useState(false);

  const toast = useToast();

  // Called when patient is selected from lookup or elsewhere
  const onPatientSelectionHandler = (patient) => {
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(patient);
    }
    if (onPatientSelected) {
      onPatientSelected(patient);
    }
    setEditingVisit(null);
  };

  // Open patient modal; clears selection if uncontrolled
  const onOpenPatientModal = () => {
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(null);
    }
    if (onPatientSelected) {
      onPatientSelected(null);
    }
    setPatientModalOpen(true);
  };

  // Close modal handlers
  const onClosePatientModal = () => setPatientModalOpen(false);
  const onCloseVisitModal = () => {
    setVisitModalOpen(false);
    setEditingVisit(null);
  };

  // After patient save in modal, refresh patient list and set as selected
  const onPatientSave = async (savedPatient) => {
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

  // Sanitize empty strings to null for UUID fields before API calls
  const sanitizePayload = (data) => {
    const uuidFields = ['patient_id', 'executive_id', 'lab_id', 'time_slot', 'address_id'];
    const cleaned = { ...data };
    uuidFields.forEach(field => {
      if (cleaned[field] === '') cleaned[field] = null;
    });
    return cleaned;
  };

  // Save visit (create or update)
  const onSaveVisit = async (visitData) => {
    setIsSaving(true);
    try {
      const payload = sanitizePayload(visitData);
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
        throw new Error(result.error || 'Failed to save visit.');
      }
      toast({
        title: payload.id ? 'Visit updated' : 'Visit created',
        description: 'Visit record saved successfully.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onCloseVisitModal();
      // Refresh data after save
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
      setIsSaving(false);
    }
  };

  return (
    <Box>
      {/* Patient Lookup component */}
      <PatientLookup 
        onPatientSelected={onPatientSelectionHandler} 
        onNewPatient={onOpenPatientModal} 
      />

      {/* Action Buttons */}
      <HStack mt={4} spacing={4}>
        <Button 
          colorScheme="blue" 
          onClick={() => setPatientModalOpen(true)} 
          isDisabled={!selectedPatient} 
        >
          {/* Show Save Patient when no ID */}
          {selectedPatient && !selectedPatient.id ? 'Save Patient' : 'Modify Patient'}
        </Button>
        <Button 
          colorScheme="green" 
          onClick={() => setVisitModalOpen(true)} 
          // Disable if no patient selected OR patient has no ID (unsaved)
          isDisabled={!selectedPatient || !selectedPatient.id} 
        >
          Book Visit
        </Button>
      </HStack>

      {/* Patient Modal */}
      <ModularPatientModal 
        isOpen={patientModalOpen} 
        onClose={onClosePatientModal} 
        onSubmit={onPatientSave} 
        initialPatient={selectedPatient} 
      />

      {/* Visit Modal */}
      <VisitModal 
        isOpen={visitModalOpen} 
        onClose={onCloseVisitModal} 
        onSubmit={onSaveVisit} 
        patientId={selectedPatient?.id} 
        patients={selectedPatient ? [selectedPatient] : []} 
        visitInitialData={null /* Or set if visit editing is enabled */}
        isLoading={isSaving} 
      />
    </Box>
  );
}
