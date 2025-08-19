// File: /app/phlebo/ActiveVisitsTab.js

"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Stack,
  Spinner,
  Button,
  VStack,
  HStack,
  Badge,
  IconButton,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack as ModalVStack,
} from "@chakra-ui/react";
import { supabase } from "../../lib/supabaseClient";
import { FiNavigation } from "react-icons/fi";
import { FaMotorcycle } from "react-icons/fa";
import { PhoneIcon, ChatIcon } from "@chakra-ui/icons";
import { useUser } from "../context/UserContext";

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

export default function ActiveVisitsTab({ selectedDate, onSelectVisit, selectedVisit }) {
  const toast = useToast();
  const { user, isLoading: userLoading } = useUser();

  const hvExecutiveId =
    !userLoading &&
    user &&
    user.userType === "executive" &&
    (user.executiveType || "").toLowerCase() === "phlebo"
      ? user.id
      : null;

  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  // Modal state for contact options
  const [isContactModalOpen, setContactModalOpen] = useState(false);
  const [contactNumber, setContactNumber] = useState(null);

  const openContactModal = (phone) => {
    if (!phone) {
      toast({
        title: "No phone number available",
        status: "warning",
        duration: 3000,
      });
      return;
    }
    setContactNumber(phone);
    setContactModalOpen(true);
  };
  const closeContactModal = () => setContactModalOpen(false);

  useEffect(() => {
    setSelectedVisitId(selectedVisit?.id ?? null);
  }, [selectedVisit]);

  useEffect(() => {
    async function fetchVisits() {
      if (!hvExecutiveId || !selectedDate) {
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
            patient:patient_id(
              id,
              name,
              phone,
              addresses:patient_addresses(
                id,
                label,
                pincode,
                address_line,
                lat,
                lng,
                is_default,
                city,
                state,
                country,
                area
              )
            ),
            executive:executive_id(name)
          `)
          .eq("visit_date", selectedDate)
          .or(`executive_id.eq.${hvExecutiveId},executive_id.is.null`);

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

    if (!userLoading) {
      fetchVisits();
    } else {
      setVisits([]);
    }
  }, [hvExecutiveId, selectedDate, toast, userLoading]);

  const assignedVisits = visits.filter((v) => v.executive_id === hvExecutiveId);
  const unassignedVisits = visits.filter((v) => !v.executive_id);

  const assignVisit = async (visitId) => {
    if (!hvExecutiveId) {
      toast({ title: "User not logged in as executive", status: "warning" });
      return;
    }
    try {
      const { error } = await supabase
        .from("visits")
        .update({ executive_id: hvExecutiveId, status: "assigned" })
        .eq("id", visitId);
      if (error) throw error;

      toast({ title: "Visit assigned", status: "success", duration: 3000 });
      // Refresh visits
      const { data, error: fetchError } = await supabase
        .from("visits")
        .select(`
          id,
          patient_id,
          visit_date,
          time_slot (slot_name),
          address,
          status,
          executive_id,
          patient:patient_id(
            id,
            name,
            phone,
            addresses:patient_addresses(
              id,
              label,
              pincode,
              address_line,
              lat,
              lng,
              is_default,
              city,
              state,
              country,
              area
            )
          ),
          executive:executive_id(name)
        `)
        .eq("visit_date", selectedDate)
        .or(`executive_id.eq.${hvExecutiveId},executive_id.is.null`);

      if (fetchError) throw fetchError;
      setVisits(data || []);
    } catch (e) {
      toast({
        title: "Failed to assign visit",
        description: e.message ?? "Unknown error",
        status: "error",
      });
    }
  };

  const startVisit = async (visitId) => {
    try {
      const { error } = await supabase
        .from("visits")
        .update({ status: "started" })
        .eq("id", visitId);
      if (error) throw error;

      toast({ title: "Visit started", status: "success", duration: 3000 });

      // Refresh
      const { data, error: fetchError } = await supabase
        .from("visits")
        .select(`
          id,
          patient_id,
          visit_date,
          time_slot (slot_name),
          address,
          status,
          executive_id,
          patient:patient_id(
            id,
            name,
            phone,
            addresses:patient_addresses(
              id,
              label,
              pincode,
              address_line,
              lat,
              lng,
              is_default,
              city,
              state,
              country,
              area
            )
          ),
          executive:executive_id(name)
        `)
        .eq("visit_date", selectedDate)
        .or(`executive_id.eq.${hvExecutiveId},executive_id.is.null`);

      if (fetchError) throw fetchError;
      setVisits(data || []);
    } catch (e) {
      toast({
        title: "Failed to start visit",
        description: e.message ?? "Unknown error",
        status: "error",
      });
    }
  };

  const navigateToVisit = (visit) => {
    let navUrl = null;
    // Find default patient address
    const defaultAddress = visit.patient?.addresses?.find(addr => addr.is_default);

    if (defaultAddress?.lat && defaultAddress?.lng) {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${defaultAddress.lat},${defaultAddress.lng}`;
    } else if (visit.address) {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`;
    } else if (visit.patient?.addresses?.length > 0) {
      // fallback to area of first address
      navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.patient.addresses[0].area || "")}`;
    }

    if (!navUrl) {
      toast({ title: "No valid address to navigate", status: "warning" });
      return;
    }
    window.open(navUrl, "_blank");
  };

  const handleRowClick = (visit) => {
    if (selectedVisitId === visit.id) {
      onSelectVisit && onSelectVisit(visit);
    } else {
      setSelectedVisitId(visit.id);
      onSelectVisit && onSelectVisit(visit);
    }
  };

  return (
    <Box>
      {loadingVisits ? (
        <Spinner size="xl" />
      ) : (
        <>
          {/* Assigned Visits */}
          <VStack spacing={4} mb={8} align="stretch">
            <Heading size="md">Assigned Visits ({assignedVisits.length})</Heading>
            {assignedVisits.length === 0 ? (
              <Text>No assigned visits found.</Text>
            ) : (
              assignedVisits.map((visit) => {
                const isSelected = selectedVisitId === visit.id;
                return (
                  <Box
                    key={visit.id}
                    p={4}
                    borderWidth="1px"
                    borderColor={isSelected ? "teal.400" : "gray.200"}
                    borderRadius="md"
                    bg={isSelected ? "teal.50" : "white"}
                    cursor="pointer"
                    onClick={() => handleRowClick(visit)}
                    boxShadow={isSelected ? "md" : "sm"}
                    _hover={{ boxShadow: "md" }}
                  >
                    <HStack justify="space-between" align="center" mb={2}>
                      <Text fontWeight="bold">{visit.patient?.name ?? "Unknown"}</Text>
                      <Badge colorScheme="teal" textTransform="capitalize">
                        {visit.status.replace(/\_/g, " ")}
                      </Badge>
                    </HStack>

                    {/* Address row */}
                    <HStack justify="space-between" align="center" mt={1}>
                      <Text fontSize="sm" color="gray.700">
                        {visit.visit_date}
                      </Text>
                      <Text fontSize="sm" fontWeight="semibold" color="blue.700">
                        {visit.address ? visit.address.toUpperCase() : "NO AREA"}
                      </Text>
                    </HStack>

                    {/* Timeslot */}
                    <Text fontWeight="bold" mt={1}>
                      {visit.time_slot?.slot_name ?? "-"}
                    </Text>

                    {/* Buttons: Navigate, Start, Call */}
                    <HStack mt={3} spacing={2}>
                      <Button
                        size="sm"
                        leftIcon={<FiNavigation />}
                        colorScheme="blue"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToVisit(visit);
                        }}
                      >
                        Navigate
                      </Button>
                      <Button
                        size="sm"
                        leftIcon={<FaMotorcycle />}
                        colorScheme="teal"
                        onClick={(e) => {
                          e.stopPropagation();
                          startVisit(visit.id);
                        }}
                      >
                        Start
                      </Button>
                      {/* Call button with modal trigger */}
                      <IconButton
                        size="sm"
                        aria-label="Contact patient"
                        icon={<PhoneIcon />}
                        colorScheme="green"
                        onClick={(e) => {
                          e.stopPropagation();
                          openContactModal(visit.patient?.phone || "");
                        }}
                      />
                    </HStack>
                  </Box>
                );
              })
            )}
          </VStack>

          {/* Unassigned Visits */}
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
                    {/* Address */}
                    <Text fontSize="sm" color="gray.600">
                      {visit.address || "No Area"}
                    </Text>
                    <Text>{visit.visit_date}</Text>
                    <Text>{visit.time_slot?.slot_name ?? "-"}</Text>
                    <HStack mt={2}>
                      <IconButton
                        aria-label="Navigate to address"
                        icon={<FiNavigation />}
                        size="sm"
                        colorScheme="blue"
                        onClick={() => navigateToVisit(visit.address)}
                        mr={2}
                      />
                      <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={() => assignVisit(visit.id)}
                      >
                        Assign to Me
                      </Button>
                      <Button
                        size="sm"
                        ml={2}
                        onClick={() => handleRowClick(visit)}
                        colorScheme="gray"
                      >
                        Select
                      </Button>
                    </HStack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          {/* Contact Modal */}
          <Modal isOpen={isContactModalOpen} onClose={closeContactModal} isCentered>
            <ModalOverlay />
            <ModalContent>
              <ModalHeader>Contact Options</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <ModalVStack spacing={3}>
                  <Button
                    leftIcon={<PhoneIcon />}
                    colorScheme="green"
                    width="100%"
                    onClick={() => {
                      if (contactNumber) {
                        window.open(`tel:${contactNumber}`, "_self");
                        closeContactModal();
                      }
                    }}
                  >
                    Call Patient
                  </Button>
                  <Button
                    leftIcon={<PhoneIcon />}
                    colorScheme="green"
                    width="100%"
                    onClick={() => {
                      if (contactNumber) {
                        // WhatsApp Video call fallback to chat (WhatsApp doesn’t support direct call URI)
                        window.open(`https://wa.me/91${contactNumber.replace(/\D/g, "")}`, "_blank");
                        closeContactModal();
                      }
                    }}
                  >
                    WhatsApp Call (Chat)
                  </Button>
                  <Button
                    leftIcon={<ChatIcon />}
                    colorScheme="green"
                    width="100%"
                    onClick={() => {
                      if (contactNumber) {
                        // WhatsApp chat message
                        window.open(`https://wa.me/91${contactNumber.replace(/\D/g, "")}`, "_blank");
                        closeContactModal();
                      }
                    }}
                  >
                    WhatsApp Message
                  </Button>
                </ModalVStack>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      )}
    </Box>
  );
}
