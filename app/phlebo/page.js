"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Select,
  Input,
  Button,
  Text,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Stack,
  Flex,
  HStack,
  Alert,
  AlertIcon,
  Link,
  useToast,
} from "@chakra-ui/react";
import { FiRefreshCw } from "react-icons/fi";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (date) => date.toISOString().split("T")[0];

const STATUS_STYLES = {
  pending: { bg: "yellow.100", borderColor: "yellow.400", pulse: false },
  in_progress: { bg: "blue.100", borderColor: "blue.400", pulse: true },
  sample_picked: { bg: "green.100", borderColor: "green.400", pulse: false },
  sample_dropped: { bg: "purple.100", borderColor: "purple.400", pulse: false },
  assigned: { bg: "cyan.100", borderColor: "cyan.400", pulse: false },
  booked: { bg: "gray.100", borderColor: "gray.300", pulse: false },
  default: { bg: "gray.100", borderColor: "gray.200", pulse: false },
};

const PhleboPage = () => {
  const [executives, setExecutives] = useState([]);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [visits, setVisits] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const toast = useToast();

  // Fetch executives with status active or available
  const fetchExecutives = async () => {
    setErrorMsg(null);
    setLoadingExecutives(true);
    try {
      const { data, error } = await supabase
        .from("executives")
        .select("id, name, status")
        .in("status", ["active", "available"]);

      if (error) throw error;

      console.log("Executives fetched:", data); // Debug log to confirm fetch

      setExecutives(data);
      setSelectedExecutive(data?.[0]?.id ?? null);
    } catch (error) {
      console.error("Error fetching executives:", error);
      setErrorMsg("Failed to load executives.");
      toast({
        title: "Error loading executives",
        description: error.message || "Please try again later.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoadingExecutives(false);
    }
  };

  // Fetch visits filtered by selected date and executive
  const fetchVisits = async () => {
    if (!selectedExecutive) {
      setVisits([]);
      return;
    }
    setErrorMsg(null);
    setLoadingVisits(true);
    try {
      const { data, error } = await supabase
        .from("visits")
        .select(`
          *,
          patient:patient_id(name, phone),
          executive:executive_id(name)
        `)
        .eq("visit_date", selectedDate)
        .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);

      if (error) throw error;

      console.log("Visits fetched:", data); // Debug log to confirm fetch

      setVisits(data || []);
    } catch (error) {
      console.error("Error fetching visits:", error);
      setErrorMsg("Failed to load visits.");
      toast({
        title: "Error loading visits",
        description: error.message || "Please try again later.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      setVisits([]);
    } finally {
      setLoadingVisits(false);
    }
  };

  // Assign visit to selected executive and set status to 'assigned'
  const assignVisit = async (visitId) => {
    if (!selectedExecutive) {
      setErrorMsg("Please select an executive to assign.");
      return;
    }
    try {
      const { error } = await supabase
        .from("visits")
        .update({ executive_id: selectedExecutive, status: "assigned" })
        .eq("id", visitId);
      if (error) throw error;

      toast({
        title: "Visit assigned to you",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await fetchVisits();
    } catch (error) {
      console.error("Error assigning visit:", error);
      setErrorMsg("Failed to assign visit.");
      toast({
        title: "Error assigning visit",
        description: error.message || "Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  useEffect(() => {
    fetchExecutives();
  }, []);

  useEffect(() => {
    fetchVisits();
  }, [selectedExecutive, selectedDate]);

  // Utility to get status styles
  const getStatusStyle = (status) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES.default;
    return {
      bg: style.bg,
      borderLeft: "4px solid",
      borderColor: style.borderColor,
    };
  };

  // Filter visits for assigned/unassigned
  const assignedVisits = visits.filter(
    (v) => v.executive_id && v.executive_id === selectedExecutive
  );
  const unassignedVisits = visits.filter(
    (v) => v.executive_id == null || v.executive_id === ""
  );

  return (
    <Box p={6} maxW="4xl" mx="auto">
      <Heading as="h1" size="xl" mb={6} textAlign="center">
        Welcome, HV Executive
      </Heading>

      <Flex direction={{ base: "column", sm: "row" }} justify="center" gap={4} mb={6} align="center">
        <Select
          maxW="240px"
          value={selectedExecutive ?? ""}
          onChange={(e) => setSelectedExecutive(e.target.value)}
          isDisabled={loadingExecutives}
          aria-label="Select Home Visit Executive"
          placeholder={loadingExecutives ? "Loading executives..." : "Select Executive"}
        >
          {executives.map(({ id, name, status }) => (
            <option key={id} value={id}>
              {name} ({status})
            </option>
          ))}
        </Select>

        <Input
          type="date"
          max={formatDate(new Date())}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          maxW="160px"
          aria-label="Select visit date"
        />

        <HStack spacing={2}>
          <Button size="sm" colorScheme="blue" onClick={() => quickSelect(-1)} aria-label="Yesterday">
            Yesterday
          </Button>
          <Button size="sm" colorScheme="blue" onClick={() => quickSelect(0)} aria-label="Today">
            Today
          </Button>
          <Button size="sm" colorScheme="blue" onClick={() => quickSelect(1)} aria-label="Tomorrow">
            Tomorrow
          </Button>
          <Button
            size="sm"
            onClick={fetchVisits}
            aria-label="Refresh visits"
            title="Refresh visits"
            leftIcon={<FiRefreshCw />}
          >
            Refresh
          </Button>
        </HStack>
      </Flex>

      {errorMsg && (
        <Alert status="error" mb={6} borderRadius="md">
          <AlertIcon />
          {errorMsg}
        </Alert>
      )}

      {loadingVisits ? (
        <Text textAlign="center" color="gray.500" mb={8}>
          Loading visits...
        </Text>
      ) : (
        <>
          <Box mb={8}>
            <Heading as="h2" size="lg" mb={4}>
              Assigned Visits ({assignedVisits.length})
            </Heading>
            {assignedVisits.length === 0 ? (
              <Text textAlign="center" color="gray.600">
                No assigned visits.
              </Text>
            ) : (
              <Table variant="simple" size="sm" borderWidth="1px" borderColor="gray.300" borderRadius="md">
                <Thead bg="gray.100">
                  <Tr>
                    <Th>Patient</Th>
                    <Th>Time Slot</Th>
                    <Th>Address</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {assignedVisits.map((visit) => (
                    <Tr key={visit.id} {...getStatusStyle(visit.status)} title={`Visit Status: ${visit.status}`}>
                      <Td>{visit.patient?.name || "Unknown Patient"}</Td>
                      <Td>{visit.time_slot}</Td>
                      <Td maxW="xs" isTruncated>
                        {visit.address}
                      </Td>
                      <Td textTransform="capitalize">{visit.status.replace(/_/g, " ")}</Td>
                      <Td>
                        <Stack direction="row" spacing={1}>
                          {visit.status === "pending" && (
                            <Button
                              size="sm"
                              colorScheme="blue"
                              onClick={() => updateVisitStatus(visit.id, "in_progress")}
                              aria-label={`Start visit for ${visit.patient?.name}`}
                            >
                              Start Visit
                            </Button>
                          )}
                          {visit.status === "in_progress" && (
                            <>
                              <Button
                                size="sm"
                                colorScheme="green"
                                onClick={() => updateVisitStatus(visit.id, "sample_picked")}
                                aria-label={`Mark sample picked for ${visit.patient?.name}`}
                              >
                                Mark Picked
                              </Button>
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  visit.address || ""
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-gray-300 hover:bg-gray-400 text-black px-2 py-1 rounded text-sm"
                              >
                                Navigate
                              </a>
                            </>
                          )}
                          {visit.status === "sample_picked" && (
                            <Button
                              size="sm"
                              colorScheme="purple"
                              onClick={() => updateVisitStatus(visit.id, "sample_dropped")}
                              aria-label={`Mark sample dropped for ${visit.patient?.name}`}
                            >
                              Mark Dropped
                            </Button>
                          )}
                        </Stack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>

          <Box>
            <Heading as="h2" size="lg" mb={4}>
              Unassigned Visits ({unassignedVisits.length})
            </Heading>
            {unassignedVisits.length === 0 ? (
              <Text textAlign="center" color="gray.600">
                No unassigned visits.
              </Text>
            ) : (
              <Stack spacing={4}>
                {unassignedVisits.map((visit) => (
                  <Box
                    key={visit.id}
                    borderLeftWidth={4}
                    borderColor="gray.500"
                    bg="white"
                    p={4}
                    rounded="md"
                    shadow="sm"
                    maxW="4xl"
                    textAlign="left"
                  >
                    <Text fontWeight="semibold" fontSize="lg">
                      {visit.patient?.name || "Unknown Patient"}
                    </Text>
                    <Text fontSize="sm" color="gray.600" mb={1}>
                      {visit.time_slot}
                    </Text>
                    <Text fontSize="sm" isTruncated maxW="xl" mb={1} title={visit.address}>
                      {visit.address}
                    </Text>
                    <Text fontSize="xs" fontStyle="italic" color="gray.700" mt={1}>
                      Status: Unassigned
                    </Text>
                    <Button
                      mt={3}
                      colorScheme="blue"
                      size="sm"
                      onClick={() => assignVisit(visit.id)}
                      aria-label={`Assign visit for ${visit.patient?.name} to me`}
                    >
                      Assign to Me
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

  // Helper functions inside component:

  function quickSelect(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    setSelectedDate(formatDate(date));
  }

  async function updateVisitStatus(visitId, status) {
    try {
      const { error } = await supabase.from("visits").update({ status }).eq("id", visitId);
      if (error) throw error;

      toast({
        title: `Visit status updated to '${status.replace(/_/g, " ")}'`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await fetchVisits();
    } catch (error) {
      toast({
        title: "Error updating visit status",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("Failed to update visit status:", error);
    }
  }
};

export default PhleboPage;
