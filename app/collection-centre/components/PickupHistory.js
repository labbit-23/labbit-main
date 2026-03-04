//app/collection-centre/components/PickupHistory.js

"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Text,
  Stack,
  Badge,
  Flex,
  HStack,
  Button,
  useToast,
  Select,
  Spinner
} from "@chakra-ui/react";
import { useUser } from "@/app/context/UserContext";

const STATUS_COLORS = {
  samples_ready: "blue",
  picked_up: "orange",
  dropped: "green",
  cancelled: "red"
};

const STATUS_LABELS = {
  samples_ready: "SAMPLES READY",
  picked_up: "PICKED UP",
  dropped: "DROPPED",
  cancelled: "CANCELLED"
};

export default function PickupHistory({ refreshFlag, date }) {
  const toast = useToast();
  const { user } = useUser();

  const execType = (user?.executiveType || "").toLowerCase();
  const canManageStatus =
    execType === "logistics" ||
    execType === "admin" ||
    execType === "manager" ||
    execType === "director";
  const canConfirmPickup = canManageStatus || execType === "b2b";
  const canCancelPickup =
    execType === "b2b" ||
    execType === "admin" ||
    execType === "manager" ||
    execType === "director";

  const [pickups, setPickups] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const toDateKeyIST = (value) => {
    if (!value) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(value))
        .reduce((acc, part) => {
          if (part.type !== "literal") acc[part.type] = part.value;
          return acc;
        }, {});
      return `${parts.year}-${parts.month}-${parts.day}`;
    } catch {
      return "";
    }
  };

  const formatIST = (value) => {
    if (!value) return "-";
    try {
      return `${new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(value))} IST`;
    } catch {
      return value;
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchPickups() {
      try {
        setIsLoading(true);
        const query = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
        const res = await fetch(`/api/pickups${query}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load pickup history");
        }

        const data = await res.json();
        if (!cancelled) {
          setPickups(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Could not load pickup history",
            description: err.message,
            status: "error"
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchPickups();
    return () => {
      cancelled = true;
    };
  }, [refreshFlag, statusFilter, toast]);

  const grouped = useMemo(() => {
    const effectiveDate =
      date ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

    return pickups.filter((pickup) => toDateKeyIST(pickup.requested_at) === effectiveDate);
  }, [pickups, date]);

  const updatePickupStatus = async (pickupId, status, lotReference = "") => {
    try {
      setUpdatingId(pickupId);
      const res = await fetch("/api/pickups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pickupId,
          status,
          lot_reference: lotReference || null,
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update pickup status");
      }

      const updatedPickup = await res.json();
      setPickups((prev) => prev.map((pickup) => (pickup.id === pickupId ? updatedPickup : pickup)));

      toast({ title: "Pickup status updated", status: "success" });
    } catch (err) {
      toast({ title: "Update failed", description: err.message, status: "error" });
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading) {
    return (
      <Flex align="center" gap={2} color="gray.500">
        <Spinner size="sm" />
        <Text>Loading pickup history...</Text>
      </Flex>
    );
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Text fontWeight="semibold" color="gray.700">
          Pickup Requests ({grouped.length})
        </Text>
        <Select maxW="220px" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="samples_ready">Samples Ready</option>
          <option value="picked_up">Picked Up</option>
          <option value="dropped">Dropped</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </Flex>

      {grouped.length === 0 ? (
        <Text color="gray.600">No pickup requests found.</Text>
      ) : (
        <Stack spacing={4}>
          {grouped.map((p) => {
            const status = p.status || "unknown";
            const statusColor = STATUS_COLORS[status] || "gray";
            const statusLabel = STATUS_LABELS[status] || status.replace(/_/g, " ").toUpperCase();

            return (
              <Box key={p.id} p={4} bg="gray.50" borderRadius="md" boxShadow="sm">
                <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                  <Box>
                    <Text fontWeight="bold">{p.collection_centre?.centre_name || "Collection Centre"}</Text>
                    <Text fontSize="sm" color="gray.600">
                      Bag count: {p.sample_bag_size || "-"}
                    </Text>
                  </Box>
                  <HStack>
                    {p.is_urgent && <Badge colorScheme="red">URGENT</Badge>}
                    <Badge colorScheme={statusColor}>{statusLabel}</Badge>
                  </HStack>
                </Flex>

                <Text mt={2} fontSize="sm" color="gray.600">Requested: {formatIST(p.requested_at)}</Text>
                <Text mt={1} fontSize="sm" color="gray.600">Picked Up: {formatIST(p.picked_up_at)}</Text>
                <Text mt={1} fontSize="sm" color="gray.600">Dropped: {formatIST(p.dropped_off_at)}</Text>
                <Text mt={1} fontSize="sm" color="gray.600">
                  Assigned: {p.assigned_executive?.name || "Not assigned"}
                </Text>

                {p.notes && (
                  <Box mt={2} p={2} bg="gray.100" borderRadius="md" whiteSpace="pre-wrap">
                    <Text fontSize="sm">{p.notes}</Text>
                  </Box>
                )}

                {(canConfirmPickup || canManageStatus || canCancelPickup) && (
                  <HStack mt={3} spacing={2}>
                    {status === "samples_ready" && canConfirmPickup && (
                      <Button
                        size="sm"
                        colorScheme="orange"
                        isLoading={updatingId === p.id}
                        onClick={() => {
                          const lotRef = window.prompt("Sample lot reference (optional)");
                          updatePickupStatus(p.id, "picked_up", lotRef || "");
                        }}
                      >
                        Mark Picked Up
                      </Button>
                    )}
                    {status === "picked_up" && canManageStatus && (
                      <Button
                        size="sm"
                        colorScheme="green"
                        isLoading={updatingId === p.id}
                        onClick={() => updatePickupStatus(p.id, "dropped")}
                      >
                        Mark Dropped
                      </Button>
                    )}
                    {status === "samples_ready" && canCancelPickup && (
                      <Button
                        size="sm"
                        colorScheme="red"
                        variant="outline"
                        isLoading={updatingId === p.id}
                        onClick={() => {
                          const ok = window.confirm("Cancel this pickup request?");
                          if (ok) updatePickupStatus(p.id, "cancelled");
                        }}
                      >
                        Cancel Pickup
                      </Button>
                    )}
                  </HStack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
