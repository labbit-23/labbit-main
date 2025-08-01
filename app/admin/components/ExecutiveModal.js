"use client";

import React, { useEffect, useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Switch,
  HStack,
  useToast,
} from "@chakra-ui/react";

export default function ExecutiveModal({
  isOpen,
  onClose,
  onSaveSuccess,          // Callback when save is successful to refresh parent list
  initialData = null,     // Object with executive info to edit or null for new
}) {
  const toast = useToast();

  const roles = ["Phlebo", "Admin", "Courier", "Management"]; // Customize as needed

  // Default form state
  const defaultForm = {
    id: null,
    name: "",
    phone: "",
    type: roles[0],
    active: true,
  };

  const [formData, setFormData] = useState(defaultForm);
  const [loading, setLoading] = useState(false);  // Form submit loading state

  // Initialize form on modal open or when initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData && typeof initialData.id !== "undefined" && initialData.id !== null) {
        // Editing existing executive
        setFormData({
          id: initialData.id,
          name: initialData.name || "",
          phone: initialData.phone || "",
          type: roles.includes(initialData.type) ? initialData.type : roles[0],
          active: typeof initialData.active === "boolean" ? initialData.active : true,
        });
      } else {
        // Creating new executive
        setFormData(defaultForm);
      }
    }
  // Only run when modal opens or executive id changes
  }, [isOpen, initialData?.id]);

  // General input change handler
  const handleChange = (field) => (event) => {
    const val = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  // Basic validation
  const validate = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", status: "warning" });
      return false;
    }
    if (!formData.phone.trim()) {
      toast({ title: "Phone number is required", status: "warning" });
      return false;
    }
    if (!/^\d{10}$/.test(formData.phone.trim())) {
      toast({ title: "Enter a valid 10-digit phone number", status: "warning" });
      return false;
    }
    if (!formData.type || !roles.includes(formData.type)) {
      toast({ title: "Role selection is required", status: "warning" });
      return false;
    }
    return true;
  };

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      // Use appropriate HTTP method based on presence of id (edit or create)
      const method = formData.id ? "PUT" : "POST";

      const res = await fetch("/api/executives", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save executive");
      }

      const savedExec = await res.json();
      toast({
        title: `Executive ${formData.id ? "updated" : "created"} successfully!`,
        status: "success",
      });

      // Notify parent to refresh list and close modal
      if (onSaveSuccess) {
        onSaveSuccess(savedExec);
      }

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        status: "error",
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const isEditing = Boolean(formData.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!loading) onClose();
      }}
      size="md"
      isCentered
      closeOnOverlayClick={!loading}
      closeOnEsc={!loading}
    >
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit} data-testid="executive-modal">
        <ModalHeader>{isEditing ? "Update Executive" : "Create Executive"}</ModalHeader>
        <ModalCloseButton disabled={loading} />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl id="name" isRequired>
              <FormLabel>Name</FormLabel>
              <Input
                placeholder="Full name"
                value={formData.name}
                onChange={handleChange("name")}
                disabled={loading}
                autoFocus
              />
            </FormControl>

            <FormControl id="phone" isRequired>
              <FormLabel>Phone Number</FormLabel>
              <Input
                placeholder="10-digit phone"
                value={formData.phone}
                onChange={handleChange("phone")}
                maxLength={10}
                disabled={loading}
                type="tel"
              />
            </FormControl>

            <FormControl id="type" isRequired>
              <FormLabel>Role</FormLabel>
              <Select
                value={formData.type}
                onChange={handleChange("type")}
                disabled={loading}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl id="active">
              <HStack alignItems="center">
                <FormLabel htmlFor="active-switch" mb="0">
                  Active
                </FormLabel>
                <Switch
                  id="active-switch"
                  isChecked={formData.active}
                  onChange={handleChange("active")}
                  disabled={loading}
                />
              </HStack>
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button
            type="submit"
            colorScheme="blue"
            isLoading={loading}
            isDisabled={loading}
            mr={3}
          >
            {isEditing ? "Update" : "Save"}
          </Button>
          <Button onClick={onClose} isDisabled={loading} variant="ghost">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
