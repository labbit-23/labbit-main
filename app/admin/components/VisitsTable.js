//app/admin/components/VisitsRable.js

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
    default:
      return "gray";
  }
};

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

// Group visits by executive id, return array of groups:
// [{ exec: executiveObject|null (null means unassigned), visits: [] }, ...]
const groupVisitsByExecutive = (visits, executives) => {
  const execMap = new Map();
  for (const exec of executives) {
    execMap.set(exec.id, exec);
  }

  const groupsMap = new Map();

  visits.forEach((visit) => {
    // Use visit.executive?.id first, fallback to visit.executive_id field
    // Treat null or empty string as unassigned (null)
    let execId = visit.executive?.id ?? visit.executive_id ?? null;
    if (execId === "" || execId === null) {
      execId = null;
    }

    if (!groupsMap.has(execId)) {
      groupsMap.set(execId, {
        exec: execId === null ? null : execMap.get(execId) || { id: execId, name: "Unknown" },
        visits: [],
      });
    }
    groupsMap.get(execId).visits.push(visit);
  });

  const groupsArray = Array.from(groupsMap.values());

  groupsArray.sort((a, b) => {
    if (a.exec === null && b.exec !== null) return -1;
    if (a.exec !== null && b.exec === null) return 1;
    if (a.exec && b.exec) return a.exec.name.localeCompare(b.exec.name);
    return 0;
  });

  return groupsArray;
};

export default function VisitsTable({
  visits = [],
  executives = [],
  timeSlots = [],
  onEdit,
  onDelete,
  onAssign, // function(visitId, executiveId)
  loading = false,
}) {
  const [assigningVisitIds, setAssigningVisitIds] = useState(new Set());
  const [assignExecByVisit, setAssignExecByVisit] = useState({}); // visitId => executiveId

  const groups = groupVisitsByExecutive(visits, executives);

  const getTimeSlotDisplay = (visit) => {
    if (visit.time_slot && visit.time_slot.slot_name) {
      return `${visit.time_slot.slot_name} (${visit.time_slot.start_time.slice(0, 5)} - ${visit.time_slot.end_time.slice(0, 5)})`;
    }
    if (timeSlots.length) {
      const tsId = visit.time_slot_id || visit.time_slot;
      const matchedSlot = timeSlots.find((s) => s.id === tsId);
      if (matchedSlot) {
        return `${matchedSlot.slot_name} (${matchedSlot.start_time.slice(0, 5)} - ${matchedSlot.end_time.slice(0, 5)})`;
      }
    }
    return "Unknown";
  };

  const handleAssignClick = async (visit) => {
    const execId = assignExecByVisit[visit.id];
    if (!execId) {
      alert("Please select an executive to assign this visit.");
      return;
    }

    if (!onAssign) return;

    try {
      setAssigningVisitIds((prev) => new Set(prev).add(visit.id));
      await onAssign(visit.id, execId);
      setAssignExecByVisit((prev) => {
        const newObj = { ...prev };
        delete newObj[visit.id];
        return newObj;
      });
    } catch (err) {
      alert("Error assigning visit: " + err.message);
    } finally {
      setAssigningVisitIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(visit.id);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <HStack justifyContent="center" py={10}>
        <Spinner size="xl" />
      </HStack>
    );
  }

  if (!visits.length) {
    return <Text textAlign="center" py={10}>No visits found.</Text>;
  }

  return (
    <Box overflowX="auto" bg="white" borderRadius="xl" boxShadow="lg">
      {groups.map(({ exec, visits }) => (
        <Box key={exec ? exec.id : "unassigned"} mb={8} px={4}>
          <Text fontWeight="bold" fontSize="lg" mb={3} mt={4} color={exec ? "green.700" : "gray.600"}>
            {exec ? exec.name || "Unknown Executive" : "Unassigned"}
          </Text>

          <Table variant="simple" size="sm" borderRadius="xl" overflowX="auto">
            <Thead bg="gray.100">
              <Tr>
                <Th>Visit Code</Th>
                <Th>Date</Th>
                <Th>Time Slot</Th>
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
                    <Td>{getTimeSlotDisplay(visit)}</Td>
                    <Td>{visit.patient?.name || "Unknown"}</Td>
                    <Td>{visit.lab?.name || "N/A"}</Td>
                    <Td>
                      <Badge
                        colorScheme={statusColorScheme(visit.status)}
                        rounded="md"
                        px={2}
                        cursor={isUnassigned ? "pointer" : "default"}
                      >
                        {visit.status?.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </Td>
                    <Td isNumeric>
                      <HStack spacing={2} justifyContent="flex-end">
                        <IconButton
                          aria-label="Edit visit"
                          icon={<EditIcon />}
                          size="sm"
                          onClick={() => onEdit && onEdit(visit)}
                        />
                        <IconButton
                          aria-label="Delete visit"
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => onDelete && onDelete(visit.id)}
                        />
                        {isUnassigned && exec === null && (
                          <>
                            <Select
                              size="xs"
                              width="120px"
                              placeholder="Assign Exec"
                              onChange={(e) =>
                                setAssignExecByVisit((prev) => ({ ...prev, [visit.id]: e.target.value }))
                              }
                              value={assignExecByVisit[visit.id] || ""}
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
                              isLoading={assigningVisitIds.has(visit.id)}
                              onClick={() => handleAssignClick(visit)}
                              title="Assign this visit"
                              isDisabled={!assignExecByVisit[visit.id]}
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
