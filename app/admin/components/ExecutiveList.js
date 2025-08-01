// app/admin/components/ExecutiveList.js

"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  Text,
  Box,
  Button,
  HStack,
  Badge,
  useToast,
  Heading,
  VStack,
} from "@chakra-ui/react";
import ExecutiveModal from "./ExecutiveModal";

export default function ExecutiveList({
  executives = [],
  loading = false,
  onRefresh = () => {},
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [disableLoadingId, setDisableLoadingId] = useState(null);

  // Group executives dynamically by the exact types coming from DB,
  // grouping unknown or empty types under "Unknown"
  const groupedExecutives = useMemo(() => {
    const groups = {};

    // Group executives by trimmed type or "Unknown" if empty or missing
    executives.forEach((exec) => {
      const execType = exec.type ? exec.type.trim() : "";
      const groupKey = execType !== "" ? execType : "Unknown";

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }

      groups[groupKey].push(exec);
    });

    // Sort group keys alphabetically (change if you want different order)
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

    // Sort each group so active executives come before inactive
    sortedGroupKeys.forEach((key) => {
      groups[key].sort((a, b) => {
        const aActive = ((a.status || a.active) || "").toString().toLowerCase() === "active" || a.active === true;
        const bActive = ((b.status || b.active) || "").toString().toLowerCase() === "active" || b.active === true;
        if (aActive === bActive) return 0;
        return aActive ? -1 : 1;
      });
    });

    // Return new object respecting sorted keys order
    const sortedGroups = {};
    sortedGroupKeys.forEach((key) => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  }, [executives]);

  // Local copy to reflect UI changes immediately without waiting for server reload
  const [localExecutives, setLocalExecutives] = useState(executives);

  // Sync local state with parent updates
  useEffect(() => {
    setLocalExecutives(executives);
  }, [executives]);

  const handleUpdate = (exec) => {
    setSelectedExecutive(exec);
    setModalOpen(true);
  };

  const handleSave = async (execData) => {
    setIsSaving(true);
    try {
      const method = execData.id ? "PUT" : "POST";
      const res = await fetch("/api/executives", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execData),
      });

      if (!res.ok) throw new Error(await res.text());

      const savedExec = await res.json();

      toast({
        title: `Executive ${execData.id ? "updated" : "created"} successfully`,
        status: "success",
      });

      setModalOpen(false);
      setSelectedExecutive(null);

      setLocalExecutives((current) => {
        if (execData.id) {
          return current.map((e) => (e.id === savedExec.id ? savedExec : e));
        } else {
          return [savedExec, ...current];
        }
      });

      onRefresh();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, status: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (exec) => {
    setDisableLoadingId(exec.id);
    const isActive = (exec.status || "").toLowerCase() === "active" || exec.active === true;
    const newStatus = isActive ? "inactive" : "active";

    try {
      const res = await fetch(`/api/executives/${exec.id}/updateStatus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error(await res.text());

      toast({
        title: `Executive status changed to ${newStatus}`,
        status: "success",
      });

      setLocalExecutives((current) =>
        current.map((e) => (e.id === exec.id ? { ...e, status: newStatus } : e))
      );

      onRefresh();
    } catch (e) {
      toast({ title: "Status update failed", description: e.message, status: "error" });
    } finally {
      setDisableLoadingId(null);
    }
  };

  if (loading) {
    return (
      <Box py={10} textAlign="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (!localExecutives.length) {
    return (
      <Text textAlign="center" py={10} fontSize="lg" color="gray.600">
        No executives found.
      </Text>
    );
  }

  return (
    <>
      {Object.entries(groupedExecutives).map(([type, execs]) => (
        <Box key={type} my={6}>
          <Heading size="md" mb={3} textTransform="capitalize">
            {type}
          </Heading>

          <Table
            variant="simple"
            size="sm"
            rounded="xl"
            boxShadow="md"
            overflowX="auto"
            bg="white"
          >
            <Thead bg="gray.100">
              <Tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th isNumeric>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {execs.map((exec) => {
                const statusLower = (exec.status || "").toLowerCase();
                const isActive = statusLower === "active" || exec.active === true;

                return (
                  <Tr key={exec.id}>
                    <Td>{exec.name}</Td>
                    <Td>{exec.phone}</Td>
                    <Td>{exec.type && exec.type.trim() !== "" ? exec.type : "Unknown"}</Td>
                    <Td>
                      <Badge
                        colorScheme={isActive ? "green" : "red"}
                        textTransform="capitalize"
                        px={2}
                        py={1}
                        rounded="md"
                      >
                        {isActive ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                    <Td isNumeric>
                      <HStack justify="flex-end" spacing={2}>
                        <Button
                          size="xs"
                          variant="outline"
                          colorScheme="blue"
                          onClick={() => handleUpdate(exec)}
                        >
                          Update
                        </Button>
                        <Button
                          size="xs"
                          colorScheme={isActive ? "red" : "green"}
                          onClick={() => handleToggleStatus(exec)}
                          isLoading={disableLoadingId === exec.id}
                        >
                          {isActive ? "Disable" : "Enable"}
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      ))}

      <ExecutiveModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedExecutive(null);
        }}
        initialData={selectedExecutive}
        onSaveSuccess={handleSave}
        isLoading={isSaving}
      />
    </>
  );
}
