// app/admin/components/VisitModal.js
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
  Textarea,
  HStack,
  Spinner,
} from "@chakra-ui/react";

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

export default function VisitModal({
  isOpen,
  onClose,
  onSubmit,
  visitInitialData,
  patients = [],     // default empty array to avoid undefined
  executives = [],   // default empty array to avoid undefined
  labs = [],         // default empty array to avoid undefined
  timeSlots = [],    // default empty array to avoid undefined
  isLoading,
}) {
  const [formData, setFormData] = useState({
    patient_id: "",
    executive_id: "",
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot_id: "",
    address: "",
    status: "booked",
  });

  // Initialize form data when editing or on open
  useEffect(() => {
    if (visitInitialData) {
      setFormData({
        patient_id: visitInitialData.patient_id || "",
        executive_id: visitInitialData.executive_id || "",
        lab_id: visitInitialData.lab_id || "",
        visit_date: formatDate(visitInitialData.visit_date) || formatDate(new Date()),
        time_slot_id: visitInitialData.time_slot_id || "",
        address: visitInitialData.address || "",
        status: visitInitialData.status || "booked",
      });
    } else {
      setFormData({
        patient_id: "",
        executive_id: "",
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot_id: "",
        address: "",
        status: "booked",
      });
    }
  }, [visitInitialData, isOpen]);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Helper to render time slot display fallback
  const getTimeSlotDisplay = (visit) => {
    // Prefer nested time_slot object if available
    if (visit.time_slot && visit.time_slot.slot_name) {
      return `${visit.time_slot.slot_name} (${visit.time_slot.start_time.slice(0, 5)} - ${visit.time_slot.end_time.slice(0, 5)})`;
    }
    // Fallback: find from timeSlots prop by id or time_slot_id
    if (timeSlots.length) {
      const tsId = visit.time_slot_id || visit.time_slot; // either form
      const matchedSlot = timeSlots.find((s) => s.id === tsId);
      if (matchedSlot) {
        return `${matchedSlot.slot_name} (${matchedSlot.start_time.slice(0, 5)} - ${matchedSlot.end_time.slice(0, 5)})`;
      }
    }
    return "Unknown";
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleFormSubmit}>
        <ModalHeader>{visitInitialData ? "Edit Visit" : "Create Visit"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel>Patient</FormLabel>
              <Select value={formData.patient_id} onChange={handleChange("patient_id")} required>
                <option value="">Select Patient</option>
                {(patients || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.phone})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>HV Executive</FormLabel>
              <Select value={formData.executive_id} onChange={handleChange("executive_id")}>
                <option value="">Unassigned</option>
                {(executives || []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.status})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Lab</FormLabel>
              <Select value={formData.lab_id} onChange={handleChange("lab_id")} required>
                <option value="">Select Lab</option>
                {(labs || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Visit Date</FormLabel>
              <Input
                type="date"
                value={formData.visit_date}
                min={formatDate(new Date())}
                onChange={handleChange("visit_date")}
                required
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Time Slot</FormLabel>
              <Select value={formData.time_slot_id} onChange={handleChange("time_slot_id")} required>
                <option value="">Select Time Slot</option>
                {(timeSlots || []).map(({ id, slot_name, start_time, end_time }) => (
                  <option key={id} value={id}>
                    {slot_name} ({start_time.slice(0, 5)} - {end_time.slice(0, 5)})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Address</FormLabel>
              <Textarea
                value={formData.address}
                onChange={handleChange("address")}
                placeholder="Address for sample collection"
                rows={3}
                required
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Status</FormLabel>
              <Select value={formData.status} onChange={handleChange("status")} required>
                {[
                  "booked",
                  "accepted",
                  "pending",
                  "postponed",
                  "rejected",
                  "in_progress",
                  "sample_picked",
                  "sample_dropped",
                  "completed",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ").toUpperCase()}
                  </option>
                ))}
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button isLoading={isLoading} colorScheme="brand" type="submit" mr={3}>
            {visitInitialData ? "Update" : "Create"}
          </Button>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
