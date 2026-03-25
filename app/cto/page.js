"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  VStack
} from "@chakra-ui/react";
import Link from "next/link";
import RequireAuth from "../../components/RequireAuth";
import ShortcutBar from "../../components/ShortcutBar";

function StatusChip({ status, color }) {
  return (
    <Badge
      px={3}
      py={1}
      borderRadius="full"
      fontSize="0.72rem"
      textTransform="uppercase"
      colorScheme={color}
      variant="subtle"
    >
      {status}
    </Badge>
  );
}

function statusColor(status) {
  if (status === "healthy") return "green";
  if (status === "degraded") return "yellow";
  if (status === "down") return "red";
  return "gray";
}

const keySystems = [
  { service_keys: ["labbit_health"], label: "Labbit" },
  { service_keys: ["whatsapp_bot_activity", "whatsapp_bot_response_sla_1m", "whatsapp_bot_chats_24h", "whatsapp_bot_reports_24h", "whatsapp_bot_last_report"], label: "WhatsApp Bot" },
  { service_keys: ["supabase_main"], label: "Supabase" },
  { service_keys: ["oracle_db"], label: "Oracle DB" },
  { service_keys: ["mirth_lab", "mirth_dicom", "tailscale_mirth"], label: "Mirth" },
  { service_keys: ["tomcat_7", "tomcat_9"], label: "Tomcat" },
  { service_keys: ["orthanc_main"], label: "Orthanc" },
];
const SERVICE_FRESHNESS_MS = 10 * 60 * 1000;

function worstStatus(statuses) {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.includes("healthy")) return "healthy";
  return "unknown";
}

function summarizeGroupStatus(group) {
  const total = group.services.length;
  const counts = group.counts || {};

  if ((counts.down || 0) > 0) {
    return {
      text: counts.down === total ? "All Down" : `${counts.down} Down`,
      color: "red",
      detail: `${counts.down} of ${total} services down`,
    };
  }

  if ((counts.degraded || 0) > 0) {
    return {
      text: counts.degraded === total ? "All Degraded" : `${counts.degraded} Degraded`,
      color: "yellow",
      detail: `${counts.degraded} of ${total} services degraded`,
    };
  }

  if ((counts.healthy || 0) > 0) {
    return {
      text: "Healthy",
      color: "green",
      detail: `${counts.healthy} of ${total} services healthy`,
    };
  }

  return {
    text: "Unknown",
    color: "gray",
    detail: `${total} services with unknown state`,
  };
}

function redactSensitiveValue(key, value) {
  const sensitiveFragments = ["key", "token", "password", "secret", "authorization", "apikey"];

  function scrub(currentKey, currentValue) {
    const normalizedKey = String(currentKey || "").toLowerCase();
    if (sensitiveFragments.some((fragment) => normalizedKey.includes(fragment))) {
      return "[redacted]";
    }

    if (Array.isArray(currentValue)) {
      return currentValue.map((item, index) => scrub(`${currentKey}_${index}`, item));
    }

    if (currentValue && typeof currentValue === "object") {
      return Object.fromEntries(
        Object.entries(currentValue).map(([nestedKey, nestedValue]) => [
          nestedKey,
          scrub(nestedKey, nestedValue),
        ])
      );
    }

    return currentValue;
  }

  const scrubbed = scrub(key, value);

  if (scrubbed && typeof scrubbed === "object") {
    try {
      return JSON.stringify(scrubbed);
    } catch {
      return "[unavailable]";
    }
  }

  return String(scrubbed);
}

function evaluateFailureCondition(condition, services) {
  const relevant = services.filter(Boolean);
  if (relevant.length === 0) return false;
  const downCount = relevant.filter((service) => service.status === "down").length;
  const degradedCount = relevant.filter((service) => service.status === "degraded").length;

  if (condition === "all_down") return downCount === relevant.length;
  if (condition === "majority_down") return downCount >= Math.ceil(relevant.length / 2);
  if (condition === "all_degraded_or_down") return downCount + degradedCount === relevant.length;
  return downCount > 0;
}

function diagnosisTone(severity) {
  if (severity === "critical") return "red";
  if (severity === "high") return "yellow";
  return "blue";
}

function isFreshService(service) {
  if (!service?.checked_at) return false;
  const checkedAt = new Date(service.checked_at).getTime();
  if (Number.isNaN(checkedAt)) return false;
  return Date.now() - checkedAt <= SERVICE_FRESHNESS_MS;
}

