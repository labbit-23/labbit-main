"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from "@chakra-ui/react";
import RequireAuth from "@/components/RequireAuth";
import ShortcutBar from "@/components/ShortcutBar";

const SEGMENTS = [
  { value: "inactive_patients", label: "Inactive Patients" },
  { value: "lapsed_report_users", label: "Lapsed Report Users" }
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function statusColor(status) {
  if (status === "completed") return "green";
  if (status === "running") return "yellow";
  if (status === "draft") return "gray";
  return "purple";
}

export default function CampaignsPage() {
  const [themeMode, setThemeMode] = useState("dark");
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [runningCampaignId, setRunningCampaignId] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const [name, setName] = useState("");
  const [segmentType, setSegmentType] = useState(SEGMENTS[0].value);
  const [date, setDate] = useState(todayIsoDate());

  const canCreate = useMemo(
    () => Boolean(name.trim()) && Boolean(segmentType) && Boolean(date),
    [name, segmentType, date]
  );

  async function fetchCampaigns() {
    setError("");
    setHint("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/campaigns/create", {
        credentials: "include",
        cache: "no-store"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load campaigns");
      setCampaigns(Array.isArray(body?.campaigns) ? body.campaigns : []);
    } catch (err) {
      setError(err?.message || "Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    setThemeMode(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!canCreate || isCreating) return;

    setError("");
    setHint("");
    setIsCreating(true);
    try {
      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          segment_type: segmentType,
          date
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to create campaign");

      setHint("Campaign created.");
      setName("");
      await fetchCampaigns();
    } catch (err) {
      setError(err?.message || "Failed to create campaign");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRun(campaignId) {
    if (!campaignId || runningCampaignId) return;

    setError("");
    setHint("");
    setRunningCampaignId(campaignId);
    try {
      const res = await fetch("/api/campaigns/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaign_id: campaignId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to run campaign");
      setHint(`Campaign run complete. Sent: ${body.sent || 0}, Failed: ${body.failed || 0}`);
      await fetchCampaigns();
    } catch (err) {
      setError(err?.message || "Failed to run campaign");
    } finally {
      setRunningCampaignId("");
    }
  }

  return (
    <RequireAuth roles={["admin", "manager", "director"]}>
      <Box minH="100vh" bg={themeMode === "dark" ? "var(--dashboard-shell-bg)" : "var(--dashboard-page-bg)"}>
        <ShortcutBar
          themeMode={themeMode}
          onToggleTheme={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
        />
        <Box maxW="6xl" mx="auto" pt="72px" px={4} pb={8}>
          <Flex align="center" justify="space-between" mb={6} wrap="wrap" gap={3}>
            <Heading size="lg">Campaign Management</Heading>
            <Button as="a" href="/admin/whatsapp" variant="outline">
              WhatsApp Inbox
            </Button>
          </Flex>

          <Box borderWidth="1px" borderRadius="xl" p={4} mb={5} bg={themeMode === "dark" ? "rgba(15,23,42,0.7)" : "white"}>
            <Heading size="sm" mb={3}>Create Campaign</Heading>
            <form onSubmit={handleCreate}>
              <Stack direction={{ base: "column", md: "row" }} gap={3}>
                <FormControl isRequired>
                  <FormLabel mb={1}>Campaign Name</FormLabel>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Trend engagement - March"
                  />
                </FormControl>
                <FormControl isRequired maxW={{ base: "100%", md: "240px" }}>
                  <FormLabel mb={1}>Segment</FormLabel>
                  <Select value={segmentType} onChange={(event) => setSegmentType(event.target.value)}>
                    {SEGMENTS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl isRequired maxW={{ base: "100%", md: "220px" }}>
                  <FormLabel mb={1}>Inactive Since</FormLabel>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </FormControl>
                <Flex align="flex-end">
                  <Button type="submit" colorScheme="teal" isLoading={isCreating} isDisabled={!canCreate}>
                    Create
                  </Button>
                </Flex>
              </Stack>
            </form>
            {error && (
              <Text mt={3} color="red.300" fontSize="sm">{error}</Text>
            )}
            {hint && (
              <Text mt={3} color="green.300" fontSize="sm">{hint}</Text>
            )}
          </Box>

          <Box borderWidth="1px" borderRadius="xl" p={4} bg={themeMode === "dark" ? "rgba(15,23,42,0.7)" : "white"}>
            <Heading size="sm" mb={3}>Campaigns</Heading>
            {isLoading ? (
              <Text fontSize="sm">Loading campaigns...</Text>
            ) : campaigns.length === 0 ? (
              <Text fontSize="sm" color="gray.500">No campaigns yet.</Text>
            ) : (
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Segment</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th>Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {campaigns.map((campaign) => (
                    <Tr key={campaign.id}>
                      <Td>{campaign.name}</Td>
                      <Td>{campaign.segment_type}</Td>
                      <Td>{campaign.date}</Td>
                      <Td>
                        <Badge colorScheme={statusColor(campaign.status)}>{campaign.status || "draft"}</Badge>
                      </Td>
                      <Td>
                        <Button
                          size="xs"
                          colorScheme="teal"
                          variant={campaign.status === "completed" ? "outline" : "solid"}
                          isLoading={runningCampaignId === campaign.id}
                          onClick={() => handleRun(campaign.id)}
                        >
                          Run
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>
        </Box>
      </Box>
    </RequireAuth>
  );
}

