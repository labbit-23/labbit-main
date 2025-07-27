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
  VStack,
  Link,
  Divider,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { FiRefreshCw } from "react-icons/fi";
import { MdOutlineLocationOn } from "react-icons/md";
import PlacesAutocomplete from "react-places-autocomplete";

import TestPackageSelector from "../../components/TestPackageSelector"; // Adjust path if needed
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const visitStatusOrder = [
  "booked",
  "assigned",
  "pending",
  "in_progress",
  "sample_picked",
  "sample_dropped",
  "completed",
];

const visitStatusLabels = {
  booked: "Booked",
  assigned: "Assigned",
  pending: "Pending",
  in_progress: "In Progress",
  sample_picked: "Sample Picked",
  sample_dropped: "Sample Dropped",
  completed: "Completed",
};

const STATUS_COLORS = {
  booked: "gray",
  assigned: "cyan",
  pending: "yellow",
  in_progress: "blue",
  sample_picked: "green",
  sample_dropped: "purple",
  completed: "teal",
};

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
};

export default function PhleboPage() {
  const toast = useToast();

  // State variables
  const [executives, setExecutives] = useState([]);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [visits, setVisits] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));

  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [activeVisit, setActiveVisit] = useState(null);

  // Modal control hooks
  const addressModal = useDisclosure();
  const testsModal = useDisclosure();

  // Modal data and input states
  const [newAddress, setNewAddress] = useState("");
  const [selectedTests, setSelectedTests] = useState(new Set());

  // Fetch executives with required statuses
  const fetchExecutives = async () => {
    setErrorMsg("");
    setLoadingExecutives(true);
    try {
      const { data, error } = await supabase
        .from("executives")
        .select("id, name, status")
        .in("status", ["active", "available"]);

      if (error) throw error;

      // Debug log - remove or comment before prod
      // console.log("Executives fetched:", data);

      setExecutives(data || []);
      setSelectedExecutive(data?.[0]?.id ?? null);
    } catch (error) {
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
    setErrorMsg("");
    setLoadingVisits(true);
    try {
      const { data, error } = await supabase
        .from("visits")
        .select(
          `
          id,
          time_slot,
          status,
          address,
          patient:patient_id(name, phone),
          executive:executive_id(name),
          executive_id
          `
        )
        .eq("visit_date", selectedDate)
        .or(`executive_id.eq.${selectedExecutive},executive_id.is.null`);

      if (error) throw error;

      // console.log("Visits fetched:", data);

      setVisits(data || []);
    } catch (error) {
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

  // Open visit detail modal, load address and selected tests
  const openVisit = async (visit) => {
    setActiveVisit(visit);
    setNewAddress(visit.address || "");
    try {
      const { data, error } = await supabase
        .from("visit_details")
        .select("test_id")
        .eq("visit_id", visit.id);

      if (error) throw error;

      setSelectedTests(new Set(data.map((d) => d.test_id)));
    } catch (error) {
      setSelectedTests(new Set());
    }
  };

  const closeVisit = () => {
    setActiveVisit(null);
    setSelectedTests(new Set());
    setNewAddress("");
  };

  // Assign visit to selected executive (with "assigned" status)
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
        title: "Visit assigned successfully",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await fetchVisits();
    } catch (error) {
      toast({
        title: "Failed to assign visit",
        description: error.message || "Please try again",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Update visit status for active visit
  const updateStatus = async (newStatus) => {
    if (!activeVisit) return;
    try {
      const { error } = await supabase
        .from("visits")
        .update({ status: newStatus })
        .eq("id", activeVisit.id);

      if (error) throw error;

      toast({
        title: `Visit status updated to "${visitStatusLabels[newStatus]}"`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // refresh visits
      await fetchVisits();

      // update activeVisit with fresh data
      const { data, error: reFetchError } = await supabase
        .from("visits")
        .select(
          `
          id,
          time_slot,
          status,
          address,
          patient:patient_id(name, phone),
          executive:executive_id(name),
          executive_id
          `
        )
        .eq("id", activeVisit.id)
        .single();

      if (!reFetchError) setActiveVisit(data);
    } catch (error) {
      toast({
        title: "Failed to update status",
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
      const { error } = await supabase
        .from("visits")
        .update({ address: newAddress })
        .eq("id", activeVisit.id);
      if (error) throw error;

      toast({
        title: "Address updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await fetchVisits();

      setActiveVisit((prev) => ({ ...prev, address: newAddress }));
    } catch (error) {
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
      // Delete existing test selections first
      const { error: deleteErr } = await supabase
        .from("visit_details")
        .delete()
        .eq("visit_id", activeVisit.id);
      if (deleteErr) throw deleteErr;

      // Insert current selections
      const inserts = Array.from(selectedTests).map((test_id) => ({
        visit_id: activeVisit.id,
        test_id,
      }));

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase
          .from("visit_details")
          .insert(inserts);
        if (insertErr) throw insertErr;
      }

      toast({
        title: "Tests updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Failed to update tests",
        description: error.message || "Please try again",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Quick date selectors
  const quickSelect = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDate(d));
  };

  // Styling rows via status color
  const getStatusStyle = (status) => {
    const color = STATUS_COLORS[status] || "gray";
    return {
      bg: `${color}.100`,
      borderLeft: "4px solid",
      borderColor: `${color}.400`,
    };
  };

  // Filtering visits
  const assignedVisits = visits.filter(
    (v) => v.executive_id === selectedExecutive
  );
  const unassignedVisits = visits.filter(
    (v) => !v.executive_id || v.executive_id === ""
  );

  return (
    <Box p={6} maxW="6xl" mx="auto">
      <Heading as="h1" size="xl" mb={6} textAlign="center">
        Welcome, HV Executive
      </Heading>

      <Flex direction={{ base: "column", sm: "row" }} gap={4} mb={6} justify="center" align="center">
        <Select
          maxW="280px"
          value={selectedExecutive ?? ""}
          onChange={(e) => setSelectedExecutive(e.target.value)}
          isDisabled={loadingExecutives}
          placeholder={loadingExecutives ? "Loading executives..." : "Select Executive"}
          aria-label="Select Executive"
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
          aria-label="Select Visit Date"
        />

        <HStack>
          <Button size="sm" onClick={() => quickSelect(-1)} aria-label="Yesterday">
            Yesterday
          </Button>
          <Button size="sm" onClick={() => quickSelect(0)} aria-label="Today">
            Today
          </Button>
          <Button size="sm" onClick={() => quickSelect(1)} aria-label="Tomorrow">
            Tomorrow
          </Button>
          <Button size="sm" onClick={fetchVisits} aria-label="Refresh visits" leftIcon={<FiRefreshCw />}>
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
        <Spinner size="xl" display="block" mx="auto" />
      ) : (
        <>
          {/* Assigned Visits */}
          <Box mb={10}>
            <Heading as="h2" size="lg" mb={3}>
              Assigned Visits ({assignedVisits.length})
            </Heading>

            {assignedVisits.length === 0 ? (
              <Text textAlign="center" color="gray.600">
                No assigned visits.
              </Text>
            ) : (
              <Table variant="simple" size="sm" borderWidth="1px" borderRadius="md" overflowX="auto">
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
                  {assignedVisits.map((visit) => (
                    <Tr
                      key={visit.id}
                      {...getStatusStyle(visit.status)}
                      cursor="pointer"
                      onClick={() => openVisit(visit)}
                    >
                      <Td>{visit.patient?.name || "Unknown"}</Td>
                      <Td>
                        {visit.patient?.phone ? (
                          <Link
                            href={`tel:${visit.patient.phone}`}
                            color="blue.600"
                            onClick={(e) => e.stopPropagation()}
                            textDecoration="underline"
                            aria-label={`Call ${visit.patient.name}`}
                            isExternal
                          >
                            {visit.patient.phone}
                          </Link>
                        ) : (
                          "Unknown"
                        )}
                      </Td>
                      <Td>{visit.time_slot}</Td>
                      <Td isTruncated maxWidth="300px">{visit.address}</Td>
                      <Td textTransform="capitalize">{visitStatusLabels[visit.status] || visit.status}</Td>
                      <Td>
                        <Stack direction="row" spacing={1} flexWrap="wrap" userSelect="none">
                          {/* The row click handles opening modal; no buttons here */}
                          <Text fontSize="sm" color="gray.600" userSelect="none">
                            Tap to manage
                          </Text>
                        </Stack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>

          {/* Unassigned Visits */}
          <Box>
            <Heading as="h2" size="lg" mb={3}>
              Unassigned Visits ({unassignedVisits.length})
            </Heading>

            {unassignedVisits.length === 0 ? (
              <Text textAlign="center" color="gray.600">
                No unassigned visits.
              </Text>
            ) : (
              <Stack spacing={5}>
                {unassignedVisits.map((visit) => (
                  <Box
                    key={visit.id}
                    bg="white"
                    rounded="md"
                    p={4}
                    shadow="md"
                    borderLeft="4px solid"
                    borderColor="gray.500"
                    textAlign="left"
                    maxWidth="6xl"
                  >
                    <Text fontWeight="bold" fontSize="lg" noOfLines={1}>
                      {visit.patient?.name || "Unknown Patient"}
                    </Text>
                    <Text fontSize="sm" color="gray.600" mb={1}>
                      {visit.time_slot}
                    </Text>
                    <Text fontSize="sm" isTruncated maxWidth="600px" mb={1} title={visit.address}>
                      {visit.address}
                    </Text>
                    <Text fontSize="xs" fontStyle="italic" color="gray.700" mb={2}>
                      Status: Unassigned
                    </Text>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={() => assignVisit(visit.id)}
                      aria-label={`Assign visit to you for ${visit.patient?.name}`}
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
        <Modal size="lg" isOpen={true} onClose={closeVisit} scrollBehavior="inside" isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              Visit Details - {activeVisit.patient?.name || "Unknown"}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack align="stretch" spacing={4}>
                {/* Patient phone click */}
                <Box>
                  <Text fontWeight="bold" mb={1}>Phone</Text>
                  {activeVisit.patient?.phone ? (
                    <Link href={`tel:${activeVisit.patient.phone}`} color="blue.600" isExternal>
                      {activeVisit.patient.phone}
                    </Link>
                  ) : <Text>Unknown</Text>}
                </Box>

                {/* Navigate Button */}
                <Button
                  as="a"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeVisit.address || "")}`}
                  leftIcon={<MdOutlineLocationOn />}
                  colorScheme="teal"
                  variant="outline"
                  w="full"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Navigate to Address
                </Button>

                {/* Address update with PlacesAutocomplete */}
                <Box>
                  <Text fontWeight="bold" mb={1}>Update Address</Text>
                  <PlacesAutocomplete
                    value={newAddress}
                    onChange={setNewAddress}
                    onSelect={setNewAddress}
                    searchOptions={{}} // add restrictions as needed
                  >
                    {({ getInputProps, suggestions, getSuggestionItemProps, loading }) => (
                      <Box position="relative">
                        <Input {...getInputProps({ placeholder: "Search address" })} />
                        {(loading || suggestions.length > 0) && (
                          <Box
                            pos="absolute"
                            zIndex={999}
                            bg="white"
                            width="100%"
                            maxHeight="200px"
                            overflowY="auto"
                            border="1px solid"
                            borderColor="gray.200"
                            shadow="md"
                          >
                            {loading && <Text p={2}>Loading...</Text>}
                            {suggestions.map((s) => {
                              const style = {
                                backgroundColor: s.active ? "#ebf8ff" : "white",
                                padding: "8px 12px",
                                cursor: "pointer",
                              };
                              return (
                                <Box key={s.placeId} {...getSuggestionItemProps(s, { style })}>
                                  {s.description}
                                </Box>
                              );
                            })}
                          </Box>
                        )}
                      </Box>
                    )}
                  </PlacesAutocomplete>
                  <Button mt={2} colorScheme="brand" size="sm" onClick={saveAddress}>
                    Save Address
                  </Button>
                </Box>

                {/* Status step control */}
                <Box>
                  <Text fontWeight="bold" mb={2}>Update Status</Text>
                  <Stack direction="row" spacing={2} wrap="wrap">
                    {visitStatusOrder.map((status) => {
                      const isActive = activeVisit.status === status;
                      const isFuture =
                        visitStatusOrder.indexOf(status) > visitStatusOrder.indexOf(activeVisit.status);
                      return (
                        <Button
                          key={status}
                          colorScheme={isActive ? "blue" : isFuture ? "gray" : "green"}
                          variant={isActive ? "solid" : "outline"}
                          isDisabled={isFuture}
                          onClick={() => {
                            if (!isActive) updateStatus(status);
                          }}
                        >
                          {visitStatusLabels[status] || status}
                        </Button>
                      );
                    })}
                  </Stack>
                </Box>

                {/* Tests selector */}
                <Box>
                  <Text fontWeight="bold" mb={2}>Manage Tests</Text>
                  <TestPackageSelector
                    initialSelectedTests={selectedTests}
                    onChange={setSelectedTests}
                    onSelectionChange={setSelectedTests}
                  />
                  <Button mt={2} colorScheme="brand" onClick={saveTests}>
                    Save Tests
                  </Button>
                </Box>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button onClick={closeVisit}>Close</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Box>
  );
}
