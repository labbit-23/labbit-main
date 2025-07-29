"use client";

import React from "react";
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
} from "@chakra-ui/react";
import { EditIcon, DeleteIcon } from "@chakra-ui/icons";

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
    default:
      return "gray";
  }
};

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

export default function VisitsTable({
  visits = [],
  timeSlots = [],
  onEdit,
  onDelete,
  loading = false,
}) {
  // Helper to render time slot display if visit.time_slot is missing
  // fallback to using timeSlots from props if needed:
  const getTimeSlotDisplay = (visit) => {
    // Prefer visit.time_slot object (should be nested)
    if (visit.time_slot && visit.time_slot.slot_name) {
      return `${visit.time_slot.slot_name} (${visit.time_slot.start_time.slice(0, 5)} - ${visit.time_slot.end_time.slice(0, 5)})`;
    }
    // Fallback: find from timeSlots prop by id or visit.time_slot_id field
    if (timeSlots.length) {
      const tsId = visit.time_slot_id || visit.time_slot; // either field
      const matchedSlot = timeSlots.find((s) => s.id === tsId);
      if (matchedSlot) {
        return `${matchedSlot.slot_name} (${matchedSlot.start_time.slice(0, 5)} - ${matchedSlot.end_time.slice(0, 5)})`;
      }
    }
    return "Unknown";
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
    <Table variant="simple" size="sm" borderRadius="xl" boxShadow="lg" overflowX="auto" bg="white">
      <Thead bg="gray.100">
        <Tr>
          <Th>Visit Code</Th>
          <Th>Date</Th>
          <Th>Time Slot</Th>
          <Th>Patient</Th>
          <Th>Executive</Th>
          <Th>Lab</Th>
          <Th>Status</Th>
          <Th isNumeric>Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {visits.map((visit) => (
          <Tr key={visit.id}>
            <Td>{visit.visit_code || "N/A"}</Td>
            <Td>{formatDate(visit.visit_date)}</Td>
            <Td>{getTimeSlotDisplay(visit)}</Td>
            <Td>{visit.patient?.name || "Unknown"}</Td>
            <Td>{visit.executive?.name || "Unassigned"}</Td>
            <Td>{visit.lab?.name || "N/A"}</Td>
            <Td>
              <Badge colorScheme={statusColorScheme(visit.status)} rounded="md" px={2}>
                {visit.status?.replace(/_/g, " ").toUpperCase()}
              </Badge>
            </Td>
            <Td isNumeric>
              <HStack spacing={1} justifyContent="flex-end">
                <IconButton
                  aria-label="Edit visit"
                  icon={<EditIcon />}
                  size="sm"
                  colorScheme="brand"
                  onClick={() => onEdit && onEdit(visit)}
                />
                <IconButton
                  aria-label="Delete visit"
                  icon={<DeleteIcon />}
                  size="sm"
                  colorScheme="red"
                  onClick={() => onDelete && onDelete(visit.id)}
                />
              </HStack>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
