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
  Badge,
  Flex,
  Stack,
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
  Textarea,
  Checkbox,
  useDisclosure,
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
  const toast = useToast();

  // State for executives and visits
  const [executives, setExecutives] = useState([]);
  const [selectedExecutive, setSelectedExecutive] = useState(null);
  const [visits, setVisits] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));

  // Loading and error state
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Address edit modal state
  const [addressEditVisitId, setAddressEditVisitId] = useState(null);
  const [newAddress, setNewAddress] = useState("");
  const {
    isOpen: isAddressModalOpen,
    onOpen: onAddressModalOpen,
    onClose: onAddressModalClose,
  } = useDisclosure();

  // Tests modal state
  const [testsCatalog, setTestsCatalog] = useState([]);
  const [testsModalVisitId, setTestsModalVisitId] = useState(null);
  const [selectedTests, setSelectedTests] = useState(new Set());
  const {
    isOpen: isTestsModalOpen,
    onOpen: onTestsModalOpen,
    onClose: onTestsModalClose,
  } = useDisclosure();

  // Fetch executives filtered by status active or available
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
      console.error("Error fetching visits:", error);
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

  // Fetch tests catalog for visit_details modal
  const fetchTestsCatalog = async () => {
    try {
      const { data, error } = await supabase.from("tests").select("id, name");
      if (error) throw error;
      setTestsCatalog(data || []);
    } catch (e) {
      console.error("Error loading tests catalog:", e);
    }
  };

  React.useEffect(() => {
    fetchExecutives();
    fetchTestsCatalog();
  }, []);

  React.useEffect(() => {
    fetchVisits();
  }, [selectedExecutive, selectedDate]);

  // Update visit status
  const updateVisitStatus = async (visitId, status) => {
    try {
      const { error } = await supabase.from("visits").update({ status }).eq("id", visitId);
      if (error) throw error;

      toast({
        title: `Visit status updated to ${status.replace(/_/g, " ")}`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await fetchVisits();
    } catch (error) {
      console.error("Error updating visit status:", error);
      setErrorMsg("Failed to update visit status.");
      toast({
        title: "Error updating visit status",
        description: error.message || "Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Assign visit to selected executive with status 'assigned'
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

  // Address update modal handlers
  const openAddressModal = (visit) => {
    setAddressEditVisitId(visit.id);
    setNewAddress(visit.address ?? "");
    onAddressModalOpen();
  };

  const handleUpdateAddress = async () => {
    if (!addressEditVisitId) return;
    try {
      const { error } = await supabase
        .from("visits")
        .update({ address: newAddress })
        .eq("id", addressEditVisitId);
      if (error) throw error;

      toast({
        title: "Address updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      onAddressModalClose();
      setAddressEditVisitId(null);
      setNewAddress("");
      await fetchVisits();
    } catch (error) {
      console.error("Error updating address:", error);
      toast({
        title: "Failed to update address",
        description: error.message || "Try again later",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Visit tests modal handlers
  const openTestsModal = async (visit) => {
    setTestsModalVisitId(visit.id);
    try {
      const { data, error } = await supabase
        .from("visit_details")
        .select("test_id")
        .eq("visit_id", visit.id);
      if (error) throw error;

      const selectedSet = new Set(data.map((d) => d.test_id));
      setSelectedTests(selectedSet);
    } catch (error) {
      console.error("Error fetching visit details:", error);
      setSelectedTests(new Set());
    }
    onTestsModalOpen();
  };

  const toggleTestSelection = (testId) => {
    setSelectedTests((current) => {
      const newSet = new Set(current);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  const saveVisitTests = async () => {
    if (!testsModalVisitId) return;
    try {
      // Delete existing visit_details for this visit
      const { error: deleteError } = await supabase
        .from("visit_details")
        .delete()
        .eq("visit_id", testsModalVisitId);
      if (deleteError) throw deleteError;

      // Insert selected tests
      const inserts = Array.from(selectedTests).map((test_id) => ({
        visit_id: testsModalVisitId,
        test_id,
      }));

      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from("visit_details").insert(inserts);
        if (insertError) throw insertError;
      }

      toast({
        title: "Tests updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      onTestsModalClose();
    } catch (error) {
      console.error("Error saving visit tests:", error);
      toast({
        title: "Failed to update tests",
        description: error.message || "Try again later",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Utility: styles based on status
  const getStatusStyle = (status) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES.default;
    return {
      bg: style.bg,
      borderLeft: "4px solid",
      borderColor: style.borderColor,
      animation: style.pulse ? "pulse 2s infinite" : undefined,
    };
  };

  // Filter visits for display
  const assignedVisits = visits.filter(
    (v) => v.executive_id && v.executive_id === selectedExecutive
  );
  const unassignedVisits = visits.filter(
    (v) => v.executive_id == null || v.executive_id === ""
  );

  // Quick date selection helper
  const quickSelect = (daysOffset) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    setSelectedDate(formatDate(date));
  };

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
              <Table
                variant="simple"
                size="sm"
                borderWidth="1px"
                borderColor="gray.300"
                borderRadius="md"
              >
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
                      <Tr key={visit.id} {...styleProps} title={`Visit Status: ${visit.status}`}>
                        <Td>{visit.patient?.name || "Unknown Patient"}</Td>
                        <Td>
                          {visit.patient?.phone ? (
                            <Link
                              href={`tel:${visit.patient.phone}`}
                              color="blue.600"
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
                            {(visit.status === "pending" || visit.status === "assigned") && (
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
                                <Link
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    visit.address ?? ""
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  fontSize="sm"
                                  px={2}
                                  py={1}
                                  bg="gray.200"
                                  rounded="md"
                                  _hover={{ bg: "gray.300" }}
                                  aria-label={`Navigate to ${visit.address || "address"}`}
                                >
                                  Navigate
                                </Link>
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

                            {/* Edit Address */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAddressModal(visit)}
                              aria-label={`Edit address for ${visit.patient?.name}`}
                            >
                              Edit Address
                            </Button>

                            {/* Edit Tests */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openTestsModal(visit)}
                              aria-label={`Edit tests for ${visit.patient?.name}`}
                            >
                              Edit Tests
                            </Button>
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

      {/* Address Edit Modal */}
      <Modal isOpen={isAddressModalOpen} onClose={onAddressModalClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Visit Address</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Textarea
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Enter new address"
              rows={4}
            />
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="brand" mr={3} onClick={handleUpdateAddress}>
              Save
            </Button>
            <Button variant="ghost" onClick={onAddressModalClose}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Visit Tests Modal */}
      <Modal isOpen={isTestsModalOpen} onClose={onTestsModalClose} size="md" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Tests Ordered</ModalHeader>
          <ModalCloseButton />
          <ModalBody maxH="60vh" overflowY="auto">
            <Stack spacing={3}>
              {testsCatalog.length === 0 && <Text>No tests available</Text>}
              {testsCatalog.map(({ id, name }) => (
                <Checkbox
                  key={id}
                  isChecked={selectedTests.has(id)}
                  onChange={() => toggleTestSelection(id)}
                >
                  {name}
                </Checkbox>
              ))}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="brand" mr={3} onClick={saveVisitTests}>
              Save
            </Button>
            <Button variant="ghost" onClick={onTestsModalClose}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default PhleboPage;
