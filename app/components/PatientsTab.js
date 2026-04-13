// File: /app/components/PatientsTab.js
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Text, Button, HStack, Spinner, useToast, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, FormControl, FormLabel, Input, VStack, Badge, Wrap, WrapItem
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import dynamic from "next/dynamic";

import { useUser } from '../context/UserContext';
import PatientLookup from './PatientLookup';
import ModularPatientModal from './ModularPatientModal';
import VisitModal from './VisitModal';
import PatientVisitCards from './PatientVisitCards';
import AddressManager from './AddressManager'; // real AddressManager

const LazyPatientSearchModal = dynamic(() => import("./PatientSearchModal"), {
  ssr: false,
});

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
  const quickbookBooking = quickbookContext?.booking || null;

  const quickbookDraftPatient = useMemo(() => {
    if (quickbookContext?.source !== 'quickbook' || !quickbookBooking) return null;
    const locationHint =
      quickbookBooking?.location_address ||
      quickbookBooking?.area ||
      quickbookBooking?.location_text ||
      '';
    return {
      id: null,
      name: quickbookBooking?.patient_name || '',
      phone: quickbookBooking?.phone || '',
      email: '',
      dob: '',
      gender: '',
      address_line: locationHint,
      pincode: '',
    };
  }, [
    quickbookContext?.source,
    quickbookBooking?.patient_name,
    quickbookBooking?.phone,
    quickbookBooking?.location_address,
    quickbookBooking?.area,
    quickbookBooking?.location_text,
  ]);

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
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [externalKeyModalOpen, setExternalKeyModalOpen] = useState(false);
  const [externalKeyInput, setExternalKeyInput] = useState("");
  const [isSavingExternalKey, setIsSavingExternalKey] = useState(false);
  const [externalKeyCandidates, setExternalKeyCandidates] = useState([]);
  const [externalKeySearchLoading, setExternalKeySearchLoading] = useState(false);
  const [externalKeySearchDone, setExternalKeySearchDone] = useState(false);
  const [selectedExternalKeyCandidate, setSelectedExternalKeyCandidate] = useState(null);

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

  const handleSearchPatientSelect = (patient) => {
    if (!patient) return;
    onPatientSelectionHandler(patient);
    if (propSelectedPatient === undefined) {
      setInitialPhone(patient.phone || "");
    }
  };

  const fetchExternalKeyCandidates = async (phone) => {
    const normalizedPhone = String(phone || "").trim();
    if (!normalizedPhone) {
      setExternalKeyCandidates([]);
      setExternalKeySearchDone(true);
      return;
    }

    setExternalKeySearchLoading(true);
    try {
      const res = await fetch(`/api/patient-lookup?phone=${encodeURIComponent(normalizedPhone)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExternalKeyCandidates([]);
        setExternalKeySearchDone(true);
        return;
      }

      const rows = Array.isArray(json?.patients)
        ? json.patients
        : Array.isArray(json)
          ? json
          : [];

      const normalized = rows
        .map((row) => ({
          id: row?.id || null,
          name: String(row?.name || "").trim(),
          phone: String(row?.phone || normalizedPhone).trim(),
          external_key: String(row?.external_key || "").trim(),
          mrn: String(row?.mrn || "").trim(),
          source: String(row?.source || "").trim(),
        }))
        .filter((row) => row.external_key);

      const seen = new Set();
      const deduped = normalized.filter((row) => {
        const key = `${row.external_key}::${row.name}::${row.phone}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setExternalKeyCandidates(deduped);
      setExternalKeySearchDone(true);

      if (deduped.length === 1) {
        setSelectedExternalKeyCandidate(deduped[0]);
        setExternalKeyInput(deduped[0].external_key);
      }
    } catch {
      setExternalKeyCandidates([]);
      setExternalKeySearchDone(true);
    } finally {
      setExternalKeySearchLoading(false);
    }
  };

  const openExternalKeyModal = async () => {
    setExternalKeyInput(String(selectedPatient?.external_key || ""));
    setSelectedExternalKeyCandidate(null);
    setExternalKeyCandidates([]);
    setExternalKeySearchDone(false);
    setExternalKeyModalOpen(true);

    const phone = String(selectedPatient?.phone || "").trim();
    if (!phone) return;
    await fetchExternalKeyCandidates(phone);
  };

  const saveExternalKey = async () => {
    if (!selectedPatient?.id) return;
    const key = String(externalKeyInput || "").trim();
    if (!key) {
      toast({
        title: "External key is required",
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    if (!externalKeySearchDone) {
      toast({
        title: "Search Shivam first",
        description: "Please run Shivam search before manual/link save.",
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    const reconfirm = window.confirm(
      `Confirm link Shivam MRNO?\n\nPatient: ${selectedPatient?.name || "-"} (${selectedPatient?.phone || "-"})\nMRNO: ${key}`
    );
    if (!reconfirm) return;

    setIsSavingExternalKey(true);
    try {
      const labId =
        (Array.isArray(user?.labIds) && user.labIds.find(Boolean)) ||
        user?.labId ||
        undefined;
      const res = await fetch("/api/save-external-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          external_key: key,
          lab_id: labId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save external key");

      if (propSelectedPatient === undefined) {
        setInternalSelectedPatient((prev) =>
          prev ? { ...prev, external_key: key } : prev
        );
      }
      toast({
        title: "Shivam MRNO linked",
        status: "success",
        duration: 2500,
        isClosable: true,
      });
      setExternalKeyModalOpen(false);
      if (typeof fetchPatients === "function") await fetchPatients();
    } catch (error) {
      toast({
        title: "Failed to link Shivam MRNO",
        description: String(error?.message || error),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setIsSavingExternalKey(false);
    }
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

      <HStack justify="flex-end" mb={3}>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<SearchIcon />}
          onClick={() => setPatientSearchOpen(true)}
        >
          Search Patient DB
        </Button>
      </HStack>

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
            setInitialPhone(
              quickbookContext?.source === 'quickbook'
                ? (quickbookBooking?.phone || '')
                : ''
            );
            setLocalDisablePhoneInput(false);
          }
          if (onPatientSelected) onPatientSelected(null);
          setPatientModalOpen(true);
          setAddressManagerOpen(false);
        }}
      />

      <Wrap mt={4} spacing={3}>
        <WrapItem>
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
        </WrapItem>

        <WrapItem>
          <Button
            colorScheme="green"
            onClick={() => setVisitModalOpen(true)}
            disabled={!selectedPatient?.id || isSavingVisit}
          >
            {isSavingVisit ? <Spinner size="sm" /> : 'Book Visit'}
          </Button>
        </WrapItem>

        <WrapItem>
          <Button
            variant="outline"
            colorScheme="teal"
            onClick={openExternalKeyModal}
            disabled={!selectedPatient?.id}
          >
            Link Shivam MRNO
          </Button>
        </WrapItem>

        {quickbookContext?.source !== 'quickbook' && (
          <WrapItem>
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
          </WrapItem>
        )}
      </Wrap>

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
        initialPatient={selectedPatient || quickbookDraftPatient}
        initialPhone={
          selectedPatient
            ? undefined
            : (quickbookContext?.source === 'quickbook'
              ? (quickbookBooking?.phone || lastLookupPhone)
              : lastLookupPhone)
        }
        disablePhoneInput={selectedPatient ? false : true}
      />

      <LazyPatientSearchModal
        isOpen={patientSearchOpen}
        onClose={() => setPatientSearchOpen(false)}
        onSelect={handleSearchPatientSelect}
        themeMode={themeMode}
      />

      <Modal isOpen={externalKeyModalOpen} onClose={() => setExternalKeyModalOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Link Shivam MRNO</ModalHeader>
          <ModalCloseButton isDisabled={isSavingExternalKey} />
          <ModalBody>
            <FormControl isRequired>
              <FormLabel>External Key / MRNO</FormLabel>
              <Input
                value={externalKeyInput}
                onChange={(e) => {
                  setExternalKeyInput(e.target.value);
                  setSelectedExternalKeyCandidate(null);
                }}
                placeholder="Enter Shivam MRNO"
              />
            </FormControl>
            <Box mt={3}>
              <HStack justify="space-between" mb={2}>
                <Text fontSize="sm" fontWeight="600">Search from Shivam (by patient phone)</Text>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => fetchExternalKeyCandidates(selectedPatient?.phone)}
                  isLoading={externalKeySearchLoading}
                >
                  Search
                </Button>
              </HStack>
              {!externalKeySearchLoading && externalKeySearchDone && externalKeyCandidates.length === 0 && (
                <Text fontSize="xs" color="gray.500">
                  No linked external keys found from Shivam for this phone. Enter manually if needed.
                </Text>
              )}
              <VStack align="stretch" spacing={2} maxH="180px" overflowY="auto">
                {externalKeyCandidates.map((row, idx) => (
                  <Box key={`${row.external_key}-${idx}`} borderWidth="1px" borderRadius="md" p={2}>
                    <HStack justify="space-between" align="start">
                      <Box>
                        <Text fontSize="sm" fontWeight="600">{row.name || "Unknown"}</Text>
                        <Text fontSize="xs" color="gray.600">{row.phone || "-"}</Text>
                        <HStack spacing={2} mt={1}>
                          <Badge colorScheme="blue">{row.external_key}</Badge>
                          {row.mrn ? <Badge colorScheme="purple">MRN {row.mrn}</Badge> : null}
                        </HStack>
                      </Box>
                      <Button
                        size="xs"
                        colorScheme={selectedExternalKeyCandidate?.external_key === row.external_key ? "green" : "teal"}
                        variant={selectedExternalKeyCandidate?.external_key === row.external_key ? "solid" : "outline"}
                        onClick={() => {
                          setSelectedExternalKeyCandidate(row);
                          setExternalKeyInput(row.external_key);
                        }}
                      >
                        Use
                      </Button>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              mr={3}
              onClick={() => setExternalKeyModalOpen(false)}
              isDisabled={isSavingExternalKey}
            >
              Cancel
            </Button>
            <Button colorScheme="teal" onClick={saveExternalKey} isLoading={isSavingExternalKey}>
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

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
