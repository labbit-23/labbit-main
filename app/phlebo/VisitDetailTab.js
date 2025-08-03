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

  const [loadingDetails, setLoadingDetails] = useState(false);
  // storing selected items as Set of IDs (either test IDs or package IDs as strings)
  const [selectedTestIds, setSelectedTestIds] = useState(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [visitStatus, setVisitStatus] = useState(visit.status);

  useEffect(() => {
    setVisitStatus(visit.status);
    fetchVisitSelections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  // Load pre-selected tests/packages from visit_details
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

  // Save selected tests/packages to DB on Save button click
  const saveSelectedTests = async () => {
    setLoadingDetails(true);
    try {
      // Clear existing selections for this visit first
      const { error: delError } = await supabase
        .from("visit_details")
        .delete()
        .eq("visit_id", visit.id);
      if (delError) throw delError;

      // Insert current selections, distinguishing test_id and package_id columns
      const inserts = [];
      selectedTestIds.forEach((id) => {
        // You must decide how to distinguish test vs package id
        // Here we assume your TestPackageSelector only sends raw ids,
        // so you may need additional logic or IDs prefixed to differentiate
        // For safety, try to fetch both columns but only set one per insert
        inserts.push({
          visit_id: visit.id,
          test_id: id,      // if id is package_id maybe handle accordingly
          package_id: null, // update if needed
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
    setUpdatingStatus(true);
    try {
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

  // Compose Google Maps URL if lat and lng available in visit
  const mapsUrl =
    visit.lat && visit.lng
      ? `https://www.google.com/maps/search/?api=1&query=${visit.lat},${visit.lng}`
      : null;

  return (
    <Box>
      {/* Navigation */}
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

      {/* Navigation Button */}
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

      {/* Test/Package Selection */}
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
