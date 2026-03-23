// File: /app/phlebo/ActiveVisitsTab.js

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FiNavigation, FiMapPin } from "react-icons/fi";
import { FaMotorcycle } from "react-icons/fa";
import { PhoneIcon, ChatIcon } from "@chakra-ui/icons";
import { useUser } from "../context/UserContext";
import NotificationsHelper from "../../lib/notificationsHelper";

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

function parseTimeSlotStart(visit) {
  const slotName = String(visit?.time_slot?.slot_name || "");
  const match = slotName.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function visitPriorityWeight(status) {
  switch (status) {
    case "in_progress":
    case "started":
      return 5;
    case "accepted":
    case "assigned":
    case "booked":
      return 4;
    case "sample_picked":
      return 3;
    case "sample_dropped":
      return 2;
    default:
      return 1;
  }
}

function getNextActionLabel(status) {
  switch (status) {
    case "assigned":
    case "booked":
      return "Start travel";
    case "accepted":
      return "Start visit";
    case "in_progress":
    case "started":
      return "Mark sample picked";
    case "sample_picked":
      return "Mark sample dropped";
    case "sample_dropped":
      return "Mark billed";
    default:
      return "Open visit";
  }
}

function hasLocationPin(visit) {
  return (
    visit?.lat !== null &&
    typeof visit?.lat !== "undefined" &&
    visit?.lng !== null &&
    typeof visit?.lng !== "undefined"
  );
}

function getVisitGuidance(visit, isRecommended) {
  const action = getNextActionLabel(visit.status);
  if (isRecommended) return `Recommended now: ${action}`;
  if (visit.status === "sample_picked") return "Finish this pickup before the next slot";
  if (visit.status === "assigned" || visit.status === "booked") return "Upcoming assigned visit";
  return `Next step: ${action}`;
}

function parseVisitStartDateTime(visit, selectedDate) {
  const startTime = visit?.time_slot?.start_time;
  if (!selectedDate || !startTime) return null;
  const parsed = new Date(`${selectedDate}T${startTime}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function ActiveVisitsTab({ selectedDate, onSelectVisit, selectedVisit, themeMode = "light" }) {
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
  const initialAssignedLoadRef = useRef(false);
  const initialSummarySentRef = useRef(false);
  const reminderTimestampsRef = useRef({});

  // Modal state for contact options
  const [isContactModalOpen, setContactModalOpen] = useState(false);
  const [contactNumber, setContactNumber] = useState(null);

  function extractGoogleMapsUrl(text) {
    if (!text) return null;
    const regex = /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl|www\.google\.com\/maps)[^\s]*)/i;
    const match = text.match(regex);
    return match ? match[1] : null;
  }
  
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

  const fetchVisits = useCallback(async () => {
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
          time_slot (slot_name, start_time, end_time),
          address,
          status,
          executive_id,
          notes,
          prescription,
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
  }, [hvExecutiveId, selectedDate, toast]);

  useEffect(() => {
    if (!userLoading) {
      fetchVisits();
    } else {
      setVisits([]);
    }
  }, [fetchVisits, userLoading]);

  useEffect(() => {
    if (userLoading || !hvExecutiveId || !selectedDate) return;
    const interval = window.setInterval(() => {
      fetchVisits();
    }, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchVisits, hvExecutiveId, selectedDate, userLoading]);

  useEffect(() => {
    if (!hvExecutiveId) return;
    NotificationsHelper.requestPermission().catch(() => {});
  }, [hvExecutiveId]);

  const assignedVisits = visits.filter((v) => v.executive_id === hvExecutiveId);
  const unassignedVisits = visits.filter((v) => !v.executive_id);
  const recommendedVisitId = useMemo(() => {
    if (!assignedVisits.length) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const ranked = [...assignedVisits].sort((a, b) => {
      const aWeight = visitPriorityWeight(a.status);
      const bWeight = visitPriorityWeight(b.status);
      if (aWeight !== bWeight) return bWeight - aWeight;

      const aStart = parseTimeSlotStart(a);
      const bStart = parseTimeSlotStart(b);
      if (aStart === null && bStart === null) return 0;
      if (aStart === null) return 1;
      if (bStart === null) return -1;
      return Math.abs(aStart - currentMinutes) - Math.abs(bStart - currentMinutes);
    });

    return ranked[0]?.id || null;
  }, [assignedVisits]);

  useEffect(() => {
    if (!assignedVisits.length) {
      initialAssignedLoadRef.current = true;
      initialSummarySentRef.current = false;
      return;
    }

    const currentIds = new Set(assignedVisits.map((visit) => visit.id));
    if (!initialAssignedLoadRef.current) {
      initialAssignedLoadRef.current = true;
      reminderTimestampsRef.current = {};
      if (!initialSummarySentRef.current) {
        const recommendedVisit =
          assignedVisits.find((visit) => visit.id === recommendedVisitId) || assignedVisits[0];
        const summaryMessage =
          assignedVisits.length === 1
            ? `You have 1 assigned visit: ${recommendedVisit?.patient?.name || "Patient"} at ${recommendedVisit?.time_slot?.slot_name || "scheduled slot"}.`
            : `You have ${assignedVisits.length} assigned visits. Next up: ${recommendedVisit?.patient?.name || "Patient"} at ${recommendedVisit?.time_slot?.slot_name || "scheduled slot"}.`;

        NotificationsHelper.showNotification("Assigned visits ready", {
          body: summaryMessage,
        });
        toast({
          title: "Assigned visits ready",
          description: summaryMessage,
          status: "info",
          duration: 5000,
          isClosable: true,
        });
        initialSummarySentRef.current = true;
      }
      return;
    }

    assignedVisits.forEach((visit) => {
      const seenKey = `assigned:${visit.id}`;
      if (!reminderTimestampsRef.current[seenKey]) {
        NotificationsHelper.notify("visitAssigned", {
          details: `${visit.patient?.name || "Patient"} at ${visit.time_slot?.slot_name || "scheduled slot"}`,
        });
        toast({
          title: "New assigned visit",
          description: `${visit.patient?.name || "Patient"} at ${visit.time_slot?.slot_name || "scheduled slot"}`,
          status: "info",
          duration: 5000,
          isClosable: true,
        });
        reminderTimestampsRef.current[seenKey] = Date.now();
      }
    });

    Object.keys(reminderTimestampsRef.current).forEach((key) => {
      if (key.startsWith("assigned:")) {
        const visitId = key.replace("assigned:", "");
        if (!currentIds.has(visitId)) {
          delete reminderTimestampsRef.current[key];
        }
      }
    });
  }, [assignedVisits, recommendedVisitId, toast]);

  useEffect(() => {
    if (!assignedVisits.length) return;

    const remindForVisits = () => {
      const now = Date.now();
      assignedVisits.forEach((visit) => {
        const startDate = parseVisitStartDateTime(visit, selectedDate);
        if (!startDate) return;

        const minutesSinceStart = (now - startDate.getTime()) / 60000;
        let thresholdMinutes = null;
        let message = "";

        if (["booked", "assigned", "accepted"].includes(visit.status)) {
          thresholdMinutes = 10;
          message = `Visit for ${visit.patient?.name || "patient"} should be started or updated.`;
        } else if (["in_progress", "started"].includes(visit.status)) {
          thresholdMinutes = 45;
          message = `Visit for ${visit.patient?.name || "patient"} is still in progress. Please update the status.`;
        } else if (visit.status === "sample_picked") {
          thresholdMinutes = 90;
          message = `Samples for ${visit.patient?.name || "patient"} are still marked picked. Please complete the next step.`;
        }

        if (!thresholdMinutes || minutesSinceStart < thresholdMinutes) return;

        const reminderKey = `reminder:${visit.id}:${visit.status}`;
        const lastSentAt = reminderTimestampsRef.current[reminderKey] || 0;
        if (now - lastSentAt < 20 * 60 * 1000) return;

        NotificationsHelper.notify("visitReminder", { message });
        toast({
          title: "Visit reminder",
          description: message,
          status: "warning",
          duration: 5000,
          isClosable: true,
        });
        reminderTimestampsRef.current[reminderKey] = now;
      });
    };

    remindForVisits();
    const interval = window.setInterval(remindForVisits, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [assignedVisits, selectedDate]);

  const assignVisit = async (visitId) => {
    if (!hvExecutiveId) {
      toast({ title: "User not logged in as executive", status: "warning" });
      return;
    }
    try {
      let res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visitId, executive_id: hvExecutiveId, status: "assigned", updated_by: user?.id || null })
      });

      if (res.status === 409) {
        const conflictData = await res.json().catch(() => ({}));
        const conflictText = (conflictData?.conflicts || [])
          .map((c) => `${c.patient_name} (${c.address || "No area"})`)
          .join("\n");
        const confirmed = window.confirm(
          `You already have visit(s) in this timeslot.\n\n${conflictText || "Conflict found"}\n\nAssign anyway?`
        );
        if (!confirmed) return;

        res = await fetch("/api/visits", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: visitId, executive_id: hvExecutiveId, status: "assigned", force_assign: true, updated_by: user?.id || null })
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Assignment failed");
      }

      toast({ title: "Visit assigned", status: "success", duration: 3000 });
      await fetchVisits();
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
      const res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visitId, status: "started", updated_by: user?.id || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start visit");

      toast({ title: "Visit started", status: "success", duration: 3000 });
      await fetchVisits();
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
    if (visit?.lat && visit?.lng) {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${visit.lat},${visit.lng}`;
    }
    // Find default patient address
    const defaultAddress = visit.patient?.addresses?.find(addr => addr.is_default);

    if (!navUrl && defaultAddress?.lat && defaultAddress?.lng) {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${defaultAddress.lat},${defaultAddress.lng}`;
    } else if (!navUrl && visit.address) {
      navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`;
    } else if (!navUrl && visit.patient?.addresses?.length > 0) {
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
          {assignedVisits.length > 0 && (
            (() => {
              const recommendedVisit = assignedVisits.find((visit) => visit.id === recommendedVisitId);
              return (
                <Box
                  mb={6}
                  p={4}
                  borderRadius="lg"
                  bg={themeMode === "dark" ? "teal.900" : "teal.50"}
                  borderWidth="1px"
                  borderColor={themeMode === "dark" ? "teal.600" : "teal.200"}
                  cursor={recommendedVisit ? "pointer" : "default"}
                  onClick={recommendedVisit ? () => handleRowClick(recommendedVisit) : undefined}
                  _hover={recommendedVisit ? { transform: "translateY(-1px)", boxShadow: "md" } : undefined}
                  transition="all 0.16s ease"
                >
                  <Heading size="sm" mb={2}>Recommended Visit</Heading>
                  {!recommendedVisit ? (
                    <Text>No recommended visit right now.</Text>
                  ) : (
                    <Stack spacing={1}>
                      <Text fontWeight="700">{recommendedVisit.patient?.name ?? "Unknown"}</Text>
                      <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.700"}>
                        {recommendedVisit.time_slot?.slot_name ?? "-"} • {recommendedVisit.address || "No area"}
                      </Text>
                      <Text fontSize="sm" color={themeMode === "dark" ? "teal.100" : "teal.700"}>
                        {getVisitGuidance(recommendedVisit, true)}
                      </Text>
                    </Stack>
                  )}
                </Box>
              );
            })()
          )}

          {/* Assigned Visits */}
          <VStack spacing={4} mb={8} align="stretch">
            <Heading size="md">Assigned Visits ({assignedVisits.length})</Heading>
            {assignedVisits.length === 0 ? (
              <Text>No assigned visits found.</Text>
            ) : (
              assignedVisits.map((visit) => {
                const isSelected = selectedVisitId === visit.id;
                const isRecommended = recommendedVisitId === visit.id;
                return (
                  <Box
                    key={visit.id}
                    p={4}
                    borderWidth="1px"
                    borderColor={
                      isRecommended
                        ? "orange.300"
                        : isSelected
                        ? "teal.400"
                        : themeMode === "dark"
                        ? "whiteAlpha.200"
                        : "gray.200"
                    }
                    borderRadius="md"
                    bg={
                      isRecommended
                        ? (themeMode === "dark" ? "orange.900" : "orange.50")
                        : isSelected
                        ? (themeMode === "dark" ? "teal.900" : "teal.50")
                        : (themeMode === "dark" ? "gray.700" : "white")
                    }
                    cursor="pointer"
                    onClick={() => handleRowClick(visit)}
                    boxShadow={isSelected ? "md" : "sm"}
                    _hover={{ boxShadow: "md" }}
                  >
                    <HStack justify="space-between" align="center" mb={2}>
                      <Text fontWeight="bold">{visit.patient?.name ?? "Unknown"}</Text>
                      <HStack spacing={2}>
                        {isRecommended && <Badge colorScheme="orange">Now</Badge>}
                        <Badge colorScheme="teal" textTransform="capitalize">
                          {visit.status.replace(/\_/g, " ")}
                        </Badge>
                      </HStack>
                    </HStack>

                    {/* Address row */}
                    <HStack justify="space-between" align="center" mt={1}>
                      <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.700"}>
                        {visit.visit_date}
                      </Text>
                      <HStack spacing={1} align="center">
                        {hasLocationPin(visit) && (
                          <Badge colorScheme="teal" variant="subtle" borderRadius="full" title="Location pin available">
                            <HStack spacing={1}>
                              <FiMapPin />
                              <Text as="span" fontSize="xs">Pin</Text>
                            </HStack>
                          </Badge>
                        )}
                        <Text fontSize="sm" fontWeight="semibold" color={themeMode === "dark" ? "blue.200" : "blue.700"}>
                          {visit.address ? visit.address.toUpperCase() : "NO AREA"}
                        </Text>
                      </HStack>
                    </HStack>

                    {/* Timeslot */}
                    <Text fontWeight="bold" mt={1}>
                      {visit.time_slot?.slot_name ?? "-"}
                    </Text>
                    <Text mt={2} fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.600"}>
                      {getVisitGuidance(visit, isRecommended)}
                    </Text>

                    {/* Buttons: Navigate, Start, Call */}
                    <HStack mt={3} spacing={2} flexWrap="wrap">
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
                        {getNextActionLabel(visit.status)}
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
                    bg={themeMode === "dark" ? "gray.700" : getStatusStyle(visit.status).bg}
                    borderColor={themeMode === "dark" ? "whiteAlpha.200" : getStatusStyle(visit.status).borderColor}
                  >
                    <Text fontWeight="bold">{visit.patient?.name ?? "Unknown"}</Text>
                    {/* Address */}
                    <HStack spacing={2} align="center">
                      {hasLocationPin(visit) && (
                        <Badge colorScheme="teal" variant="subtle" borderRadius="full" title="Location pin available">
                          Pin
                        </Badge>
                      )}
                      <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                        {visit.address || "No Area"}
                      </Text>
                    </HStack>
                    <Text>{visit.visit_date}</Text>
                    <Text>{visit.time_slot?.slot_name ?? "-"}</Text>
                    <HStack mt={2}>
                      <IconButton
                        aria-label="Navigate to address"
                        icon={<FiNavigation />}
                        size="sm"
                        colorScheme="blue"
                        onClick={() => navigateToVisit(visit)}
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
