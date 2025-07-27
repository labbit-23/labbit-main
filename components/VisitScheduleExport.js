// components/VisitScheduleExport.js
"use client";

import React, { useState, useRef } from "react";
import {
  Box,
  Button,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Heading,
  HStack,
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import html2canvas from "html2canvas";

const VisitScheduleExport = ({ visits, executives }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); // default today
  const tableRef = useRef();

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
      case "completed":
        return "green";
      default:
        return "gray";
    }
  };

  const downloadImage = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { backgroundColor: "#fff", scale: 2 });
      const link = document.createElement("a");
      link.download = `HV_Visit_Schedule_${date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("Error generating image: " + err.message);
    }
  };

  return (
    <>
      <HStack mb={4} spacing={3} wrap="wrap">
        <Input
          type="date"
          maxW="180px"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Select date for export"
        />
        <Button leftIcon={<DownloadIcon />} colorScheme="brand" onClick={downloadImage} aria-label="Download Visit Schedule">
          Download Schedule
        </Button>
      </HStack>

      <Box
        ref={tableRef}
        p={4}
        bg="white"
        borderRadius="md"
        boxShadow="md"
        overflowX="auto"
        userSelect="none"
      >
        <Heading size="md" mb={4} textAlign="center" color="brand.600">
          Visit Schedule for {date}
        </Heading>
        <Table size="sm" variant="simple" whiteSpace="nowrap">
          <Thead bg="gray.100">
            <Tr>
              <Th>Executive</Th>
              <Th>Time Slot</Th>
              <Th>Patient</Th>
              <Th>Address</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {executives
              .concat([{ id: null, name: "Unassigned" }]) // Add unassigned group
              .map((exec) => {
                const execVisits = visits.filter(
                  (v) =>
                    v.visit_date &&
                    v.visit_date.slice(0, 10) === date &&
                    (v.executive?.id === exec.id || (!v.executive?.id && exec.id === null))
                );
                if (!execVisits.length) return null;
                return execVisits.map((visit, idx) => (
                  <Tr key={visit.id}>
                    {idx === 0 && (
                      <Td rowSpan={execVisits.length} fontWeight="bold" bg="brand.50">
                        {exec.name}
                      </Td>
                    )}
                    <Td>{visit.time_slot}</Td>
                    <Td>{visit.patient?.name || "Unknown"}</Td>
                    <Td>{visit.address}</Td>
                    <Td>
                      <Badge colorScheme={statusColorScheme(visit.status)}>
                        {visit.status?.replace(/_/g, " ").toUpperCase() ?? "N/A"}
                      </Badge>
                    </Td>
                  </Tr>
                ));
              })}
          </Tbody>
        </Table>
      </Box>
    </>
  );
};

export default VisitScheduleExport;
