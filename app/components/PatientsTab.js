// File: /app/components/PatientsTab.js
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  defaultExecutiveId = null,         // <-- Add this!
  disablePhoneInput = false,
  quickbookContext = null,
  onQuickbookCompleted = null,
  themeMode = 'light',
}) {
  const toast = useToast();
  const { user, isLoading: isUserLoading } = useUser();
  const isPatientUser = user?.userType === 'patient';
  const [internalSelectedPatient, setInternalSelectedPatient] = useState(null);
  const [initialPhone, setInitialPhone] = useState(
    quickbookContext?.booking?.phone || ''
  );
  const [localDisablePhoneInput, setLocalDisablePhoneInput] = useState(false);

  const [lastLookupPhone, setLastLookupPhone] = useState('');

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

  const toTomorrowIsoDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

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

      // Booking Request: go straight to visit creation
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
      const url = isUpdate ? `/api/visits/${formData.id}` : "/api/visits";
      const method = isUpdate ? "PUT" : "POST";
      const submitVisit = async (bodyPayload) => {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        const data = await response.json().catch(() => null);
        return { response, data };
      };

      let { response, data } = await submitVisit(payload);
      if (!response.ok && response.status === 409 && data?.can_override) {
        const conflictCount = Array.isArray(data?.conflicts) ? data.conflicts.length : 0;
        const proceed = window.confirm(
          `Executive already has ${conflictCount || "another"} visit in this slot. Save anyway?`
        );
        if (proceed) {
          ({ response, data } = await submitVisit({ ...payload, force_assign: true }));
        }
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save visit");
      }

      const savedVisit = data;

      setVisits((prev) =>
        isUpdate
          ? prev.map((v) => (v.id === savedVisit.id ? savedVisit : v))
          : [savedVisit, ...prev]
      );
      setVisitModalOpen(false);
      setEditingVisit(null);
      setSelectedVisitId(savedVisit.id);

      if (typeof fetchPatients === "function") {
        await fetchPatients();
      }

      toast({
        title: isUpdate ? 'Visit updated successfully' : 'Visit created successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Booking Request: mark booking as processed
      if (quickbookContext?.source === 'quickbook') {
        await fetch(`/api/quickbook/${quickbookContext.booking.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PROCESSED", visit_id: savedVisit.id }),
        });
        if (typeof onQuickbookCompleted === "function") {
          onQuickbookCompleted(savedVisit);
        }
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

  const visitModalInitialData = useMemo(() => {
    if (editingVisit) {
      return editingVisit;
    }

    if (quickbookContext?.source === 'quickbook') {
      return {
        patient_id: selectedPatient?.id,
        patient: { name: selectedPatient?.name },
        visit_date: quickbookContext.booking?.date || '',
        time_slot: quickbookContext.booking?.time_slot?.id || '',
        lat: quickbookContext.booking?.location_lat || null,
        lng: quickbookContext.booking?.location_lng || null,
        location_text: quickbookContext.booking?.location_text || "",
        address:
          quickbookContext.booking?.location_text ||
          quickbookContext.booking?.location_address ||
          quickbookContext.booking?.area ||
          "",
        notes: quickbookContext.booking?.tests?.length
          ? Array.isArray(quickbookContext.booking.tests)
            ? quickbookContext.booking.tests.join(', ')
            : quickbookContext.booking.tests
          : quickbookContext.booking?.package_name || '',
        prescription: quickbookContext.booking?.prescription || '',
        status: 'PENDING',
      };
    }

    if (selectedPatient) {
      return {
        patient_id: selectedPatient.id,
        patient: { name: selectedPatient.name },
        // Scrub any stale visit_code from previous records.
        visit_code: undefined
      };
    }

    return {};
  }, [
    editingVisit,
    selectedPatient?.id,
    selectedPatient?.name,
    quickbookContext?.source,
    quickbookContext?.booking?.date,
    quickbookContext?.booking?.time_slot?.id,
    quickbookContext?.booking?.location_lat,
    quickbookContext?.booking?.location_lng,
    quickbookContext?.booking?.location_text,
    quickbookContext?.booking?.location_address,
    quickbookContext?.booking?.area,
    quickbookContext?.booking?.tests,
    quickbookContext?.booking?.package_name,
    quickbookContext?.booking?.prescription
  ]);

  return (
    <Box>
      {quickbookContext?.source === 'quickbook' && (
        <Box
          bg={themeMode === 'dark' ? "rgba(250,204,21,0.14)" : "yellow.50"}
          p={3}
          mb={4}
          borderRadius="md"
          border="1px solid"
          borderColor={themeMode === 'dark' ? "rgba(250,204,21,0.28)" : "yellow.200"}
        >
          <Text fontSize="sm" color={themeMode === 'dark' ? "yellow.200" : "yellow.800"} fontWeight="medium">
            Processing booking request — please confirm patient details and create a visit.
          </Text>
          <Text fontSize="xs" color={themeMode === 'dark' ? "yellow.100" : "yellow.700"} mt={1}>
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
        onPhoneChange={setLastLookupPhone}    // Add this line
        themeMode={themeMode}

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

        {quickbookContext?.source !== 'quickbook' && (
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
        )}
      </HStack>

      {selectedPatient?.id && (
        <Box mt={6}>
          {!addressManagerOpen ? (
            <PatientVisitCards
              visits={visits}
              selectedVisitId={selectedVisitId}
              onSelectVisit={setSelectedVisitId}
              openVisitModal={(visit, options = {}) => {
                if (options?.mode === "rebook") {
                  const normalizedTimeSlot =
                    (visit?.time_slot && typeof visit.time_slot === "object"
                      ? visit.time_slot.id
                      : null) ||
                    visit?.time_slot_id ||
                    visit?.time_slot ||
                    "";
                  const normalizedExecutiveId =
                    (visit?.executive_id && typeof visit.executive_id === "object"
                      ? visit.executive_id.id
                      : null) ||
                    visit?.executive_id ||
                    visit?.executive?.id ||
                    "";
                  const normalizedLabId =
                    (visit?.lab_id && typeof visit.lab_id === "object"
                      ? visit.lab_id.id
                      : null) ||
                    visit?.lab_id ||
                    visit?.lab?.id ||
                    "";
                  const rebookPayload = {
                    ...visit,
                    id: null,
                    patient_id: visit?.patient_id || selectedPatient?.id || "",
                    visit_date: toTomorrowIsoDate(),
                    status: "unassigned",
                    address_id: "",
                    time_slot: normalizedTimeSlot ? String(normalizedTimeSlot) : "",
                    executive_id: normalizedExecutiveId ? String(normalizedExecutiveId) : "",
                    lab_id: normalizedLabId ? String(normalizedLabId) : "",
                    rebook_source_visit_id: visit?.id || null,
                  };
                  setEditingVisit(rebookPayload);
                } else {
                  setEditingVisit(visit);
                }
                setVisitModalOpen(true);
              }}
              loading={loadingVisits}
              error={visitsError}
              setVisitsLoading={setIsSavingVisit}
              themeMode={themeMode}
            />
          ) : (
            <AddressManager patientId={selectedPatient.id} onChange={() => {}} themeMode={themeMode} />
          )}
        </Box>
      )}

      <ModularPatientModal
        isOpen={patientModalOpen}
        onClose={() => setPatientModalOpen(false)}
        onSubmit={onPatientSave}
        initialPatient={selectedPatient}
        initialPhone={selectedPatient ? undefined : lastLookupPhone}
        disablePhoneInput={selectedPatient ? false : true}
      />

      {!isUserLoading && user?.userType && visitModalOpen && (
        <VisitModal
          key={`${editingVisit?.id || `new-${editingVisit?.rebook_source_visit_id || "plain"}`}-${selectedPatient?.id || 'no-patient'}`}
          isOpen={visitModalOpen}
          onClose={() => {
            setVisitModalOpen(false);
            setEditingVisit(null);
          }}
          onSubmit={handleVisitSubmit}
          patientId={selectedPatient?.id}
          patients={selectedPatient ? [selectedPatient] : []}
          visitInitialData={visitModalInitialData}
          isLoading={isSavingVisit}
          userType={user.userType}
          defaultExecutiveId={defaultExecutiveId}  // <-- Add this
        />
      )}
    </Box>
  );
}
