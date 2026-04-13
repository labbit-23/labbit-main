"use client";

import MetricCardsStrip from "@/components/MetricCardsStrip";

export default function BookingRequestStatusCards({
  summary,
  themeMode = "light",
  isLoading = false,
}) {
  const safe = summary || {
    unprocessed: 0,
    in_progress: 0,
    booked: 0,
    rejected: 0,
    closed: 0,
    other: 0,
    total: 0,
  };

  const items = [
    { key: "total", label: "Total Requests", value: safe.total, tone: "total" },
    { key: "booked", label: "Booked", value: safe.booked, tone: "completed" },
    { key: "unprocessed", label: "Unprocessed", value: safe.unprocessed, tone: "unassigned" },
    { key: "in_progress", label: "In Progress", value: safe.in_progress, tone: "pending" },
    { key: "rejected", label: "Rejected", value: safe.rejected, tone: "unassigned" },
    { key: "closed", label: "Closed", value: safe.closed, tone: "neutral" },
    { key: "other", label: "Other", value: safe.other, tone: "assigned" },
  ];

  return <MetricCardsStrip items={items} themeMode={themeMode} loading={isLoading} minW="980px" singleRow />;
}
