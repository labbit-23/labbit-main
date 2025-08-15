//app/collection-centre/components/PickupRequestForm.js

"use client";

import React, { useState } from "react";
import {
  Box, Button, FormControl, FormLabel, NumberInput, NumberInputField,
  Textarea, VStack, useToast,
} from "@chakra-ui/react";

export default function PickupRequestForm({ collectionCentreId, onSuccess }) {
  const [sampleBagSize, setSampleBagSize] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sampleBagSize || Number(sampleBagSize) <= 0) {
      toast({ title: "Please enter a valid sample bag size", status: "warning" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_centre_id: collectionCentreId,
          sample_bag_size: Number(sampleBagSize),
          notes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create pickup request");
      }

      setSampleBagSize("");
      setNotes("");
      onSuccess();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    }
    setLoading(false);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} maxW="400px">
      <VStack spacing={4} align="stretch">
        <FormControl id="sampleBagSize" isRequired>
          <FormLabel>Sample Bag Size</FormLabel>
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

        <Button type="submit" colorScheme="teal" isLoading={loading}>
          Request Pickup
        </Button>
      </VStack>
    </Box>
  );
}
