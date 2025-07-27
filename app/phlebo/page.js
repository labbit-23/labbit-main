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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  IconButton,
  Divider,
  VStack,
} from "@chakra-ui/react";
import { FiRefreshCw } from "react-icons/fi";
import { PhoneIcon } from "@chakra-ui/icons";
import { MdLocationOn } from "react-icons/md";
import PlacesAutocomplete from "react-places-autocomplete";

import { createClient } from "@supabase/supabase-js";
import TestPackageSelector from "../../components/TestPackageSelector";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (date) => date.toISOString().split("T")[0];

const STATUS_STYLES = {
  booked: { bg: "gray.100", borderColor: "gray.300" },
  assigned: { bg: "cyan.100", borderColor: "cyan.400" },
  pending: { bg: "yellow.100", borderColor: "yellow.400" },
  in_progress: { bg: "blue.100", borderColor: "blue.400" },
  sample_picked: { bg: "green.100", borderColor: "green.400" },
  sample_dropped: { bg: "purple.100", borderColor: "purple.400" },
  completed: { bg: "green.200", borderColor: "green.500" },
  default: { bg: "gray.100", borderColor: "gray.200" },
};

const visitStatusOrder = [
  "booked",
  "assigned",
  "pending",
  "in_progress",
  "sample_picked",
  "sample_dropped",
  "completed",
];

// Helpers for status step progression
const statusToStepIndex = (status) => visitStatusOrder.indexOf(status);
const stepIndexToStatus = (index) => visitStatusOrder[index] || "booked";

