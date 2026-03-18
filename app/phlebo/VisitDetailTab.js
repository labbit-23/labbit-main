// File: /app/phlebo/VisitDetailTab.js
"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Heading,
  Text,
  Button,
  Stack,
  useToast,
  Spinner,
  FormControl,
  FormLabel,
  Link,
  HStack,
  Flex,
  Select,
  IconButton,
  Collapse,
  Switch
} from "@chakra-ui/react";
import { ExternalLinkIcon, CheckIcon } from "@chakra-ui/icons";
import { supabase } from "../../lib/supabaseClient";
import TestPackageSelector from "../../components/TestPackageSelector";
import { useUser } from "../context/UserContext";

const FALLBACK_STATUS_OPTIONS = [
  { code: "disabled", label: "Cancelled", order: -3 },
  { code: "postponed", label: "Postponed", order: -2 },
  { code: "rejected", label: "Rejected", order: -1 },
  { code: "pending", label: "Pending", order: 0 },
  { code: "unassigned", label: "Unassigned", order: 1 },
  { code: "booked", label: "Booked", order: 2 },
  { code: "accepted", label: "Accepted", order: 3 },
  { code: "in_progress", label: "In Progress", order: 4 },
  { code: "sample_picked", label: "Sample Picked", order: 5 },
  { code: "sample_dropped", label: "Sample Dropped", order: 6 },
  { code: "completed", label: "Billed", order: 7 },
];

function extractGoogleMapsUrl(text) {
  if (!text) return null;
  const match = String(text).match(
    /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl|www\.google\.com\/maps)[^\s]*)/i
  );
  return match ? match[1] : null;
}

