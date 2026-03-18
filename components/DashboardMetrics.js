// File: /components/DashboardMetrics.js

import React, { useEffect, useState } from "react";
import { Box, Flex, Stat, StatLabel, StatNumber, useToast } from "@chakra-ui/react";
import { supabase } from "../lib/supabaseClient";

export default function DashboardMetrics({ hvExecutiveId, date, collectionCentreId, pickupMode = false, themeMode = "light" }) {
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

        // If pickupMode is enabled, show sample_pickups KPIs
        if (pickupMode) {
          // Filter pickups by collection centre and requested_at date
          const pickupsRes = await supabase
            .from("sample_pickups")
            .select("status, requested_at, collection_centre_id");

          if (pickupsRes.error) throw pickupsRes.error;

          const filtered = (pickupsRes.data || []).filter((p) => {
            const dt = new Date(p.requested_at);
            const dtDateStr = dt.toISOString().slice(0, 10);
            const matchesCentre = collectionCentreId ? p.collection_centre_id === collectionCentreId : true;
            return dtDateStr === queryDate && matchesCentre;
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
  }, [hvExecutiveId, date, collectionCentreId, pickupMode, toast]);

  if (loading) {
    return (
      <Box textAlign="center" py={4} color={themeMode === "dark" ? "whiteAlpha.700" : "gray.500"}>
        Loading metrics...
      </Box>
    );
  }

  const metricStyles = themeMode === "dark"
    ? {
        total: { bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.950", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
        assigned: { bg: "rgba(45,212,191,0.16)", color: "teal.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
        completed: { bg: "rgba(34,197,94,0.18)", color: "green.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
        pending: { bg: "rgba(250,204,21,0.16)", color: "yellow.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
        unassigned: { bg: "rgba(248,113,113,0.18)", color: "red.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
      }
    : {
        total: { bg: "gray.50", color: "inherit", label: "gray.600", shadow: "sm" },
        assigned: { bg: "teal.50", color: "inherit", label: "gray.600", shadow: "sm" },
        completed: { bg: "green.50", color: "inherit", label: "gray.600", shadow: "sm" },
        pending: { bg: "yellow.50", color: "inherit", label: "gray.600", shadow: "sm" },
        unassigned: { bg: "red.50", color: "inherit", label: "gray.600", shadow: "sm" },
      };

  return (
    <Box overflowX="auto" mb={6}>
      <Flex minW="600px" gap={4}>
        <Stat
          bg={metricStyles.total.bg}
          color={metricStyles.total.color}
          p={4}
          rounded="md"
          boxShadow={metricStyles.total.shadow}
          minW={140}
          flex="none"
          borderWidth={themeMode === "dark" ? "1px" : "0"}
          borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }} color={metricStyles.total.label}>Total {pickupMode ? "Pickups" : "Visits"}</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.total}</StatNumber>
        </Stat>

        {!pickupMode && hvExecutiveId && (
          <Stat
            bg={metricStyles.assigned.bg}
            color={metricStyles.assigned.color}
            p={4}
            rounded="md"
            boxShadow={metricStyles.assigned.shadow}
            minW={140}
            flex="none"
            borderWidth={themeMode === "dark" ? "1px" : "0"}
            borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
          >
            <StatLabel fontSize={{ base: "sm", md: "md" }} color={metricStyles.assigned.label}>Assigned to Me</StatLabel>
            <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.assigned}</StatNumber>
          </Stat>
        )}

        <Stat
          bg={metricStyles.completed.bg}
          color={metricStyles.completed.color}
          p={4}
          rounded="md"
          boxShadow={metricStyles.completed.shadow}
          minW={140}
          flex="none"
          borderWidth={themeMode === "dark" ? "1px" : "0"}
          borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }} color={metricStyles.completed.label}>Completed</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.completed}</StatNumber>
        </Stat>

        <Stat
          bg={metricStyles.pending.bg}
          color={metricStyles.pending.color}
          p={4}
          rounded="md"
          boxShadow={metricStyles.pending.shadow}
          minW={140}
          flex="none"
          borderWidth={themeMode === "dark" ? "1px" : "0"}
          borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }} color={metricStyles.pending.label}>Pending</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.pending}</StatNumber>
        </Stat>

        {!pickupMode && (
          <Stat
            bg={metricStyles.unassigned.bg}
            color={metricStyles.unassigned.color}
            p={4}
            rounded="md"
            boxShadow={metricStyles.unassigned.shadow}
            minW={140}
            flex="none"
            borderWidth={themeMode === "dark" ? "1px" : "0"}
            borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
          >
            <StatLabel fontSize={{ base: "sm", md: "md" }} color={metricStyles.unassigned.label}>Unassigned</StatLabel>
            <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.unassigned}</StatNumber>
          </Stat>
        )}
      </Flex>
    </Box>
  );
}
