// File: app/admin/components/ExecutiveList.js

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
  Image,
} from "@chakra-ui/react";
import ExecutiveModal from "./ExecutiveModal";

export default function ExecutiveList({
  executives = [],
  labs = [],
  loading = false,
  onRefresh = () => {},
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [disableLoadingId, setDisableLoadingId] = useState(null);

  // Memoized grouping and sorting
  const groupedExecutives = useMemo(() => {
    const groups = {};
    executives.forEach(exec => {
      const execType = exec.type ? exec.type.trim() : "";
      const groupKey = execType !== "" ? execType : "Unknown";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(exec);
    });

    // Alphabetical order of type
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    sortedGroupKeys.forEach((key) => {
      groups[key].sort((a, b) => {
        // Active first, then Available, then others/inactive
        const aStatus =
          ((a.status || a.active) || "").toString().toLowerCase() === "active"
            ? 1
            : ((a.status || "").toString().toLowerCase() === "available" ? 0 : -1);
        const bStatus =
          ((b.status || b.active) || "").toString().toLowerCase() === "active"
            ? 1
            : ((b.status || "").toString().toLowerCase() === "available" ? 0 : -1);
        if (aStatus === bStatus) return 0;
        return aStatus > bStatus ? -1 : 1;
      });
    });

    // Return sorted object
    const sortedGroups = {};
    sortedGroupKeys.forEach(key => {
      sortedGroups[key] = groups[key];
    });
    return sortedGroups;
  }, [executives]);

  const [localExecutives, setLocalExecutives] = useState(executives);

  useEffect(() => {
    setLocalExecutives(executives);
  }, [executives]);

  // Get lab name/logo by lab_id
  const getLabInfo = (exec) => {
    if (!exec.lab_id) return { name: "--", logo_url: null };
    const found = (exec.lab && exec.lab.name) ? exec.lab : labs.find(l => l.id === exec.lab_id);
    return found || { name: "--", logo_url: null };
  };

  const handleUpdate = (exec) => {
    setSelectedExecutive(exec);
    setModalOpen(true);
  };

  const handleSave = async (execData) => {
    setIsSaving(true);
    try {
      const isUpdate = !!execData.id;
      // For new Phlebo, set status default value to Available
      if (!isUpdate && (execData.type?.toLowerCase() === "phlebo" || execData.type?.toLowerCase() === "phlebotomist")) {
        execData.status = "available";
      }
      const method = isUpdate ? "PUT" : "POST";
      const res = await fetch("/api/executives", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execData),
      });
      if (!res.ok) throw new Error(await res.text());
      const savedExec = await res.json();
      toast({
        title: `Executive ${isUpdate ? "updated" : "created"} successfully`,
        status: "success",
      });
      setModalOpen(false);
      setSelectedExecutive(null);
      setLocalExecutives((current) => {
        if (isUpdate) {
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
                <Th>Email</Th>
                <Th>Lab</Th>
                <Th>Status</Th>
                <Th isNumeric>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {execs.map((exec) => {
                const statusLower = (exec.status || "").toLowerCase();
                const isActive = statusLower === "active" || exec.active === true;
                const labInfo = getLabInfo(exec);
                return (
                  <Tr key={exec.id}>
                    <Td>{exec.name}</Td>
                    <Td>{exec.phone}</Td>
                    <Td>{exec.email}</Td>
                    <Td>
                      <HStack>
                        {labInfo.logo_url && (
                          <Image
                            src={labInfo.logo_url}
                            alt={labInfo.name + " logo"}
                            height="30px"
                            borderRadius="sm"
                          />
                        )}
                        <Text display="inline">{labInfo.name}</Text>
                      </HStack>
                    </Td>
                    <Td>
                      <Badge
                        colorScheme={
                          isActive
                            ? "green"
                            : statusLower === "available"
                            ? "blue"
                            : "red"
                        }
                        textTransform="capitalize"
                        px={2}
                        py={1}
                        rounded="md"
                      >
                        {isActive ? "Active" : statusLower === "available" ? "Available" : "Inactive"}
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
        labs={labs}
      />
    </>
  );
}
