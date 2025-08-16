// File: /app/components/VisitModal.js
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, Button,
  VStack, FormControl, FormLabel, Select, Input,
  Text, Spinner, Box, Flex, useToast, IconButton, Textarea, Image
} from "@chakra-ui/react";
import { EditIcon } from "@chakra-ui/icons";
import dayjs from "dayjs";
import { useUser } from "../context/UserContext";
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
  defaultExecutiveId = "",      // <-- add this line

}) {
  const toast = useToast();
  const { user, isLoading: userLoading } = useUser();
  if (userLoading || !user) return null;

  const role = (user.executiveType || user.userType || "patient").toLowerCase();
  const { hiddenFields, readOnlyFields, defaultValues } = useMemo(
    () => getModalFieldSettings("VisitModal", role),
    [role]
  );

  const patientName =
    visitInitialData?.patient?.name || "Unknown Patient";
  const initialPatientId =
    visitInitialData?.patient_id || patientId || "";
  const initialExecId = defaultValues.executive_id  || "";  

  const [uploadingPrescription, setUploadingPrescription] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    patient_id: initialPatientId,
    executive_id: initialExecId,
    lab_id: "",
    visit_date: "",
    time_slot: "",
    address_id: "",
    address: "",
    status: defaultValues.status || "unassigned",
    notes: visitInitialData?.tests?.length
      ? Array.isArray(visitInitialData.tests)
        ? visitInitialData.tests.join(", ")
        : visitInitialData.tests
      : visitInitialData?.package_name || visitInitialData?.notes || "",
    prescription: visitInitialData?.prescription || "",
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

  const handlePrescriptionFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return; // ✅ Skip if nothing selected

    setUploadingPrescription(true);
    try {
      const formDataObj = new FormData();
      formDataObj.append("file", file);

      const res = await fetch("/api/visits/upload-prescription", {
        method: "POST",
        body: formDataObj
      });

      const data = await res.json();
      if (res.ok) {
        setFormData(f => ({ ...f, prescription: data.url }));
        toast({ title: "Prescription uploaded", status: "success" });
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err) {
      toast({ title: "Error uploading prescription", description: err.message, status: "error" });
    } finally {
      setUploadingPrescription(false);
    }
  };

  useEffect(() => {
    if (visitInitialData?.id) {
      setFormData({
        id: visitInitialData.id,
        patient_id: visitInitialData.patient_id || patientId || "",
        executive_id: visitInitialData.executive_id && typeof visitInitialData.executive_id === "object"
          ? visitInitialData.executive_id.id
          : visitInitialData.executive_id || "",
        lab_id: visitInitialData.lab_id && typeof visitInitialData.lab_id === "object"
          ? visitInitialData.lab_id.id
          : visitInitialData.lab_id || "",
        visit_date: visitInitialData.visit_date ? formatDate(visitInitialData.visit_date) : "",
        time_slot: visitInitialData.time_slot && typeof visitInitialData.time_slot === "object"
          ? visitInitialData.time_slot.id
          : visitInitialData.time_slot || "",
        address_id: visitInitialData.address_id || "",
        address: visitInitialData.address || "",
        status: visitInitialData.status || defaultValues.status || "unassigned",
        notes: visitInitialData?.tests?.length
          ? Array.isArray(visitInitialData.tests)
            ? visitInitialData.tests.join(", ")
            : visitInitialData.tests
          : visitInitialData?.package_name || visitInitialData?.notes || "",
        prescription: visitInitialData?.prescription || "",
        ...defaultValues,
      });
    } else {
      //console.log('UserID: ' + user.id + '\n DefaultExecutiveID: ' +  defaultExecutiveId)
      // Create mode:
      let initialExecutive = "";

      if (role === "phlebo") {
        initialExecutive = String(user.id);
      } else if (defaultValues.executive_id) {
        initialExecutive = String(defaultValues.executive_id);
      }
      setFormData({
        id: null,
        patient_id: patientId || "",
        executive_id: initialExecutive,
        lab_id: "",
        visit_date: visitInitialData && visitInitialData.visit_date ? formatDate(visitInitialData.visit_date) : "",
        time_slot: visitInitialData && visitInitialData.time_slot
          ? typeof visitInitialData.time_slot === "object"
            ? visitInitialData.time_slot.id
            : visitInitialData.time_slot
          : "",
        address_id: "",
        address: "",
        status: defaultValues.status || "unassigned",
        notes: visitInitialData?.tests?.length
          ? Array.isArray(visitInitialData.tests)
            ? visitInitialData.tests.join(", ")
            : visitInitialData.tests
          : visitInitialData?.package_name || visitInitialData?.notes || "",
        prescription: "",
        ...defaultValues,
      });
    }
  }, [visitInitialData, patientId, defaultValues]);

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

  useEffect(() => {
    if (timeSlots.length === 0) return;
    setFormData(prev => {
      if (prev.time_slot && !timeSlots.some(slot => slot.id === prev.time_slot)) {
        return { ...prev, time_slot: "" };
      }
      return prev;
    });
  }, [timeSlots]);

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
          const defAddr = addresses.find(a => a.is_default);
          if (defAddr) {
            setFormData(f => ({
              ...f,
              address_id: defAddr.id,
              address: defAddr.area || defAddr.address_line || "",
            }));
          } else if (addresses.length === 1) {
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

  const renderRow = (label, field, required = true) => (
    <FormControl isRequired={required}>
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
                {/* HV Exec now optional */}
                {!hiddenFields.includes("executive_id") &&
                  renderRow(
                    "HV Executive",
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
                    </Select>,
                    false
                  )
                }

                {/* Lab */}
                {!hiddenFields.includes("lab_id") &&
                  renderRow("Lab", (
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
                  ))
                }

                {/* Visit Date */}
                {!hiddenFields.includes("visit_date") &&
                  renderRow("Visit Date", (
                    <Input
                      type="date"
                      value={formData.visit_date}
                      onChange={handleChange("visit_date")}
                      min={formatDate(new Date())}
                      isDisabled={readOnlyFields.includes("visit_date")}
                    />
                  ))
                }

                {/* Time Slot */}
                {!hiddenFields.includes("time_slot") &&
                  renderRow("Time Slot", (
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
                  ))
                }

                {/* Address */}
                {!hiddenFields.includes("address_id") &&
                  renderRow("Address / Area", (
                    loadingAddresses ? <Spinner /> :
                    patientAddresses.length > 0 ? (
                      <Flex gap={2}>
                        <Select
                          flex="1"
                          value={formData.address_id}
                          onChange={handleChange("address_id")}
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
                            const addr = patientAddresses.find(a => a.id === formData.address_id);
                            if (addr) {
                              setEditingAddress(addr);
                              setIsAddressModalOpen(true);
                            }
                          }}
                        />
                      </Flex>
                    ) : (
                      <Input
                        placeholder="Enter area"
                        value={formData.address}
                        onChange={handleChange("address")}
                      />
                    )
                  ))
                }

                {/* Status */}
                {!hiddenFields.includes("status") &&
                  renderRow("Status", (
                    <Select
                      value={formData.status}
                      onChange={handleChange("status")}
                    >
                      {statusOptions.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </Select>
                  ))
                }

                {/* Test List */}
                {renderRow("Test List", (
                  <Textarea
                    value={formData.notes}
                    onChange={handleChange("notes")}
                    placeholder="Enter test names..."
                  />
                ), false)}

                {/* Prescription Upload */}
                {renderRow("Prescription", (
                  <>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handlePrescriptionFile}
                      isDisabled={uploadingPrescription}
                    />
                    {uploadingPrescription && <Text fontSize="sm">Uploading...</Text>}
                    {formData.prescription && (
                      <Box mt={2}>
                        <Image src={formData.prescription} alt="Prescription" maxH="200px" />
                      </Box>
                    )}
                  </>
                ), false)}
              </VStack>
            )}
          </ModalBody>

          <ModalFooter gap={3}>
            <Button type="submit" isLoading={modalLoading} colorScheme="blue" disabled={!isValid}>
              {formData.id ? "Update" : "Create"}
            </Button>
            <Button onClick={onClose} variant="outline" disabled={modalLoading}>Cancel</Button>
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
