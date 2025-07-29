"use client";

import React from "react";
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
} from "@chakra-ui/react";

export default function ExecutiveList({ executives = [], loading = false }) {
  if (loading) {
    return (
      <Box py={10} textAlign="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (!executives.length) {
    return (
      <Text textAlign="center" py={10} fontSize="lg" color="gray.600">
        No executives found.
      </Text>
    );
  }

  return (
    <Table variant="simple" size="sm" rounded="xl" boxShadow="lg" overflowX="auto" bg="white">
      <Thead bg="gray.100">
        <Tr>
          <Th>Name</Th>
          <Th>Phone</Th>
          <Th>Status</Th>
        </Tr>
      </Thead>
      <Tbody>
        {executives.map((exec) => (
          <Tr key={exec.id}>
            <Td>{exec.name}</Td>
            <Td>{exec.phone || "N/A"}</Td>
            <Td>{exec.status || "N/A"}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
