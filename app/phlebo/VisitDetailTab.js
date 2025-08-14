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

export default function VisitDetailTab({ visit, onBack }) {
  const toast = useToast();
  const { user, isLoading: userLoading } = useUser();

  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [visitStatus, setVisitStatus] = useState(visit.status);
  const [statusOptions, setStatusOptions] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState(visit.status);
  const [showTestSelection, setShowTestSelection] = useState(false);

  // Load statuses from API
  useEffect(() => {
    async function fetchStatuses() {
      try {
        const res = await fetch("/api/visits/status");
        const data = await res.json();
        const sorted = Array.isArray(data)
          ? data.sort((a, b) => a.order - b.order)
          : [];
        setStatusOptions(sorted);
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
      const { error } = await supabase
        .from("visits")
        .update({ status: newStatus })
        .eq("id", visit.id);
      if (error) throw error;

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
  const currentIndex = statusOptions.findIndex(
    (s) => s.code === visitStatus
  );
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

  const mapsUrl =
    visit.lat && visit.lng
      ? `https://www.google.com/maps/search/?api=1&query=${visit.lat},${visit.lng}`
      : null;

  if (userLoading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

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
        <Text mb={4} fontSize="sm" bg="gray.50" p={2} borderRadius="md">
          {visit.notes}
        </Text>
      )}

      {/* Current status */}
      <Text mb={4}>
        Status:{" "}
        <strong>
          {statusOptions.find((s) => s.code === visitStatus)?.label ||
            visitStatus}
        </strong>
      </Text>

      {/* Main nav buttons */}
      <Stack direction="row" spacing={4} mb={6} flexWrap="wrap">
        {prevStatus && (
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
            colorScheme={nextStatus.order <= 0 ? "red" : "teal"}
            onClick={() => updateStatus(nextStatus.code)}
            isLoading={updatingStatus}
          >
            Mark as {nextStatus.label} →
          </Button>
        )}
      </Stack>

      {/* Status override dropdown */}
      <HStack spacing={2} mb={6} align="center">
        <Select
          size="sm"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          <optgroup label="Normal Flow">
            {normalOptions.map((s) => (
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
        <HStack spacing={4} mb={6}>
          <Link href={mapsUrl} isExternal>
            <Button colorScheme="blue" leftIcon={<ExternalLinkIcon />}>
              Navigate to Address
            </Button>
          </Link>
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
