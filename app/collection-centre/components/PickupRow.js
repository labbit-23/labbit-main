//app/collection-centre/components/PickupRow.js

"use client";

import React from "react";
import {
  Box, Text, Badge, Flex, Stack, Button
} from "@chakra-ui/react";

export default function PickupRow({ pickup, onViewDetails, onCancel }) {
  const { sample_bag_size, status, requested_at, notes } = pickup;

  // Map status to color scheme
  const statusColor = {
    samples_ready: "blue",
    picked_up: "orange",
    dropped: "green",
    cancelled: "red",
  }[status] || "gray";

  return (
    <Box p={4} bg="gray.50" borderRadius="md" boxShadow="sm" borderWidth="1px" borderColor="gray.200">
      <Flex justify="space-between" align="center" mb={2}>
        <Text fontWeight="semibold" fontSize="md">Bag Size: {sample_bag_size || "-"}</Text>
        <Badge colorScheme={statusColor} fontWeight="bold" textTransform="uppercase" fontSize="sm">
          {status.replace(/_/g, " ")}
        </Badge>
      </Flex>

      <Text fontSize="sm" color="gray.600" mb={2}>
        Requested on: {new Date(requested_at).toLocaleString()}
      </Text>

      {notes && (
        <Box bg="gray.100" p={2} borderRadius="md" whiteSpace="pre-wrap" mb={4}>
          <Text fontSize="sm">{notes}</Text>
        </Box>
      )}

      <Stack direction="row" spacing={3}>
        {onViewDetails && (
          <Button size="sm" colorScheme="teal" variant="outline" onClick={() => onViewDetails(pickup)}>
            View Details
          </Button>
        )}

        {onCancel && status === "samples_ready" && (
          <Button size="sm" colorScheme="red" variant="ghost" onClick={() => onCancel(pickup)}>
            Cancel
          </Button>
        )}
      </Stack>
    </Box>
  );
}
