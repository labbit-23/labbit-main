// File: /app/admin/components/VisitsTable.js
"use client";

import React, { useState } from "react";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  Badge, IconButton, Spinner, HStack,
  Text, Select, Box
} from "@chakra-ui/react";
import { EditIcon, DeleteIcon, AddIcon } from "@chakra-ui/icons";

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

// Group active visits by executive and return disabled separately
const groupVisitsByExecutive = (visits, executives) => {
  const execMap = new Map(executives.map((exec) => [exec.id, exec]));
  const groups = new Map();
  const disabledVisits = [];

  for (const visit of visits) {
    if (visit.status === "disabled") {
      disabledVisits.push(visit);
      continue;
    }
    let execId = visit.executive?.id ?? visit.executive_id ?? null;
    if (!groups.has(execId)) {
      groups.set(execId, {
        exec: execId ? execMap.get(execId) ?? { id: execId, name: "Unknown" } : null,
        visits: [],
      });
    }
    groups.get(execId).visits.push(visit);
  }

  groups.forEach((group) => {
    group.visits.sort((a, b) => {
      const timeA = a?.time_slot?.start_time ?? "";
      const timeB = b?.time_slot?.start_time ?? "";
      return new Date(`1970-01-01T${timeA}Z`) - new Date(`1970-01-01T${timeB}Z`);
    });
  });

  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (a.exec === null && b.exec !== null) return -1;
    if (a.exec !== null && b.exec === null) return 1;
    if (a.exec && b.exec) return a.exec.name.localeCompare(b.exec.name);
    return 0;
  });

  return { groups: sortedGroups, disabled: disabledVisits };
};

export default function VisitsTable({
  visits = [],
  executives = [],
  timeSlots = [],
  onEdit,
  onDelete,
  onAssign,
  loading = false,
  statusOptions = [], //added prop for dynamic status options
}) {
  const [assigning, setAssigning] = useState(new Set());
  const [selectedExec, setSelectedExec] = useState({});

  const { groups, disabled } = groupVisitsByExecutive(visits, executives);

  const getSlotDisplay = (visit) => {
    if (visit?.time_slot?.slot_name) return visit.time_slot.slot_name;
    if (timeSlots.length) {
      const id = visit.time_slot ?? visit.time_slot_id;
      const slot = timeSlots.find((s) => s.id === id);
      if (slot) return slot.slot_name;
    }
    return "Unknown";
  };

  // New function: get color from statusOptions prop
  const getStatusColor = (status) => {
    const statusObj = statusOptions.find(opt => opt.code === status);
    return statusObj?.color || "gray";
  };

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
      setSelectedExec((prev) => {
        const copy = { ...prev };
        delete copy[visit.id];
        return copy;
      });
    } catch (error) {
      alert("Error assigning: " + error.message);
    } finally {
      setAssigning((prev) => {
        const copy = new Set(prev);
        copy.delete(visit.id);
        return copy;
      });
    }
  };

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
      <Box overflowX="auto" bg="white" rounded="xl" shadow="lg" p={4}>
        {/* Active Visits Groups */}
        {groups.map(({ exec, visits }) => (
          <Box key={exec ? exec.id : "unassigned"} mb={8}>
            <Text fontWeight="bold" fontSize="lg" mb={3} color={exec ? "green.700" : "gray.600"}>
              {exec ? exec.name : "Unassigned"}
            </Text>
            <Table variant="simple" size="sm">
              <Thead bg="gray.100">
                <Tr>
                  <Th>Patient</Th>
                  <Th>Address / Code</Th>
                  <Th>Date</Th>
                  <Th>Slot</Th>
                  <Th>Status</Th>
                  <Th className="no-export" isNumeric>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visits.map((visit) => {
                  const isUnassigned = !visit.executive_id;
                  return (
                    <Tr key={visit.id}>
                      {/* Patient info */}
                      <Td>
                        <Box>{visit.patient?.name ?? "Unknown"}</Box>
                        <Box fontWeight="bold" fontSize="sm" color="gray.700">
                          {visit.patient?.phone ?? "No Phone"}
                        </Box>
                      </Td>
                      {/* Address / Code */}
                      <Td>
                        <Box fontWeight="bold">
                          {visit.address || "No Area"}
                        </Box>
                        <Box fontSize="sm" color="gray.500">
                          {visit.visit_code ?? "N/A"}
                        </Box>
                      </Td>
                      {/* Date */}
                      <Td>{formatDate(visit.visit_date)}</Td>
                      {/* Slot */}
                      <Td>{getSlotDisplay(visit)}</Td>
                      {/* Status with dynamic color */}
                      <Td>
                        <Badge colorScheme={getStatusColor(visit.status)} rounded="md" px={2}>
                          {visit.status?.toUpperCase().replace(/_/g, " ")}
                        </Badge>
                      </Td>
                      {/* Actions */}
                      <Td className="no-export" isNumeric>
                        <HStack spacing={2} justify="flex-end">
                          <IconButton
                            aria-label="Edit"
                            icon={<EditIcon />}
                            size="sm"
                            onClick={() => onEdit && onEdit(visit)}
                          />
                          <IconButton
                            aria-label="Disable"
                            icon={<DeleteIcon />}
                            size="sm"
                            colorScheme="red"
                            onClick={() => handleDisable(visit)}
                          />
                          {isUnassigned && exec === null && (
                            <>
                              <Select
                                size="xs"
                                w={120}
                                placeholder="Assign Exec"
                                onChange={(e) => setSelectedExec((prev) => ({
                                  ...prev,
                                  [visit.id]: e.target.value
                                }))}
                                value={selectedExec[visit.id] ?? ""}
                              >
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

        {/* Disabled Visits Section */}
        {disabled.length > 0 && (
          <Box mt={10}>
            <Text fontWeight="bold" fontSize="lg" mb={3} color="gray.500">
              Disabled Visits
            </Text>
            <Table variant="simple" size="sm">
              <Thead bg="gray.100">
                <Tr>
                  <Th>Patient</Th>
                  <Th>Address / Code</Th>
                  <Th>Date</Th>
                  <Th>Slot</Th>
                  <Th>Status</Th>
                  <Th className="no-export" isNumeric>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {disabled.map((visit) => (
                  <Tr key={visit.id} opacity={0.5} bg="gray.50">
                    <Td>
                      <Box>{visit.patient?.name ?? "Unknown"}</Box>
                      <Box fontWeight="bold" fontSize="sm" color="gray.700">
                        {visit.patient?.phone ?? "No Phone"}
                      </Box>
                    </Td>
                    <Td>
                      <Box fontWeight="bold">
                        {visit.address || "No Area"}
                      </Box>
                      <Box fontSize="sm" color="gray.500">
                        {visit.visit_code ?? "N/A"}
                      </Box>
                    </Td>
                    <Td>{formatDate(visit.visit_date)}</Td>
                    <Td>{getSlotDisplay(visit)}</Td>
                    <Td>
                      <Badge colorScheme="gray" rounded="md" px={2}>
                        DISABLED
                      </Badge>
                    </Td>
                    <Td className="no-export" isNumeric>
                      {/* You can add re-enable or other actions here if needed */}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Box>
    </>
  );
}
