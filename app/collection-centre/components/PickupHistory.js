//app/collection-centre/components/PickupHistory.js

"use client";

import React from "react";
import {
  Box, Text, Stack, Badge, Flex, SimpleGrid
} from "@chakra-ui/react";

export default function PickupHistory({ pickups }) {
  if (!pickups || pickups.length === 0) {
    return <Text>No pickup requests found.</Text>;
  }

  return (
    <Stack spacing={4}>
      {pickups.map((p) => (
        <Box key={p.id} p={4} bg="gray.50" borderRadius="md" boxShadow="sm">
          <Flex justify="space-between" align="center">
            <Text fontWeight="bold">Bag Size: {p.sample_bag_size || "-"}</Text>
            <Badge colorScheme={
              p.status === "samples_ready" ? "blue" :
              p.status === "picked_up" ? "orange" :
              p.status === "dropped" ? "green" : "gray"}
            >
              {p.status.replace(/_/g, " ").toUpperCase()}
            </Badge>
          </Flex>
          <Text mt={2} fontSize="sm" color="gray.600">
            Requested on: {new Date(p.requested_at).toLocaleString()}
          </Text>
          {p.notes && (
            <Box mt={2} p={2} bg="gray.100" borderRadius="md" whiteSpace="pre-wrap">
              <Text fontSize="sm">{p.notes}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Stack>
  );
}
