//app/admin/componentss/PatientList.js

"use client";

import React, { useState, useMemo } from "react";
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
  Input,
  HStack,
  Badge,
  VStack,
  Button,
  Flex,
} from "@chakra-ui/react";

const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

export default function PatientList({ patients = [], loading = false, visits = [] }) {
  const [searchTerm, setSearchTerm] = useState("");

  // Map patient ID → pending visits count
  const patientPendingVisitsMap = useMemo(() => {
    const map = {};
    visits.forEach((visit) => {
      if (visit.status === "pending" && visit.patient_id) {
        map[visit.patient_id] = (map[visit.patient_id] || 0) + 1;
      }
    });
    return map;
  }, [visits]);

  // 🔹 New: Count visits per HV (or Unassigned)
  const hvVisitCounts = useMemo(() => {
    return visits.reduce((acc, visit) => {
      const label = visit.executive?.name || "Unassigned";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
  }, [visits]);

  // Filter + sort patients
  const filteredPatients = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const filtered = patients.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchLower) ||
        (p.phone && p.phone.toLowerCase().includes(searchLower))
      );
    });
    filtered.sort((a, b) => {
      const aPending = patientPendingVisitsMap[a.id] || 0;
      const bPending = patientPendingVisitsMap[b.id] || 0;
      return bPending - aPending;
    });
    return filtered;
  }, [patients, searchTerm, patientPendingVisitsMap]);

  if (loading) {
    return (
      <Box py={10} textAlign="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (!filteredPatients.length) {
    return (
      <Text textAlign="center" py={10} fontSize="lg" color="gray.600">
        No patients found.
      </Text>
    );
  }

  return (
    <Box>
      {/* 🔹 HV visit counts row */}
      <Flex mb={3} gap={2} flexWrap="wrap">
        {Object.entries(hvVisitCounts).map(([label, count]) => (
          <Badge
            key={label}
            colorScheme={label === "Unassigned" ? "red" : "green"}
            fontSize="sm"
          >
            {label} ({count})
          </Badge>
        ))}
      </Flex>

      <VStack align="start" mb={4}>
        <HStack spacing={3} maxW="400px" width="100%">
          <Input
            placeholder="Search patients by name or phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search patients"
            size="md"
          />
          <Button onClick={() => setSearchTerm("")} size="md">
            Clear
          </Button>
        </HStack>
      </VStack>

      <Table
        variant="simple"
        size="sm"
        rounded="xl"
        boxShadow="lg"
        overflowX="auto"
        bg="white"
      >
        <Thead bg="gray.100">
          <Tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>DOB</Th>
            <Th>Gender</Th>
            <Th>Email</Th>
            <Th isNumeric>Pending Visits</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredPatients.map((patient) => {
            const pendingCount = patientPendingVisitsMap[patient.id] || 0;
            return (
              <Tr key={patient.id} bg={pendingCount > 0 ? "yellow.50" : undefined}>
                <Td>{patient.name}</Td>
                <Td>{patient.phone}</Td>
                <Td>{patient.dob ? formatDate(patient.dob) : "N/A"}</Td>
                <Td>{patient.gender || "N/A"}</Td>
                <Td>{patient.email || "N/A"}</Td>
                <Td isNumeric>
                  {pendingCount > 0 ? (
                    <Badge colorScheme="yellow" variant="subtle" fontWeight="bold">
                      {pendingCount}
                    </Badge>
                  ) : (
                    "0"
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