export default function VisitDetailTab({ visit, onBack, themeMode = "light" }) {
  const toast = useToast();
  const { user, isLoading: userLoading } = useUser();
  const isPhleboUser =
    !!user &&
    user.userType === "executive" &&
    String(user.executiveType || "").toLowerCase() === "phlebo";

  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [visitStatus, setVisitStatus] = useState(visit.status);
  const [statusOptions, setStatusOptions] = useState(FALLBACK_STATUS_OPTIONS);
  const [selectedStatus, setSelectedStatus] = useState(visit.status);
  const [showTestSelection, setShowTestSelection] = useState(false);

  // Prescription preview
  const [prescriptionUrl, setPrescriptionUrl] = useState(null);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [savingGateLocation, setSavingGateLocation] = useState(false);

  // Load statuses from API
  useEffect(() => {
    async function fetchStatuses() {
      try {
        const res = await fetch("/api/visits/status");
        const data = await res.json();
        const sorted = Array.isArray(data)
          ? data.sort((a, b) => a.order - b.order)
          : [];
        if (sorted.length > 0) {
          setStatusOptions(sorted);
        }
      } catch (err) {
        toast({
          title: "Error loading statuses",
          description: err.message,
          status: "error",
        });
      }
    }
    fetchStatuses();
  }, [toast]);

  // Prescription fetch effect
  useEffect(() => {
    if (!visit?.prescription) {
      setPrescriptionUrl(null);
      return;
    }

    if (/^https?:\/\//i.test(visit.prescription)) {
      setPrescriptionUrl(visit.prescription);
      return;
    }

    setLoadingPrescription(true);
    const bucketName = "uploads";
    const filePath = visit.prescription.replace(/^uploads\//, "");

    supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 60 * 60)
      .then(({ data }) => {
        setPrescriptionUrl(data?.signedUrl || null);
        setLoadingPrescription(false);
      })
      .catch(() => {
        setPrescriptionUrl(null);
        setLoadingPrescription(false);
      });
  }, [visit]);

  // Update local visit status and selections when visit changes
  useEffect(() => {
    setVisitStatus(visit.status);
    setSelectedStatus(visit.status);
    fetchVisitSelections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  // Load selected tests/packages
  const fetchVisitSelections = async () => {
    setLoadingDetails(true);
    try {
      const { data, error } = await supabase
        .from("visit_details")
        .select("test_id, package_id")
        .eq("visit_id", visit.id);
      if (error) throw error;

      const selections = new Set();
      (data || []).forEach((item) => {
        if (item.test_id) selections.add(item.test_id);
        if (item.package_id) selections.add(item.package_id);
      });
      setSelectedTestIds(selections);
    } catch (err) {
      toast({
        title: "Error loading visit tests/packages",
        description: err.message,
        status: "error",
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  // Save selected tests/packages
  const saveSelectedTests = async () => {
    if (userLoading) {
      toast({ title: "User data is loading, please wait", status: "warning" });
      return;
    }
    if (!user || !user.id) {
      toast({ title: "User not authenticated", status: "error" });
      return;
    }

    setLoadingDetails(true);
    try {
      const { error: delError } = await supabase
        .from("visit_details")
        .delete()
        .eq("visit_id", visit.id);
      if (delError) throw delError;

      const inserts = [];
      selectedTestIds.forEach((id) => {
        inserts.push({
          visit_id: visit.id,
          test_id: id,
          package_id: null,
        });
      });

      if (inserts.length) {
        const { error: insError } = await supabase
          .from("visit_details")
          .insert(inserts);
        if (insError) throw insError;
      }

      toast({
        title: "Tests/packages saved successfully",
        status: "success",
      });
    } catch (err) {
      toast({
        title: "Failed to save tests/packages",
        description: err.message,
        status: "error",
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  // Update visit status
  const updateStatus = async (newStatus) => {
    if (userLoading) {
      toast({
        title: "User data is loading, please wait",
        status: "warning",
      });
      return;
    }
    if (!user || !user.id) {
      toast({ title: "User not authenticated", status: "error" });
      return;
    }

    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: visit.id,
          status: newStatus,
          updated_by: user?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      setVisitStatus(newStatus);
      setSelectedStatus(newStatus);
      toast({
        title: `Visit marked as ${
          statusOptions.find((s) => s.code === newStatus)?.label || newStatus
        }`,
        status: "success",
      });
    } catch (err) {
      toast({
        title: "Failed to update status",
        description: err.message,
        status: "error",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Next/Prev status
  const currentIndex = statusOptions.findIndex((s) => s.code === visitStatus);
  const nextStatus =
    currentIndex >= 0 && currentIndex < statusOptions.length - 1
      ? statusOptions[currentIndex + 1]
      : null;
  const prevStatus = currentIndex > 0
    ? statusOptions[currentIndex - 1]
    : null;

  // Grouped status options by order
  const normalOptions = statusOptions.filter(s => s.order > 0);
  const abnormalOptions = statusOptions.filter(s => s.order <= 0);
  const allowedNormalOptions = isPhleboUser
    ? normalOptions.filter((option) => option.order >= (statusOptions[currentIndex]?.order ?? option.order))
    : normalOptions;
  const nextActionLabel =
    nextStatus?.code === "accepted"
      ? "Mark as Accepted"
      : nextStatus?.code === "in_progress"
      ? "Start Visit"
      : nextStatus?.code === "sample_picked"
      ? "Mark Sample Picked"
      : nextStatus?.code === "sample_dropped"
      ? "Mark Sample Dropped"
      : nextStatus?.code === "completed"
      ? "Mark Billed"
      : nextStatus
      ? `Mark as ${nextStatus.label}`
      : null;

  const embeddedMapsUrl = extractGoogleMapsUrl(visit.address);
  const mapsUrl = visit.lat && visit.lng
    ? `https://www.google.com/maps/search/?api=1&query=${visit.lat},${visit.lng}`
    : (embeddedMapsUrl ||
      (visit.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`
        : null));

  if (userLoading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  const saveGateLocation = async () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation is not available on this device", status: "warning" });
      return;
    }

    setSavingGateLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch("/api/visits", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: visit.id,
              patient_id: visit.patient_id,
              lat: latitude,
              lng: longitude,
              location_text: visit.address || "Gate location captured by phlebo",
              address: visit.address || "",
              updated_by: user?.id || null,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || "Failed to save gate location");
          }
          toast({
            title: "Gate location saved",
            description: "This visit now has the latest gate coordinates.",
            status: "success",
          });
        } catch (err) {
          toast({
            title: "Failed to save gate location",
            description: err.message,
            status: "error",
          });
        } finally {
          setSavingGateLocation(false);
        }
      },
      (err) => {
        setSavingGateLocation(false);
        toast({
          title: "Unable to read current location",
          description: err.message,
          status: "warning",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <Box>
      {onBack && (
        <Button mb={4} colorScheme="gray" onClick={onBack}>
          ← Back to Visits
        </Button>
      )}

      <Heading size="lg" mb={6}>
        Visit Details for {visit.patient?.name || "Unknown"}
      </Heading>

      {/* Show visit.notes directly if exists */}
      {visit.notes && (
        <Text mb={4} fontSize="sm" bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"} p={2} borderRadius="md">
          {visit.notes}
        </Text>
      )}

      {/* Prescription Preview Section */}
      {loadingPrescription ? (
        <Spinner size="sm" color="teal" mb={4} />
      ) : prescriptionUrl ? (
        <Box mb={4} p={3} bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"} borderRadius="md">
          <Heading size="sm" mb={2}>Prescription</Heading>
          {/\.(pdf)$/i.test(prescriptionUrl)
            ? (
              <Link href={prescriptionUrl} isExternal>
                <Button leftIcon={<ExternalLinkIcon />} colorScheme="blue" variant="outline">
                  View Prescription (PDF)
                </Button>
              </Link>
            )
            : (
              <Link href={prescriptionUrl} isExternal>
                <Box
                  cursor="pointer"
                  borderRadius="8px"
                  overflow="hidden"
                  border="1px solid #CBD5E0"
                  boxShadow="sm"
                  maxW="170px"
                  maxH="170px"
                  _hover={{ boxShadow: "md", borderColor: "teal.400" }}
                  transition="all 0.15s"
                >
                  <img
                    src={prescriptionUrl}
                    alt="Prescription"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      background: "#f9fafb"
                    }}
                  />
                </Box>
                <Text mt={2} fontSize="xs" color="gray.500">
                  Tap image to open &amp; zoom
                </Text>
              </Link>
            )
          }
        </Box>
      ) : visit.prescription && typeof visit.prescription === "string" ? (
        <Box mb={4} p={3} bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"} borderRadius="md" whiteSpace="pre-wrap">
          <Heading size="sm" mb={2}>Prescription</Heading>
          <Text>{visit.prescription}</Text>
        </Box>
      ) : null}

      {/* Current status */}
      <Box
        mb={5}
        p={4}
        borderRadius="lg"
        bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"}
        borderWidth="1px"
        borderColor={themeMode === "dark" ? "whiteAlpha.200" : "gray.200"}
      >
        <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"} mb={1}>
          Current Visit Status
        </Text>
        <Text fontSize="xl" fontWeight="bold">
          {statusOptions.find((s) => s.code === visitStatus)?.label || visitStatus}
        </Text>
      </Box>

      {/* Main nav buttons */}
      <Stack direction={{ base: "column", md: "row" }} spacing={4} mb={6}>
        {!isPhleboUser && prevStatus && (
          <Button
            size="sm"
            colorScheme={prevStatus.order <= 0 ? "red" : "gray"}
            onClick={() => updateStatus(prevStatus.code)}
            isLoading={updatingStatus}
          >
            ← Back to {prevStatus.label}
          </Button>
        )}
        {nextStatus && (
          <Button
            size="md"
            colorScheme={nextStatus.order <= 0 ? "red" : "teal"}
            onClick={() => updateStatus(nextStatus.code)}
            isLoading={updatingStatus}
          >
            {nextActionLabel} →
          </Button>
        )}
        <Button
          variant="outline"
          colorScheme="orange"
          onClick={saveGateLocation}
          isLoading={savingGateLocation}
        >
          Save Gate Location
        </Button>
      </Stack>

      {/* Status override dropdown */}
      <HStack spacing={2} mb={6} align="center">
        <Select
          size="sm"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          <optgroup label="Normal Flow">
            {allowedNormalOptions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </optgroup>
          {abnormalOptions.length > 0 && (
            <optgroup label="Abnormal Flow">
              {abnormalOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <IconButton
          aria-label="Update Status"
          icon={<CheckIcon />}
          size="sm"
          colorScheme="teal"
          onClick={() => updateStatus(selectedStatus)}
          isLoading={updatingStatus}
          isDisabled={selectedStatus === visitStatus}
        />
      </HStack>

      {/* Navigation */}
      {mapsUrl && (
        <HStack spacing={4} mb={6} flexWrap="wrap">
          <Link href={mapsUrl} isExternal>
            <Button colorScheme="blue" leftIcon={<ExternalLinkIcon />}>
              Navigate to Address
            </Button>
          </Link>
          {embeddedMapsUrl && (
            <Link href={embeddedMapsUrl} isExternal>
              <Button variant="outline" leftIcon={<ExternalLinkIcon />}>
                Open Shared Map Link
              </Button>
            </Link>
          )}
          <Text>{visit.address ?? "No Address Available"}</Text>
        </HStack>
      )}

      {/* Toggle for tests/packages */}
      <FormControl display="flex" alignItems="center" mb={4}>
        <FormLabel htmlFor="toggle-tests" mb="0">
          Show Test / Package Selection
        </FormLabel>
        <Switch
          id="toggle-tests"
          isChecked={showTestSelection}
          onChange={(e) => setShowTestSelection(e.target.checked)}
        />
      </FormControl>

      <Collapse in={showTestSelection}>
        <FormControl mb={6}>
          <FormLabel>Select Tests / Packages Performed</FormLabel>
          {loadingDetails ? (
            <Spinner />
          ) : (
            <TestPackageSelector
              initialSelectedTests={selectedTestIds}
              onSelectionChange={setSelectedTestIds}
              loading={loadingDetails}
            />
          )}
          <Button
            mt={4}
            colorScheme="blue"
            onClick={saveSelectedTests}
            isLoading={loadingDetails}
          >
            Save Selected Tests/Packages
          </Button>
        </FormControl>
      </Collapse>
    </Box>
  );
}
