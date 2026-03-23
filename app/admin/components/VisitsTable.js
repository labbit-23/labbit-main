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

const hasLocationPin = (visit) =>
  visit?.lat !== null &&
  typeof visit?.lat !== "undefined" &&
  visit?.lng !== null &&
  typeof visit?.lng !== "undefined";

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
  themeMode = "light",
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

  const isDark = themeMode === "dark";
  const tableShellBg = isDark ? "rgba(255,255,255,0.03)" : "white";
  const tableHeadBg = isDark ? "rgba(255,255,255,0.08)" : "gray.100";
  const tableText = isDark ? "whiteAlpha.920" : "gray.800";
  const tableMutedText = isDark ? "whiteAlpha.700" : "gray.500";
  const sectionHeading = isDark ? "green.200" : "green.700";
  const disabledHeading = isDark ? "whiteAlpha.700" : "gray.500";
  const rowBorderColor = isDark ? "whiteAlpha.200" : "gray.100";
  const disabledRowBg = isDark ? "rgba(255,255,255,0.04)" : "gray.50";
  const actionButtonBg = isDark ? "rgba(255,255,255,0.08)" : undefined;

  return (
    <>
      <Box overflowX="auto" bg={tableShellBg} rounded="xl" shadow="lg" p={4} color={tableText}>
        {/* Active Visits Groups */}
        {groups.map(({ exec, visits }) => (
          <Box key={exec ? exec.id : "unassigned"} mb={8}>
            <Text fontWeight="bold" fontSize="lg" mb={3} color={exec ? sectionHeading : tableMutedText}>
              {exec ? exec.name : "Unassigned"}
            </Text>
            <Table variant="simple" size="sm">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th color={tableMutedText}>Patient</Th>
                  <Th color={tableMutedText}>Address / Tests</Th>
                  <Th color={tableMutedText}>Date</Th>
                  <Th color={tableMutedText}>Slot</Th>
                  <Th color={tableMutedText}>Status</Th>
                  <Th className="no-export" isNumeric color={tableMutedText}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visits.map((visit) => {
                  const isUnassigned = !visit.executive_id;
                  return (
                    <Tr key={visit.id}>
                      {/* Patient info */}
                      <Td borderColor={rowBorderColor}>
                        <Box>{visit.patient?.name ?? "Unknown"}</Box>
                        <Box fontWeight="bold" fontSize="sm" color={isDark ? "whiteAlpha.900" : "gray.700"}>
                          {visit.patient?.phone ?? "No Phone"}
                        </Box>
                      </Td>
                      {/* Address / Code */}
                      <Td borderColor={rowBorderColor}>
                        <HStack spacing={2} align="center">
                          <Box fontWeight="bold">
                            {visit.address || "No Area"}
                          </Box>
                          {hasLocationPin(visit) && (
                            <Badge colorScheme="teal" variant="subtle" borderRadius="full">
                              PIN
                            </Badge>
                          )}
                        </HStack>
                        <Box fontSize="sm" color={tableMutedText}>
                          {visit.notes ?? "N/A"}
                        </Box>
                      </Td>
                      {/* Date */}
                      <Td borderColor={rowBorderColor}>{formatDate(visit.visit_date)}</Td>
                      {/* Slot */}
                      <Td borderColor={rowBorderColor}>{getSlotDisplay(visit)}</Td>
                      {/* Status with dynamic color */}
                      <Td borderColor={rowBorderColor}>
                        <Badge colorScheme={getStatusColor(visit.status)} rounded="md" px={2}>
                          {visit.status?.toUpperCase().replace(/_/g, " ")}
                        </Badge>
                      </Td>
                      {/* Actions */}
                      <Td className="no-export" isNumeric borderColor={rowBorderColor}>
                        <HStack spacing={2} justify="flex-end">
                          <IconButton
                            aria-label="Edit"
                            icon={<EditIcon />}
                            size="sm"
                            bg={actionButtonBg}
                            color={isDark ? "whiteAlpha.900" : undefined}
                            _hover={isDark ? { bg: "rgba(255,255,255,0.16)" } : undefined}
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
                                bg={isDark ? "rgba(15,23,42,0.88)" : undefined}
                                color={isDark ? "whiteAlpha.900" : undefined}
                                borderColor={isDark ? "whiteAlpha.300" : undefined}
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
            <Text fontWeight="bold" fontSize="lg" mb={3} color={disabledHeading}>
              Disabled Visits
            </Text>
            <Table variant="simple" size="sm">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th color={tableMutedText}>Patient</Th>
                  <Th color={tableMutedText}>Address / Code</Th>
                  <Th color={tableMutedText}>Date</Th>
                  <Th color={tableMutedText}>Slot</Th>
                  <Th color={tableMutedText}>Status</Th>
                  <Th className="no-export" isNumeric color={tableMutedText}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {disabled.map((visit) => (
                  <Tr key={visit.id} opacity={0.65} bg={disabledRowBg}>
                    <Td borderColor={rowBorderColor}>
                      <Box>{visit.patient?.name ?? "Unknown"}</Box>
                      <Box fontWeight="bold" fontSize="sm" color={isDark ? "whiteAlpha.900" : "gray.700"}>
                        {visit.patient?.phone ?? "No Phone"}
                      </Box>
                    </Td>
                    <Td borderColor={rowBorderColor}>
                      <HStack spacing={2} align="center">
                        <Box fontWeight="bold">
                          {visit.address || "No Area"}
                        </Box>
                        {hasLocationPin(visit) && (
                          <Badge colorScheme="teal" variant="subtle" borderRadius="full">
                            PIN
                          </Badge>
                        )}
                      </HStack>
                      <Box fontSize="sm" color={tableMutedText}>
                        {visit.visit_code ?? "N/A"}
                      </Box>
                    </Td>
                    <Td borderColor={rowBorderColor}>{formatDate(visit.visit_date)}</Td>
                    <Td borderColor={rowBorderColor}>{getSlotDisplay(visit)}</Td>
                    <Td borderColor={rowBorderColor}>
                      <Badge colorScheme="gray" rounded="md" px={2}>
                        DISABLED
                      </Badge>
                    </Td>
                    <Td className="no-export" isNumeric borderColor={rowBorderColor}>
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