function domainTitleForService(service) {
  const key = service?.service_key || "";
  const category = service?.category || "";

  if (category === "whatsapp" || key.startsWith("whatsapp_bot_")) return "WhatsApp Chatbot";
  if (key === "supabase_main" || category === "database") return "Database";
  if (
    category === "mirth" ||
    category === "orthanc" ||
    key === "orthanc_main" ||
    key.startsWith("mirth_") ||
    key === "tailscale_mirth"
  ) {
    return "Machine Interfacing";
  }
  if (key.startsWith("tomcat_")) return "App Servers";
  if (category === "python" || category === "neosoft" || key === "labbit_health" || category === "app") {
    return "Core Platform";
  }
  return "Other";
}

function isWhatsappMetric(service) {
  return service?.category === "whatsapp" || String(service?.service_key || "").startsWith("whatsapp_bot_");
}

function CtoDashboardPage() {
  const [latest, setLatest] = useState({ summary: { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }, services: [] });
  const [agentPresence, setAgentPresence] = useState([]);
  const [labs, setLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isProductCto, setIsProductCto] = useState(false);
  const [pinnedLabId, setPinnedLabId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [selectedServiceKey, setSelectedServiceKey] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("");
  const refreshRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const PIN_KEY = "ctoPinnedLabId";

    async function loadLabs() {
      try {
        const res = await fetch("/api/labs?cto=true", {
          credentials: "include",
          cache: "no-store"
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.labs)) return;
        if (cancelled) return;
        const availableLabs = data.labs || [];
        const productMode = Boolean(data?.is_product_cto);
        setLabs(availableLabs);
        setIsProductCto(productMode);

        const storedPinnedLab = typeof window !== "undefined" ? window.localStorage.getItem(PIN_KEY) || "" : "";
        const safePinnedLab = availableLabs.some((lab) => String(lab.id) === storedPinnedLab) ? storedPinnedLab : "";
        setPinnedLabId(safePinnedLab);

        if (!selectedLabId && availableLabs.length > 0) {
          if (productMode && safePinnedLab) {
            setSelectedLabId(safePinnedLab);
          } else {
            setSelectedLabId(String(availableLabs[0].id));
          }
        }
      } catch {
        // keep dashboard functional even if labs endpoint fails
      }
    }

    loadLabs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLatest({ silent = false } = {}) {
      if (!silent) setLoading(true);
      setLoadError("");
      try {
        const params = new URLSearchParams({ ts: String(Date.now()) });
        if (selectedLabId) params.set("lab_id", selectedLabId);
        const res = await fetch(`/api/cto/latest?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load CTO metrics");
        if (!cancelled) {
          setLatest(data);
          setLastLoadedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        }
      } catch (error) {
        if (!cancelled) setLoadError(error.message || "Failed to load CTO metrics");
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    }

    refreshRef.current = loadLatest;
    loadLatest();

    return () => {
      cancelled = true;
      refreshRef.current = null;
    };
  }, [selectedLabId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPresence() {
      try {
        const res = await fetch("/api/admin/whatsapp/agent-presence", {
          credentials: "include",
          cache: "no-store"
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setAgentPresence(Array.isArray(body?.agents) ? body.agents : []);
      } catch {
        if (!cancelled) setAgentPresence([]);
      }
    }

    loadPresence();
    return () => {
      cancelled = true;
    };
  }, []);

  const realServices = useMemo(() => {
    return (latest.services || []).filter(
      (service) =>
        !String(service.service_key || "").startsWith("__") &&
        isFreshService(service)
    );
  }, [latest.services]);

  const staleServices = useMemo(() => {
    return (latest.services || []).filter(
      (service) =>
        !String(service.service_key || "").startsWith("__") &&
        !isFreshService(service)
    );
  }, [latest.services]);

  const groupConfig = useMemo(() => {
    return (latest.services || []).find((service) => service.service_key === "__group_config__")?.payload?.groups || [];
  }, [latest.services]);

  const smartDiagnosis = useMemo(() => {
    if (!groupConfig.length) return null;
    const byKey = new Map(realServices.map((service) => [service.service_key, service]));

    const matches = groupConfig
      .map((group) => {
        const services = (group.services || []).map((key) => byKey.get(key)).filter(Boolean);
        const triggered = evaluateFailureCondition(group.failure_condition, services);
        return {
          ...group,
          triggered,
          services,
          downCount: services.filter((service) => service.status === "down").length,
        };
      })
      .filter((group) => group.triggered)
      .sort((a, b) => {
        const severityWeight = { critical: 3, high: 2, medium: 1, low: 0 };
        return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
      });

    return matches[0] || null;
  }, [groupConfig, realServices]);

  const heroStats = useMemo(() => {
    const summary = realServices.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }
    );

    return [
      { label: "Services", value: String(summary.total || 0), tone: "cyan.300", note: "All monitored services", filter: "" },
      { label: "Healthy", value: String(summary.healthy || 0), tone: "green.400", note: "Operating normally", filter: "healthy" },
      { label: "Degraded", value: String(summary.degraded || 0), tone: "yellow.300", note: "Slow or partially impaired", filter: "degraded" },
      { label: "Down", value: String(summary.down || 0), tone: "red.400", note: "Immediate attention required", filter: "down" },
    ];
  }, [realServices]);

  const filteredServices = useMemo(() => {
    if (!activeStatusFilter) return realServices;
    return realServices.filter((service) => service.status === activeStatusFilter);
  }, [activeStatusFilter, realServices]);

  const groupedServices = useMemo(() => {
    const groups = new Map();
    for (const service of filteredServices) {
      const key = domainTitleForService(service);
      const group = groups.get(key) || {
        title: key,
        services: [],
        status: "healthy",
        counts: { healthy: 0, degraded: 0, down: 0, unknown: 0 },
      };
      group.services.push(service);
      group.counts[service.status] = (group.counts[service.status] || 0) + 1;
      if (service.status === "down") {
        group.status = "down";
      } else if (service.status === "degraded" && group.status !== "down") {
        group.status = "degraded";
      }
      groups.set(key, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredServices]);

  const topLatency = useMemo(() => {
    return [...realServices]
      .filter((service) => typeof service.latency_ms === "number" && !isWhatsappMetric(service))
      .sort((a, b) => (b.latency_ms || 0) - (a.latency_ms || 0))
      .slice(0, 4);
  }, [realServices]);

  const incidentFeed = useMemo(() => {
    return realServices
      .filter((service) => service.status === "down" || service.status === "degraded")
      .sort((a, b) => {
        const weight = { down: 2, degraded: 1 };
        return (weight[b.status] || 0) - (weight[a.status] || 0);
      })
      .slice(0, 5);
  }, [realServices]);

  const selectedService = useMemo(() => {
    const pool = filteredServices.length > 0 ? filteredServices : realServices;
    if (!selectedServiceKey) return incidentFeed[0] || topLatency[0] || pool[0] || null;
    return pool.find((service) => service.service_key === selectedServiceKey) || realServices.find((service) => service.service_key === selectedServiceKey) || null;
  }, [filteredServices, incidentFeed, realServices, selectedServiceKey, topLatency]);

  const selectedPayloadEntries = useMemo(() => {
    const payload = selectedService?.payload;
    if (!payload || typeof payload !== "object") return [];
    return Object.entries(payload).slice(0, 6);
  }, [selectedService]);

  const agentPresenceSummary = useMemo(() => {
    return {
      online: agentPresence.filter((a) => a.presence === "online").length,
      away: agentPresence.filter((a) => a.presence === "away").length,
      offline: agentPresence.filter((a) => a.presence === "offline").length
    };
  }, [agentPresence]);

  const keySystemStatuses = useMemo(() => {
    const services = realServices;
    return keySystems.map((system) => {
      const matches = services.filter((service) => system.service_keys.includes(service.service_key));
      const freshMatches = matches.filter(isFreshService);
      const sourceMatches = freshMatches.length > 0 ? freshMatches : matches;
      const status = sourceMatches.length > 0 ? worstStatus(sourceMatches.map((service) => service.status)) : "unknown";
      const primaryMatch =
        sourceMatches.find((service) => service.status === status) ||
        sourceMatches[0] ||
        null;

      return {
        ...system,
        status,
        latency_ms: isWhatsappMetric(primaryMatch) ? null : primaryMatch?.latency_ms,
        message:
          freshMatches.length === 0 && matches.length > 0
            ? "No recent snapshot"
            : primaryMatch?.message || "No data yet",
        matchCount: sourceMatches.length,
        primaryServiceKey: primaryMatch?.service_key || "",
      };
    });
  }, [realServices]);

  const canSelectLab = isProductCto && labs.length > 1;
  const selectedLabName = useMemo(() => {
    const match = labs.find((lab) => String(lab.id) === String(selectedLabId));
    return match?.name || null;
  }, [labs, selectedLabId]);
  const togglePinnedLab = () => {
    if (typeof window === "undefined" || !selectedLabId) return;
    const nextPinned = pinnedLabId === selectedLabId ? "" : selectedLabId;
    setPinnedLabId(nextPinned);
    if (nextPinned) {
      window.localStorage.setItem("ctoPinnedLabId", nextPinned);
    } else {
      window.localStorage.removeItem("ctoPinnedLabId");
    }
  };

  const monitoringLabControl = (
    <HStack
      spacing={2}
      px={2}
      py={1.5}
      borderRadius="14px"
      bg="rgba(255,255,255,0.06)"
      border="1px solid rgba(255,255,255,0.14)"
      color="white"
    >
      <Text fontSize="xs" color="whiteAlpha.800" whiteSpace="nowrap">Lab</Text>
      <Select
        value={selectedLabId}
        onChange={(e) => {
          setSelectedServiceKey("");
          setSelectedLabId(e.target.value);
        }}
        isDisabled={!canSelectLab}
        size="sm"
        maxW="220px"
        borderRadius="10px"
        bg="rgba(11, 19, 32, 0.72)"
        borderColor="rgba(255,255,255,0.22)"
        color="white"
      >
        {labs.length === 0 && <option value="">Default Lab</option>}
        {labs.map((lab) => (
          <option key={lab.id} value={String(lab.id)}>
            {lab.name || lab.id}
          </option>
        ))}
      </Select>
      {isProductCto && selectedLabId && (
        <Button
          size="xs"
          variant="outline"
          borderColor="rgba(255,255,255,0.28)"
          color="whiteAlpha.900"
          onClick={togglePinnedLab}
        >
          {pinnedLabId === selectedLabId ? "Unpin" : "Pin"}
        </Button>
      )}
    </HStack>
  );

  return (
    <Box
      minH="100vh"
      bg="radial-gradient(circle at top left, rgba(0, 195, 255, 0.18), transparent 28%), radial-gradient(circle at top right, rgba(255, 123, 67, 0.16), transparent 22%), linear-gradient(180deg, #0b1320 0%, #111827 50%, #0d1726 100%)"
      color="#f8fafc"
      px={{ base: 4, md: 8 }}
      py={{ base: 5, md: 8 }}
    >
      <ShortcutBar themeMode="dark" centerContent={monitoringLabControl} />
      <Box maxW="1440px" mx="auto">
        <Box pt="64px" />
        <Flex
          direction={{ base: "column", xl: "row" }}
          justify="space-between"
          align={{ base: "flex-start", xl: "center" }}
          gap={6}
          mb={8}
        >
          <VStack align="flex-start" spacing={3} maxW="760px">
            <Badge
              bg="rgba(29, 233, 182, 0.14)"
              color="#7ef4d7"
              px={3}
              py={1}
              borderRadius="full"
              fontSize="0.72rem"
              letterSpacing="0.08em"
            >
              CTO Control Plane
            </Badge>
            <Heading size="2xl" lineHeight="1.05" fontWeight="800">
              Labbit Operations
            </Heading>
            <Text color="whiteAlpha.760" fontSize="sm">
              {isProductCto ? "Product CTO view • multi-lab diagnostics" : "Lab-level diagnostics • restricted to assigned lab"}
            </Text>
            <HStack spacing={2} flexWrap="wrap">
              <Badge colorScheme="green" borderRadius="full" px={3} py={1}>
                Agents Active: {agentPresenceSummary.online}
              </Badge>
              <Badge colorScheme="yellow" borderRadius="full" px={3} py={1}>
                Away: {agentPresenceSummary.away}
              </Badge>
              <Badge colorScheme="gray" borderRadius="full" px={3} py={1}>
                Not Logged In: {agentPresenceSummary.offline}
              </Badge>
            </HStack>
              <HStack spacing={4} color="whiteAlpha.760" fontSize="sm" flexWrap="wrap">
                <HStack spacing={2}>
                  <Box w={2.5} h={2.5} borderRadius="full" bg={heroStats[3].value !== "0" ? "red.400" : heroStats[2].value !== "0" ? "yellow.300" : "green.400"} />
                  <Text>{heroStats[3].value !== "0" ? "Attention needed" : heroStats[2].value !== "0" ? "Degraded services present" : "All critical services healthy"}</Text>
                </HStack>
              <Text color="whiteAlpha.500">•</Text>
              <Text>{lastLoadedAt ? `Last updated ${lastLoadedAt}` : "Waiting for first sync"}</Text>
              {selectedLabName && (
                <>
                  <Text color="whiteAlpha.500">•</Text>
                  <Text>Lab: {selectedLabName}</Text>
                </>
              )}
              {staleServices.length > 0 && (
                <>
                  <Text color="whiteAlpha.500">•</Text>
                  <Text>{staleServices.length} stale service{staleServices.length > 1 ? "s" : ""} hidden</Text>
                </>
              )}
            </HStack>
          </VStack>

          <Stack spacing={3} alignSelf={{ base: "stretch", xl: "flex-end" }} w={{ base: "full", xl: "auto" }}>
            <Box
              px={3}
              py={2}
              borderRadius="18px"
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.08)"
              minW={{ base: "100%", xl: "320px" }}
              display={{ base: "block", md: "none" }}
            >
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>
                Monitoring Lab
              </Text>
              <Select
                value={selectedLabId}
                onChange={(e) => {
                  setSelectedServiceKey("");
                  setSelectedLabId(e.target.value);
                }}
                isDisabled={!canSelectLab}
                size="sm"
                borderRadius="10px"
                bg="rgba(11, 19, 32, 0.72)"
                borderColor="rgba(255,255,255,0.18)"
                color="white"
              >
                {labs.length === 0 && <option value="">Default Lab</option>}
                {labs.map((lab) => (
                  <option key={lab.id} value={String(lab.id)}>
                    {lab.name || lab.id}
                  </option>
                ))}
              </Select>
              {isProductCto && selectedLabId && (
                <HStack spacing={2} mt={2}>
                  <Button
                    size="xs"
                    variant="outline"
                    borderColor="rgba(255,255,255,0.28)"
                    color="whiteAlpha.900"
                    onClick={togglePinnedLab}
                  >
                    {pinnedLabId === selectedLabId ? "Unpin Lab" : "Pin Lab"}
                  </Button>
                  {pinnedLabId === selectedLabId && (
                    <Text fontSize="xs" color="whiteAlpha.700">Pinned for this browser</Text>
                  )}
                </HStack>
              )}
              {!isProductCto && (
                <Text fontSize="xs" color="whiteAlpha.700" mt={2}>
                  Restricted to assigned lab scope
                </Text>
              )}
            </Box>
            <Flex
              gap={2}
              px={3}
              py={2}
              borderRadius="28px"
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.08)"
              wrap="wrap"
              maxW={{ base: "full", xl: "720px" }}
            >
              {keySystemStatuses.map((system) => (
                <Tooltip
                  key={system.label}
                  hasArrow
                  placement="top"
                  bg="gray.900"
                  color="white"
                  label={`${system.label}: ${system.status}${typeof system.latency_ms === "number" ? ` • ${system.latency_ms} ms` : ""}${system.message ? ` • ${system.message}` : ""}${system.matchCount ? ` • ${system.matchCount} checks` : ""}`}
                >
                  <Flex
                    align="center"
                    gap={2}
                    px={3}
                    py={1.5}
                    borderRadius="full"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.05)"
                    cursor={system.primaryServiceKey ? "pointer" : "default"}
                    minW="fit-content"
                    onClick={() => {
                      if (system.primaryServiceKey) setSelectedServiceKey(system.primaryServiceKey);
                    }}
                  >
                    <Box
                      w={2.5}
                      h={2.5}
                      borderRadius="full"
                      bg={
                        system.status === "healthy"
                          ? "green.400"
                          : system.status === "degraded"
                          ? "yellow.300"
                          : system.status === "down"
                          ? "red.400"
                          : "gray.400"
                      }
                    />
                    <Text fontSize="xs" color="whiteAlpha.900">
                      {system.label}
                    </Text>
                  </Flex>
                </Tooltip>
              ))}
            </Flex>
            <Flex gap={3} wrap="wrap" justify={{ base: "flex-start", xl: "flex-end" }}>
              <Button
                bg="white"
                color="#0b1320"
                _hover={{ bg: "gray.100" }}
                borderRadius="full"
                px={6}
                onClick={() => refreshRef.current?.()}
              >
                Run Diagnostics
              </Button>
              <Button
                as={Link}
                href="/admin"
                bg="rgba(126, 244, 215, 0.16)"
                color="white"
                _hover={{ bg: "rgba(126, 244, 215, 0.24)" }}
                borderRadius="full"
                px={6}
              >
                Admin Dashboard
              </Button>
              <Button
                as={Link}
                href="/admin/whatsapp"
                bg="rgba(56, 189, 248, 0.16)"
                color="white"
                _hover={{ bg: "rgba(56, 189, 248, 0.24)" }}
                borderRadius="full"
                px={6}
              >
                WhatsApp Inbox
              </Button>
              <Button
                as={Link}
                href="/cto/whatsapp-sim"
                variant="outline"
                borderColor="rgba(126, 244, 215, 0.55)"
                color="white"
                _hover={{ bg: "rgba(126, 244, 215, 0.16)" }}
                borderRadius="full"
                px={6}
              >
                Bot Simulator
              </Button>
            </Flex>
          </Stack>
        </Flex>

        {smartDiagnosis && (
          <Box
            mb={6}
            p={4}
            borderRadius="22px"
            bg={
              smartDiagnosis.severity === "critical"
                ? "rgba(248,113,113,0.12)"
                : "rgba(250,204,21,0.12)"
            }
            border={
              smartDiagnosis.severity === "critical"
                ? "1px solid rgba(248,113,113,0.28)"
                : "1px solid rgba(250,204,21,0.28)"
            }
          >
            <HStack justify="space-between" align="flex-start" gap={4} flexWrap="wrap">
              <Box>
                <HStack mb={2}>
                  <StatusChip status={smartDiagnosis.label} color={diagnosisTone(smartDiagnosis.severity)} />
                  <Text color="whiteAlpha.700" fontSize="sm">
                    Likely cause
                  </Text>
                </HStack>
                <Text fontWeight="700" mb={1}>
                  {smartDiagnosis.message || smartDiagnosis.label}
                </Text>
                <Text fontSize="sm" color="whiteAlpha.760">
                  Based on: {smartDiagnosis.services.map((service) => service.label || service.service_key).join(", ")}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="outline"
                borderColor="whiteAlpha.300"
                color="white"
                _hover={{ bg: "whiteAlpha.120" }}
                onClick={() => {
                  const firstDown = smartDiagnosis.services.find((service) => service.status === "down") || smartDiagnosis.services[0];
                  if (firstDown) {
                    setSelectedServiceKey(firstDown.service_key);
                    setActiveStatusFilter("");
                  }
                }}
              >
                Inspect Weak Link
              </Button>
            </HStack>
          </Box>
        )}

        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4} mb={8}>
          {heroStats.map((stat) => (
            <Tooltip key={stat.label} label={stat.note} hasArrow placement="top" bg="gray.900" color="white">
              <Box
                p={5}
                borderRadius="24px"
                bg="rgba(255,255,255,0.06)"
                border="1px solid rgba(255,255,255,0.08)"
                backdropFilter="blur(16px)"
                boxShadow="0 24px 60px rgba(0,0,0,0.18)"
                cursor="pointer"
                outline={activeStatusFilter === stat.filter ? "2px solid rgba(126,244,215,0.45)" : "none"}
                _hover={{ bg: "rgba(255,255,255,0.09)" }}
                onClick={() => {
                  const nextFilter = activeStatusFilter === stat.filter ? "" : stat.filter;
                  setActiveStatusFilter(nextFilter);
                  setSelectedServiceKey("");
                }}
              >
                <Text fontSize="sm" color="whiteAlpha.700" mb={3}>
                  {stat.label}
                </Text>
                <Text fontSize="4xl" fontWeight="800" color={stat.tone} lineHeight="1">
                  {stat.value}
                </Text>
                <Text mt={3} fontSize="sm" color="whiteAlpha.800">
                  {stat.note}
                </Text>
              </Box>
            </Tooltip>
          ))}
        </SimpleGrid>

        {loadError && (
          <Box
            mb={6}
            p={4}
            borderRadius="18px"
            bg="rgba(248,113,113,0.12)"
            border="1px solid rgba(248,113,113,0.28)"
          >
            <Text color="red.200" fontWeight="600">{loadError}</Text>
          </Box>
        )}

        <Grid templateColumns={{ base: "1fr", xl: "1.45fr 1fr" }} gap={5} mb={5}>
          <GridItem>
            <Box
              p={{ base: 5, md: 6 }}
              borderRadius="28px"
              bg="rgba(8,15,28,0.82)"
              border="1px solid rgba(126, 244, 215, 0.16)"
              boxShadow="0 28px 80px rgba(0,0,0,0.22)"
            >
              <Flex justify="space-between" align="center" mb={5}>
                <Box>
                  <Heading size="md" mb={1}>Operational Domains</Heading>
                  <Text color="whiteAlpha.700">
                    {activeStatusFilter ? `Showing ${activeStatusFilter} services` : "Showing all monitored services"}
                  </Text>
                </Box>
                <HStack spacing={2}>
                  {activeStatusFilter && (
                    <Button
                      size="xs"
                      variant="ghost"
                      color="whiteAlpha.800"
                      _hover={{ bg: "whiteAlpha.120" }}
                      onClick={() => {
                        setActiveStatusFilter("");
                        setSelectedServiceKey("");
                      }}
                    >
                      Clear filter
                    </Button>
                  )}
                  <Badge colorScheme="purple" variant="solid" borderRadius="full" px={3} py={1}>
                    {loading ? "Loading" : "Live"}
                  </Badge>
                </HStack>
              </Flex>

              <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4}>
                {groupedServices.length === 0 && !loading && (
                  <Box
                    p={4}
                    borderRadius="22px"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.08)"
                  >
                    <Text fontSize="sm" color="whiteAlpha.760">
                      No monitoring data has been ingested yet.
                    </Text>
                  </Box>
                )}
                {groupedServices.map((domain) => (
                  <Box
                    key={domain.title}
                    p={4}
                    borderRadius="22px"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.08)"
                  >
                    {(() => {
                      const summary = summarizeGroupStatus(domain);
                      return (
                        <>
                          <HStack justify="space-between" mb={1}>
                            <Heading size="sm">{domain.title}</Heading>
                            <StatusChip status={summary.text} color={summary.color} />
                          </HStack>
                          <Text fontSize="xs" color="whiteAlpha.600" mb={3}>
                            {summary.detail}
                          </Text>
                        </>
                      );
                    })()}
                    <Stack spacing={2}>
                      {domain.services.map((service) => (
                        <Tooltip
                          key={service.service_key}
                          hasArrow
                          placement="top"
                          bg="gray.900"
                          color="white"
                          label={
                            <Box>
                              <Text fontWeight="700">{service.label || service.service_key}</Text>
                              <Text fontSize="xs">Status: {service.status}</Text>
                              {!isWhatsappMetric(service) && (
                                <Text fontSize="xs">
                                  Latency: {typeof service.latency_ms === "number" ? `${service.latency_ms} ms` : "n/a"}
                                </Text>
                              )}
                              <Text fontSize="xs">{service.message || "No detail"}</Text>
                            </Box>
                          }
                        >
                          <Box
                            px={3}
                            py={2}
                            borderRadius="14px"
                            bg={
                              service.status === "down"
                                ? "rgba(248,113,113,0.18)"
                                : service.status === "degraded"
                                ? "rgba(250,204,21,0.14)"
                                : selectedService?.service_key === service.service_key
                                ? "rgba(126,244,215,0.16)"
                                : "rgba(255,255,255,0.05)"
                            }
                            border={
                              service.status === "down"
                                ? "1px solid rgba(248,113,113,0.45)"
                                : service.status === "degraded"
                                ? "1px solid rgba(250,204,21,0.35)"
                                : selectedService?.service_key === service.service_key
                                ? "1px solid rgba(126,244,215,0.38)"
                                : "1px solid transparent"
                            }
                            cursor="pointer"
                            transition="all 0.2s ease"
                            _hover={{
                              bg:
                                service.status === "down"
                                  ? "rgba(248,113,113,0.24)"
                                  : service.status === "degraded"
                                  ? "rgba(250,204,21,0.18)"
                                  : "rgba(255,255,255,0.08)"
                            }}
                            onClick={() => setSelectedServiceKey(service.service_key)}
                          >
                            <Flex justify="space-between" align="center" gap={3}>
                              <Text fontSize="sm">{service.label || service.service_key}</Text>
                              <Text fontSize="xs" color="whiteAlpha.700">
                                {isWhatsappMetric(service)
                                  ? (service.payload?.last_bot_message_ist || service.payload?.last_bot_report_sent_ist || "Activity")
                                  : typeof service.latency_ms === "number"
                                    ? `${service.latency_ms} ms`
                                    : "n/a"}
                              </Text>
                            </Flex>
                          </Box>
                        </Tooltip>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          </GridItem>

          <GridItem>
            <Box
              p={{ base: 5, md: 6 }}
              borderRadius="28px"
              bg="linear-gradient(180deg, rgba(26,37,55,0.96) 0%, rgba(13,23,38,0.98) 100%)"
              border="1px solid rgba(255,255,255,0.08)"
              h="100%"
            >
              <Heading size="md" mb={1}>Priority Issues</Heading>
              <Text color="whiteAlpha.700" mb={5}>
                Click a card or status counter to inspect exactly what needs attention.
              </Text>

              <Stack spacing={4}>
                {incidentFeed.length === 0 && !loading && (
                  <Box
                    p={4}
                    borderRadius="20px"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.08)"
                  >
                    <Text fontSize="sm" color="whiteAlpha.760">No active degraded or down services.</Text>
                  </Box>
                )}
                {incidentFeed.map((incident) => (
                  <Box
                    key={incident.service_key}
                    p={4}
                    borderRadius="20px"
                    bg={selectedService?.service_key === incident.service_key ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}
                    border={selectedService?.service_key === incident.service_key ? "1px solid rgba(126,244,215,0.32)" : "1px solid rgba(255,255,255,0.08)"}
                    cursor="pointer"
                    _hover={{ bg: "rgba(255,255,255,0.07)" }}
                    onClick={() => setSelectedServiceKey(incident.service_key)}
                  >
                    <HStack justify="space-between" mb={2}>
                      <StatusChip
                        status={incident.status}
                        color={statusColor(incident.status)}
                      />
                      <Text fontSize="xs" color="whiteAlpha.600">
                        {incident.category || "other"}
                      </Text>
                    </HStack>
                    <Text fontWeight="700" mb={2}>{incident.label || incident.service_key}</Text>
                    <Text fontSize="sm" color="whiteAlpha.760">
                      {incident.message || "Service needs review."}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Box>
          </GridItem>
        </Grid>

        <Grid templateColumns={{ base: "1fr", lg: "1.05fr 1fr" }} gap={5} mb={5}>
          <GridItem>
            <Box
              p={{ base: 5, md: 6 }}
              borderRadius="28px"
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.08)"
            >
              <Heading size="md" mb={1}>Latency Watchlist</Heading>
              <Text color="whiteAlpha.700" mb={6}>
                Slowest responding services from the latest collector run.
              </Text>

              <Stack spacing={5}>
                {topLatency.length === 0 && !loading && (
                  <Text fontSize="sm" color="whiteAlpha.760">No latency data yet.</Text>
                )}
                {topLatency.map((item) => (
                  <Box
                    key={item.service_key}
                    p={3}
                    borderRadius="18px"
                    cursor="pointer"
                    bg={selectedService?.service_key === item.service_key ? "rgba(255,255,255,0.08)" : "transparent"}
                    border={selectedService?.service_key === item.service_key ? "1px solid rgba(126,244,215,0.32)" : "1px solid transparent"}
                    _hover={{ bg: "rgba(255,255,255,0.05)" }}
                    onClick={() => setSelectedServiceKey(item.service_key)}
                  >
                    <Flex justify="space-between" align="center" mb={2}>
                      <Text fontWeight="600">{item.label || item.service_key}</Text>
                      <Text color="whiteAlpha.700">{item.latency_ms} ms</Text>
                    </Flex>
                    <Progress
                      value={Math.min(100, Math.round(((item.latency_ms || 0) / 3000) * 100))}
                      colorScheme={item.status === "down" ? "red" : item.status === "degraded" ? "yellow" : "green"}
                      borderRadius="full"
                      bg="whiteAlpha.200"
                      size="sm"
                    />
                    <Text mt={2} fontSize="sm" color="whiteAlpha.700">
                      {item.message || "No detail"}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Box>
          </GridItem>

          <GridItem>
            <Box
              p={{ base: 5, md: 6 }}
              borderRadius="28px"
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.08)"
              h="100%"
            >
              <Heading size="md" mb={1}>Service Detail</Heading>
              <Text color="whiteAlpha.700" mb={5}>
                Latest detail for the selected service.
              </Text>

              {selectedService ? (
                <Stack spacing={4}>
                  <Box p={4} borderRadius="18px" bg="rgba(10, 18, 30, 0.55)">
                    <HStack justify="space-between" mb={3}>
                      <Text fontWeight="700">{selectedService.label || selectedService.service_key}</Text>
                      <StatusChip status={selectedService.status} color={statusColor(selectedService.status)} />
                    </HStack>
                    <SimpleGrid columns={2} spacing={3}>
                      <Box>
                        <Text fontSize="xs" color="whiteAlpha.600" mb={1}>Category</Text>
                        <Text fontSize="sm">{selectedService.category || "other"}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="xs" color="whiteAlpha.600" mb={1}>Latency</Text>
                        <Text fontSize="sm">
                          {isWhatsappMetric(selectedService)
                            ? (selectedService.payload?.last_bot_message_ist || selectedService.payload?.last_bot_report_sent_ist || "n/a")
                            : typeof selectedService.latency_ms === "number"
                              ? `${selectedService.latency_ms} ms`
                              : "n/a"}
                        </Text>
                      </Box>
                      <Box>
                        <Text fontSize="xs" color="whiteAlpha.600" mb={1}>Checked</Text>
                        <Text fontSize="sm">
                          {selectedService.checked_at ? new Date(selectedService.checked_at).toLocaleString() : "n/a"}
                        </Text>
                      </Box>
                      <Box>
                        <Text fontSize="xs" color="whiteAlpha.600" mb={1}>Source</Text>
                        <Text fontSize="sm">{selectedService.source || latest.source || "n/a"}</Text>
                      </Box>
                    </SimpleGrid>
                  </Box>

                  <Box p={4} borderRadius="18px" bg="rgba(10, 18, 30, 0.55)">
                    <Text fontSize="xs" color="whiteAlpha.600" mb={2}>Latest message</Text>
                    <Text fontSize="sm" color="whiteAlpha.860">
                      {selectedService.message || "No detail available for this service."}
                    </Text>
                  </Box>

                  <Box p={4} borderRadius="18px" bg="rgba(10, 18, 30, 0.55)">
                    <Text fontSize="xs" color="whiteAlpha.600" mb={3}>Payload</Text>
                    <Stack spacing={2}>
                      {selectedPayloadEntries.length === 0 && (
                        <Text fontSize="sm" color="whiteAlpha.700">No payload metadata returned.</Text>
                      )}
                      {selectedPayloadEntries.map(([key, value]) => (
                        <Flex key={key} justify="space-between" gap={4}>
                          <Text fontSize="sm" color="whiteAlpha.700">{key}</Text>
                          <Text fontSize="sm" color="whiteAlpha.900" textAlign="right" noOfLines={2}>
                            {redactSensitiveValue(key, value)}
                          </Text>
                        </Flex>
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              ) : (
                <Box p={4} borderRadius="18px" bg="rgba(10, 18, 30, 0.55)">
                  <Text fontSize="sm" color="whiteAlpha.760">Select a service to inspect its latest status and payload.</Text>
                </Box>
              )}
            </Box>
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}

export default function CtoPage() {
  return (
    <RequireAuth roles={["director"]}>
      <CtoDashboardPage />
    </RequireAuth>
  );
}
