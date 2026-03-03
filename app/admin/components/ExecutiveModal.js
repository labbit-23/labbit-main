//app/admin/components/ExecutiveModal.js

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
  Checkbox,
  CheckboxGroup,
  Stack,
  Text,
} from "@chakra-ui/react";

export default function ExecutiveModal({
  isOpen,
  onClose,
  onSaveSuccess,
  initialData = null,
}) {
  const toast = useToast();
  const roles = [
    { value: "Phlebo", label: "Phlebo" },
    { value: "Admin", label: "Admin" },
    { value: "Manager", label: "Manager" },
    { value: "Director", label: "Director" },
    { value: "logistics", label: "Logistics" },
    { value: "b2b", label: "Collection Centre" },
  ];

  const defaultForm = {
    id: null,
    name: "",
    phone: "",
    email: "",
    type: roles[0].value,
    active: true,
    lab_id: "",
    collection_centre_ids: [],
  };

  const [formData, setFormData] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [labs, setLabs] = useState([]);
  const [collectionCentres, setCollectionCentres] = useState([]);

  const isCollectionRole = ["logistics", "b2b"].includes(
    (formData.type || "").toLowerCase()
  );

  useEffect(() => {
    if (isOpen) {
      // Fetch labs for logged-in admin only
      fetch("/api/labs?my_labs=true")
        .then((r) => r.json())
        .then((data) => setLabs(Array.isArray(data) ? data : []))
        .catch(() => setLabs([]));

      fetch("/api/collection-centres?my_labs=true")
        .then((r) => r.json())
        .then((data) => setCollectionCentres(Array.isArray(data) ? data : []))
        .catch(() => setCollectionCentres([]));

      if (initialData && initialData.id != null) {
        setFormData({
          id: initialData.id,
          name: initialData.name || "",
          phone: initialData.phone || "",
          email: initialData.email || "",
          type: roles.some((role) => role.value === initialData.type)
            ? initialData.type
            : roles[0].value,
          active:
            typeof initialData.active === "boolean"
              ? initialData.active
              : true,
          lab_id: initialData.lab_id || "",
          collection_centre_ids: Array.isArray(initialData.collection_centre_ids)
            ? initialData.collection_centre_ids.map((v) => String(v))
            : [],
        });
      } else {
        setFormData(defaultForm);
      }
    }
  }, [isOpen, initialData]);

  const handleChange = (field) => (event) => {
    const val =
      event.target.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

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
      toast({
        title: "Enter a valid 10-digit phone number",
        status: "warning",
      });
      return false;
    }
    if (formData.email.trim() && !validateEmail(formData.email.trim())) {
      toast({ title: "Please enter a valid email", status: "warning" });
      return false;
    }
    if (!formData.type || !roles.some((role) => role.value === formData.type)) {
      toast({ title: "Role selection is required", status: "warning" });
      return false;
    }
    if (!formData.lab_id) {
      toast({ title: "Lab assignment is required", status: "warning" });
      return false;
    }
    if (isCollectionRole && (formData.collection_centre_ids || []).length === 0) {
      toast({
        title: "At least one collection centre is required for this role",
        status: "warning",
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const method = formData.id ? "PUT" : "POST";

      const res = await fetch("/api/executives", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          collection_centre_ids: (formData.collection_centre_ids || []).map((v) => String(v)),
        }),
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
      <ModalContent
        as="form"
        onSubmit={handleSubmit}
        data-testid="executive-modal"
      >
        <ModalHeader>
          {isEditing ? "Update Executive" : "Create Executive"}
        </ModalHeader>
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

            <FormControl id="email">
              <FormLabel>Email Address</FormLabel>
              <Input
                placeholder="Email"
                value={formData.email}
                onChange={handleChange("email")}
                disabled={loading}
                type="email"
                autoComplete="off"
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
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl id="lab_id" isRequired>
              <FormLabel>Lab</FormLabel>
              <Select
                value={formData.lab_id}
                onChange={handleChange("lab_id")}
                disabled={loading}
              >
                <option value="">Select lab</option>
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
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

            {isCollectionRole && (
              <FormControl id="collection_centres">
                <FormLabel>Collection Centres</FormLabel>
                {collectionCentres.length === 0 ? (
                  <Text fontSize="sm" color="orange.500">
                    No collection centres found. Add centres first.
                  </Text>
                ) : (
                  <CheckboxGroup
                    value={(formData.collection_centre_ids || []).map((v) => String(v))}
                    onChange={(values) =>
                      setFormData((prev) => ({
                        ...prev,
                        collection_centre_ids: values,
                      }))
                    }
                  >
                    <Stack spacing={2} maxH="160px" overflowY="auto" p={2} borderWidth="1px" borderRadius="md">
                      {collectionCentres.map((centre) => (
                        <Checkbox key={centre.id} value={String(centre.id)}>
                          {centre.centre_name}
                        </Checkbox>
                      ))}
                    </Stack>
                  </CheckboxGroup>
                )}
              </FormControl>
            )}
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
