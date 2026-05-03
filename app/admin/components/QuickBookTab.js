"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Divider,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  Wrap,
  WrapItem
} from "@chakra-ui/react";
import { FiNavigation } from "react-icons/fi";
import { FiHome } from "react-icons/fi";
import { FiMapPin } from "react-icons/fi";
import { FiEye } from "react-icons/fi";
import { FiShare2 } from "react-icons/fi";
import { FiCalendar } from "react-icons/fi";
import { FiLink2 } from "react-icons/fi";
import { FiEdit3 } from "react-icons/fi";
import { HiOutlineOfficeBuilding } from "react-icons/hi";
import PatientsTab from "@/app/components/PatientsTab";

const REJECTION_REASONS = [
  { code: "too_far", label: "Too far" },
  { code: "unserviceable_area", label: "Unserviceable area" },
  { code: "patient_not_looking", label: "Patient was not looking for a visit" },
  { code: "patient_visited", label: "Patient already visited" },
  { code: "other", label: "Other" }
];

const FOLLOWUP_STATUS_OPTIONS = [
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_PATIENT", label: "Waiting Patient" },
  { value: "CONNECTED", label: "Connected" },
  { value: "ATTEMPTED", label: "Attempted" },
  { value: "CLOSED", label: "Closed" },
  { value: "OTHER", label: "Other" }
];

const FOLLOWUP_OUTCOME_OPTIONS = [
  { value: "CONFIRMED_CENTER_VISIT", label: "Confirmed Center Visit" },
  { value: "CALL_BACK_REQUESTED", label: "Call Back Requested" },
  { value: "NO_ANSWER", label: "No Answer" },
  { value: "DECLINED", label: "Declined" },
  { value: "INVALID_NUMBER", label: "Invalid Number" },
  { value: "DUPLICATE_REQUEST", label: "Duplicate Request" },
  { value: "CLOSED_NO_ACTION", label: "Closed - No Action" },
  { value: "OTHER", label: "Other" }
];

const FOLLOWUP_CHANNEL_OPTIONS = [
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "MANUAL", label: "Manual" },
  { value: "OTHER", label: "Other" }
];

function isPending(booking) {
  const status = String(booking?.status || "").trim().toLowerCase();
  return status === "" || status === "pending";
}

function isInProgress(booking) {
  const status = String(booking?.status || "").trim().toLowerCase();
  return status === "in_progress";
}

function formatDateShort(value) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "-";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function extractAreaFromTextLocation(locationText) {
  const raw = String(locationText || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const q = url.searchParams.get("query") || url.searchParams.get("q") || "";
      const normalized = decodeURIComponent(String(q || "")).replace(/\+/g, " ").trim();
      if (normalized && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(normalized)) {
        return normalized;
      }
    } catch {
      return "";
    }
  }

  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(raw)) return "";
  return raw;
}

function getAreaLabel(qb) {
  return (
    String(qb?.area || "").trim() ||
    String(qb?.location_name || "").trim() ||
    String(qb?.location_address || "").trim() ||
    extractAreaFromTextLocation(qb?.location_text) ||
    ((qb?.location_lat && qb?.location_lng) ? "Pin shared" : "Location pending")
  );
}

