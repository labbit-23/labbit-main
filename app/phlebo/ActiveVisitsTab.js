"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Stack,
  Spinner,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  Input,
  useToast,
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const STATUS_STYLES = {
  pending: { bg: "yellow.100", borderColor: "yellow.400" },
  in_progress: { bg: "blue.100", borderColor: "blue.400" },
  sample_picked: { bg: "green.100", borderColor: "green.400" },
  sample_dropped: { bg: "purple.100", borderColor: "purple.400" },
  assigned: { bg: "cyan.100", borderColor: "cyan.400" },
  booked: { bg: "gray.100", borderColor: "gray.300" },
  default: { bg: "gray.100", borderColor: "gray.200" },
};

function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.default;
}

export default function ActiveVisitsTab({ onSelectVisit, selectedVisit }) {
  const toast = useToast();

  const [executives, setExecutives] = useState([]);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    async function fetchExecutives() {
      setLoadingExecutives(true);
      setErrorMsg(null);
      try {
        const { data, error } = await supabase
          .from("executives")
          .select("id, name, status")
          .in("status", ["active", "available"]);

        if (error) throw error;

        setExecutives(data);
        setSelectedExecutive(data?.[0]?.id ?? null);
      } catch (error) {
        setErrorMsg("Failed to load executives.");
        toast({
          title: "Error loading executives",
          description: error.message || "Please try again.",
          status: "error",
          duration: 5000,
        });
      } finally {
        setLoadingExecutives(false);
      }
    }
    fetchExecutives();
  }, [toast]);

  useEffect(() => {
    async function fetchVisits() {
      if (!selectedExecutive) {
        setVisits([]);
        return;
      }
      setLoadingVisits(true);
      setErrorMsg(null);
      try {
        const { data, error } = await supabase
          .from("visits")
          .select(`
            id,
            patient_id,
            visit_date,
            time_slot (slot_name),
            address,
            status,
            executive_id,
            patient:patient_id(name, phone),
            executive:executive_id(name)
          `)
          .eq("visit_date", selectedDate)
          .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);

        if (error) throw error;

        setVisits(data || []);
      } catch (error) {
        setErrorMsg("Failed to load visits.");
        toast({
          title: "Error loading visits",
          description: error.message || "Please try again.",
          status: "error",
          duration: 5000,
        });
        setVisits([]);
      } finally {
        setLoadingVisits(false);
      }
    }
    fetchVisits();
  }, [selectedExecutive, selectedDate, toast]);

  const assignedVisits = visits.filter((v) => v.executive_id === selectedExecutive);
  const unassignedVisits = visits.filter((v) => !v.executive_id);

  const assignVisit = async (visitId) => {
    if (!selectedExecutive) {
      toast({ title: "Please select an executive", status: "warning" });
      return;
    }
    try {
      const { error } = await supabase
        .from("visits")
        .update({ executive_id: selectedExecutive, status: "assigned" })
        .eq("id", visitId);
      if (error) throw error;
      toast({ title: "Visit assigned", status: "success", duration: 3000 });
      // Refresh visits
      setLoadingVisits(true);
      const { data } = await supabase
        .from("visits")
        .select(`
          id,
          patient_id,
          visit_date,
          time_slot (slot_name),
          address,
          status,
          executive_id,
          patient:patient_id(name),
          executive:executive_id(name)
        `)
        .eq("visit_date", selectedDate)
        .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);
      setVisits(data || []);
      setLoadingVisits(false);
    } catch (e) {
      toast({
        title: "Failed to assign visit",
        description: e.message ?? "Unknown error",
        status: "error",
      });
    }
  };

  return (
    <Box>
      <Heading size="md" mb={4}>
        Select Executive and Visit Date
      </Heading>

      <Stack direction={{ base: "column", md: "row" }} spacing={4} mb={6}>
        <Select
          maxW="300px"
          placeholder={loadingExecutives ? "Loading executives..." : "Select Executive"}
          isDisabled={loadingExecutives}
          value={selectedExecutive ?? ""}
          onChange={(e) => setSelectedExecutive(e.target.value)}
        >
          {executives.map(({ id, name, status }) => (
            <option key={id} value={id}>
              {name} ({status})
            </option>
          ))}
        </Select>

        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          maxW="160px"
        />
      </Stack>

      {errorMsg && (
        <Text color="red.500" my={4}>
          {errorMsg}
        </Text>
      )}

      {loadingVisits ? (
        <Spinner size="xl" />
      ) : (
        <>
          <Box mb={8}>
            <Heading size="md" mb={3}>
              Assigned Visits ({assignedVisits.length})
            </Heading>
            {assignedVisits.length === 0 ? (
              <Text>No assigned visits found.</Text>
            ) : (
              <Table variant="simple" size="sm" mb={6}>
                <Thead bg="gray.100">
                  <Tr>
                    <Th>Patient</Th>
                    <Th>Date</Th>
                    <Th>Time Slot</Th>
                    <Th>Status</Th>
                    <Th isNumeric>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {assignedVisits.map((visit) => (
                    <Tr key={visit.id} style={getStatusStyle(visit.status)}>
                      <Td>{visit.patient?.name ?? "Unknown"}</Td>
                      <Td>{visit.visit_date}</Td>
                      <Td>{visit.time_slot?.slot_name ?? "-"}</Td>
                      <Td textTransform="capitalize">{visit.status.replace(/_/g, " ")}</Td>
                      <Td isNumeric>
                        <Button
                          size="sm"
                          onClick={() => onSelectVisit(visit)}
                          colorScheme={selectedVisit?.id === visit.id ? "teal" : "blue"}
                        >
                          Select
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>

          <Box>
            <Heading size="md" mb={3}>
              Unassigned Visits ({unassignedVisits.length})
            </Heading>
            {unassignedVisits.length === 0 ? (
              <Text>No unassigned visits.</Text>
            ) : (
              <Stack spacing={3}>
                {unassignedVisits.map((visit) => (
                  <Box
                    key={visit.id}
                    p={4}
                    borderWidth="1px"
                    rounded="md"
                    style={getStatusStyle(visit.status)}
                  >
                    <Text fontWeight="bold">{visit.patient?.name ?? "Unknown"}</Text>
                    <Text>{visit.visit_date}</Text>
                    <Text>{visit.time_slot?.slot_name ?? "-"}</Text>
                    <Button
                      size="sm"
                      mt={2}
                      colorScheme="blue"
                      onClick={() => assignVisit(visit.id)}
                    >
                      Assign to Me
                    </Button>
                    <Button
                      size="sm"
                      ml={2}
                      onClick={() => onSelectVisit(visit)}
                      colorScheme="gray"
                    >
                      Select
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
