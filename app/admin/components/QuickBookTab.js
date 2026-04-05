"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
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
import { EditIcon, LinkIcon } from "@chakra-ui/icons";
import { FiNavigation } from "react-icons/fi";
import PatientsTab from "@/app/components/PatientsTab";

const REJECTION_REASONS = [
  { code: "too_far", label: "Too far" },
  { code: "unserviceable_area", label: "Unserviceable area" },
  { code: "patient_not_looking", label: "Patient was not looking for a visit" },
  { code: "patient_visited", label: "Patient already visited" },
  { code: "other", label: "Other" }
];

function isPending(booking) {
  const status = String(booking?.status || "").trim().toLowerCase();
  return status === "" || status === "pending";
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

  const isDark = themeMode === "dark";

  const pendingQuickBooks = useMemo(
    () => quickbookings.filter(isPending),
    [quickbookings]
  );
  const nonPendingQuickBooks = useMemo(
    () => quickbookings.filter((qb) => !isPending(qb)),
    [quickbookings]
  );

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

  const handleSaveVisitLink = async (qb) => {
    const visitId = String(editing[qb.id]?.visit_id || qb.visit_id || "").trim();
    if (!visitId) {
      alert("Select a visit first.");
      return;
    }

    await updateBooking(qb.id, {
      visit_id: visitId,
      status: "booked",
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
        <Table size="sm" bg={isDark ? "rgba(255,255,255,0.03)" : "white"} color={isDark ? "whiteAlpha.920" : "gray.800"} mb={8}>
          <Thead>
            <Tr>
              <Th>Patient</Th>
              <Th>Request</Th>
              <Th>Schedule</Th>
              <Th>Area / Location</Th>
              <Th>Link</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pendingQuickBooks.map((qb) => {
              const qbDate = String(qb?.date || "").slice(0, 10);
              const visitValue = editing[qb.id]?.visit_id ?? qb.visit_id ?? "";
              const visitsForDate = visitLists[qbDate] || [];

              return (
                <Tr key={qb.id} verticalAlign="top">
                  <Td minW="170px">
                    <Text fontWeight="700">{qb.patient_name || "(No name)"}</Text>
                    <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>{qb.phone || "-"}</Text>
                  </Td>
                  <Td minW="240px" maxW="320px">
                    <Text fontWeight="600" whiteSpace="pre-wrap" wordBreak="break-word">
                      {qb.package_name || "No package/tests provided"}
                    </Text>
                  </Td>
                  <Td minW="150px">
                    <Text>{formatDateShort(qbDate)}</Text>
                    <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                      {qb.time_slot?.slot_name || "Slot pending"}
                    </Text>
                  </Td>
                  <Td minW="220px" maxW="300px">
                    <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">{getAreaLabel(qb)}</Text>
                    {(qb?.location_lat && qb?.location_lng) && (
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.500"}>
                        {qb.location_lat}, {qb.location_lng}
                      </Text>
                    )}
                  </Td>
                  <Td minW="170px">
                    {visitValue && linkingVisitId !== qb.id ? (
                      <Badge colorScheme="green" fontSize="10px">Linked</Badge>
                    ) : (
                      <VStack align="stretch" spacing={2}>
                        <Button
                          size="xs"
                          leftIcon={<LinkIcon />}
                          onClick={() => {
                            if (qbDate) fetchVisitsForDate(qbDate);
                            setLinkingVisitId((prev) => (prev === qb.id ? null : qb.id));
                          }}
                          px={2}
                          minW="88px"
                        >
                          {linkingVisitId === qb.id ? "Hide" : "Link"}
                        </Button>
                        {linkingVisitId === qb.id && (
                          <>
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
                              px={2}
                            >
                              Save
                            </Button>
                          </>
                        )}
                      </VStack>
                    )}
                  </Td>
                  <Td minW="210px">
                    <Wrap spacing={2}>
                      <WrapItem>
                        <IconButton
                          size="xs"
                          icon={<FiNavigation />}
                          aria-label="Navigate"
                          title="Navigate"
                          onClick={() => {
                            const url = getQuickbookNavUrl(qb);
                            if (!url) {
                              alert("No location available for navigation.");
                              return;
                            }
                            window.open(url, "_blank");
                          }}
                        />
                      </WrapItem>
                      <WrapItem>
                        <Button
                          size="xs"
                          leftIcon={<EditIcon />}
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
                        >
                          Edit
                        </Button>
                      </WrapItem>
                      <WrapItem>
                        <Button
                          size="xs"
                          colorScheme="green"
                          isDisabled={Boolean(qb.visit_id)}
                          onClick={() => setProcessingQuickBook(qb)}
                        >
                          Accept Visit
                        </Button>
                      </WrapItem>
                      <WrapItem>
                        <Button
                          size="xs"
                          colorScheme="red"
                          variant="outline"
                          onClick={() => openRejectModal(qb)}
                        >
                          Reject
                        </Button>
                      </WrapItem>
                    </Wrap>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {nonPendingQuickBooks.length > 0 && (
        <Box mt={8}>
          <Text fontSize="md" mb={2} color={isDark ? "whiteAlpha.700" : "gray.600"} fontWeight="bold">
            Processed Booking Requests
          </Text>
          <Table size="sm" bg={isDark ? "rgba(255,255,255,0.04)" : "gray.50"} color={isDark ? "whiteAlpha.840" : "gray.700"} opacity={0.9}>
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
                  <Tr key={qb.id}>
                    <Td minW="160px">
                      <Text fontWeight="700">{qb.patient_name || "(No name)"}</Text>
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>{qb.phone || "-"}</Text>
                    </Td>
                    <Td minW="220px" maxW="320px">
                      <Text whiteSpace="pre-wrap" wordBreak="break-word">{qb.package_name || "-"}</Text>
                    </Td>
                    <Td minW="150px">
                      <Text>{formatDateShort(qb.date)}</Text>
                      <Text fontSize="xs" color={isDark ? "whiteAlpha.700" : "gray.600"}>
                        {qb.time_slot?.slot_name || "Slot pending"}
                      </Text>
                    </Td>
                    <Td minW="200px">
                      <Badge colorScheme={status === "rejected" ? "red" : "green"}>{statusLabel}</Badge>
                      {rejectionReason && (
                        <Text mt={1} fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word">
                          {rejectionReason}
                        </Text>
                      )}
                    </Td>
                    <Td minW="220px" maxW="300px">
                      <Text whiteSpace="pre-wrap" wordBreak="break-word">{getAreaLabel(qb)}</Text>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>

          <HStack mt={3} spacing={3}>
            {hasMoreProcessedLoaded && (
              <Button size="sm" variant="outline" onClick={() => setProcessedVisibleCount((prev) => prev + 30)}>
                Show more loaded
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onLoadMoreHistory && onLoadMoreHistory()}
              isLoading={isLoadingMore}
              isDisabled={!hasMoreHistory || isLoadingMore}
            >
              {hasMoreHistory ? "Load older processed" : "No more processed requests"}
            </Button>
          </HStack>
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
    </Box>
  );
}
