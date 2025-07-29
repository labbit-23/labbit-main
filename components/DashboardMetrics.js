import React, { useEffect, useState } from "react";
import { Box, SimpleGrid, Stat, StatLabel, StatNumber, useToast } from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function DashboardMetrics({ hvExecutiveId }) {
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
      const today = new Date().toISOString().slice(0, 10);
      try {
        // Run queries in parallel
        const [
          totalRes,
          assignedRes,
          completedRes,
          pendingRes,
          unassignedRes,
        ] = await Promise.all([
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", today),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", today).eq("executive_id", hvExecutiveId),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", today).eq("status", "completed"),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", today).eq("status", "pending"),
          supabase.from("visits").select("id", { count: "exact", head: true }).eq("visit_date", today).is("executive_id", null),
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
    fetchMetrics();
  }, [hvExecutiveId, toast]);

  if (loading) {
    return <Box>Loading metrics...</Box>;
  }

  return (
    <SimpleGrid columns={[2, null, 5]} spacing={4} mb={6}>
      <Stat bg="gray.50" p={4} rounded="md" boxShadow="sm">
        <StatLabel>Total Visits Today</StatLabel>
        <StatNumber>{metrics.total}</StatNumber>
      </Stat>
      <Stat bg="teal.50" p={4} rounded="md" boxShadow="sm">
        <StatLabel>Assigned to Me</StatLabel>
        <StatNumber>{metrics.assigned}</StatNumber>
      </Stat>
      <Stat bg="green.50" p={4} rounded="md" boxShadow="sm">
        <StatLabel>Completed</StatLabel>
        <StatNumber>{metrics.completed}</StatNumber>
      </Stat>
      <Stat bg="yellow.50" p={4} rounded="md" boxShadow="sm">
        <StatLabel>Pending</StatLabel>
        <StatNumber>{metrics.pending}</StatNumber>
      </Stat>
      <Stat bg="red.50" p={4} rounded="md" boxShadow="sm">
        <StatLabel>Unassigned</StatLabel>
        <StatNumber>{metrics.unassigned}</StatNumber>
      </Stat>
    </SimpleGrid>
  );
}
