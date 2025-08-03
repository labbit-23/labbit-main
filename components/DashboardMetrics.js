// File: /components/DashboardMetrics.js

import React, { useEffect, useState } from "react";
import { Box, Flex, Stat, StatLabel, StatNumber, useToast } from "@chakra-ui/react";
import { supabase } from "../lib/supabaseClient";

export default function DashboardMetrics({ hvExecutiveId, date }) {
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
    async function fetchMetrics() {
      setLoading(true);
      const queryDate = date || new Date().toISOString().slice(0, 10);

      try {
        const [
          totalRes,
          assignedRes,
          completedRes,
          pendingRes,
          unassignedRes,
        ] = await Promise.all([
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", queryDate),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", queryDate).eq("executive_id", hvExecutiveId),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", queryDate).eq("status", "completed"),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", queryDate).eq("status", "pending"),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", queryDate).is("executive_id", null),
        ]);

        setMetrics({
          total: totalRes.count ?? 0,
          assigned: assignedRes.count ?? 0,
          completed: completedRes.count ?? 0,
          pending: pendingRes.count ?? 0,
          unassigned: unassignedRes.count ?? 0,
        });
      } catch (error) {
        toast({
          title: "Error loading dashboard metrics",
          description: error.message || "Please try again later.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    }
    if (hvExecutiveId && date) {
      fetchMetrics();
    }
  }, [hvExecutiveId, date, toast]);

  if (loading) {
    return (
      <Box textAlign="center" py={4} color="gray.500">
        Loading metrics...
      </Box>
    );
  }

  // Scrollable container with horizontal scrolling
  return (
    <Box overflowX="auto" mb={6} py={2}>
      <Flex minW="600px" gap={4}>
        <Stat
          bg="gray.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW="140px"
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Total Visits Today</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.total}</StatNumber>
        </Stat>
        <Stat
          bg="teal.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW="140px"
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Assigned to Me</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.assigned}</StatNumber>
        </Stat>
        <Stat
          bg="green.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW="140px"
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
          minW="140px"
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Pending</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.pending}</StatNumber>
        </Stat>
        <Stat
          bg="red.50"
          p={4}
          rounded="md"
          boxShadow="sm"
          minW="140px"
          flex="none"
        >
          <StatLabel fontSize={{ base: "sm", md: "md" }}>Unassigned</StatLabel>
          <StatNumber fontSize={{ base: "lg", md: "2xl" }}>{metrics.unassigned}</StatNumber>
        </Stat>
      </Flex>
    </Box>
  );
}
