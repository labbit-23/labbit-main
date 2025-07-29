// ExecutiveModal.js
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

function ExecutiveModal({ isOpen, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    status: "active",
  });

  useEffect(() => {
    if (!isOpen) {
      setFormData({ name: "", phone: "", status: "active" });
    }
  }, [isOpen]);

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
        <ModalHeader>Create HV Executive</ModalHeader>
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
            <FormControl isRequired>
              <FormLabel>Status</FormLabel>
              <Select value={formData.status} onChange={handleChange("status")} required>
                <option value="active">Active</option>
                <option value="available">Available</option>
                <option value="inactive">Inactive</option>
              </Select>
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

export default ExecutiveModal;
