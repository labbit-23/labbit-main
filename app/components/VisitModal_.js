// File: /app/components/VisitModal.js

"use client";

import React, { useEffect, useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Select,
  Input,
  Text,
  Spinner,
  Box,
} from "@chakra-ui/react";
import dayjs from "dayjs";

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
};

export default function VisitModal({
  isOpen,
  onClose,
  onSubmit,
  visitInitialData,
  patients = [],
  patientId: propPatientId,
  executiveId: propExecutiveId,
  hiddenFields = [],
  readOnlyFields = [],
  defaultValues = {},
  isLoading,
}) {
  // Dropdown and related data state
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [patientAddresses, setPatientAddresses] = useState([]);
  const [latestVisit, setLatestVisit] = useState(null);

  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [loadingPatientAddresses, setLoadingPatientAddresses] = useState(false);
  const [loadingLatestVisit, setLoadingLatestVisit] = useState(false);

  // Form state merged with defaultValues initial set
  const [formData, setFormData] = useState({
    patient_id: "",
    executive_id: "",
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot: "",
    address_id: "",
    address: "",
    status: "unassigned",
    ...defaultValues,
  });

  // Fetch dropdown data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setLoadingExecutives(true);
    fetch("/api/executives")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return setExecutives([]);
        setExecutives(
          data.filter(
            (e) =>
              e.type?.toLowerCase() === "phlebo" &&
              (e.status?.toLowerCase() === "active" || e.active)
          )
        );
      })
      .catch(() => setExecutives([]))
      .finally(() => setLoadingExecutives(false));

    setLoadingLabs(true);
    fetch("/api/labs")
      .then((r) => r.json())
      .then((data) => setLabs(Array.isArray(data) ? data : []))
      .catch(() => setLabs([]))
      .finally(() => setLoadingLabs(false));

    setLoadingTimeSlots(true);
    fetch("/api/visits/time_slots")
      .then((r) => r.json())
      .then((data) => setTimeSlots(Array.isArray(data) ? data : []))
      .catch(() => setTimeSlots([]))
      .finally(() => setLoadingTimeSlots(false));
  }, [isOpen]);

  // Effect 1: Fetch patient addresses when modal opens or patient_id changes (no formData mutation here)
  useEffect(() => {
    if (!isOpen || !formData.patient_id) {
      setPatientAddresses([]);
      return;
    }
    setLoadingPatientAddresses(true);
    fetch(`/api/patients/addresses?patient_id=${formData.patient_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) {
          setPatientAddresses([]);
          return;
        }
        const sorted = data.sort((a, b) => {
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return (a.address_index ?? 9999) - (b.address_index ?? 9999);
        });
        setPatientAddresses(sorted);
      })
      .catch(() => setPatientAddresses([]))
      .finally(() => setLoadingPatientAddresses(false));
  }, [isOpen, formData.patient_id]);

  // Effect 2: Set default address_id and address in formData once patientAddresses loaded and not already set
  useEffect(() => {
    if (
      isOpen &&
      formData.patient_id &&
      patientAddresses.length > 0 &&
      (formData.address_id === "" || formData.address_id == null)
    ) {
      const defAdr = patientAddresses.find((a) => a.is_default) ?? patientAddresses[0];
      setFormData((f) =>
        f.address_id === defAdr.id
          ? f // Prevent update if already set correctly
          : {
              ...f,
              address_id: defAdr.id,
              address: defAdr.address_line,
            }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, formData.patient_id, patientAddresses]);

  // Fetch last visit summary when modal opens or patient_id changes
  useEffect(() => {
    if (!isOpen || !formData.patient_id) {
      setLatestVisit(null);
      return;
    }
    setLoadingLatestVisit(true);
    fetch(`/api/visits?patient_id=${formData.patient_id}&limit=1&order=desc`)
      .then((r) => r.json())
      .then((data) => setLatestVisit(data?.[0] ?? null))
      .catch(() => setLatestVisit(null))
      .finally(() => setLoadingLatestVisit(false));
  }, [isOpen, formData.patient_id]);

  // Initialize formData on modal open or when relevant props change
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        patient_id: "",
        executive_id: "",
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot: "",
        address_id: "",
        address: "",
        status: "unassigned",
        ...defaultValues,
      });
      setPatientAddresses([]);
      setLatestVisit(null);
      setExecutives([]);
      setLabs([]);
      setTimeSlots([]);
      return;
    }

    const basePatientId = visitInitialData?.patient_id ?? propPatientId ?? "";
    const baseExecutiveId = visitInitialData?.executive_id ?? propExecutiveId ?? "";

    const composedDefaults = { ...defaultValues };

    setFormData({
      patient_id: basePatientId || composedDefaults.patient_id || "",
      executive_id: baseExecutiveId || composedDefaults.executive_id || "",
      lab_id: visitInitialData?.lab_id || composedDefaults.lab_id || "",
      visit_date: visitInitialData?.visit_date
        ? formatDate(visitInitialData.visit_date)
        : composedDefaults.visit_date || formatDate(new Date()),
      time_slot:
        typeof visitInitialData?.time_slot === "object"
          ? visitInitialData.time_slot.id
          : visitInitialData?.time_slot || composedDefaults.time_slot || "",
      address_id: visitInitialData?.address_id || composedDefaults.address_id || "",
      address: visitInitialData?.address || composedDefaults.address || "",
      status: visitInitialData?.status || composedDefaults.status || "unassigned",
    });
  }, [isOpen, propPatientId, propExecutiveId, visitInitialData, defaultValues]);

  // Generalized handler for input changes
  const handleChange = (field) => (e) => {
    const val = e.target.value;
    if (field === "time_slot") {
      setFormData((f) => ({ ...f, time_slot: val }));
    } else if (field === "address_id") {
      const adr = patientAddresses.find((a) => a.id === val);
      setFormData((f) => ({
        ...f,
        address_id: val,
        address: adr?.address_line || "",
      }));
    } else {
      setFormData((f) => ({ ...f, [field]: val }));
    }
  };

  // Submit handler
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isPatientFixed = Boolean(
    (propPatientId && !hiddenFields.includes("patient_id")) || readOnlyFields.includes("patient_id")
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>{visitInitialData ? "Edit" : "Create"} Visit</ModalHeader>
        <ModalCloseButton isDisabled={isLoading} />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {loadingLatestVisit ? (
              <Spinner />
            ) : latestVisit ? (
              <Box p={3} mb={4} borderWidth="1px" bg="gray.50" borderRadius="md">
                <Text fontWeight="bold" mb={2}>
                  Last Visit Summary
                </Text>
                <Text>Date: {dayjs(latestVisit.visit_date).format("YYYY-MM-DD")}</Text>
                <Text>Status: {latestVisit.status?.replace(/_/g, " ") || "-"}</Text>
                <Text>Address: {latestVisit.address || "-"}</Text>
              </Box>
            ) : (
              <Text mb={4} fontStyle="italic" color="gray.600">
                No previous visit data.
              </Text>
            )}

            {!hiddenFields.includes("patient_id") && (
              <FormControl isRequired>
                <FormLabel>Patient</FormLabel>
                <Select
                  value={formData.patient_id}
                  onChange={handleChange("patient_id")}
                  isDisabled={isPatientFixed}
                  placeholder={isPatientFixed ? undefined : "Select Patient"}
                  required
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone})
                    </option>
                  ))}
                </Select>
              </FormControl>
            )}

            {!hiddenFields.includes("executive_id") && (
              <FormControl>
                <FormLabel>HV Executive</FormLabel>
                {loadingExecutives ? (
                  <Spinner />
                ) : (
                  <Select
                    value={formData.executive_id || ""}
                    onChange={handleChange("executive_id")}
                    placeholder="Unassigned"
                    isDisabled={readOnlyFields.includes("executive_id")}
                  >
                    <option value="">Unassigned</option>
                    {executives.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.status})
                      </option>
                    ))}
                  </Select>
                )}
              </FormControl>
            )}

            {!hiddenFields.includes("lab_id") && (
              <FormControl isRequired>
                <FormLabel>Lab</FormLabel>
                {loadingLabs ? (
                  <Spinner />
                ) : (
                  <Select
                    value={formData.lab_id}
                    onChange={handleChange("lab_id")}
                    required
                    placeholder="Select Lab"
                    isDisabled={readOnlyFields.includes("lab_id")}
                  >
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormControl>
            )}

            {!hiddenFields.includes("visit_date") && (
              <FormControl isRequired>
                <FormLabel>Visit Date</FormLabel>
                <Input
                  type="date"
                  value={formData.visit_date}
                  onChange={handleChange("visit_date")}
                  min={formatDate(new Date())}
                  required
                  disabled={readOnlyFields.includes("visit_date")}
                />
              </FormControl>
            )}

            {!hiddenFields.includes("time_slot") && (
              <FormControl isRequired>
                <FormLabel>Time Slot</FormLabel>
                {loadingTimeSlots ? (
                  <Spinner />
                ) : (
                  <Select
                    value={formData.time_slot}
                    onChange={handleChange("time_slot")}
                    required
                    placeholder="Select Time Slot"
                    isDisabled={readOnlyFields.includes("time_slot")}
                  >
                    {timeSlots.map(({ id, start_time, end_time }) => (
                      <option key={id} value={id}>
                        {`${start_time.slice(0, 5)} - ${end_time.slice(0, 5)}`}
                      </option>
                    ))}
                  </Select>
                )}
              </FormControl>
            )}

            {!hiddenFields.includes("address_id") && (
              <FormControl isRequired>
                <FormLabel>Address for Sample Collection</FormLabel>
                {loadingPatientAddresses ? (
                  <Spinner />
                ) : patientAddresses.length ? (
                  <Select
                    value={formData.address_id}
                    onChange={handleChange("address_id")}
                    required
                    placeholder="Select Address"
                    isDisabled={readOnlyFields.includes("address_id")}
                  >
                    {patientAddresses.map(({ id, address_line }) => (
                      <option key={id} value={id}>
                        {address_line}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Text fontStyle="italic" color="gray.600">
                    No saved addresses.
                  </Text>
                )}
              </FormControl>
            )}

            {!hiddenFields.includes("status") && (
              <FormControl isRequired>
                <FormLabel>Status</FormLabel>
                <Select
                  value={formData.status}
                  onChange={handleChange("status")}
                  required
                  isDisabled={readOnlyFields.includes("status")}
                >
                  {[
                    "unassigned",
                    "booked",
                    "accepted",
                    "pending",
                    "postponed",
                    "rejected",
                    "in_progress",
                    "sample_picked",
                    "sample_dropped",
                    "completed",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </FormControl>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter justifyContent="flex-end" gap={3}>
          <Button
            isLoading={isLoading}
            colorScheme="blue"
            type="submit"
            disabled={isLoading}
            minWidth="100px"
          >
            {visitInitialData ? "Update" : "Create"}
          </Button>
          <Button disabled={isLoading} onClick={onClose} minWidth="100px" variant="outline">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
