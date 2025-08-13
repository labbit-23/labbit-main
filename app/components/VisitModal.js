// File: /app/components/VisitModal.js
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, Button,
  VStack, FormControl, FormLabel, Select, Input,
  Text, Spinner, Box, Flex, useToast, IconButton
} from "@chakra-ui/react";
import { EditIcon } from "@chakra-ui/icons";
import dayjs from "dayjs";
import { useUser } from "../context/UserContext";
import AddressManager from "./AddressManager";
import AddressModal from "./AddressModal";
import { getModalFieldSettings } from "../../lib/modalFieldSettings";

const formatDate = (date) =>
  date ? new Date(date).toISOString().slice(0, 10) : "";

export default function VisitModal({
  isOpen,
  onClose,
  onSubmit,
  visitInitialData = {},
  patientId,
  isLoading: modalLoading,
}) {
  const toast = useToast();
  const { user, isLoading: userLoading } = useUser();
  if (userLoading || !user) return null;

  const role = (user.userType || user.executiveType || "patient").toLowerCase();
  const { hiddenFields, readOnlyFields, defaultValues } = useMemo(
    () => getModalFieldSettings("VisitModal", role),
    [role]
  );

  const patientName =
    visitInitialData?.patient?.name || "Unknown Patient";
  const initialPatientId =
    visitInitialData?.patient_id || patientId || "";

  const [formData, setFormData] = useState({
    id: null,
    patient_id: initialPatientId,
    executive_id: "",
    lab_id: "",
    visit_date: "",
    time_slot: "",
    address_id: "",
    address: "",
    status: defaultValues.status || "unassigned",
    ...defaultValues,
  });

  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [patientAddresses, setPatientAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [latestVisit, setLatestVisit] = useState(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);

  // Reset formData when visitInitialData changes
  useEffect(() => {
    if (visitInitialData?.id) {
      setFormData({
        id: visitInitialData.id,
        patient_id: visitInitialData.patient_id || patientId || "",
        executive_id:
          typeof visitInitialData.executive_id === "object"
            ? visitInitialData.executive_id.id
            : visitInitialData.executive_id || "",
        lab_id:
          typeof visitInitialData.lab_id === "object"
            ? visitInitialData.lab_id.id
            : visitInitialData.lab_id || "",
        visit_date: formatDate(visitInitialData.visit_date),
        time_slot:
          typeof visitInitialData.time_slot === "object"
            ? visitInitialData.time_slot.id
            : visitInitialData.time_slot || "",
        address_id: visitInitialData.address_id || "",
        address: visitInitialData.address || "",
        status: visitInitialData.status || defaultValues.status || "unassigned",
        ...defaultValues,
      });
    } else {
      setFormData({
        id: null,
        patient_id: patientId || "",
        executive_id: "",
        lab_id: "",
        visit_date: "",
        time_slot: "",
        address_id: "",
        address: "",
        status: defaultValues.status || "unassigned",
        ...defaultValues,
      });
    }
  }, [visitInitialData, patientId, defaultValues]);

  // Load dropdowns
  useEffect(() => {
    if (!isOpen) { setDropdownsLoading(true); return; }
    let isMounted = true;
    setDropdownsLoading(true);
    Promise.all([
      fetch("/api/executives").then(r => r.json()),
      fetch("/api/labs").then(r => r.json()),
      fetch("/api/visits/time_slots").then(r => r.json()),
      fetch("/api/visits/status").then(r => r.json()),
    ])
      .then(([execData, labsData, timeData, statusData]) => {
        if (!isMounted) return;
        setExecutives(Array.isArray(execData) ? execData.filter(
          e => e.type?.toLowerCase() === "phlebo" &&
               (e.status?.toLowerCase() === "active" || e.active)
        ) : []);
        setLabs(Array.isArray(labsData) ? labsData : []);
        setTimeSlots(Array.isArray(timeData) ? timeData : []);
        setStatusOptions(Array.isArray(statusData) ? statusData : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setExecutives([]); setLabs([]); setTimeSlots([]); setStatusOptions([]);
      })
      .finally(() => { if (isMounted) setDropdownsLoading(false); });
    return () => { isMounted = false; };
  }, [isOpen]);

  // Auto-select lab if only one
  useEffect(() => {
    if (!isOpen || !formData.patient_id || labs.length === 0) return;
    setFormData(prev => {
      if (!prev.lab_id) {
        if (labs.length === 1) return { ...prev, lab_id: labs[0].id };
        if (defaultValues.lab_id) return { ...prev, lab_id: defaultValues.lab_id };
      }
      return prev;
    });
  }, [isOpen, labs, formData.patient_id, defaultValues.lab_id]);

  // Validate time slot
  useEffect(() => {
    if (timeSlots.length === 0) return;
    setFormData(prev => {
      if (prev.time_slot && !timeSlots.some(slot => slot.id === prev.time_slot)) {
        return { ...prev, time_slot: "" };
      }
      return prev;
    });
  }, [timeSlots]);

  // Load latest visit summary
  useEffect(() => {
    if (!isOpen || !formData.patient_id) { setLatestVisit(null); return; }
    let cancelled = false;
    setLoadingLatest(true);
    fetch(`/api/visits?patient_id=${formData.patient_id}&limit=1&order=desc`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setLatestVisit(data?.[0] || null); })
      .catch(() => { if (!cancelled) setLatestVisit(null); })
      .finally(() => { if (!cancelled) setLoadingLatest(false); });
    return () => { cancelled = true; };
  }, [isOpen, formData.patient_id]);

  // Load full patient addresses + auto select default or single
  useEffect(() => {
    if (!formData.patient_id) { setPatientAddresses([]); return; }
    let cancelled = false;
    setLoadingAddresses(true);
    fetch(`/api/patients/addresses?patient_id=${formData.patient_id}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const addresses = Array.isArray(data) ? data : [];
        setPatientAddresses(addresses);
        if (!formData.address_id) {
          const defaultAddr = addresses.find(a => a.is_default);
          if (defaultAddr) {
            setFormData(f => ({
              ...f,
              address_id: defaultAddr.id,
              address: defaultAddr.area || defaultAddr.address_line || "",
            }));
          }
          else if (addresses.length === 1) {
            setFormData(f => ({
              ...f,
              address_id: addresses[0].id,
              address: addresses[0].area || addresses[0].address_line || "",
            }));
          }
        }
      })
      .catch(() => { if (!cancelled) setPatientAddresses([]); })
      .finally(() => { if (!cancelled) setLoadingAddresses(false); });
    return () => { cancelled = true; };
  }, [formData.patient_id]);

  const handleChange = field => e => {
    const val = e.target.value;
    if (field === "address_id") {
      const addr = patientAddresses.find(a => a.id === val);
      setFormData(f => ({
        ...f,
        address_id: val,
        address: addr?.area || addr?.address_line || f.address,
      }));
    } else {
      setFormData(f => ({ ...f, [field]: val }));
    }
  };

  const isValid =
    !!formData.patient_id &&
    !!formData.lab_id &&
    !!formData.visit_date &&
    !!formData.time_slot &&
    !!formData.address;

  const handleSubmit = e => {
    e.preventDefault();
    if (!isValid) {
      return toast({
        title: "Validation Error",
        description: "Please complete all required fields (Lab, Date, Time, Area/Address).",
        status: "warning",
      });
    }
    onSubmit(formData);
    toast({
      title: formData.id ? "Visit updated successfully." : "Visit created successfully.",
      status: "success",
    });
  };

  const renderRow = (label, field) => (
    <FormControl isRequired>
      <Flex align="center" gap={3}>
        <FormLabel m="0" flex="0 0 140px">{label}</FormLabel>
        {field}
      </Flex>
    </FormControl>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside" isCentered>
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleSubmit}>
          <ModalHeader>{formData.id ? "Edit" : "Create"} Visit</ModalHeader>
          <ModalCloseButton isDisabled={modalLoading} />
          <ModalBody>
            <Box mb={3}>
              <Text fontSize="lg" fontWeight="semibold" color="teal.600">
                {patientName}
              </Text>
            </Box>

            {dropdownsLoading ? (
              <Spinner size="xl" m="auto" />
            ) : (
              <VStack spacing={3} align="stretch">
                {loadingLatest ? (
                  <Spinner />
                ) : latestVisit ? (
                  <Box p={2} mb={3} borderWidth="1px" bg="gray.50" borderRadius="sm">
                    <Text fontWeight="semibold" fontSize="sm">Last Visit</Text>
                    <Text fontSize="xs">
                      Date: {dayjs(latestVisit.visit_date).format("YYYY-MM-DD")}
                    </Text>
                    <Text fontSize="xs">
                      Status: {latestVisit.status?.replace(/_/g, " ").toUpperCase() || "-"}
                    </Text>
                    <Text fontSize="xs">Address: {latestVisit.address || "-"}</Text>
                  </Box>
                ) : (
                  <Text fontSize="xs" mb={3} fontStyle="italic" color="gray.500">
                    No previous visit data.
                  </Text>
                )}

                {/* Executive */}
                {!hiddenFields.includes("executive_id") &&
                  renderRow("HV Executive",
                    <Select
                      value={formData.executive_id}
                      onChange={handleChange("executive_id")}
                      placeholder="Unassigned"
                      isDisabled={readOnlyFields.includes("executive_id")}
                    >
                      <option value="">Unassigned</option>
                      {executives.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </Select>
                  )}

                {/* Lab */}
                {!hiddenFields.includes("lab_id") &&
                  renderRow("Lab",
                    <Select
                      value={formData.lab_id}
                      onChange={handleChange("lab_id")}
                      placeholder="Select Lab"
                      isDisabled={readOnlyFields.includes("lab_id")}
                    >
                      {labs.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </Select>
                  )}

                {/* Visit Date */}
                {!hiddenFields.includes("visit_date") &&
                  renderRow("Visit Date",
                    <Input
                      type="date"
                      value={formData.visit_date}
                      onChange={handleChange("visit_date")}
                      min={formatDate(new Date())}
                      isDisabled={readOnlyFields.includes("visit_date")}
                    />
                  )}

                {/* Time Slot */}
                {!hiddenFields.includes("time_slot") &&
                  renderRow("Time Slot",
                    <Select
                      value={formData.time_slot}
                      onChange={handleChange("time_slot")}
                      placeholder="Select Time Slot"
                      isDisabled={readOnlyFields.includes("time_slot")}
                    >
                      {timeSlots.map(({ id, slot_name }) => (
                        <option key={id} value={id}>{slot_name}</option>
                      ))}
                    </Select>
                  )}

                {/* Address / Area */}
                {!hiddenFields.includes("address_id") &&
                  renderRow("Address / Area",
                    loadingAddresses ? (
                      <Spinner />
                    ) : patientAddresses.length > 0 ? (
                      <Flex w="100%" direction="column" gap={2}>
                        <Flex w="100%" gap={2}>
                          <Select
                            flex="1"
                            value={formData.address_id}
                            onChange={handleChange("address_id")}
                            placeholder="Select Saved Address"
                            isDisabled={readOnlyFields.includes("address_id")}
                          >
                            {patientAddresses.map(({ id, label, area, address_line }) => (
                              <option key={id} value={id}>
                                {label || address_line} {area ? `(${area})` : ""}
                              </option>
                            ))}
                          </Select>
                          <IconButton
                            aria-label="Edit address"
                            icon={<EditIcon />}
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const addr = patientAddresses.find(a => a.id === formData.address_id) || null;
                              if (!addr) return;
                              setEditingAddress(addr);
                              setIsAddressModalOpen(true);
                            }}
                          />
                        </Flex>
                        <Input
                          placeholder="Quick area (optional)"
                          value={formData.address}
                          onChange={e => setFormData(f => ({ ...f, address: e.target.value }))}
                        />
                      </Flex>
                    ) : (
                      <Input
                        placeholder="Enter area (quick)"
                        value={formData.address}
                        onChange={e => setFormData(f => ({ ...f, address: e.target.value }))}
                      />
                    )
                  )}

                {/* Status */}
                {!hiddenFields.includes("status") &&
                  renderRow("Status",
                    <Select
                      value={formData.status}
                      onChange={handleChange("status")}
                      isDisabled={readOnlyFields.includes("status")}
                    >
                      <optgroup label="Normal Progression">
                        {statusOptions.filter(s => s.order >= 1)
                          .sort((a, b) => a.order - b.order)
                          .map(({ code, label }) => (
                            <option key={code} value={code}>{label}</option>
                          ))}
                      </optgroup>
                      <optgroup label="Abnormal / Exception">
                        {statusOptions.filter(s => s.order <= 0)
                          .sort((a, b) => a.order - b.order)
                          .map(({ code, label }) => (
                            <option key={code} value={code}>{label}</option>
                          ))}
                      </optgroup>
                    </Select>
                  )}
              </VStack>
            )}
          </ModalBody>

          <ModalFooter justifyContent="flex-end" gap={3}>
            <Button
              isLoading={modalLoading}
              colorScheme="blue"
              type="submit"
              disabled={modalLoading || !isValid}
              minWidth="100px"
            >
              {formData.id ? "Update" : "Create"}
            </Button>
            <Button onClick={onClose} variant="outline" disabled={modalLoading} minWidth="100px">
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AddressModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        address={editingAddress}
        onSave={(updated) => {
          setIsAddressModalOpen(false);
          setPatientAddresses(prev => {
            const idx = prev.findIndex(a => a.id === updated.id);
            if (idx !== -1) {
              const copy = [...prev];
              copy[idx] = updated;
              return copy;
            }
            return [...prev, updated];
          });
          setFormData(f => ({
            ...f,
            address_id: updated.id,
            address: updated.area || updated.address_line || "",
          }));
        }}
      />
    </>
  );
}
