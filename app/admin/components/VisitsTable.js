// File: /app/admin/components/VisitsTable.js

"use client";

import React, { useState } from "react";
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  Spinner,
  HStack,
  Text,
  Select,
  Box,
} from "@chakra-ui/react";
import { EditIcon, DeleteIcon, AddIcon } from "@chakra-ui/icons";

const statusColorScheme = (status) => {
  switch (status) {
    case "booked":
      return "blue";
    case "pending":
      return "orange";
    case "accepted":
      return "teal";
    case "postponed":
      return "yellow";
    case "rejected":
      return "red";
    case "in_progress":
      return "cyan";
    case "sample_picked":
      return "green";
    case "sample_dropped":
      return "purple";
    case "completed":
      return "green";
    case "unassigned":
      return "gray";
    case "disabled":       // New disabled status styling
      return "gray";
    default:
      return "gray";
  }
};

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

// Group visits by executive id, returning groups like:
// [{ exec: executiveObject|null, visits: [...] }, ...]
const groupVisitsByExecutive = (visits, executives) => {
  const execMap = new Map();
  for (const exec of executives) {
    execMap.set(exec.id, exec);
  }

  const groups = new Map();

  visits.forEach((visit) => {
    let execId = visit.executive?.id ?? visit.executive_id ?? null;
    if (!execId) execId = null;

    if (!groups.has(execId)) {
      groups.set(execId, {
        exec: execId ? execMap.get(execId) ?? { id: execId, name: "Unknown" } : null,
        visits: [],
      });
    }
    groups.get(execId).visits.push(visit);
  });

  // Sort groups by exec name, putting unassigned first
  const sortedGroups = Array.from(groups.values());
  sortedGroups.sort((a, b) => {
    if (a.exec === null && b.exec !== null) return -1;
    if (a.exec !== null && b.exec === null) return 1;
    if (a.exec && b.exec) return a.exec.name.localeCompare(b.exec.name);
    return 0;
  });

  return sortedGroups;
};

export default function VisitsTable({
  visits = [],
  executives = [],
  timeSlots = [],
  onEdit,
  onDelete,   // Will be used for soft-delete as disable
  onAssign,
  loading = false,
}) {
  const [assigning, setAssigning] = useState(new Set());
  const [selectedExecByVisit, setSelectedExecByVisit] = useState({});

  const groups = groupVisitsByExecutive(visits, executives);

  const getSlotDisplay = (visit) => {
    if (visit.time_slot?.slot_name) {
      return `${visit.time_slot.slot_name} (${visit.time_slot.start_time.slice(0, 5)} - ${visit.time_slot.end_time.slice(0, 5)})`;
    }
    if (timeSlots.length) {
      const slotId = visit.time_slot_id || visit.time_slot;
      const found = timeSlots.find((s) => s.id === slotId);
      if (found) {
        return `${found.slot_name} (${found.start_time.slice(0, 5)} - ${found.end_time.slice(0, 5)})`;
      }
    }
    return "Unknown";
  };

  const handleAssign = async (visit) => {
    const execId = selectedExecByVisit[visit.id];
    if (!execId) {
      alert("Please select an executive");
      return;
    }
    if (!onAssign) return;

    try {
      setAssigning(prev => new Set(prev).add(visit.id));
      await onAssign(visit.id, execId);
      setSelectedExecByVisit(prev => {
        const copy = { ...prev };
        delete copy[visit.id];
        return copy;
      });
    } catch (error) {
      alert("Error assigning visit: " + error.message);
    } finally {
      setAssigning(prev => {
        const copy = new Set(prev);
        copy.delete(visit.id);
        return copy;
      });
    }
  };

  // Soft delete handler: sets status to 'disabled' and unassigns executive
  const handleSoftDelete = async (visit) => {
    if (!window.confirm("Are you sure you want to disable this visit?")) return;
    if (!onDelete) return alert("Delete handler not provided");

    try {
      await onDelete(visit.id, "disabled");  // Provide status param
    } catch (error) {
      alert("Error disabling visit: " + error.message);
    }
  };

  if (loading) {
    return (
      <HStack justify="center" py={10}>
        <Spinner size="xl" />
      </HStack>
    );
  }

  if (!visits.length) {
    return (
      <Text textAlign="center" py={10} color="gray.600">
        No visits found.
      </Text>
    );
  }

  return (
    <Box overflowX="auto" bg="white" borderRadius="xl" shadow="lg" p={4}>
      {groups.map(({ exec, visits }) => (
        <Box key={exec ? exec.id : "unassigned"} mb={8}>
          <Text fontWeight="bold" fontSize="lg" mb={3} color={exec ? "green.700" : "gray.600"}>
            {exec ? exec.name : "Unassigned"}
          </Text>

          <Table variant="simple" size="sm" rounded="xl" overflowX="auto">
            <Thead bg="gray.100">
              <Tr>
                <Th>Code</Th>
                <Th>Date</Th>
                <Th>Slot</Th>
                <Th>Patient</Th>
                <Th>Lab</Th>
                <Th>Status</Th>
                <Th isNumeric>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {visits.map((visit) => {
                const isUnassigned = !visit.executive_id || visit.executive_id === "";

                return (
                  <Tr key={visit.id}>
                    <Td>{visit.visit_code || "N/A"}</Td>
                    <Td>{formatDate(visit.visit_date)}</Td>
                    <Td>{getSlotDisplay(visit)}</Td>
                    <Td>{visit.patient?.name || "Unknown"}</Td>
                    <Td>{visit.lab?.name || "N/A"}</Td>
                    <Td>
                      <Badge
                        colorScheme={statusColorScheme(visit.status)}
                        rounded="md"
                        px={2}
                        cursor={isUnassigned ? "pointer" : "default"}
                      >
                        {visit.status?.toUpperCase().replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td isNumeric>
                      <HStack spacing={2} justify="flex-end">
                        <IconButton
                          aria-label="Edit visit"
                          icon={<EditIcon />}
                          size="sm"
                          onClick={() => onEdit && onEdit(visit)}
                        />
                        <IconButton
                          aria-label="Disable visit"
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => handleSoftDelete(visit)}
                        />
                        {isUnassigned && exec === null && (
                          <>
                            <Select
                              size="xs"
                              w="120px"
                              placeholder="Assign Exec"
                              onChange={(e) =>
                                setSelectedExecByVisit((prev) => ({ ...prev, [visit.id]: e.target.value }))
                              }
                              value={selectedExecByVisit[visit.id] || ""}
                            >
                              {executives.map((ex) => (
                                <option key={ex.id} value={ex.id}>
                                  {ex.name}
                                </option>
                              ))}
                            </Select>

                            <IconButton
                              aria-label="Assign visit"
                              icon={<AddIcon />}
                              size="xs"
                              colorScheme="green"
                              onClick={() => handleAssign(visit)}
                              isDisabled={!selectedExecByVisit[visit.id]}
                              isLoading={assigning.has(visit.id)}
                              title="Assign this visit"
                            />
                          </>
                        )}
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      ))}
    </Box>
  );
}
