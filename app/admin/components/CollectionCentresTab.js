"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { AddIcon, EditIcon } from "@chakra-ui/icons";

const EMPTY_FORM = {
  id: "",
  lab_id: "",
  centre_name: "",
  contact_email: "",
  phone: "",
  address: "",
};

export default function CollectionCentresTab({
  labs = [],
  executives = [],
  themeMode = "light",
  onRegisterRefresh
}) {
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

  const assignedLoginsByCentre = useMemo(() => {
    const map = new Map();
    (executives || []).forEach((exec) => {
      const ids = Array.isArray(exec?.collection_centre_ids) ? exec.collection_centre_ids : [];
      if (ids.length === 0) return;
      ids.forEach((centreId) => {
        const key = String(centreId);
        const current = map.get(key) || [];
        const displayName = (exec?.name || "").trim() || (exec?.phone ? String(exec.phone) : "Unknown");
        current.push(displayName);
        map.set(key, current);
      });
    });
    return map;
  }, [executives]);

  const loadCentres = useCallback(async () => {
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
  }, [toast]);

  useEffect(() => {
    loadCentres();
  }, [loadCentres]);

  useEffect(() => {
    onRegisterRefresh?.(() => loadCentres);
    return () => onRegisterRefresh?.(() => null);
  }, [onRegisterRefresh, loadCentres]);

  const isDark = themeMode === "dark";

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
      </HStack>

      {loading ? (
        <Box py={10} textAlign="center">
          <Spinner size="lg" />
        </Box>
      ) : centres.length === 0 ? (
        <Text color={isDark ? "whiteAlpha.700" : "gray.600"}>No collection centres found for your labs.</Text>
      ) : (
        <Table size="sm" variant="simple" bg={isDark ? "rgba(255,255,255,0.03)" : "white"} borderRadius="md" color={isDark ? "whiteAlpha.920" : "gray.800"}>
          <Thead bg={isDark ? "rgba(255,255,255,0.08)" : "gray.50"}>
            <Tr>
              <Th color={isDark ? "whiteAlpha.700" : "gray.600"}>Centre</Th>
              <Th color={isDark ? "whiteAlpha.700" : "gray.600"}>Lab</Th>
              <Th color={isDark ? "whiteAlpha.700" : "gray.600"}>Phone</Th>
              <Th color={isDark ? "whiteAlpha.700" : "gray.600"}>Email</Th>
              <Th color={isDark ? "whiteAlpha.700" : "gray.600"}>Assigned Logins</Th>
              <Th color={isDark ? "whiteAlpha.700" : "gray.600"}>Address</Th>
              <Th isNumeric color={isDark ? "whiteAlpha.700" : "gray.600"}>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {centres.map((centre) => (
              <Tr key={centre.id}>
                <Td>{centre.centre_name}</Td>
                <Td>{labNameMap.get(centre.lab_id) || centre.lab_id}</Td>
                <Td>{centre.phone || "-"}</Td>
                <Td>{centre.contact_email || "-"}</Td>
                <Td maxW="280px" whiteSpace="normal">
                  {(() => {
                    const assigned = assignedLoginsByCentre.get(String(centre.id)) || [];
                    if (assigned.length === 0) return "-";
                    return [...new Set(assigned)].join(", ");
                  })()}
                </Td>
                <Td>{centre.address || "-"}</Td>
                <Td isNumeric>
                  <Button
                    size="xs"
                    leftIcon={<EditIcon />}
                    variant="outline"
                    onClick={() => openEdit(centre)}
                    {...(isDark
                      ? {
                          bg: "rgba(255,255,255,0.08)",
                          color: "white",
                          borderColor: "whiteAlpha.400",
                          _hover: { bg: "rgba(255,255,255,0.16)" },
                        }
                      : {})}
                  >
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
        <ModalContent as="form" onSubmit={saveCentre} bg={isDark ? "#111827" : "white"} color={isDark ? "whiteAlpha.920" : "gray.800"}>
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
