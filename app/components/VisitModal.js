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
  Switch,
  Flex,
  Spacer,
  useToast,
} from "@chakra-ui/react";
import dayjs from "dayjs";
import { useUser } from "../context/UserContext";
import { useModalSettings } from "../../lib/useModalSettings";
import AddressManager from "./AddressManager";

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
};

export default function VisitModal({
  isOpen,
  onClose,
  onSubmit,
  visitInitialData,
  patientId,
  patients = [],
  isLoading,
}) {
  const toast = useToast();
  const user = useUser();
  const { hiddenFields, readOnlyFields, defaultValues } = useModalSettings("VisitModal");

  const safeVisitInitialData = visitInitialData || {};

  // Determine resolved patient ID with fallback priorities
  const userPatientId = user?.userType === "patient" ? user.id : "";
  const resolvedPatientId = patientId || safeVisitInitialData.patient_id || userPatientId || "";

  // Form data state initialization including id for edit
  const [formData, setFormData] = useState(() => ({
    id: safeVisitInitialData.id || null,
    patient_id: resolvedPatientId || defaultValues.patient_id || "",
    executive_id: safeVisitInitialData.executive_id || defaultValues.executive_id || "",
    lab_id: safeVisitInitialData.lab_id || defaultValues.lab_id || "",
    visit_date: safeVisitInitialData.visit_date
      ? formatDate(safeVisitInitialData.visit_date)
      : defaultValues.visit_date || formatDate(new Date()),
    time_slot:
      typeof safeVisitInitialData.time_slot === "object"
        ? safeVisitInitialData.time_slot.id
        : safeVisitInitialData.time_slot || defaultValues.time_slot || "",
    address_id: safeVisitInitialData.address_id || defaultValues.address_id || "",
    address: safeVisitInitialData.address || defaultValues.address || "",
    status: safeVisitInitialData.status || defaultValues.status || "unassigned",
  }));

  // Sync formData.patient_id if patientId prop changes
  useEffect(() => {
    if (patientId && formData.patient_id !== patientId) {
      setFormData((f) => ({ ...f, patient_id: patientId }));
      console.log("[VisitModal] formData.patient_id updated from prop patientId:", patientId);
    }
  }, [patientId]);

  // Dropdown data and loading states
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);

  // Address toggle and loading state
  const [showAddresses, setShowAddresses] = useState(false);
  const [patientAddresses, setPatientAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Latest visit and loading state
  const [latestVisit, setLatestVisit] = useState(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  // Load dropdown data on modal open
  useEffect(() => {
    if (!isOpen) {
      setDropdownsLoading(true);
      return;
    }
    let isMounted = true;
    setDropdownsLoading(true);
    Promise.all([
      fetch("/api/executives").then((r) => r.json()),
      fetch("/api/labs").then((r) => r.json()),
      fetch("/api/visits/time_slots").then((r) => r.json()),
    ])
      .then(([execData, labsData, timeSlotsData]) => {
        if (!isMounted) return;
        setExecutives(
          Array.isArray(execData)
            ? execData.filter(
                (e) =>
                  e.type?.toLowerCase() === "phlebo" &&
                  (e.status?.toLowerCase() === "active" || e.active)
              )
            : []
        );
        setLabs(Array.isArray(labsData) ? labsData : []);
        setTimeSlots(Array.isArray(timeSlotsData) ? timeSlotsData : []);
      })
      .catch(() => {
        if (isMounted) {
          setExecutives([]);
          setLabs([]);
          setTimeSlots([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setDropdownsLoading(false);
          setShowAddresses(false);
          setPatientAddresses([]);
          setLatestVisit(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Auto-select default lab if only one exists
  useEffect(() => {
    if (!isOpen || !formData.patient_id || labs.length === 0) return;

    if (labs.length === 1 && !formData.lab_id) {
      console.log("[VisitModal] auto-selecting single lab:", labs[0]);
      setFormData((f) => ({ ...f, lab_id: labs[0].id }));
    } else if (!formData.lab_id && defaultValues.lab_id) {
      setFormData((f) => ({ ...f, lab_id: defaultValues.lab_id }));
    }
  }, [isOpen, labs, formData.patient_id, defaultValues.lab_id, formData.lab_id]);

  // Load latest visit summary on modal open or patient change
  useEffect(() => {
    if (!isOpen || !formData.patient_id) {
      setLatestVisit(null);
      return;
    }
    let cancelled = false;
    setLoadingLatest(true);
    fetch(`/api/visits?patient_id=${formData.patient_id}&limit=1&order=desc`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setLatestVisit(data?.[0] || null);
        }
      })
      .catch(() => {
        if (!cancelled) setLatestVisit(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingLatest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, formData.patient_id]);

  // Fetch addresses on toggle and patient id present
  useEffect(() => {
    if (!showAddresses || !formData.patient_id) {
      setPatientAddresses([]);
      return;
    }
    let cancelled = false;
    setLoadingAddresses(true);
    fetch(`/api/patients/addresses?patient_id=${formData.patient_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setPatientAddresses(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setPatientAddresses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAddresses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAddresses, formData.patient_id]);

  const toggleAddresses = () => setShowAddresses((v) => !v);

  // Form field change handler - preserves all fields including id
  const handleChange = (field) => (e) => {
    const val = e.target.value;
    if (field === "address_id") {
      const addr = patientAddresses.find((a) => a.id === val);
      setFormData((f) => ({
        ...f,
        address_id: val,
        address: addr?.address_line || "",
      }));
    } else {
      setFormData((f) => ({ ...f, [field]: val }));
    }
  };

  // Validation - required fields and address if shown
  const isValid =
    Boolean(formData.patient_id) &&
    Boolean(formData.lab_id) &&
    Boolean(formData.visit_date) &&
    Boolean(formData.time_slot) &&
    (!showAddresses || Boolean(formData.address_id));

  // Submit handler, passes entire formData including id
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("[VisitModal] submit with formData:", formData);

    if (typeof onSubmit !== "function") {
      toast({
        title: "Submission Error",
        description: "Submit handler missing.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please complete all required fields.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    onSubmit(formData);
  };

  // Patient ID fixed if readonly or prop present and not hidden
  const isPatientFixed = Boolean(
    (resolvedPatientId && !hiddenFields.includes("patient_id")) || readOnlyFields.includes("patient_id")
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>
          {safeVisitInitialData.id ? "Edit" : "Create"} Visit
          <Flex align="center" mt={2}>
            <Text fontSize="sm" mr={2}>
              Show Addresses:
            </Text>
            <Switch isChecked={showAddresses} onChange={toggleAddresses} />
            <Spacer />
          </Flex>
        </ModalHeader>
        <ModalCloseButton isDisabled={isLoading} />
        <ModalBody>
          {dropdownsLoading ? (
            <Spinner size="xl" m="auto" />
          ) : (
            <VStack spacing={4} align="stretch">
              {loadingLatest ? (
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
                        {p.name} ({p.phone || "No phone"})
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}

              {!hiddenFields.includes("executive_id") && (
                <FormControl>
                  <FormLabel>HV Executive</FormLabel>
                  <Select
                    value={formData.executive_id || ""}
                    onChange={handleChange("executive_id")}
                    placeholder="Unassigned"
                    isDisabled={readOnlyFields.includes("executive_id")}
                  >
                    <option value="">Unassigned</option>
                    {executives.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.status || "unknown"})
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}

              {!hiddenFields.includes("lab_id") && (
                <FormControl isRequired>
                  <FormLabel>Lab</FormLabel>
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
                </FormControl>
              )}

              {showAddresses && !hiddenFields.includes("address_id") && (
                <FormControl isRequired>
                  <FormLabel>Address for Sample Collection</FormLabel>
                  {loadingAddresses ? (
                    <Spinner />
                  ) : patientAddresses.length > 0 ? (
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
                    <>
                      <Text fontStyle="italic" color="gray.600" mb={2}>
                        No saved addresses.
                      </Text>
                      <AddressManager
                        patientId={formData.patient_id}
                        onAddressAdded={(newAddress) => {
                          setPatientAddresses((prev) => [...prev, newAddress]);
                          setFormData((f) => ({
                            ...f,
                            address_id: newAddress.id,
                            address: newAddress.address_line,
                          }));
                        }}
                      />
                    </>
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
          )}
        </ModalBody>

        <ModalFooter justifyContent="flex-end" gap={3}>
          <Button
            isLoading={isLoading}
            colorScheme="blue"
            type="submit"
            disabled={isLoading || !isValid}
            minWidth="100px"
          >
            {safeVisitInitialData.id ? "Update" : "Create"}
          </Button>
          <Button disabled={isLoading} onClick={onClose} minWidth="100px" variant="outline">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
