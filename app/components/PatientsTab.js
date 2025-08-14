// File: /app/components/PatientsTab.js
'use client';

import React, { useState, useEffect } from 'react';
import {
  Box, Text, Button, HStack, Spinner, useToast
} from '@chakra-ui/react';

import { useUser } from '../context/UserContext';
import PatientLookup from './PatientLookup';
import ModularPatientModal from './ModularPatientModal';
import VisitModal from './VisitModal';
import PatientVisitCards from './PatientVisitCards';
import AddressManager from './AddressManager'; // real AddressManager

export default function PatientsTab({
  fetchPatients,
  onPatientSelected,
  selectedPatient: propSelectedPatient,
  phone = '',
  disablePhoneInput = false,
  quickbookContext = null,
}) {
  const toast = useToast();
  const { user, isLoading: isUserLoading } = useUser();
  const isPatientUser = user?.userType === 'patient';

  const [internalSelectedPatient, setInternalSelectedPatient] = useState(null);
  const [initialPhone, setInitialPhone] = useState(
    quickbookContext?.booking?.phone || ''
  );
  const [localDisablePhoneInput, setLocalDisablePhoneInput] = useState(false);

  const selectedPatient =
    propSelectedPatient !== undefined
      ? propSelectedPatient
      : internalSelectedPatient;

  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visitsError, setVisitsError] = useState(null);

  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [editingVisit, setEditingVisit] = useState(null);

  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);

  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [isSavingVisit, setIsSavingVisit] = useState(false);

  const [addressManagerOpen, setAddressManagerOpen] = useState(false);

  const [hasAddresses, setHasAddresses] = useState(false);
  const [loadingLabels, setLoadingLabels] = useState(false);

  // Auto-load logged-in patient info
  useEffect(() => {
    if (!isUserLoading && isPatientUser) {
      const patientFromUser = {
        id: user.id,
        name: user.name,
        phone: user.phone,
      };
      setInternalSelectedPatient(patientFromUser);
      setInitialPhone(user.phone || '');
      setLocalDisablePhoneInput(true);
      if (onPatientSelected) {
        onPatientSelected(patientFromUser);
      }
    }
  }, [user, isUserLoading, isPatientUser, onPatientSelected]);

  // Fetch visits for selected patient
  useEffect(() => {
    if (!selectedPatient?.id) {
      setVisits([]);
      setVisitsError(null);
      setLoadingVisits(false);
      return;
    }
    const fetchVisits = async () => {
      setLoadingVisits(true);
      setVisitsError(null);
      try {
        const res = await fetch(`/api/visits?patient_id=${selectedPatient.id}`);
        if (!res.ok) throw new Error('Failed to fetch visits');
        const data = await res.json();
        setVisits(Array.isArray(data) ? data : []);
      } catch (err) {
        setVisitsError(err.message || 'Error fetching visits');
        setVisits([]);
      } finally {
        setLoadingVisits(false);
      }
    };
    fetchVisits();
  }, [selectedPatient]);

  // Fetch address labels for patient
  useEffect(() => {
    if (!selectedPatient?.id) {
      setHasAddresses(false);
      return;
    }
    setLoadingLabels(true);
    fetch(`/api/patients/address_labels?patient_id=${selectedPatient.id}`)
      .then(res => res.json())
      .then(data => {
        setHasAddresses(Array.isArray(data) && data.length > 0);
      })
      .catch(() => setHasAddresses(false))
      .finally(() => setLoadingLabels(false));
  }, [selectedPatient]);

  const onPatientSelectionHandler = (patient) => {
    if (propSelectedPatient === undefined) {
      setInternalSelectedPatient(patient);
    }
    if (onPatientSelected) {
      onPatientSelected(patient);
    }
    setEditingVisit(null);
    setSelectedVisitId(null);
    setAddressManagerOpen(false);
  };

  const onPatientSave = async (savedPatient) => {
    if (isSavingPatient) return;
    setIsSavingPatient(true);
    try {
      if (fetchPatients) await fetchPatients();
      if (propSelectedPatient === undefined) {
        setInternalSelectedPatient(savedPatient);
      }
      if (onPatientSelected) onPatientSelected(savedPatient);
      setPatientModalOpen(false);
      toast({
        title: 'Patient saved',
        status: 'success',
        duration: 3000,
        isClosable: true
      });

      // QuickBook: go straight to visit creation
      if (quickbookContext?.source === 'quickbook') {
        setVisitModalOpen(true);
      }
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

  const handleVisitSubmit = async (formData) => {
    if (isSavingVisit) return;
    setIsSavingVisit(true);

    const payload = {
      ...formData,
      executive_id: formData.executive_id || null,
      address_id: formData.address_id || null,
    };

    try {
      const isUpdate = Boolean(formData.id);
      const url = isUpdate ? `/api/visits/${formData.id}` : '/api/visits';
      const method = isUpdate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to save visit');
      }

      const savedVisit = await res.json();

      setVisits((prev) =>
        isUpdate
          ? prev.map((v) => (v.id === savedVisit.id ? savedVisit : v))
          : [savedVisit, ...prev]
      );
      setVisitModalOpen(false);
      setEditingVisit(null);
      setSelectedVisitId(savedVisit.id);

      toast({
        title: isUpdate ? 'Visit updated successfully' : 'Visit created successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // QuickBook: mark booking as processed
      if (quickbookContext?.source === 'quickbook') {
        await fetch(`/api/quickbook/${quickbookContext.booking.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PROCESSED", visit_id: savedVisit.id }),
        });
      }
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

  const handleManageAddressClick = () => {
    setAddressManagerOpen(true);
  };

  return (
    <Box>
      {quickbookContext?.source === 'quickbook' && (
        <Box bg="yellow.50" p={3} mb={4} borderRadius="md" border="1px solid" borderColor="yellow.200">
          <Text fontSize="sm" color="yellow.800" fontWeight="medium">
            Processing QuickBook booking — please confirm patient details and create a visit.
          </Text>
          <Text fontSize="xs" color="yellow.700" mt={1}>
            {[
              quickbookContext.booking.patient_name || '(No name)',
              quickbookContext.booking.phone,
              quickbookContext.booking.date,
              quickbookContext.booking.time_slot?.slot_name,
              quickbookContext.booking.package_name
            ].filter(Boolean).join(' | ')}
          </Text>
        </Box>
      )}

      <PatientLookup
        initialPhone={
          quickbookContext?.booking?.phone ||
          initialPhone ||
          (isPatientUser ? user.phone : phone)
        }
        disablePhoneInput={
          quickbookContext?.source === 'quickbook'
            ? true
            : localDisablePhoneInput
        }
        onPatientSelected={onPatientSelectionHandler}
        onNewPatient={() => {
          if (propSelectedPatient === undefined) {
            setInternalSelectedPatient(null);
            setInitialPhone('');
            setLocalDisablePhoneInput(false);
          }
          if (onPatientSelected) onPatientSelected(null);
          setPatientModalOpen(true);
          setAddressManagerOpen(false);
        }}
      />

      <HStack mt={4} spacing={4}>
        <Button
          colorScheme="blue"
          onClick={() => setPatientModalOpen(true)}
          disabled={!selectedPatient || isSavingPatient}
        >
          {isSavingPatient ? (
            <Spinner size="sm" />
          ) : selectedPatient && !selectedPatient.id ? (
            'Save Patient'
          ) : (
            'Modify Patient'
          )}
        </Button>

        <Button
          colorScheme="green"
          onClick={() => setVisitModalOpen(true)}
          disabled={!selectedPatient?.id || isSavingVisit}
        >
          {isSavingVisit ? <Spinner size="sm" /> : 'Book Visit'}
        </Button>

        <Button
          colorScheme="purple"
          onClick={handleManageAddressClick}
          disabled={!selectedPatient?.id || loadingLabels}
        >
          {loadingLabels ? (
            <Spinner size="sm" />
          ) : hasAddresses ? (
            'Manage Address'
          ) : (
            'Add Address'
          )}
        </Button>
      </HStack>

      {selectedPatient?.id && (
        <Box mt={6}>
          {!addressManagerOpen ? (
            <PatientVisitCards
              visits={visits}
              selectedVisitId={selectedVisitId}
              onSelectVisit={setSelectedVisitId}
              openVisitModal={(visit) => {
                setEditingVisit(visit);
                setVisitModalOpen(true);
              }}
              loading={loadingVisits}
              error={visitsError}
              setVisitsLoading={setIsSavingVisit}
            />
          ) : (
            <AddressManager patientId={selectedPatient.id} onChange={() => {}} />
          )}
        </Box>
      )}

      <ModularPatientModal
        isOpen={patientModalOpen}
        onClose={() => setPatientModalOpen(false)}
        onSubmit={onPatientSave}
        initialPatient={selectedPatient}
      />

      {!isUserLoading && user?.userType && visitModalOpen && (
        <VisitModal
          key={editingVisit?.id || 'new'}
          isOpen={visitModalOpen}
          onClose={() => {
            setVisitModalOpen(false);
            setEditingVisit(null);
          }}
          onSubmit={handleVisitSubmit}
          patientId={selectedPatient?.id}
          patients={selectedPatient ? [selectedPatient] : []}
          visitInitialData={
            editingVisit && editingVisit.id
              ? editingVisit
              : quickbookContext?.source === 'quickbook'
              ? {
                  patient_id: selectedPatient?.id,
                  patient: { name: selectedPatient?.name },
                  visit_date: quickbookContext.booking?.date || '',
                  time_slot: quickbookContext.booking?.time_slot?.id || '',
                  notes: quickbookContext.booking?.tests?.length
                    ? Array.isArray(quickbookContext.booking.tests)
                      ? quickbookContext.booking.tests.join(', ')
                      : quickbookContext.booking.tests
                    : quickbookContext.booking?.package_name || '',
                  prescription: quickbookContext.booking?.prescription || '',
                  status: 'PENDING',
                }
              : selectedPatient
              ? {
                  patient_id: selectedPatient.id,
                  patient: { name: selectedPatient.name },
                  // ✅ Scrub any stale visit_code
                  visit_code: undefined
                }
              : {}
          }
          isLoading={isSavingVisit}
          userType={user.userType}
        />
      )}
    </Box>
  );
}
