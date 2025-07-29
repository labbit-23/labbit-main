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
  Input,
  Select,
} from "@chakra-ui/react";

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

export default function PatientModal({ isOpen, onClose, onSubmit, isLoading, initialData = {} }) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    dob: "",
    gender: "",
    email: "",
    cregno: "", // External patient key field
  });

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setFormData({
        name: "",
        phone: "",
        dob: "",
        gender: "",
        email: "",
        cregno: "",
      });
    } else if (initialData && Object.keys(initialData).length > 0) {
      // Prefill for edit or lookup
      setFormData({
        name: initialData.name || "",
        phone: initialData.phone || "",
        dob: initialData.dob || "",
        gender: initialData.gender || "",
        email: initialData.email || "",
        cregno: initialData.cregno || "",
      });
    }
  }, [isOpen, initialData]);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Create New Patient</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={formData.name} onChange={handleChange("name")} required />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Phone</FormLabel>
              <Input value={formData.phone} onChange={handleChange("phone")} required />
            </FormControl>
            <FormControl>
              <FormLabel>DOB</FormLabel>
              <Input
                type="date"
                value={formData.dob}
                onChange={handleChange("dob")}
                max={formatDate(new Date())}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Gender</FormLabel>
              <Select
                value={formData.gender}
                onChange={handleChange("gender")}
                placeholder="Select gender"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Email</FormLabel>
              <Input type="email" value={formData.email} onChange={handleChange("email")} />
            </FormControl>

            {/* Optionally display CREGNO field in UI (read-only or hidden) */}
            <FormControl>
              <FormLabel>External Key (CREGNO)</FormLabel>
              <Input
                value={formData.cregno}
                onChange={handleChange("cregno")}
                placeholder="External patient key"
                isReadOnly
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button isLoading={isLoading} colorScheme="brand" type="submit" mr={3}>
            Create
          </Button>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