export default function PhleboPage() {
  const toast = useToast();

  // States
  const [executives, setExecutives] = useState([]);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [visits, setVisits] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));

  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Active visit details
  const [activeVisit, setActiveVisit] = useState(null);
  const [newAddress, setNewAddress] = useState("");
  const addressModal = useDisclosure();

  // Tests modal
  const [selectedTests, setSelectedTests] = useState(new Set());
  const testsModal = useDisclosure();

  // Fetch executives
  const fetchExecutives = async () => {
    setErrorMsg(null);
    setLoadingExecutives(true);
    try {
      const { data, error } = await supabase
        .from("executives")
        .select("id, name, status")
        .in("status", ["active", "available"]);

      if (error) throw error;

      setExecutives(data);
      setSelectedExecutive(data?.[0]?.id ?? null);
    } catch (error) {
      console.error(error);
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

  // Fetch visits
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
        .select(
          `
          id,
          address,
          time_slot,
          status,
          patient:patient_id(name, phone),
          executive:executive_id(name),
          executive_id
        `
        )
        .eq("visit_date", selectedDate)
        .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);

      if (error) throw error;

      setVisits(data || []);
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to load visits.");
      setVisits([]);
      toast({
        title: "Error loading visits",
        description: error.message || "Please try again later.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoadingVisits(false);
    }
  };

  // Open visit details modal/view
  const openVisit = async (visit) => {
    setActiveVisit(visit);
    setNewAddress(visit.address ?? "");

    try {
      const { data, error } = await supabase
        .from("visit_details")
        .select("test_id")
        .eq("visit_id", visit.id);
      if (error) throw error;

      setSelectedTests(new Set(data.map((d) => d.test_id)));
    } catch (e) {
      console.error("Error fetching selected tests:", e);
      setSelectedTests(new Set());
    }
  };

  const closeVisit = () => {
    setActiveVisit(null);
    setSelectedTests(new Set());
    setNewAddress("");
  };

  // Assign visit to selected executive, set status assigned
  const assignVisit = async (visitId) => {
    if (!selectedExecutive) {
      setErrorMsg("Please select an executive.");
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
      console.error(error);
      setErrorMsg("Failed to assign visit.");
      toast({
        title: "Error assigning visit",
        description: error.message || "Please try again later.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Update visit status for active visit
  const updateVisitStatus = async (newStatus) => {
    if (!activeVisit) return;
    try {
      const { error } = await supabase.from("visits").update({ status: newStatus }).eq("id", activeVisit.id);
      if (error) throw error;

      toast({
        title: `Visit status updated to ${newStatus.replace(/_/g, " ")}`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await fetchVisits();

      // Refresh activeVisit with latest data
      const { data, error: singleErr } = await supabase
        .from("visits")
        .select(
          `
          id,
          address,
          time_slot,
          status,
          patient:patient_id(name, phone),
          executive:executive_id(name),
          executive_id
          `
        )
        .eq("id", activeVisit.id)
        .single();

      if (!singleErr) setActiveVisit(data);
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to update visit status",
        description: error.message || "Please try again",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Save updated address for active visit
  const saveAddress = async () => {
    if (!activeVisit) return;
    try {
      const { error } = await supabase.from("visits").update({ address: newAddress }).eq("id", activeVisit.id);
      if (error) throw error;

      toast({
        title: "Address updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await fetchVisits();
      setActiveVisit({ ...activeVisit, address: newAddress });
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to update address",
        description: error.message || "Please try again",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Save selected tests for active visit
  const saveTests = async () => {
    if (!activeVisit) return;
    try {
      // Delete any existing tests for this visit
      const { error: deleteError } = await supabase.from("visit_details").delete().eq("visit_id", activeVisit.id);
      if (deleteError) throw deleteError;

      // Insert new ones
      const inserts = Array.from(selectedTests).map((test_id) => ({
        visit_id: activeVisit.id,
        test_id,
      }));

      if (inserts.length) {
        const { error: insertError } = await supabase.from("visit_details").insert(inserts);
        if (insertError) throw insertError;
      }

      toast({
        title: "Tests updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to save tests",
        description: error.message || "Please try again",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Quick date helpers
  const quickSelect = (daysOffset) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    setSelectedDate(formatDate(date));
  };

  // Styles for visit rows based on status
  const getStatusStyle = (status) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES.default;
    return {
      bg: style.bg,
      borderLeft: "4px solid",
      borderColor: style.borderColor,
    };
  };

  // Filter visits according to selected executive
  const assignedVisits = visits.filter(
    (v) => v.executive_id && v.executive_id === selectedExecutive
  );
  const unassignedVisits = visits.filter(
    (v) => !v.executive_id || v.executive_id === ""
  );

  return (
    <Box p={6} maxW="4xl" mx="auto">
      {/* Page header */}
      <Heading as="h1" size="xl" mb={6} textAlign="center">
        Welcome, HV Executive
      </Heading>

      {/* Executive selector and date picker */}
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

      {/* Error message */}
      {errorMsg && (
        <Alert status="error" mb={6} borderRadius="md">
          <AlertIcon />
          {errorMsg}
        </Alert>
      )}

      {/* Visits Table */}
      {loadingVisits ? (
        <Text textAlign="center" color="gray.500" mb={8}>
          Loading visits...
        </Text>
      ) : (
        <>
          {/* Assigned Visits */}
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
                    <Th>Phone</Th>
                    <Th>Time Slot</Th>
                    <Th>Address</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {assignedVisits.map((visit) => {
                    const styleProps = getStatusStyle(visit.status);
                    return (
                      <Tr
                        key={visit.id}
                        {...styleProps}
                        title={`Visit Status: ${visit.status}`}
                        cursor="pointer"
                        onClick={() => openVisit(visit)}
                      >
                        <Td>{visit.patient?.name || "Unknown Patient"}</Td>
                        <Td>
                          {visit.patient?.phone ? (
                            <Link
                              href={`tel:${visit.patient.phone}`}
                              color="blue.600"
                              onClick={(e) => e.stopPropagation()}
                              textDecoration="underline"
                              aria-label={`Call ${visit.patient.name}`}
                            >
                              {visit.patient.phone}
                            </Link>
                          ) : (
                            "Unknown"
                          )}
                        </Td>
                        <Td>{visit.time_slot}</Td>
                        <Td maxW="xs" isTruncated>
                          {visit.address}
                        </Td>
                        <Td textTransform="capitalize">{visit.status.replace(/_/g, " ")}</Td>
                        <Td>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            {/* The whole row is clickable to open detail, so no other buttons here */}
                            <Text fontSize="sm" color="gray.500" userSelect="none">
                              Tap row for actions
                            </Text>
                          </Stack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </Box>

          {/* Unassigned Visits */}
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
                    borderWidth={1}
                    borderColor="gray.300"
                    borderLeftWidth={4}
                    borderLeftColor="gray.500"
                    bg="white"
                    p={4}
                    rounded="md"
                    shadow="sm"
                    maxW="4xl"
                  >
                    <Text fontWeight="semibold" fontSize="lg">
                      {visit.patient?.name || "Unknown Patient"}
                    </Text>
                    <Text fontSize="sm" color="gray.600" mb={1}>
                      {visit.time_slot}
                    </Text>
                    <Text fontSize="sm" noOfLines={2} mb={1} title={visit.address}>
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

      {/* Visit Detail Modal */}
      {activeVisit && (
        <Modal isOpen={true} onClose={closeVisit} size="lg" scrollBehavior="inside" isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Visit Details for {activeVisit.patient?.name}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold">Patient Phone:</Text>
                  {activeVisit.patient?.phone ? (
                    <Link href={`tel:${activeVisit.patient.phone}`} color="blue.600" isExternal>
                      {activeVisit.patient.phone}
                    </Link>
                  ) : (
                    "Unknown"
                  )}
                </Box>

                {/* Navigate button */}
                <Button
                  as="a"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeVisit.address ?? "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftIcon={<MdLocationOn />}
                  colorScheme="teal"
                  variant="outline"
                >
                  Navigate to Address
                </Button>

                {/* Address update with Google Places Autocomplete */}
                <Box>
                  <Text fontWeight="bold" mb={1}>
                    Update Address:
                  </Text>
                  <PlacesAutocomplete
                    value={newAddress}
                    onChange={setNewAddress}
                    onSelect={setNewAddress}
                  >
                    {({ getInputProps, suggestions, getSuggestionItemProps, loading }) => (
                      <Box position="relative">
                        <Input {...getInputProps({ placeholder: "Search address..." })} />
                        {loading && (
                          <Box position="absolute" bg="white" w="full" p={2} shadow="md" zIndex={1000}>
                            <Text>Loading...</Text>
                          </Box>
                        )}
                        <Box position="absolute" bg="white" w="full" maxH="200px" overflowY="auto" shadow="md" zIndex={1000}>
                          {suggestions.map((suggestion) => {
                            const style = {
                              backgroundColor: suggestion.active ? "#edf2f7" : "#fff",
                              cursor: "pointer",
                              padding: "8px 12px",
                            };
                            return (
                              <Box
                                key={suggestion.placeId}
                                {...getSuggestionItemProps(suggestion, { style })}
                              >
                                {suggestion.description}
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>
                    )}
                  </PlacesAutocomplete>
                  <Button mt={2} colorScheme="brand" onClick={saveAddress} size="sm">
                    Save Address
                  </Button>
                </Box>

                {/* Status Update Buttons (Stepper style) */}
                <Box>
                  <Text fontWeight="bold" mb={2}>
                    Visit Status:
                  </Text>
                  <HStack spacing={2}>
                    {visitStatusOrder.map((status, idx) => {
                      const isCurrent = status === activeVisit.status;
                      const isCompleted = visitStatusOrder.indexOf(activeVisit.status) > idx;
                      return (
                        <Button
                          key={status}
                          size="sm"
                          isDisabled={!isCurrent && !isCompleted}
                          colorScheme={isCurrent ? "blue" : isCompleted ? "green" : "gray"}
                          variant={isCurrent ? "solid" : "outline"}
                          onClick={() => !isCurrent && updateVisitStatus(status)}
                        >
                          {status.replace(/_/g, " ").toUpperCase()}
                        </Button>
                      );
                    })}
                  </HStack>
                </Box>

                {/* Add Tests Selector */}
                <Box>
                  <Text fontWeight="bold" mb={2}>
                    Add Tests/Packages:
                  </Text>
                  <TestPackageSelector
                    initialSelectedTests={selectedTests}
                    onSelectionChange={setSelectedTests}
                  />
                  <Button mt={2} colorScheme="brand" onClick={saveTests}>
                    Save Tests
                  </Button>
                </Box>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button onClick={closeVisit} variant="ghost">
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Box>
  );
}
