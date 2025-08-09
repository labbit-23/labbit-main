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

/**
 * Maps visit status to Chakra UI badge color scheme.
 * @param {string} status - Visit status string.
 * @returns {string} - Chakra color scheme.
 */
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
    case "disabled":
      return "gray";
    case "unassigned":
    default:
      return "gray";
  }
};

/**
 * Formats a date string into `YYYY-MM-DD`.
 * @param {string|Date} dateInput - Date input.
 * @returns {string} Formatted date string.
 */
const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

/**
 * Groups visits by executive.
 * Unassigned visits are grouped under `exec === null`.
 * @param {Array} visits - List of visits.
 * @param {Array} executives - List of executives.
 * @returns {Array} Sorted groups of visits by executive.
 */
const groupVisitsByExecutive = (visits, executives) => {
  const execMap = new Map(executives.map((exec) => [exec.id, exec]));
  const groups = new Map();

  // Separate disabled visits
  const disabledVisits = [];

  for (const visit of visits) {
    if (visit.status === "disabled") {
      disabledVisits.push(visit);
      continue; // skip adding to other groups
    }

    let execId = visit.executive?.id ?? visit.executive_id ?? null;
    if (!execId) execId = null;

    if (!groups.has(execId)) {
      groups.set(execId, {
        exec: execId ? execMap.get(execId) ?? { id: execId, name: "Unknown" } : null,
        visits: [],
      });
    }
    groups.get(execId).visits.push(visit);
  }


  // Sort visits within groups by their time slot start time
  groups.forEach((group) => {
    group.visits.sort((a, b) => {
      const timeA = a?.time_slot?.start_time ?? "";
      const timeB = b?.time_slot?.start_time ?? "";
      const dateA = new Date(`1970-01-01T${timeA}Z`);
      const dateB = new Date(`1970-01-01T${timeB}Z`);
      return dateA - dateB;
    });
  });

  const sortedGroups = Array.from(groups.values());

  // Sort groups so unassigned visits appear first, then alphabetically by executive name
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
  onDelete,
  onAssign,
  loading = false,
}) {
  // Track which visits are being assigned currently to show loading state on assign buttons
  const [assigning, setAssigning] = useState(new Set());

  // Controlled state for selected executive per visit (keyed by visit.id)
  const [selectedExec, setSelectedExec] = useState({});

  // Group visits by their assigned executive (or null if unassigned)
  const groups = groupVisitsByExecutive(visits, executives);

  /**
   * Returns the display label for the visit's time slot.
   * Looks at time_slot from visit or fallbacks to timeSlots list.
   * @param {Object} visit - Visit object.
   * @returns {string} Display name of the time slot.
   */
  const getSlotDisplay = (visit) => {
    if (visit?.time_slot?.slot_name) return visit.time_slot.slot_name;
    if (timeSlots.length) {
      const id = visit.time_slot ?? visit.time_slot_id;
      const slot = timeSlots.find((s) => s.id === id);
      if (slot) return slot.slot_name;
    }
    return "Unknown";
  };

  /**
   * Handles assigning an executive to a visit.
   * Calls onAssign prop with visit ID and selected executive ID.
   * @param {Object} visit - Visit to assign.
   */
  const handleAssign = async (visit) => {
    const execId = selectedExec[visit.id];
    if (!execId) {
      alert("Please select an executive");
      return;
    }
    if (!onAssign) return;

    try {
      setAssigning((prev) => new Set(prev).add(visit.id));
      await onAssign(visit.id, execId);

      // Clear selected exec after successful assign
      setSelectedExec((prev) => {
        const copy = { ...prev };
        delete copy[visit.id];
        return copy;
      });
    } catch (error) {
      alert("Error assigning: " + error.message);
    } finally {
      // Remove visit from assigning loading set
      setAssigning((prev) => {
        const copy = new Set(prev);
        copy.delete(visit.id);
        return copy;
      });
    }
  };

  /**
   * Handles disabling a visit (soft delete).
   * @param {Object} visit - Visit to disable.
   */
  const handleDisable = async (visit) => {
    if (!window.confirm(`Do you really want to disable visit ${visit.visit_code}?`)) return;
    if (!onDelete) {
      alert("Disable action not configured");
      return;
    }
    try {
      await onDelete(visit.id, "disabled");
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
    return <Text textAlign="center" py={10}>No visits found.</Text>;
  }

  return (
    <>
      {/* Hide no-export elements when exporting */}
      <style>{`
        .hide-on-export .no-export {
          display: none !important;
        }
      `}</style>
      <Box overflowX="auto" bg="white" rounded="xl" shadow="lg" p={4}>
        {groups.map(({ exec, visits }) => (
          <Box key={exec ? exec.id : "unassigned"} mb={8}>
            <Text fontWeight="bold" fontSize="lg" mb={3} color={exec ? "green.700" : "gray.600"}>
              {exec ? exec.name : "Unassigned"}
            </Text>
            <Table variant="simple" size="sm" rounded className="visits-table" overflowX="auto">
              <Thead bg="gray.100">
                <Tr>
                  <Th>Code</Th>
                  <Th>Date</Th>
                  <Th>Slot</Th>
                  <Th>Patient</Th>
                  <Th>Status</Th>
                  <Th className="no-export" isNumeric>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visits.map((visit) => {
                  const isUnassigned = !visit.executive_id || visit.executive_id === "";
                  return (
                    <Tr key={visit.id}>
                      <Td>{visit.visit_code ?? "N/A"}</Td>
                      <Td>{formatDate(visit.visit_date)}</Td>
                      <Td>{getSlotDisplay(visit)}</Td>
                      <Td>
                        <Box>{visit.patient?.name ?? "Unknown"}</Box>
                        <Box fontWeight="bold" fontSize="sm" color="gray.700">
                          {visit.patient?.phone ?? "No Phone"}
                        </Box>
                      </Td>
                      <Td>
                        <Badge colorScheme={statusColorScheme(visit.status)} rounded="md" px={2}>
                          {visit.status?.toUpperCase().replace(/_/g, " ") ?? "UNKNOWN"}
                        </Badge>
                      </Td>
                      <Td className="no-export" isNumeric>
                        <HStack spacing={2} justify="flex-end">
                          {/* Edit visit button */}
                          <IconButton 
                            aria-label="Edit" 
                            icon={<EditIcon />} 
                            size="sm" 
                            onClick={() => onEdit && onEdit(visit)} 
                          />
                          {/* Disable visit button */}
                          <IconButton 
                            aria-label="Disable" 
                            icon={<DeleteIcon />} 
                            size="sm" 
                            colorScheme="red" 
                            onClick={() => handleDisable(visit)} 
                          />
                          {/* Assign executive dropdown for unassigned visits */}
                          {isUnassigned && exec === null && (
                            <>
                              <Select
                                size="xs"
                                w={120}
                                placeholder="Assign Exec"
                                onChange={(e) =>
                                  setSelectedExec(prev => ({ ...prev, [visit.id]: e.target.value }))
                                }
                                value={selectedExec[visit.id] ?? ""}
                              >
                                {/* Options populated from executives prop */}
                                {executives.map((execItem) => (
                                  <option key={execItem.id} value={execItem.id}>
                                    {execItem.name}
                                  </option>
                                ))}
                              </Select>
                              <IconButton
                                aria-label="Assign"
                                icon={<AddIcon />}
                                size="xs"
                                colorScheme="green"
                                onClick={() => handleAssign(visit)}
                                isDisabled={!selectedExec[visit.id]}
                                isLoading={assigning.has(visit.id)}
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
    </>
  );
}
