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
  patientId,
  isLoading,
}) {
  const [formData, setFormData] = useState({
    patient_id: "",
    executive_id: "",
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot: "", // store UUID of selected slot
    address_id: "",
    address: "", // snapshot of actual address text
    status: "unassigned",
  });

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

  const patientObj = patients.find((p) => p.id === patientId) || null;

  // Fetch dropdown data on modal open
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

  // Fetch patient addresses on modal open or patientId change
  useEffect(() => {
    if (!isOpen || !patientId) return setPatientAddresses([]);
    setLoadingPatientAddresses(true);
    fetch(`/api/patients/addresses?patient_id=${patientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return setPatientAddresses([]);
        const sorted = data.sort((a, b) => {
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return (a.address_index ?? 9999) - (b.address_index ?? 9999);
        });
        setPatientAddresses(sorted);
        if (sorted.length && !formData.address_id) {
          const defAdr = sorted.find((a) => a.is_default) ?? sorted[0];
          setFormData((f) => ({
            ...f,
            address_id: defAdr.id,
            address: defAdr.address_line,
          }));
        }
      })
      .catch(() => setPatientAddresses([]))
      .finally(() => setLoadingPatientAddresses(false));
  }, [isOpen, patientId, formData.address_id]);

  // Fetch last visit summary on modal open or patientId change
  useEffect(() => {
    if (!isOpen || !patientId) return setLatestVisit(null);
    setLoadingLatestVisit(true);
    fetch(`/api/visits?patient_id=${patientId}&limit=1&order=desc`)
      .then((r) => r.json())
      .then((data) => setLatestVisit(data?.[0] ?? null))
      .catch(() => setLatestVisit(null))
      .finally(() => setLoadingLatestVisit(false));
  }, [isOpen, patientId]);

  // Initialize form data on open or when visitInitialData changes
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
      });
      setPatientAddresses([]);
      setLatestVisit(null);
      setExecutives([]);
      setLabs([]);
      setTimeSlots([]);
      return;
    }
    const defaultStatus = "unassigned";
    if (visitInitialData) {
      setFormData({
        patient_id: visitInitialData.patient_id || patientId || "",
        executive_id: visitInitialData.executive_id || "",
        lab_id: visitInitialData.lab_id || "",
        visit_date: visitInitialData.visit_date ? formatDate(visitInitialData.visit_date) : formatDate(new Date()),
        time_slot: visitInitialData.time_slot || "",
        address_id: visitInitialData.address_id || "",
        address: visitInitialData.address || "",
        status: visitInitialData.status || defaultStatus,
      });
    } else {
      setFormData({
        patient_id: patientId || "",
        executive_id: "",
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot: "",
        address_id: "",
        address: "",
        status: defaultStatus,
      });
    }
  }, [isOpen, patientId, visitInitialData]);

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    if (field === "time_slot") {
      setFormData((f) => ({
        ...f,
        time_slot: val,
      }));
    } else if (field === "address_id") {
      const adr = patientAddresses.find((a) => a.id === val);
      setFormData((f) => ({
        ...f,
        address_id: val,
        address: adr?.address_line || "",
      }));
    } else {
      setFormData((f) => ({
        ...f,
        [field]: val,
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isPatientFixed = Boolean(patientId);

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

            <FormControl isRequired>
              <FormLabel>Patient</FormLabel>
              <Select
                value={formData.patient_id}
                onChange={handleChange("patient_id")}
                isDisabled={isPatientFixed}
                required
                placeholder={isPatientFixed ? undefined : "Select Patient"}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.phone})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>HV Executive</FormLabel>
              {loadingExecutives ? (
                <Spinner />
              ) : (
                <Select
                  value={formData.executive_id}
                  onChange={handleChange("executive_id")}
                  placeholder="Unassigned"
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
                >
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Visit Date</FormLabel>
              <Input
                type="date"
                value={formData.visit_date}
                onChange={handleChange("visit_date")}
                min={formatDate(new Date())}
                required
              />
            </FormControl>

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
                >
                  {timeSlots.map(({ id, start_time, end_time }) => (
                    <option key={id} value={id}>
                      {`${start_time.slice(0, 5)} - ${end_time.slice(0, 5)}`}
                    </option>
                  ))}
                </Select>
              )}
            </FormControl>

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

            <FormControl isRequired>
              <FormLabel>Status</FormLabel>
              <Select value={formData.status} onChange={handleChange("status")} required>
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
