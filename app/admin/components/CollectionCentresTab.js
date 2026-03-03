"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Table,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { AddIcon, EditIcon, RepeatIcon } from "@chakra-ui/icons";

const EMPTY_FORM = {
  id: "",
  lab_id: "",
  centre_name: "",
  contact_email: "",
  phone: "",
  address: "",
};

export default function CollectionCentresTab({ labs = [] }) {
  const toast = useToast();
  const modal = useDisclosure();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [centres, setCentres] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const labNameMap = useMemo(() => {
    const map = new Map();
    (labs || []).forEach((lab) => map.set(lab.id, lab.name));
    return map;
  }, [labs]);

  const loadCentres = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collection-centres?my_labs=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load collection centres");
      setCentres(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        title: "Error loading collection centres",
        description: err.message,
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCentres();
  }, []);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      lab_id: labs?.[0]?.id || "",
    });
    modal.onOpen();
  };

  const openEdit = (centre) => {
    setForm({
      id: centre.id || "",
      lab_id: centre.lab_id || "",
      centre_name: centre.centre_name || "",
      contact_email: centre.contact_email || "",
      phone: centre.phone || "",
      address: centre.address || "",
    });
    modal.onOpen();
  };

  const saveCentre = async (e) => {
    e.preventDefault();
    if (!form.lab_id || !form.centre_name.trim()) {
      toast({ title: "Lab and Centre Name are required", status: "warning" });
      return;
    }

    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const res = await fetch("/api/collection-centres", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save collection centre");

      toast({
        title: form.id ? "Collection centre updated" : "Collection centre created",
        status: "success",
      });
      modal.onClose();
      setForm(EMPTY_FORM);
      await loadCentres();
    } catch (err) {
      toast({
        title: "Error saving collection centre",
        description: err.message,
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <HStack justify="space-between" mb={4}>
        <Button leftIcon={<AddIcon />} colorScheme="teal" onClick={openCreate}>
          Add Collection Centre
        </Button>
        <Button leftIcon={<RepeatIcon />} variant="outline" onClick={loadCentres} isLoading={loading}>
          Refresh
        </Button>
      </HStack>

      {loading ? (
        <Box py={10} textAlign="center">
          <Spinner size="lg" />
        </Box>
      ) : centres.length === 0 ? (
        <Text color="gray.600">No collection centres found for your labs.</Text>
      ) : (
        <Table size="sm" variant="simple" bg="white" borderRadius="md">
          <Thead bg="gray.50">
            <Tr>
              <Th>Centre</Th>
              <Th>Lab</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Address</Th>
              <Th isNumeric>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {centres.map((centre) => (
              <Tr key={centre.id}>
                <Td>{centre.centre_name}</Td>
                <Td>{labNameMap.get(centre.lab_id) || centre.lab_id}</Td>
                <Td>{centre.phone || "-"}</Td>
                <Td>{centre.contact_email || "-"}</Td>
                <Td>{centre.address || "-"}</Td>
                <Td isNumeric>
                  <Button size="xs" leftIcon={<EditIcon />} variant="outline" onClick={() => openEdit(centre)}>
                    Edit
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Modal isOpen={modal.isOpen} onClose={() => !saving && modal.onClose()} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent as="form" onSubmit={saveCentre}>
          <ModalHeader>{form.id ? "Edit Collection Centre" : "Add Collection Centre"}</ModalHeader>
          <ModalCloseButton disabled={saving} />
          <ModalBody>
            <FormControl mb={3} isRequired>
              <FormLabel>Lab</FormLabel>
              <Select
                value={form.lab_id}
                onChange={(e) => setForm((prev) => ({ ...prev, lab_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">Select lab</option>
                {(labs || []).map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl mb={3} isRequired>
              <FormLabel>Centre Name</FormLabel>
              <Input
                value={form.centre_name}
                onChange={(e) => setForm((prev) => ({ ...prev, centre_name: e.target.value }))}
                disabled={saving}
                placeholder="e.g., SDRC Marredpally"
              />
            </FormControl>

            <FormControl mb={3}>
              <FormLabel>Phone</FormLabel>
              <Input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                disabled={saving}
                placeholder="Contact phone"
              />
            </FormControl>

            <FormControl mb={3}>
              <FormLabel>Contact Email</FormLabel>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((prev) => ({ ...prev, contact_email: e.target.value }))}
                disabled={saving}
                placeholder="Contact email"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Address</FormLabel>
              <Textarea
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                disabled={saving}
                placeholder="Full address"
                rows={3}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button type="submit" colorScheme="teal" mr={3} isLoading={saving}>
              Save
            </Button>
            <Button variant="ghost" onClick={modal.onClose} disabled={saving}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