function getQuickbookNavUrl(qb) {
  if (qb?.location_lat && qb?.location_lng) {
    return `https://www.google.com/maps/search/?api=1&query=${qb.location_lat},${qb.location_lng}`;
  }

  if (qb?.location_text && /^https?:\/\//i.test(qb.location_text)) {
    return qb.location_text;
  }

  const query = qb?.location_text || qb?.location_address || qb?.area || "";
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getBookingTypeMeta(qb) {
  const isHomeVisit = qb?.home_visit_required !== false;
  return {
    isHomeVisit,
    label: isHomeVisit ? "Home Collection" : "Center Visit"
  };
}

function getRequestItemsFromPayload(qb) {
  const items = Array.isArray(qb?.request_payload_json?.items) ? qb.request_payload_json.items : [];
  return items
    .map((item) => {
      const type = String(item?.type || "").trim().toLowerCase();
      const name = String(item?.name || "").trim();
      if (!name) return null;
      const prefix = type === "package" ? "[Package]" : type === "test" ? "[Test]" : "[Item]";
      return `${prefix} ${name}`;
    })
    .filter(Boolean);
}

function getRequestDisplayText(qb, { multiline = false, fallbackDash = false } = {}) {
  const requestItems = getRequestItemsFromPayload(qb);
  if (requestItems.length > 0) {
    const countLabel = `${requestItems.length} item${requestItems.length > 1 ? "s" : ""}`;
    if (multiline) {
      return `Cart request (${countLabel})\n${requestItems.join("\n")}`;
    }
    return `Cart request (${countLabel}) ${requestItems.join(" | ")}`;
  }

  const fallback = String(qb?.package_name || "").trim();
  if (fallback) return fallback;
  return fallbackDash ? "-" : "No package/tests provided";
}

function buildBookingFollowupShareText(qb) {
  const lines = [
    `Booking: ${qb?.patient_name || "-"}`,
    `Phone: ${qb?.phone || "-"}`,
    `Date: ${formatDateShort(qb?.date)}`,
    `Slot: ${qb?.time_slot?.slot_name || "Slot pending"}`,
    `Status: ${String(qb?.followup_status || "-").toUpperCase()}`,
    `Outcome: ${qb?.followup_outcome ? String(qb.followup_outcome).replaceAll("_", " ") : "-"}`,
    `Channel: ${qb?.followup_channel ? String(qb.followup_channel).toUpperCase() : "-"}`,
    `Next follow-up: ${qb?.next_followup_at ? new Date(qb.next_followup_at).toLocaleString("en-IN") : "-"}`,
    `Patient said: ${qb?.patient_response || "-"}`,
    `Agent note: ${qb?.last_followup_note || "-"}`
  ];
  return lines.join("\n");
}

export default function QuickBookTab({
  quickbookings = [],
  onRefresh,
  onAcceptVisitComplete,
  themeMode = "light",
  isLoading = false,
  isLoadingMore = false,
  hasMoreHistory = false,
  onLoadMoreHistory
}) {
  const [processingQuickBook, setProcessingQuickBook] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [visitLists, setVisitLists] = useState({});
  const [editing, setEditing] = useState({});
  const [linkingVisitId, setLinkingVisitId] = useState(null);
  const [processedVisibleCount, setProcessedVisibleCount] = useState(30);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [rejectCode, setRejectCode] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectSaving, setIsRejectSaving] = useState(false);
  const [detailsBooking, setDetailsBooking] = useState(null);
  const [followupBooking, setFollowupBooking] = useState(null);
  const [followupStatus, setFollowupStatus] = useState("IN_PROGRESS");
  const [followupOutcome, setFollowupOutcome] = useState("");
  const [followupChannel, setFollowupChannel] = useState("CALL");
  const [followupPatientResponse, setFollowupPatientResponse] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [followupNextAt, setFollowupNextAt] = useState("");
  const [isFollowupSaving, setIsFollowupSaving] = useState(false);

  const isDark = themeMode === "dark";

  const pendingQuickBooks = useMemo(
    () => {
      return [...quickbookings.filter(isPending)].sort((a, b) => {
        const aGroup = a?.home_visit_required === false ? 1 : 0;
        const bGroup = b?.home_visit_required === false ? 1 : 0;
        if (aGroup !== bGroup) return aGroup - bGroup;

        const aTime = new Date(a?.created_at || 0).getTime();
        const bTime = new Date(b?.created_at || 0).getTime();
        return bTime - aTime;
      });
    },
    [quickbookings]
  );
  const inProgressQuickBooks = useMemo(
    () => quickbookings.filter(isInProgress),
    [quickbookings]
  );
  const nonPendingQuickBooks = useMemo(
    () => quickbookings.filter((qb) => !isPending(qb) && !isInProgress(qb)),
    [quickbookings]
  );

  const statusSummary = useMemo(() => {
    const summary = {
      unprocessed: 0,
      in_progress: 0,
      booked: 0,
      rejected: 0,
      closed: 0,
      other: 0,
      total: quickbookings.length,
    };
    for (const qb of quickbookings) {
      const s = String(qb?.status || "").trim().toLowerCase();
      if (!s || s === "pending") summary.unprocessed += 1;
      else if (s === "in_progress") summary.in_progress += 1;
      else if (s === "booked") summary.booked += 1;
      else if (s === "rejected") summary.rejected += 1;
      else if (s === "closed" || s === "resolved") summary.closed += 1;
      else summary.other += 1;
    }
    return summary;
  }, [quickbookings]);

  const visibleProcessed = nonPendingQuickBooks.slice(0, processedVisibleCount);
  const hasMoreProcessedLoaded = nonPendingQuickBooks.length > processedVisibleCount;

  const fetchVisitsForDate = async (date) => {
    if (!date || visitLists[date]) return;
    try {
      const res = await fetch(`/api/visits?visit_date=${date}`);
      if (!res.ok) throw new Error("Failed to fetch visits");
      const data = await res.json();
      setVisitLists((prev) => ({ ...prev, [date]: data }));
    } catch (error) {
      console.error("Error fetching visits for date", date, error);
    }
  };

  const updateBooking = async (id, payload) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/quickbook/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update booking request");
      }
      onRefresh && onRefresh();
      return true;
    } catch (err) {
      alert(err?.message || "Failed to update booking request");
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const openRejectModal = (qb) => {
    setRejectingBooking(qb);
    setRejectCode("");
    setRejectReason("");
  };

  const closeRejectModal = () => {
    if (isRejectSaving) return;
    setRejectingBooking(null);
    setRejectCode("");
    setRejectReason("");
  };

  const submitReject = async () => {
    if (!rejectingBooking?.id || !rejectCode) return;
    const selectedReason = REJECTION_REASONS.find((item) => item.code === rejectCode);
    const reasonText =
      rejectCode === "other"
        ? String(rejectReason || "").trim()
        : String(selectedReason?.label || "").trim();
    if (!reasonText) {
      alert("Reason details are required when selecting Other.");
      return;
    }

    setIsRejectSaving(true);
    try {
      const ok = await updateBooking(rejectingBooking.id, {
        status: "rejected",
        rejection_code: rejectCode,
        rejection_reason: reasonText,
        rejected_at: new Date().toISOString()
      });
      if (ok) {
        closeRejectModal();
      }
    } finally {
      setIsRejectSaving(false);
    }
  };

  const openFollowupModal = (qb) => {
    setFollowupBooking(qb);
    setFollowupStatus(String(qb?.followup_status || "IN_PROGRESS").toUpperCase());
    setFollowupOutcome(String(qb?.followup_outcome || "").toUpperCase());
    setFollowupChannel(String(qb?.followup_channel || "CALL").toUpperCase());
    setFollowupPatientResponse(String(qb?.patient_response || ""));
    setFollowupNote(String(qb?.last_followup_note || ""));
    setFollowupNextAt(qb?.next_followup_at ? String(qb.next_followup_at).slice(0, 16) : "");
  };

  const closeFollowupModal = () => {
    if (isFollowupSaving) return;
    setFollowupBooking(null);
    setFollowupStatus("IN_PROGRESS");
    setFollowupOutcome("");
    setFollowupChannel("CALL");
    setFollowupPatientResponse("");
    setFollowupNote("");
    setFollowupNextAt("");
  };

  const submitFollowup = async () => {
    if (!followupBooking?.id) return;
    if (!followupStatus) {
      alert("Follow-up status is required.");
      return;
    }
    if (followupStatus !== "CLOSED" && !String(followupNextAt || "").trim()) {
      alert("Tentative next follow-up date/time is required for open requests.");
      return;
    }
    if (followupOutcome === "OTHER" && !String(followupNote || "").trim()) {
      alert("Please add details when outcome is Other.");
      return;
    }

    setIsFollowupSaving(true);
    try {
      const payload = {
        followup_status: followupStatus,
        followup_outcome: followupOutcome || null,
        followup_channel: followupChannel || null,
        patient_response: String(followupPatientResponse || "").trim() || null,
        last_followup_note: String(followupNote || "").trim() || null,
        next_followup_at: followupStatus === "CLOSED" ? null : (followupNextAt ? new Date(followupNextAt).toISOString() : null),
        close_booking: followupStatus === "CLOSED"
      };

      const res = await fetch("/api/quickbook/" + followupBooking.id + "/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save follow-up");
      }

      onRefresh && onRefresh();
      closeFollowupModal();
    } catch (err) {
      alert(err?.message || "Failed to save follow-up");
    } finally {
      setIsFollowupSaving(false);
    }
  };

  const handleSaveVisitLink = async (qb) => {
    const visitId = String(editing[qb.id]?.visit_id || qb.visit_id || "").trim();
    if (!visitId) {
      alert("Select a visit first.");
      return;
    }

    await updateBooking(qb.id, {
      visit_id: visitId,
      status: "booked",
      followup_status: "CLOSED",
      followup_outcome: "OTHER",
      followup_channel: "MANUAL",
      next_followup_at: null,
      last_followup_note: `Linked to visit ${visitId} and auto-closed.`,
      rejection_code: null,
      rejection_reason: null
    });

    setEditing((prev) => {
      const copy = { ...prev };
      delete copy[qb.id];
      return copy;
    });
    setLinkingVisitId(null);
  };

  const renderRequestPayloadDetails = (payload) => {
    if (!payload || typeof payload !== "object") {
      return <Text color={isDark ? "whiteAlpha.700" : "gray.500"}>No request payload captured.</Text>;
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    const hasTotals =
      payload?.subtotal != null ||
      payload?.collection_fee != null ||
      payload?.total != null ||
      payload?.source != null;

    return (
      <VStack align="stretch" spacing={3}>
        {items.length > 0 ? (
          <Box>
            <Text fontWeight="700" mb={2}>Cart Items</Text>
            <VStack align="stretch" spacing={2}>
              {items.map((item, idx) => (
                <Box
                  key={`${item?.type || "item"}-${item?.name || idx}-${idx}`}
                  borderWidth="1px"
                  borderColor={isDark ? "whiteAlpha.300" : "gray.200"}
                  borderRadius="md"
                  p={2}
                >
                  <HStack justify="space-between" align="start">
                    <Text fontSize="sm" fontWeight="600" whiteSpace="pre-wrap" wordBreak="break-word">
                      {item?.name || "Unnamed item"}
                    </Text>
                    <Badge colorScheme={(item?.type || "").toLowerCase() === "package" ? "purple" : "blue"}>
                      {String(item?.type || "item")}
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"} mt={1}>
                    Price: {item?.price != null ? item.price : "-"}
                  </Text>
                </Box>
              ))}
            </VStack>
          </Box>
        ) : (
          <Text color={isDark ? "whiteAlpha.700" : "gray.500"}>No cart items in payload.</Text>
        )}

        {hasTotals && (
          <Box>
            <Divider mb={2} />
            <Text fontWeight="700" mb={2}>Totals</Text>
            <VStack align="stretch" spacing={1}>
              <Text fontSize="sm">Subtotal: {payload?.subtotal ?? "-"}</Text>
              <Text fontSize="sm">Collection fee: {payload?.collection_fee ?? "-"}</Text>
              <Text fontSize="sm" fontWeight="700">Total: {payload?.total ?? "-"}</Text>
              <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                Source: {payload?.source || "-"}
              </Text>
            </VStack>
          </Box>
        )}
      </VStack>
    );
  };

  const renderBookingTypeChip = (qb) => {
    const type = getBookingTypeMeta(qb);
    const bg = type.isHomeVisit
      ? (isDark ? "green.900" : "green.50")
      : (isDark ? "gray.700" : "gray.100");
    const color = type.isHomeVisit
      ? (isDark ? "green.200" : "green.800")
      : (isDark ? "gray.200" : "gray.700");
    const IconComp = type.isHomeVisit ? FiHome : HiOutlineOfficeBuilding;

    return (
      <HStack
        spacing={2}
        w="fit-content"
        px={2}
        py={1}
        borderRadius="full"
        bg={bg}
        color={color}
      >
        <Box as={IconComp} fontSize="14px" />
        <Text fontSize="xs" fontWeight="700" lineHeight="1">
          {type.label}
        </Text>
      </HStack>
    );
  };

  if (processingQuickBook) {
    return (
      <PatientsTab
        quickbookContext={{ source: "quickbook", booking: processingQuickBook }}
        fetchPatients={onRefresh}
        onQuickbookCompleted={(savedVisit) => {
          setProcessingQuickBook(null);
          if (typeof onRefresh === "function") onRefresh();
          if (typeof onAcceptVisitComplete === "function") {
            onAcceptVisitComplete(savedVisit);
          }
        }}
        onPatientSelected={() => {}}
      />
    );
  }

  if (!quickbookings) return <Spinner />;
  if (isLoading) {
    return (
      <HStack spacing={3} py={6}>
        <Spinner />
        <Text>Loading booking requests...</Text>
      </HStack>
    );
  }

  return (
    <Box w="100%" overflowX="auto" py={4}>
      {pendingQuickBooks.length > 0 && (
        <Box mb={8}>
          <Text fontSize="md" mb={2} color={isDark ? "whiteAlpha.700" : "gray.600"} fontWeight="bold">
            Unprocessed Booking Requests
          </Text>
          <Box overflowX="auto">
          <Table size={{ base: "xs", md: "sm" }} minW={{ base: "860px", md: "1120px" }} bg={isDark ? "rgba(255,255,255,0.03)" : "white"} color={isDark ? "whiteAlpha.920" : "gray.800"}>
          <Thead>
            <Tr>
              <Th>Patient</Th>
              <Th>Request</Th>
              <Th>Schedule</Th>
              <Th>Area / Location</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pendingQuickBooks.map((qb) => {
              const qbDate = String(qb?.date || "").slice(0, 10);
              const visitValue = editing[qb.id]?.visit_id ?? qb.visit_id ?? "";
              const visitsForDate = visitLists[qbDate] || [];
              const isCentreVisit = qb?.home_visit_required === false;

              return (
                <Tr
                  key={qb.id}
                  verticalAlign="top"
                  cursor="pointer"
                  _hover={{ bg: isDark ? "whiteAlpha.50" : "gray.50" }}
                  onClick={() => setDetailsBooking(qb)}
                >
                  <Td minW="170px" onClick={(e) => e.stopPropagation()}>
                    <Text fontWeight="700">{qb.patient_name || "(No name)"}</Text>
                    <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>{qb.phone || "-"}</Text>
                  </Td>
                  <Td minW="240px" maxW="320px">
                    <Text fontWeight="600" whiteSpace="pre-wrap" wordBreak="break-word">
                      {getRequestDisplayText(qb)}
                    </Text>
                  </Td>
                  <Td minW="150px">
                    <Box mb={1}>{renderBookingTypeChip(qb)}</Box>
                    <Text>{formatDateShort(qbDate)}</Text>
                    <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                      {qb.time_slot?.slot_name || "Slot pending"}
                    </Text>
                    {isCentreVisit && (
                      <Text fontSize="xs" color={isDark ? "orange.200" : "orange.600"}>
                        Tentative preference
                      </Text>
                    )}
                    {(qb?.followup_status || qb?.followup_outcome) && (
                      <Text fontSize="xs" color={isDark ? "cyan.200" : "blue.600"}>
                        Follow-up: {String(qb?.followup_status || "-").toUpperCase()}{qb?.followup_outcome ? " · " + String(qb.followup_outcome).replaceAll("_", " ") : ""}
                      </Text>
                    )}
                  </Td>
                  <Td minW="220px" maxW="300px">
                    <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">{getAreaLabel(qb)}</Text>
                    {(qb?.location_lat && qb?.location_lng) && (
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.500"}>
                        {qb.location_lat}, {qb.location_lng}
                      </Text>
                    )}
                  </Td>
                  <Td minW="210px" onClick={(e) => e.stopPropagation()}>
                    <VStack align="stretch" spacing={2}>
                      <Wrap spacing={2}>
                      {qb?.home_visit_required !== false && (
                        <WrapItem>
                          <IconButton
                            size="xs"
                            colorScheme="red"
                            variant="outline"
                            icon={<FiMapPin />}
                            aria-label="Add or update location"
                            title="Add or update location"
                            onClick={async () => {
                              const current = qb.location_lat && qb.location_lng
                                ? `${qb.location_lat},${qb.location_lng}`
                                : qb.location_text || qb.location_address || "";
                              const input = window.prompt(
                                "Set location (maps link OR lat,lng OR plain address):",
                                current
                              );
                              if (input === null) return;
                              const trimmed = input.trim();
                              if (!trimmed) return;

                              const latLngMatch = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
                              const payload = latLngMatch
                                ? {
                                    location_source: "manual_admin",
                                    location_lat: Number(latLngMatch[1]),
                                    location_lng: Number(latLngMatch[2]),
                                    location_text: null
                                  }
                                : {
                                    location_source: "manual_admin",
                                    location_text: trimmed
                                  };
                              await updateBooking(qb.id, payload);
                            }}
                          />
                        </WrapItem>
                      )}
                      {qb?.home_visit_required === false && (
                        <WrapItem>
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="orange"
                            onClick={async () => {
                              const ok = window.confirm("Convert this Center Visit request to Home Visit?");
                              if (!ok) return;
                              await updateBooking(qb.id, { home_visit_required: true });
                            }}
                          >
                            Convert to Home Visit
                          </Button>
                        </WrapItem>
                      )}
                      <WrapItem>
                        <IconButton
                          size="xs"
                          variant="outline"
                          icon={<FiEye />}
                          aria-label="View booking details"
                          title="View details"
                          onClick={() => setDetailsBooking(qb)}
                        />
                      </WrapItem>
                      <WrapItem>
                        <IconButton
                          size="xs"
                          variant="outline"
                          icon={<FiLink2 />}
                          aria-label={linkingVisitId === qb.id ? "Hide attach visit" : "Attach to visit"}
                          title={linkingVisitId === qb.id ? "Hide attach visit" : "Attach to visit"}
                          isDisabled={isCentreVisit}
                          onClick={() => {
                            if (isCentreVisit) return;
                            if (qbDate) fetchVisitsForDate(qbDate);
                            setLinkingVisitId((prev) => (prev === qb.id ? null : qb.id));
                          }}
                        />
                      </WrapItem>
                      <WrapItem>
                        <IconButton
                          size="xs"
                          variant="solid"
                          colorScheme="green"
                          icon={<FiCalendar />}
                          aria-label="Create visit"
                          title="Create visit"
                          isDisabled={Boolean(qb.visit_id)}
                          onClick={() => setProcessingQuickBook(qb)}
                        />
                      </WrapItem>
                      <WrapItem>
                        <IconButton
                          size="xs"
                          variant="outline"
                          colorScheme="blue"
                          icon={<FiEdit3 />}
                          aria-label="Process request / follow-up"
                          title="Process request / follow-up"
                          onClick={() => openFollowupModal(qb)}
                        />
                      </WrapItem>
                      </Wrap>
                      {linkingVisitId === qb.id && !isCentreVisit && (
                        <HStack spacing={2} align="stretch">
                          <Select
                            size="xs"
                            value={visitValue}
                            placeholder="Select visit"
                            onChange={(e) => {
                              const next = e.target.value || "";
                              setEditing((prev) => ({
                                ...prev,
                                [qb.id]: { ...(prev[qb.id] || {}), visit_id: next }
                              }));
                            }}
                          >
                            {visitsForDate.map((v) => (
                              <option key={v.id} value={v.id}>
                                {(v.visit_code || v.id) + " - " + (v.patient?.name || "Unknown")}
                              </option>
                            ))}
                          </Select>
                          <Button
                            size="xs"
                            colorScheme="blue"
                            onClick={() => handleSaveVisitLink(qb)}
                            isLoading={savingId === qb.id}
                          >
                            Attach
                          </Button>
                        </HStack>
                      )}
                    </VStack>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
          </Table>
          </Box>
        </Box>
      )}

      {inProgressQuickBooks.length > 0 && (
        <Box mb={8}>
          <Text fontSize="md" mb={2} color={isDark ? "whiteAlpha.700" : "gray.600"} fontWeight="bold">
            In Progress Booking Requests
          </Text>
          <Box overflowX="auto">
          <Table size={{ base: "xs", md: "sm" }} minW={{ base: "840px", md: "1060px" }} bg={isDark ? "rgba(255,255,255,0.03)" : "white"} color={isDark ? "whiteAlpha.920" : "gray.800"}>
            <Thead>
              <Tr>
                <Th>Patient</Th>
                <Th>Request</Th>
                <Th>Schedule</Th>
                <Th>Area / Location</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {inProgressQuickBooks.map((qb) => {
                const qbDate = String(qb?.date || "").slice(0, 10);
                const visitValue = editing[qb.id]?.visit_id ?? qb.visit_id ?? "";
                const visitsForDate = visitLists[qbDate] || [];
                const isCentreVisit = qb?.home_visit_required === false;
                return (
                  <Tr key={`inprogress-${qb.id}`} verticalAlign="top">
                    <Td minW="170px">
                      <Text fontWeight="700">{qb.patient_name || "(No name)"}</Text>
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>{qb.phone || "-"}</Text>
                    </Td>
                    <Td minW="240px" maxW="320px">
                      <Text fontWeight="600" whiteSpace="pre-wrap" wordBreak="break-word">
                        {getRequestDisplayText(qb)}
                      </Text>
                    </Td>
                    <Td minW="150px">
                      <Box mb={1}>{renderBookingTypeChip(qb)}</Box>
                      <Text>{formatDateShort(qbDate)}</Text>
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                        {qb.time_slot?.slot_name || "Slot pending"}
                      </Text>
                      {isCentreVisit && (
                        <Text fontSize="xs" color={isDark ? "orange.200" : "orange.600"}>
                          Tentative preference
                        </Text>
                      )}
                    </Td>
                    <Td minW="220px" maxW="300px">
                      <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">{getAreaLabel(qb)}</Text>
                    </Td>
                    <Td minW="210px" onClick={(e) => e.stopPropagation()}>
                      <VStack align="stretch" spacing={2}>
                        <Wrap spacing={2}>
                        <WrapItem>
                          <IconButton
                            size="xs"
                            variant="outline"
                            icon={<FiEye />}
                            aria-label="View booking details"
                            title="View details"
                            onClick={() => setDetailsBooking(qb)}
                          />
                        </WrapItem>
                        <WrapItem>
                          <IconButton
                            size="xs"
                            variant="outline"
                            icon={<FiLink2 />}
                            aria-label={linkingVisitId === qb.id ? "Hide attach visit" : "Attach to visit"}
                            title={linkingVisitId === qb.id ? "Hide attach visit" : "Attach to visit"}
                            isDisabled={isCentreVisit}
                            onClick={() => {
                              if (isCentreVisit) return;
                              if (qbDate) fetchVisitsForDate(qbDate);
                              setLinkingVisitId((prev) => (prev === qb.id ? null : qb.id));
                            }}
                          />
                        </WrapItem>
                        <WrapItem>
                          <IconButton
                            size="xs"
                            variant="solid"
                            colorScheme="green"
                            icon={<FiCalendar />}
                            aria-label="Create visit"
                            title="Create visit"
                            isDisabled={Boolean(qb.visit_id)}
                            onClick={() => setProcessingQuickBook(qb)}
                          />
                        </WrapItem>
                        <WrapItem>
                          <IconButton
                            size="xs"
                            variant="outline"
                            colorScheme="blue"
                            icon={<FiEdit3 />}
                            aria-label="Process request / follow-up"
                            title="Process request / follow-up"
                            onClick={() => openFollowupModal(qb)}
                          />
                        </WrapItem>
                        </Wrap>
                        {linkingVisitId === qb.id && !isCentreVisit && (
                          <HStack spacing={2} align="stretch">
                            <Select
                              size="xs"
                              value={visitValue}
                              placeholder="Select visit"
                              onChange={(e) => {
                                const next = e.target.value || "";
                                setEditing((prev) => ({
                                  ...prev,
                                  [qb.id]: { ...(prev[qb.id] || {}), visit_id: next }
                                }));
                              }}
                            >
                              {visitsForDate.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {(v.visit_code || v.id) + " - " + (v.patient?.name || "Unknown")}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="xs"
                              colorScheme="blue"
                              onClick={() => handleSaveVisitLink(qb)}
                              isLoading={savingId === qb.id}
                            >
                              Attach
                            </Button>
                          </HStack>
                        )}
                      </VStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          </Box>
        </Box>
      )}

      {nonPendingQuickBooks.length > 0 && (
        <Box mt={8}>
          <Text fontSize="md" mb={2} color={isDark ? "whiteAlpha.700" : "gray.600"} fontWeight="bold">
            Processed Booking Requests
          </Text>
          <Box overflowX="auto">
          <Table size={{ base: "xs", md: "sm" }} minW={{ base: "760px", md: "980px" }} bg={isDark ? "rgba(255,255,255,0.04)" : "gray.50"} color={isDark ? "whiteAlpha.840" : "gray.700"} opacity={0.9}>
            <Thead>
              <Tr>
                <Th>Patient</Th>
                <Th>Request</Th>
                <Th>Schedule</Th>
                <Th>Outcome</Th>
                <Th>Area / Location</Th>
              </Tr>
            </Thead>
            <Tbody>
              {visibleProcessed.map((qb) => {
                const status = String(qb?.status || "").trim().toLowerCase();
                const statusLabel = status || "processed";
                const rejectionReason = String(qb?.rejection_reason || "").trim();

                return (
                  <Tr
                    key={qb.id}
                    cursor="pointer"
                    _hover={{ bg: isDark ? "whiteAlpha.50" : "gray.100" }}
                    onClick={() => setDetailsBooking(qb)}
                  >
                    <Td minW="160px">
                      <Text fontWeight="700">{qb.patient_name || "(No name)"}</Text>
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>{qb.phone || "-"}</Text>
                    </Td>
                    <Td minW="220px" maxW="320px">
                      <Text whiteSpace="pre-wrap" wordBreak="break-word">{getRequestDisplayText(qb, { fallbackDash: true })}</Text>
                    </Td>
                    <Td minW="150px">
                      <Box mb={1}>{renderBookingTypeChip(qb)}</Box>
                      <Text>{formatDateShort(qb.date)}</Text>
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                        {qb.time_slot?.slot_name || "Slot pending"}
                      </Text>
                      {qb?.home_visit_required === false && (
                        <Text fontSize="xs" color={isDark ? "orange.200" : "orange.600"}>
                          Tentative preference
                        </Text>
                      )}
                    </Td>
                    <Td minW="200px">
                      <Badge colorScheme={status === "rejected" ? "red" : "green"}>{statusLabel}</Badge>
                      {rejectionReason && (
                        <Text mt={1} fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word">
                          {rejectionReason}
                        </Text>
                      )}
                      {(qb?.followup_status || qb?.followup_outcome) && (
                        <Text mt={1} fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word">
                          Follow-up: {String(qb?.followup_status || "-").toUpperCase()}{qb?.followup_outcome ? " · " + String(qb.followup_outcome).replaceAll("_", " ") : ""}
                        </Text>
                      )}
                    </Td>
                    <Td minW="220px" maxW="300px" onClick={(e) => e.stopPropagation()}>
                      <Text whiteSpace="pre-wrap" wordBreak="break-word">{getAreaLabel(qb)}</Text>
                      <Button
                        size="xs"
                        mt={2}
                        variant="outline"
                        onClick={() => setDetailsBooking(qb)}
                      >
                        View Details
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          </Box>

          <Wrap mt={3} spacing={3}>
            {hasMoreProcessedLoaded && (
              <WrapItem>
              <Button size="sm" variant="outline" onClick={() => setProcessedVisibleCount((prev) => prev + 30)}>
                Show more loaded
              </Button>
              </WrapItem>
            )}
            <WrapItem>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onLoadMoreHistory && onLoadMoreHistory()}
              isLoading={isLoadingMore}
              isDisabled={!hasMoreHistory || isLoadingMore}
            >
              {hasMoreHistory ? "Load older processed" : "No more processed requests"}
            </Button>
            </WrapItem>
          </Wrap>
        </Box>
      )}

      {quickbookings.length === 0 && (
        <Text>No booking requests found.</Text>
      )}

      <Modal isOpen={Boolean(rejectingBooking)} onClose={closeRejectModal} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reject Booking Request</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm">
                {rejectingBooking?.patient_name || "Patient"} · {rejectingBooking?.phone || "-"}
              </Text>

              <FormControl isRequired>
                <FormLabel mb={1}>Rejection reason</FormLabel>
                <Select
                  value={rejectCode}
                  onChange={(e) => setRejectCode(e.target.value)}
                  placeholder="Select reason"
                >
                  {REJECTION_REASONS.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              {rejectCode === "other" && (
                <FormControl isRequired>
                  <FormLabel mb={1}>Reason details</FormLabel>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter rejection reason"
                  />
                </FormControl>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button mr={3} variant="ghost" onClick={closeRejectModal} isDisabled={isRejectSaving}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={submitReject}
              isLoading={isRejectSaving}
              isDisabled={!rejectCode || (rejectCode === "other" && !String(rejectReason || "").trim())}
            >
              Confirm Reject
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={Boolean(followupBooking)} onClose={closeFollowupModal} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Booking Follow-up</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm">
                {followupBooking?.patient_name || "Patient"} · {followupBooking?.phone || "-"}
              </Text>

              <FormControl isRequired>
                <FormLabel mb={1}>Follow-up status</FormLabel>
                <Select value={followupStatus} onChange={(e) => setFollowupStatus(e.target.value)}>
                  {FOLLOWUP_STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel mb={1}>Outcome / reason</FormLabel>
                <Select
                  value={followupOutcome}
                  onChange={(e) => setFollowupOutcome(e.target.value)}
                  placeholder="Select outcome"
                >
                  {FOLLOWUP_OUTCOME_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel mb={1}>Channel</FormLabel>
                <Select value={followupChannel} onChange={(e) => setFollowupChannel(e.target.value)}>
                  {FOLLOWUP_CHANNEL_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
              </FormControl>

              <FormControl isRequired={followupStatus !== "CLOSED"}>
                <FormLabel mb={1}>Tentative next follow-up</FormLabel>
                <Input
                  type="datetime-local"
                  value={followupNextAt}
                  onChange={(e) => setFollowupNextAt(e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel mb={1}>Patient said</FormLabel>
                <Input
                  value={followupPatientResponse}
                  onChange={(e) => setFollowupPatientResponse(e.target.value)}
                  placeholder="Patient response"
                />
              </FormControl>

              <FormControl isRequired={followupOutcome === "OTHER"}>
                <FormLabel mb={1}>Agent note</FormLabel>
                <Input
                  value={followupNote}
                  onChange={(e) => setFollowupNote(e.target.value)}
                  placeholder="Enter follow-up note"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              mr={3}
              variant="outline"
              onClick={() => {
                if (!followupBooking) return;
                setDetailsBooking(followupBooking);
              }}
              isDisabled={isFollowupSaving}
            >
              View Details
            </Button>
            <Button
              mr={3}
              colorScheme="red"
              variant="outline"
              onClick={() => {
                if (!followupBooking) return;
                const target = followupBooking;
                closeFollowupModal();
                openRejectModal(target);
              }}
              isDisabled={isFollowupSaving}
            >
              Reject Request
            </Button>
            <Button mr={3} variant="ghost" onClick={closeFollowupModal} isDisabled={isFollowupSaving}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={submitFollowup} isLoading={isFollowupSaving}>
              Save Follow-up
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={Boolean(detailsBooking)} onClose={() => setDetailsBooking(null)} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Booking Details</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Text fontWeight="700">
                  {detailsBooking?.patient_name || "(No name)"} · {detailsBooking?.phone || "-"}
                </Text>
                <Text fontSize="sm" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                  {getRequestDisplayText(detailsBooking, { multiline: true })}
                </Text>
                <Box mt={2}>{renderBookingTypeChip(detailsBooking)}</Box>
              </Box>

              <Box>
                <Text fontWeight="700" mb={1}>Patient Comments</Text>
                <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">
                  {String(detailsBooking?.request_payload_json?.comments || "").trim() || "-"}
                </Text>
              </Box>

              <Box>
                <Text fontWeight="700" mb={1}>Request Payload</Text>
                {renderRequestPayloadDetails(detailsBooking?.request_payload_json)}
              </Box>
              <Box>
                <Text fontWeight="700" mb={1}>Follow-up Snapshot</Text>
                <Text fontSize="sm">Booking date: {formatDateShort(detailsBooking?.date)}</Text>
                <Text fontSize="sm">Booking slot: {detailsBooking?.time_slot?.slot_name || "-"}</Text>
                <Text fontSize="sm">Status: {String(detailsBooking?.followup_status || "-").toUpperCase()}</Text>
                <Text fontSize="sm">
                  Outcome: {detailsBooking?.followup_outcome ? String(detailsBooking.followup_outcome).replaceAll("_", " ") : "-"}
                </Text>
                <Text fontSize="sm">
                  Channel: {detailsBooking?.followup_channel ? String(detailsBooking.followup_channel).toUpperCase() : "-"}
                </Text>
                <Text fontSize="sm">
                  Next follow-up: {detailsBooking?.next_followup_at ? new Date(detailsBooking.next_followup_at).toLocaleString("en-IN") : "-"}
                </Text>
                <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">
                  Patient said: {detailsBooking?.patient_response || "-"}
                </Text>
                <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">
                  Agent note: {detailsBooking?.last_followup_note || "-"}
                </Text>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              mr={3}
              variant="outline"
              leftIcon={<FiShare2 />}
              onClick={async () => {
                const text = buildBookingFollowupShareText(detailsBooking || {});
                try {
                  if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    alert("Follow-up summary copied.");
                    return;
                  }
                } catch {}
                window.prompt("Copy follow-up summary:", text);
              }}
            >
              Share
            </Button>
            <Button
              mr={3}
              variant="outline"
              colorScheme="blue"
              onClick={() => {
                if (!detailsBooking) return;
                openFollowupModal(detailsBooking);
              }}
            >
              Update Follow-up
            </Button>
            <Button
              mr={3}
              variant="outline"
              leftIcon={<FiNavigation />}
              onClick={() => {
                const url = getQuickbookNavUrl(detailsBooking);
                if (!url) {
                  alert("No location available for navigation.");
                  return;
                }
                window.open(url, "_blank");
              }}
            >
              Navigate
            </Button>
            <Button onClick={() => setDetailsBooking(null)}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
