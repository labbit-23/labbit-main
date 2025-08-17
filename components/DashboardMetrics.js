// File: /components/DashboardMetrics.js

import React, { useEffect, useState } from "react";
import { Box, Flex, Stat, StatLabel, StatNumber, useToast } from "@chakra-ui/react";
import { supabase } from "../lib/supabaseClient";

export default function DashboardMetrics({ hvExecutiveId, date, collectionCentreId }) {
  const [metrics, setMetrics] = useState({
    total: 0,
    assigned: 0,
    completed: 0,
    pending: 0,
    unassigned: 0,
  });
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (!date) return; // Don't fetch if date isn't set

    let cancelled = false;

    async function fetchMetrics() {
      setLoading(true);
      try {
        // Build base query date boundaries
        const queryDate = date;

        // If collectionCentreId is provided, show sample_pickups KPIs instead of visits
        if (collectionCentreId) {
          // Filter pickups by collection centre and requested_at date
          const pickupsRes = await supabase
            .from("sample_pickups")
            .select("status, requested_at");

          if (pickupsRes.error) throw pickupsRes.error;

          const filtered = (pickupsRes.data || []).filter((p) => {
            const dt = new Date(p.requested_at);
            const dtDateStr = dt.toISOString().slice(0, 10);
            return dtDateStr === queryDate && p.collection_centre_id === collectionCentreId;
          });

          if (!cancelled) {
            const total = filtered.length;
            const pending = filtered.filter((p) => p.status === "samples_ready").length;
            const completed = filtered.filter((p) => p.status === "dropped").length;

            setMetrics({
              total,
              assigned: 0, // Not applicable or handle based on assignment logic
              completed,
              pending,
              unassigned: 0,
            });
          }
        } else {
          // Existing visits KPIs for admin or executive
          const baseFilter = (query) =>
            query
              .eq("visit_date", queryDate)
              .not("status", "eq", "disabled"); // Exclude disabled visits

          const totalQuery = baseFilter(
            supabase.from("visits").select("id", { count: "exact", head: true })
          );

          let assignedQuery = baseFilter(
            supabase.from("visits").select("id", { count: "exact", head: true })
          );

          if (hvExecutiveId) {
            assignedQuery = assignedQuery.eq("executive_id", hvExecutiveId);
          } else {
            assignedQuery = assignedQuery.not("executive_id", "is", null);
          }

          const completedQuery = baseFilter(
            supabase
              .from("visits")
              .select("id", { count: "exact", head: true })
              .eq("status", "completed")
          );

          const pendingQuery = baseFilter(
            supabase
              .from("visits")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
          );

          const unassignedQuery = baseFilter(
            supabase
              .from("visits")
              .select("id", { count: "exact", head: true })
              .is("executive_id", null)
          );

          const [
            { count: totalCount, error: totalErr },
            { count: assignedCount, error: assignedErr },
            { count: completedCount, error: completedErr },
            { count: pendingCount, error: pendingErr },
            { count: unassignedCount, error: unassignedErr },
          ] = await Promise.all([
            totalQuery,
            assignedQuery,
            completedQuery,
            pendingQuery,
            unassignedQuery,
          ]);

          if (totalErr || assignedErr || completedErr || pendingErr || unassignedErr) {
            throw new Error(
              totalErr?.message ||
                assignedErr?.message ||
                completedErr?.message ||
                pendingErr?.message ||
                unassignedErr?.message ||
                "Error fetching metrics"
            );
          }

          if (!cancelled) {
            setMetrics({
              total: totalCount ?? 0,
              assigned: assignedCount ?? 0,
              completed: completedCount ?? 0,
              pending: pendingCount ?? 0,
              unassigned: unassignedCount ?? 0,
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Error loading dashboard metrics",
            description: error.message || "Please try again later.",
            status: "error",
            duration: 6000,
            isClosable: true,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMetrics();

    return () => {
      cancelled = true;
    };
  }, [hvExecutiveId, date, collectionCentreId, toast]);

  if (loading) {
    return (
      <Box textAlign="center" py={4} color="gray.500">
        Loading metrics...
      </Box>
    );
  }

  return (
    <Box overflowX="auto" mb={6}>
      <Flex minW="600px" gap={4}>
        <Stat
          bg="gray.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW={140}
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Total {collectionCentreId ? "Pickups" : "Visits"}</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.total}</StatNumber>
        </Stat>

        {!collectionCentreId && hvExecutiveId && (
          <Stat
            bg="teal.50"
            p={4}
            rounded="md"
            boxShadow="sm"
            minW={140}
            flex="none"
          >
            <StatLabel fontSize={{ base: "sm", md: "md" }}>Assigned to Me</StatLabel>
            <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.assigned}</StatNumber>
          </Stat>
        )}

        <Stat
          bg="green.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW={140}
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Completed</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.completed}</StatNumber>
        </Stat>

        <Stat
          bg="yellow.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW={140}
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Pending</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.pending}</StatNumber>
        </Stat>

        {!collectionCentreId && (
          <Stat
            bg="red.50"
            p={4}
            rounded="md"
            boxShadow="sm"
            minW={140}
            flex="none"
          >
            <StatLabel fontSize={{ base: "sm", md: "md" }}>Unassigned</StatLabel>
            <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.unassigned}</StatNumber>
          </Stat>
        )}
      </Flex>
    </Box>
  );
}
