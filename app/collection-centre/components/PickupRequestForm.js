//app/collection-centre/components/PickupRequestForm.js

"use client";

import React, { useState } from "react";
import {
  Box, Button, FormControl, FormLabel, NumberInput, NumberInputField,
  Textarea, VStack, useToast, Select, Text, Switch, HStack,
} from "@chakra-ui/react";
import { useEffect } from "react";
import { useUser } from "@/app/context/UserContext";

export default function PickupRequestForm({ collectionCentreId, onSuccess }) {
  const { user } = useUser();
  const execType = (user?.executiveType || "").toLowerCase();
  const canCreatePickedUp =
    execType === "logistics" ||
    execType === "admin" ||
    execType === "manager" ||
    execType === "director";

  const [sampleBagSize, setSampleBagSize] = useState("");
  const [notes, setNotes] = useState("");
  const [lotReference, setLotReference] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [markPickedUp, setMarkPickedUp] = useState(false);
  const [centres, setCentres] = useState([]);
  const [selectedCentreId, setSelectedCentreId] = useState(collectionCentreId || "");
  const [loading, setLoading] = useState(false);
  const [loadingCentres, setLoadingCentres] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;

    async function fetchCentres() {
      try {
        setLoadingCentres(true);
        const res = await fetch("/api/pickups/centres");
        if (!res.ok) throw new Error("Failed to load centres");
        const data = await res.json();
        if (cancelled) return;

        setCentres(Array.isArray(data) ? data : []);

        const preferred =
          collectionCentreId && data.find((c) => c.id === collectionCentreId)
            ? collectionCentreId
            : data?.[0]?.id || "";
        setSelectedCentreId(preferred);
      } catch (err) {
        if (!cancelled) {
          toast({ title: "Could not load collection centres", description: err.message, status: "error" });
        }
      } finally {
        if (!cancelled) setLoadingCentres(false);
      }
    }

    fetchCentres();
    return () => {
      cancelled = true;
    };
  }, [collectionCentreId, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCentreId) {
      toast({ title: "Please select a collection centre", status: "warning" });
      return;
    }
    if (!sampleBagSize || Number(sampleBagSize) <= 0) {
      toast({ title: "Please enter a valid sample count", status: "warning" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_centre_id: selectedCentreId,
          sample_bag_size: Number(sampleBagSize),
          notes,
          lot_reference: lotReference || null,
          urgent_lot: isUrgent,
          initial_status: canCreatePickedUp && markPickedUp ? "picked_up" : "samples_ready",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create pickup request");
      }

      setSampleBagSize("");
      setNotes("");
      setLotReference("");
      setIsUrgent(false);
      setMarkPickedUp(false);
      onSuccess();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    }
    setLoading(false);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} maxW="400px">
      <VStack spacing={4} align="stretch">
        <FormControl id="collectionCentre" isRequired>
          <FormLabel>Collection Centre</FormLabel>
          <Select
            value={selectedCentreId}
            onChange={(e) => setSelectedCentreId(e.target.value)}
            isDisabled={loadingCentres || centres.length === 0}
          >
            {centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.centre_name}
              </option>
            ))}
          </Select>
          {centres.length === 0 && !loadingCentres && (
            <Text mt={2} fontSize="sm" color="red.500">
              No collection centre assignment found. Contact admin.
            </Text>
          )}
        </FormControl>

        <FormControl id="sampleBagSize" isRequired>
          <FormLabel>Sample Count Ready</FormLabel>
          <NumberInput min={1} value={sampleBagSize} onChange={(value) => setSampleBagSize(value)}>
            <NumberInputField placeholder="Number of samples" />
          </NumberInput>
        </FormControl>

        <FormControl id="notes">
          <FormLabel>Additional Notes (optional)</FormLabel>
          <Textarea
            placeholder="Any special instructions or comments"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </FormControl>

        <FormControl id="lotReference">
          <FormLabel>Sample Lot Reference (optional)</FormLabel>
          <Textarea
            placeholder="e.g., LOT-CC-YPR-20260303-01"
            value={lotReference}
            onChange={(e) => setLotReference(e.target.value)}
            rows={2}
          />
        </FormControl>

        <FormControl id="urgentLot">
          <HStack justify="space-between">
            <FormLabel mb={0}>Mark this lot as URGENT</FormLabel>
            <Switch
              colorScheme="red"
              isChecked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
            />
          </HStack>
        </FormControl>

        {canCreatePickedUp && (
          <FormControl id="markPickedUp">
            <HStack justify="space-between">
              <FormLabel mb={0}>Mark this lot as already picked up</FormLabel>
              <Switch
                isChecked={markPickedUp}
                onChange={(e) => setMarkPickedUp(e.target.checked)}
              />
            </HStack>
            <Text fontSize="xs" color="gray.500" mt={1}>
              If enabled, status will be set to Picked Up with current timestamp.
            </Text>
          </FormControl>
        )}

        <Button type="submit" colorScheme="teal" isLoading={loading}>
          {canCreatePickedUp && markPickedUp ? "Save As Picked Up" : "Request Pickup"}
        </Button>
      </VStack>
    </Box>
  );
}
