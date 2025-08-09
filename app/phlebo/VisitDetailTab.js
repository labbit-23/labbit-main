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
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { supabase } from "../../lib/supabaseClient";
import TestPackageSelector from "../../components/TestPackageSelector";

import { useUser } from "../context/UserContext"; // Import global user context

const VISIT_STATUSES = [
  "pending",
  "in_progress",
  "sample_picked",
  "sample_dropped",
  "billed",
  "completed",
];

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  sample_picked: "Sample Picked",
  sample_dropped: "Sample Dropped",
  billed: "Billed",
  completed: "Completed",
};

export default function VisitDetailTab({ visit, onBack }) {
  const toast = useToast();
  const { user, isLoading: userLoading } = useUser();

  // Loading and selection states
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [visitStatus, setVisitStatus] = useState(visit.status);

  // Update local visit status and selections when visit prop changes
  useEffect(() => {
    setVisitStatus(visit.status);
    fetchVisitSelections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  // Load selected tests/packages for this visit from DB
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
      toast({
        title: "User data is loading, please wait",
        status: "warning",
      });
      return;
    }
    if (!user || !user.id) {
      toast({
        title: "User not authenticated",
        status: "error",
      });
      return;
    }

    setLoadingDetails(true);
    try {
      // Optionally add authorization validation here against user.id

      // Clear existing selections
      const { error: delError } = await supabase
        .from("visit_details")
        .delete()
        .eq("visit_id", visit.id);
      if (delError) throw delError;

      // Prepare insert data (adjust distinguishing logic if needed)
      const inserts = [];
      selectedTestIds.forEach((id) => {
        inserts.push({
          visit_id: visit.id,
          test_id: id, // Adjust if package_id needed separately
          package_id: null,
        });
      });

      if (inserts.length) {
        const { error: insError } = await supabase.from("visit_details").insert(inserts);
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

  // Update visit status in DB
  const updateStatus = async (newStatus) => {
    if (userLoading) {
      toast({
        title: "User data is loading, please wait",
        status: "warning",
      });
      return;
    }
    if (!user || !user.id) {
      toast({
        title: "User not authenticated",
        status: "error",
      });
      return;
    }

    setUpdatingStatus(true);
    try {
      // Optionally add authorization validation here against user.id

      const { error } = await supabase
        .from("visits")
        .update({ status: newStatus })
        .eq("id", visit.id);
      if (error) throw error;

      setVisitStatus(newStatus);
      toast({
        title: `Visit marked as ${STATUS_LABELS[newStatus]}`,
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

  // Google Maps URL for visit address
  const mapsUrl =
    visit.lat && visit.lng
      ? `https://www.google.com/maps/search/?api=1&query=${visit.lat},${visit.lng}`
      : null;

  // While user info is loading, optionally show a spinner or placeholder
  if (userLoading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <Box>
      {/* Back Button */}
      {onBack && (
        <Button mb={4} colorScheme="gray" onClick={onBack}>
          ← Back to Visits
        </Button>
      )}

      <Heading size="lg" mb={6}>
        Visit Details for {visit.patient?.name || "Unknown"}
      </Heading>

      <Text mb={4}>
        Status: <strong>{STATUS_LABELS[visitStatus] || visitStatus}</strong>
      </Text>

      <Stack direction="row" spacing={4} mb={6} flexWrap="wrap">
        {VISIT_STATUSES.map((status) => (
          <Button
            key={status}
            colorScheme={visitStatus === status ? "teal" : "blue"}
            onClick={() => updateStatus(status)}
            isLoading={updatingStatus}
            isDisabled={updatingStatus || visitStatus === status}
            mb={2}
          >
            {STATUS_LABELS[status]}
          </Button>
        ))}
      </Stack>

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
        <Button mt={4} colorScheme="blue" onClick={saveSelectedTests} isLoading={loadingDetails}>
          Save Selected Tests/Packages
        </Button>
      </FormControl>
    </Box>
  );
}
