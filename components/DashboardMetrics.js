// File: /components/DashboardMetrics.js

import React, { useEffect, useState } from "react";
import { Box, useToast } from "@chakra-ui/react";
import { supabase } from "../lib/supabaseClient";
import MetricCardsStrip from "./MetricCardsStrip";

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
          // visits now has RLS enabled (2026-09-14) -- browser can no
          // longer count it via the anon key. See
          // app/api/internal/visits/kpis/route.js.
          const kpiUrl = new URL("/api/internal/visits/kpis", window.location.origin);
          kpiUrl.searchParams.set("date", queryDate);
          if (hvExecutiveId) kpiUrl.searchParams.set("hv_executive_id", hvExecutiveId);
          const kpiRes = await fetch(kpiUrl.toString());
          const kpiBody = await kpiRes.json().catch(() => ({}));
          if (!kpiRes.ok) throw new Error(kpiBody.error || "Error fetching metrics");

          const totalCount = kpiBody.total;
          const assignedCount = kpiBody.assigned;
          const completedCount = kpiBody.completed;
          const pendingCount = kpiBody.pending;
          const unassignedCount = kpiBody.unassigned;

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

  const metricItems = [
    { key: "total", label: `Total ${pickupMode ? "Pickups" : "Visits"}`, shortLabel: pickupMode ? "Pickups" : "Total", value: metrics.total, tone: "total" },
    ...(!pickupMode && hvExecutiveId
      ? [{ key: "assigned", label: "Assigned to Me", shortLabel: "Assigned", value: metrics.assigned, tone: "assigned" }]
      : []),
    { key: "completed", label: "Completed", shortLabel: "Done", value: metrics.completed, tone: "completed" },
    { key: "pending", label: "Pending", shortLabel: "Pending", value: metrics.pending, tone: "pending" },
    ...(!pickupMode
      ? [{ key: "unassigned", label: "Unassigned", shortLabel: "Unassigned", value: metrics.unassigned, tone: "unassigned" }]
      : []),
  ];

  return <MetricCardsStrip items={metricItems} themeMode={themeMode} loading={loading} singleRow compactMobile />;
}
