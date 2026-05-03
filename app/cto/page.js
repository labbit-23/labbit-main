"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Badge,
  Button,
  IconButton,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { ExternalLinkIcon, QuestionOutlineIcon, RepeatIcon, SettingsIcon } from "@chakra-ui/icons";
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
  { service_keys: ["labbit_health"], label: "Labit" },
  { service_keys: ["whatsapp_bot_activity", "whatsapp_bot_response_sla_1m", "whatsapp_bot_chats_24h", "whatsapp_bot_reports_24h", "whatsapp_bot_last_report"], label: "WhatsApp Bot" },
  { service_keys: ["supabase_main"], label: "Supabase" },
  { service_keys: ["oracle_db"], label: "Oracle DB" },
  { service_keys: ["mirth_lab", "mirth_dicom", "tailscale_mirth"], label: "Mirth" },
  { service_keys: ["tomcat_7", "tomcat_9"], label: "Tomcat" },
  { service_keys: ["orthanc_main"], label: "Orthanc" },
];
const SERVICE_FRESHNESS_MS = 10 * 60 * 1000;
const TREND_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Daily (7 Days)" },
  { value: "30d", label: "30 Days" },
  { value: "12w", label: "Weekly (12 Weeks)" },
  { value: "12m", label: "Monthly (12 Months)" },
];

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

function formatBytesCompact(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 1024) return `${Math.round(num)} B`;
  const kb = num / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

function formatPayloadValue(key, value) {
  const lowerKey = String(key || "").toLowerCase();
  const isMemoryLike = ["memory", "rss", "heap", "bytes", "pmem"].some((fragment) =>
    lowerKey.includes(fragment)
  );
  if (isMemoryLike) {
    const compact = formatBytesCompact(value);
    if (compact) return compact;
  }
  return redactSensitiveValue(key, value);
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

function parseServiceKey(serviceKey) {
  const fullKey = String(serviceKey || "");
  const match = fullKey.match(/^(.*)__([a-z0-9_-]+)$/i);
  if (!match) {
    return {
      fullKey,
      baseKey: fullKey,
      nodeRole: null
    };
  }
  return {
    fullKey,
    baseKey: match[1] || fullKey,
    nodeRole: (match[2] || "").toLowerCase() || null
  };
}

function isVpsService(service) {
  const role = String(parseServiceKey(service?.service_key).nodeRole || "");
  return role.startsWith("vps");
}

function toFiniteNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace("%", "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMemoryMb(value) {
  const numeric = toFiniteNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 1024 * 1024) return numeric / (1024 * 1024); // bytes
  if (numeric >= 1024 * 8) return numeric / 1024; // kilobytes
  return numeric; // already MB-ish
}

function extractPayloadMetric(payload, keys = []) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const value = payload[key];
      const parsed = toFiniteNumber(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pressureTone(value, { warn = 75, critical = 90 } = {}) {
  if (!Number.isFinite(value)) return "gray";
  if (value >= critical) return "red";
  if (value >= warn) return "yellow";
  return "green";
}

function domainTitleForService(service) {
  const key = parseServiceKey(service?.service_key).baseKey;
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
  const baseKey = parseServiceKey(service?.service_key).baseKey;
  return service?.category === "whatsapp" || String(baseKey || "").startsWith("whatsapp_bot_");
}

function toFiniteInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
}

function formatMinutesAgoCompact(value) {
  const mins = Number(value);
  if (!Number.isFinite(mins) || mins < 0) return "n/a";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  const rem = Math.round(mins % 60);
  return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}

function formatWhatsappMetricValue(service) {
  const payload = service?.payload && typeof service.payload === "object" ? service.payload : {};
  const baseKey = parseServiceKey(service?.service_key).baseKey;

  if (baseKey === "whatsapp_bot_activity") {
    return [
      payload?.last_bot_message_ist || "No recent bot msg",
      `24h: ${toFiniteInt(payload?.bot_messages_24h)}`
    ];
  }

  if (baseKey === "whatsapp_bot_chats_24h") {
    return [`24h: ${toFiniteInt(payload?.count_24h)}`, `1h: ${toFiniteInt(payload?.count_1h)}`];
  }

  if (baseKey === "whatsapp_bot_reports_24h") {
    return [`24h: ${toFiniteInt(payload?.count_24h)}`, `1h: ${toFiniteInt(payload?.count_1h)}`];
  }

  if (baseKey === "whatsapp_bot_last_report") {
    return [
      payload?.last_bot_report_sent_ist || "No recent report",
      formatMinutesAgoCompact(payload?.last_bot_report_minutes_ago)
    ];
  }

  if (baseKey === "whatsapp_bot_response_sla_1m") {
    const total = toFiniteInt(payload?.count_1h);
    const within = toFiniteInt(payload?.replied_within_sla_1h);
    const late = toFiniteInt(payload?.late_replies_1h);
    const noReply = toFiniteInt(payload?.no_reply_1h);
    const pct = total > 0 ? Math.round((within / total) * 100) : 0;
    return [`SLA: ${pct}% (${within}/${total})`, `Late: ${late} • No reply: ${noReply}`];
  }

  if (baseKey === "whatsapp_bot_help_waits_24h") {
    return [`24h: ${toFiniteInt(payload?.count_24h)}`, "Exec handoff waits"];
  }

  if (baseKey === "whatsapp_bot_report_waits_24h") {
    return [`24h: ${toFiniteInt(payload?.count_24h)}`, "Report verification waits"];
  }

  return [payload?.last_bot_message_ist || payload?.last_bot_report_sent_ist || "Activity"];
}

function toChartY(value, height, padding, { min = 0, max = 100 } = {}) {
  const normalizedMin = Number.isFinite(min) ? min : 0;
  const normalizedMax = Number.isFinite(max) && max > normalizedMin ? max : normalizedMin + 1;
  const clamped = Math.max(normalizedMin, Math.min(normalizedMax, Number(value ?? normalizedMin)));
  const drawable = Math.max(1, height - padding * 2);
  return padding + ((normalizedMax - clamped) / (normalizedMax - normalizedMin)) * drawable;
}

function parseHourBucketToUtc(bucketKey) {
  const key = String(bucketKey || "");
  if (!key.includes(" ")) return null;
  const parsed = new Date(key.replace(" ", "T") + ":00.000Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBucketLabelIst(bucketKey) {
  const parsed = parseHourBucketToUtc(bucketKey);
  if (!parsed) return String(bucketKey || "");
  const day = parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata"
  });
  const time = parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata"
  });
  return `${day} ${time}`;
}

function buildTrendPath(points, valueAccessor, width, height, padding, yDomain = { min: 0, max: 100 }) {
  if (!Array.isArray(points) || points.length === 0) return "";
  const step = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1);
  let path = "";
  let hasStarted = false;

  for (let index = 0; index < points.length; index += 1) {
    const raw = valueAccessor(points[index], index);
    const valid = Number.isFinite(raw);
    if (!valid) {
      hasStarted = false;
      continue;
    }
    const x = points.length === 1 ? width / 2 : padding + step * index;
    const y = toChartY(raw, height, padding, yDomain);
    path += `${hasStarted ? "L" : "M"} ${x} ${y} `;
    hasStarted = true;
  }

  return path.trim();
}

function compressTrendPoints(points = [], maxPoints = 28) {
  const ordered = [...(Array.isArray(points) ? points : [])].sort((a, b) =>
    String(a?.bucket_key || "").localeCompare(String(b?.bucket_key || ""))
  );
  if (ordered.length <= maxPoints || maxPoints < 2) return ordered;

  const bucketSize = ordered.length / maxPoints;
  const compressed = [];

  for (let bucketIndex = 0; bucketIndex < maxPoints; bucketIndex += 1) {
    const start = Math.floor(bucketIndex * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize));
    const slice = ordered.slice(start, end);
    if (!slice.length) continue;

    const avgFinite = (values) => {
      const finite = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      if (!finite.length) return null;
      return finite.reduce((sum, v) => sum + v, 0) / finite.length;
    };

    const first = slice[0];
    const last = slice[slice.length - 1];
    compressed.push({
      ...first,
      bucket_key: first?.bucket_key || `bucket_${bucketIndex}`,
      bucket_label:
        bucketIndex === 0
          ? first?.bucket_label || first?.bucket_key || ""
          : bucketIndex === maxPoints - 1
            ? last?.bucket_label || last?.bucket_key || ""
            : "",
      healthy_rate: avgFinite(slice.map((point) => point?.healthy_rate)),
      down_rate: avgFinite(slice.map((point) => point?.down_rate)),
      avg_latency_ms: avgFinite(slice.map((point) => point?.avg_latency_ms)),
      total_checks: slice.reduce((sum, point) => sum + Number(point?.total_checks || 0), 0),
      healthy_count: slice.reduce((sum, point) => sum + Number(point?.healthy_count || 0), 0),
      down_count: slice.reduce((sum, point) => sum + Number(point?.down_count || 0), 0),
      degraded_count: slice.reduce((sum, point) => sum + Number(point?.degraded_count || 0), 0),
      unknown_count: slice.reduce((sum, point) => sum + Number(point?.unknown_count || 0), 0)
    });
  }

  return compressed;
}

function buildTrendChartModel(rawPoints = [], range = "30d") {
  const orderedPoints = [...(Array.isArray(rawPoints) ? rawPoints : [])].sort((a, b) =>
    String(a?.bucket_key || "").localeCompare(String(b?.bucket_key || ""))
  );
  const points = compressTrendPoints(orderedPoints, range === "12m" ? 24 : 30);
  const width = 560;
  const height = 180;
  const padding = 26;

  const healthyPath = buildTrendPath(points, (point) => {
    const value = Number(point?.healthy_rate);
    return Number.isFinite(value) ? value * 100 : null;
  }, width, height, padding);

  return {
    points,
    width,
    height,
    padding,
    healthyPath,
    hasPath: Boolean(healthyPath),
    xLabels: {
      start: points[0]?.bucket_label || "",
      mid: points[Math.floor(points.length / 2)]?.bucket_label || "",
      end: points[points.length - 1]?.bucket_label || ""
    }
  };
}

function buildSingleMetricHostChartModel(rawPoints = [], metricKey = "host_memory_pct") {
  const ordered = [...(Array.isArray(rawPoints) ? rawPoints : [])].sort((a, b) =>
    String(a?.bucket_key || "").localeCompare(String(b?.bucket_key || ""))
  );
  const isHourlyBuckets = ordered.some((point) => String(point?.bucket_key || "").includes(" "));
  const filledPoints = [];
  if (isHourlyBuckets) {
    const keyed = new Map(ordered.map((point) => [String(point?.bucket_key || ""), point]));
    const firstKey = String(ordered[0]?.bucket_key || "");
    const lastKey = String(ordered[ordered.length - 1]?.bucket_key || "");
    const first = parseHourBucketToUtc(firstKey);
    const last = parseHourBucketToUtc(lastKey);
    const startUtc = first || last;
    const currentHourUtc = last || first;
    if (startUtc && currentHourUtc) {
      for (let hourTs = startUtc.getTime(); hourTs <= currentHourUtc.getTime(); hourTs += 60 * 60 * 1000) {
        const dt = new Date(hourTs);
        const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")} ${String(dt.getUTCHours()).padStart(2, "0")}:00`;
        filledPoints.push(keyed.get(key) || { bucket_key: key, bucket_label: formatBucketLabelIst(key), [metricKey]: null });
      }
    }
  }
  const points = filledPoints.length > 0 ? filledPoints : ordered;
  const width = 520;
  const height = 140;
  const padding = 24;

  const metricValues = points
    .map((point) => Number(point?.[metricKey]))
    .filter((value) => Number.isFinite(value));
  const metricMax = metricValues.length > 0 ? Math.max(...metricValues) : 100;
  const roundedMax = Math.ceil(metricMax / 10) * 10;
  const yMax = Math.max(100, roundedMax || 100);
  const yDomain = { min: 0, max: yMax };
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((tick) => Number(tick.toFixed(2)));

  const path = buildTrendPath(points, (point) => {
    const value = Number(point?.[metricKey]);
    return Number.isFinite(value) ? value : null;
  }, width, height, padding, yDomain);

  let singlePointY = null;
  if (points.length === 1) {
    const value = Number(points[0]?.[metricKey]);
    singlePointY = Number.isFinite(value) ? toChartY(value, height, padding, yDomain) : null;
  }

  const step = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1);
  const plotPoints = points.map((point, index) => {
    const value = Number(point?.[metricKey]);
    const finite = Number.isFinite(value);
    const x = points.length === 1 ? width / 2 : padding + step * index;
    const y = finite ? toChartY(value, height, padding, yDomain) : null;
    const label = String(point?.bucket_key || "").includes(" ")
      ? formatBucketLabelIst(point?.bucket_key)
      : (point?.bucket_label || point?.bucket_key || "");
    return {
      x,
      y,
      value: finite ? value : null,
      label
    };
  });
  const latestPoint = [...plotPoints].reverse().find((point) => Number.isFinite(point.value)) || null;

  return {
    points,
    width,
    height,
    padding,
    path,
    hasPath: Boolean(path),
    singlePointY,
    plotPoints,
    latestPoint,
    yDomain,
    yTicks,
    xLabels: {
      start: points[0]?.bucket_key ? formatBucketLabelIst(points[0].bucket_key) : (points[0]?.bucket_label || ""),
      end: points[points.length - 1]?.bucket_key ? formatBucketLabelIst(points[points.length - 1].bucket_key) : (points[points.length - 1]?.bucket_label || "")
    }
  };
}

function CtoDashboardPage() {
  const smartReportModal = useDisclosure();
  const [latest, setLatest] = useState({ summary: { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }, services: [] });
  const [agentPresence, setAgentPresence] = useState([]);
  const [labs, setLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isProductCto, setIsProductCto] = useState(false);
  const [pinnedLabId, setPinnedLabId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [trendRange, setTrendRange] = useState("today");
  const [selectedVpsNode, setSelectedVpsNode] = useState("vps");
  const [trendVpsServiceKey, setTrendVpsServiceKey] = useState("");
  const [trendLocalServiceKey, setTrendLocalServiceKey] = useState("");
  const [trendData, setTrendData] = useState({ points: [], summary: {}, source: {}, service_key: "" });
  const [trendCompareData, setTrendCompareData] = useState({ points: [], summary: {}, source: {}, service_key: "" });
  const [trendWowData, setTrendWowData] = useState({ points: [], summary: {}, source: {} });
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState("");
  const [hostMetricHover, setHostMetricHover] = useState({});
  const [vpsHostSeriesByNode, setVpsHostSeriesByNode] = useState({});
  const [selectedServiceKey, setSelectedServiceKey] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("");
  const [eventsRows, setEventsRows] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [eventsStatusFilter, setEventsStatusFilter] = useState("");
  const [eventsSeverityFilter, setEventsSeverityFilter] = useState("");
  const [eventActionBusy, setEventActionBusy] = useState({});
  const [feedbackPeriod, setFeedbackPeriod] = useState("month");
  const [feedbackData, setFeedbackData] = useState({
    summary: {},
    points: [],
    categories: [],
    top_sources: [],
    period: "month"
  });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("bot");
  const feedbackDetailsModal = useDisclosure();
  const [feedbackDetailsRows, setFeedbackDetailsRows] = useState([]);
  const [feedbackDetailsLoading, setFeedbackDetailsLoading] = useState(false);
  const [feedbackDetailsError, setFeedbackDetailsError] = useState("");
  const [feedbackDetailsTitle, setFeedbackDetailsTitle] = useState("");
  const [smartMrnoInput, setSmartMrnoInput] = useState("");
  const [showVpsRunbook, setShowVpsRunbook] = useState(false);
  const [dashboardTab, setDashboardTab] = useState("cto");
  const refreshRef = useRef(null);
  const vpsSectionRef = useRef(null);
  const operationalSectionRef = useRef(null);
  const detailSectionRef = useRef(null);
  const trendsSectionRef = useRef(null);
  const feedbackSectionRef = useRef(null);
  const eventsSectionRef = useRef(null);

  function drillToSection(sectionRef) {
    setDashboardTab("cto");
    setTimeout(() => {
      sectionRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 20);
  }

  function openServiceRca(serviceKey) {
    if (!serviceKey) return;
    setSelectedServiceKey(serviceKey);
    drillToSection(detailSectionRef);
  }

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

    async function loadTrends() {
      setTrendLoading(true);
      setTrendError("");
      try {
        const vpsParams = new URLSearchParams({
          range: trendRange,
          node_role: "vps",
          ts: String(Date.now())
        });
        if (selectedLabId) vpsParams.set("lab_id", selectedLabId);
        if (selectedVpsNode && selectedVpsNode !== "vps") vpsParams.set("node_suffix", selectedVpsNode);
        if (trendVpsServiceKey) vpsParams.set("service_key", trendVpsServiceKey);

        const localParams = new URLSearchParams({
          range: trendRange,
          node_role: "local",
          ts: String(Date.now())
        });
        if (selectedLabId) localParams.set("lab_id", selectedLabId);
        if (trendLocalServiceKey) localParams.set("service_key", trendLocalServiceKey);

        const wowParams = new URLSearchParams({
          range: "30d",
          bucket: "day",
          node_role: "vps",
          ts: String(Date.now())
        });
        if (selectedLabId) wowParams.set("lab_id", selectedLabId);
        if (selectedVpsNode && selectedVpsNode !== "vps") wowParams.set("node_suffix", selectedVpsNode);
        if (trendVpsServiceKey) wowParams.set("service_key", trendVpsServiceKey);

        const fetches = [
          fetch(`/api/cto/trends?${vpsParams.toString()}`, {
            credentials: "include",
            cache: "no-store"
          }),
          fetch(`/api/cto/trends?${localParams.toString()}`, {
            credentials: "include",
            cache: "no-store"
          }),
          fetch(`/api/cto/trends?${wowParams.toString()}`, {
            credentials: "include",
            cache: "no-store"
          })
        ];

        const [vpsRes, localRes, wowRes] = await Promise.all(fetches);

        const vpsData = await vpsRes.json().catch(() => ({}));
        const localData = await localRes.json().catch(() => ({}));
        const wowData = await wowRes.json().catch(() => ({}));

        if (!vpsRes.ok) throw new Error(vpsData.error || "Failed to load VPS trends");
        if (!localRes.ok) throw new Error(localData.error || "Failed to load local trends");
        if (!wowRes.ok) throw new Error(wowData.error || "Failed to load week-over-week trends");

        if (!cancelled) {
          setTrendData({
            ...vpsData,
            service_key: trendVpsServiceKey || ""
          });
          setTrendWowData(wowData);
          setTrendCompareData({
            ...localData,
            service_key: trendLocalServiceKey || ""
          });
        }
      } catch (error) {
        if (!cancelled) {
          setTrendError(error.message || "Failed to load historical trends");
          setTrendData({ points: [], summary: {}, source: {} });
          setTrendCompareData({ points: [], summary: {}, source: {}, service_key: "" });
          setTrendWowData({ points: [], summary: {}, source: {} });
        }
      } finally {
        if (!cancelled) setTrendLoading(false);
      }
    }

    loadTrends();
    return () => {
      cancelled = true;
    };
  }, [selectedLabId, trendRange, selectedVpsNode, trendVpsServiceKey, trendLocalServiceKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents({ silent = false } = {}) {
      if (!silent) setEventsLoading(true);
      setEventsError("");
      try {
        const params = new URLSearchParams({ limit: "50", ts: String(Date.now()) });
        if (selectedLabId) params.set("lab_id", selectedLabId);
        if (eventsStatusFilter) params.set("status", eventsStatusFilter);
        if (eventsSeverityFilter) params.set("severity", eventsSeverityFilter);

        const res = await fetch(`/api/cto/events?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load CTO events");
        if (!cancelled) {
          setEventsRows(Array.isArray(data.rows) ? data.rows : []);
        }
      } catch (error) {
        if (!cancelled) setEventsError(error.message || "Failed to load CTO events");
      } finally {
        if (!cancelled && !silent) setEventsLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [selectedLabId, eventsStatusFilter, eventsSeverityFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeedback() {
      setFeedbackLoading(true);
      setFeedbackError("");
      try {
        const params = new URLSearchParams({
          period: feedbackPeriod,
          ts: String(Date.now())
        });
        if (selectedLabId) params.set("lab_id", selectedLabId);
        const res = await fetch(`/api/cto/feedback?${params.toString()}`, {
          credentials: "include",
          cache: "no-store"
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to load feedback analytics");
        if (!cancelled) {
          setFeedbackData({
            summary: body?.summary || {},
            points: Array.isArray(body?.points) ? body.points : [],
            categories: Array.isArray(body?.categories) ? body.categories : [],
            top_sources: Array.isArray(body?.top_sources) ? body.top_sources : [],
            period: body?.period || feedbackPeriod
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFeedbackError(error.message || "Failed to load feedback analytics");
          setFeedbackData({ summary: {}, points: [], categories: [], top_sources: [], period: feedbackPeriod });
        }
      } finally {
        if (!cancelled) setFeedbackLoading(false);
      }
    }

    loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [selectedLabId, feedbackPeriod]);

  const selectedFeedbackCategory = useMemo(() => {
    const categories = Array.isArray(feedbackData?.categories) ? feedbackData.categories : [];
    return categories.find((row) => row?.key === feedbackCategory) || categories[0] || null;
  }, [feedbackData?.categories, feedbackCategory]);

  useEffect(() => {
    if (!selectedFeedbackCategory?.key) return;
    setFeedbackCategory(selectedFeedbackCategory.key);
  }, [selectedFeedbackCategory?.key]);

  async function openFeedbackDetails(point, category = selectedFeedbackCategory) {
    if (!point?.key || !category?.key) return;
    setFeedbackDetailsTitle(`${category.label} · ${point.label}`);
    setFeedbackDetailsRows([]);
    setFeedbackDetailsError("");
    setFeedbackDetailsLoading(true);
    feedbackDetailsModal.onOpen();
    try {
      const params = new URLSearchParams({
        mode: "details",
        period: feedbackPeriod,
        category: category.key,
        bucket_key: point.key,
        ts: String(Date.now())
      });
      if (selectedLabId) params.set("lab_id", selectedLabId);
      const res = await fetch(`/api/cto/feedback?${params.toString()}`, {
        credentials: "include",
        cache: "no-store"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load feedback details");
      setFeedbackDetailsRows(Array.isArray(body?.rows) ? body.rows : []);
    } catch (error) {
      setFeedbackDetailsError(error.message || "Failed to load feedback details");
    } finally {
      setFeedbackDetailsLoading(false);
    }
  }

  async function updateEventStatus(eventId, status) {
    if (!eventId || !status) return;
    let note = null;
    if (status === "resolved") {
      const entered = window.prompt("Resolution note (optional):", "");
      if (entered === null) return;
      note = String(entered || "").trim() || null;
    }
    setEventActionBusy((prev) => ({ ...prev, [eventId]: true }));
    try {
      const res = await fetch(`/api/cto/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update event");
      setEventsRows((prev) =>
        prev.map((row) => (row.id === eventId ? { ...row, ...(data.row || {}) } : row))
      );
    } catch (error) {
      setEventsError(error.message || "Failed to update event");
    } finally {
      setEventActionBusy((prev) => ({ ...prev, [eventId]: false }));
    }
  }

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

  const vpsNodeOptions = useMemo(() => {
    return [...new Set(
      realServices
        .filter(isVpsService)
        .map((service) => String(parseServiceKey(service?.service_key).nodeRole || ""))
        .filter((role) => role.startsWith("vps"))
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [realServices]);
  const vpsNodeSelectorOptions = useMemo(() => {
    if (vpsNodeOptions.length === 0) return [];
    return Array.from(new Set(["vps", ...vpsNodeOptions]));
  }, [vpsNodeOptions]);

  useEffect(() => {
    if (vpsNodeSelectorOptions.length === 0) return;
    if (vpsNodeSelectorOptions.includes(selectedVpsNode)) return;
    if (vpsNodeSelectorOptions.includes("vps")) {
      setSelectedVpsNode("vps");
      return;
    }
    setSelectedVpsNode(vpsNodeSelectorOptions[0]);
  }, [selectedVpsNode, vpsNodeSelectorOptions]);

  useEffect(() => {
    if (!trendVpsServiceKey) return;
    const nodeRole = String(parseServiceKey(trendVpsServiceKey).nodeRole || "");
    if (selectedVpsNode === "vps") {
      if (!nodeRole.startsWith("vps")) setTrendVpsServiceKey("");
      return;
    }
    if (nodeRole && nodeRole !== selectedVpsNode) {
      setTrendVpsServiceKey("");
    }
  }, [selectedVpsNode, trendVpsServiceKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadVpsNodeSeries() {
      if (vpsNodeOptions.length === 0) {
        setVpsHostSeriesByNode({});
        return;
      }

      try {
        const entries = await Promise.all(
          vpsNodeOptions.map(async (node) => {
            const params = new URLSearchParams({
              range: trendRange,
              node_role: "vps",
              node_suffix: node,
              ts: String(Date.now())
            });
            if (selectedLabId) params.set("lab_id", selectedLabId);
            const res = await fetch(`/api/cto/trends?${params.toString()}`, {
              credentials: "include",
              cache: "no-store"
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return [node, []];
            return [node, Array.isArray(body?.host_points) ? body.host_points : []];
          })
        );

        if (!cancelled) {
          setVpsHostSeriesByNode(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setVpsHostSeriesByNode({});
      }
    }

    loadVpsNodeSeries();
    return () => {
      cancelled = true;
    };
  }, [selectedLabId, trendRange, vpsNodeOptions]);

  const staleServices = useMemo(() => {
    return (latest.services || []).filter(
      (service) =>
        !String(service.service_key || "").startsWith("__") &&
        !isFreshService(service)
    );
  }, [latest.services]);

  const groupConfig = useMemo(() => {
    return (latest.services || [])
      .filter((service) => String(service.service_key || "").startsWith("__group_config__"))
      .flatMap((service) => (Array.isArray(service?.payload?.groups) ? service.payload.groups : []));
  }, [latest.services]);

  const smartDiagnosis = useMemo(() => {
    if (!groupConfig.length) return null;
    const byKey = new Map();
    for (const service of realServices) {
      const parsed = parseServiceKey(service.service_key);
      if (!byKey.has(parsed.fullKey)) byKey.set(parsed.fullKey, []);
      byKey.get(parsed.fullKey).push(service);
      if (!byKey.has(parsed.baseKey)) byKey.set(parsed.baseKey, []);
      byKey.get(parsed.baseKey).push(service);
    }

    const matches = groupConfig
      .map((group) => {
        const servicesRaw = (group.services || [])
          .flatMap((key) => byKey.get(String(key || "").trim()) || [])
          .filter(Boolean);
        const seen = new Set();
        const services = servicesRaw.filter((service) => {
          const uniq = `${service.service_key || ""}|${service.checked_at || ""}`;
          if (seen.has(uniq)) return false;
          seen.add(uniq);
          return true;
        });
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

  const statusServicePreview = useMemo(() => {
    const bucket = {
      healthy: [],
      degraded: [],
      down: [],
      unknown: []
    };
    for (const service of realServices) {
      const status = String(service?.status || "").toLowerCase();
      if (!bucket[status]) continue;
      bucket[status].push(service.label || service.service_key || "service");
    }
    const buildPreview = (statusKey) => {
      const list = bucket[statusKey] || [];
      if (list.length === 0) return "No services in this status.";
      const unique = [...new Set(list)];
      const head = unique.slice(0, 8).join(", ");
      const remaining = unique.length - 8;
      return remaining > 0 ? `${head} (+${remaining} more)` : head;
    };
    return {
      healthy: buildPreview("healthy"),
      degraded: buildPreview("degraded"),
      down: buildPreview("down"),
      unknown: buildPreview("unknown")
    };
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

  const selectedIssueSamples = useMemo(() => {
    const samples = selectedService?.payload?.issue_samples;
    if (!Array.isArray(samples)) return [];
    return samples.slice(0, 10);
  }, [selectedService]);

  const agentPresenceSummary = useMemo(() => {
    return {
      online: agentPresence.filter((a) => a.presence === "online").length,
      away: agentPresence.filter((a) => a.presence === "away").length,
      offline: agentPresence.filter((a) => a.presence === "offline").length
    };
  }, [agentPresence]);

  const trendPoints = useMemo(() => {
    return Array.isArray(trendData?.points) ? trendData.points : [];
  }, [trendData]);
  const trendComparePoints = useMemo(() => {
    return Array.isArray(trendCompareData?.points) ? trendCompareData.points : [];
  }, [trendCompareData]);

  const trendSource = useMemo(() => {
    return trendData?.source || {};
  }, [trendData]);
  const trendIsHourlyBucket = String(trendData?.bucket || "").toLowerCase() === "hour";
  const trendBucketMinutes = useMemo(() => {
    const bucket = String(trendData?.bucket || "").toLowerCase();
    if (bucket === "hour") return 60;
    if (bucket === "day") return 24 * 60;
    if (bucket === "week") return 7 * 24 * 60;
    if (bucket === "month") return 30 * 24 * 60;
    return 60;
  }, [trendData?.bucket]);

  const computeChartUptimeDowntime = useCallback((points = [], includePct = false) => {
    const list = Array.isArray(points) ? points : [];
    const formatMinutes = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${String(m).padStart(2, "0")}m`;
    };
    const valid = list.filter((point) => Number.isFinite(Number(point?.healthy_rate)));
    if (valid.length === 0) {
      return { uptimeLabel: "n/a", downtimeLabel: "n/a", uptimePct: null, downtimePct: null };
    }
    const downBuckets = valid.filter((point) => Number(point?.healthy_rate) < 0.999).length;
    const totalBuckets = valid.length;
    const upBuckets = Math.max(0, totalBuckets - downBuckets);
    const downMinutes = downBuckets * trendBucketMinutes;
    const upMinutes = upBuckets * trendBucketMinutes;
    const downPct = Math.round((downBuckets / totalBuckets) * 100);
    const upPct = Math.max(0, 100 - downPct);
    return {
      uptimeLabel: includePct ? `${formatMinutes(upMinutes)} (${upPct}%)` : formatMinutes(upMinutes),
      downtimeLabel: includePct ? `${formatMinutes(downMinutes)} (${downPct}%)` : formatMinutes(downMinutes),
      uptimePct: upPct,
      downtimePct: downPct
    };
  }, [trendBucketMinutes]);

  const trendChartModel = useMemo(() => buildTrendChartModel(trendPoints, trendRange), [trendPoints, trendRange]);
  const trendCompareChartModel = useMemo(() => buildTrendChartModel(trendComparePoints, trendRange), [trendComparePoints, trendRange]);
  const vpsHostTrendPoints = useMemo(() => (Array.isArray(trendData?.host_points) ? trendData.host_points : []), [trendData]);
  const vpsHostMemoryModel = useMemo(
    () => buildSingleMetricHostChartModel(vpsHostTrendPoints, "host_memory_pct"),
    [vpsHostTrendPoints]
  );
  const vpsHostDiskModel = useMemo(
    () => buildSingleMetricHostChartModel(vpsHostTrendPoints, "host_disk_pct"),
    [vpsHostTrendPoints]
  );
  const vpsHostSwapModel = useMemo(
    () => buildSingleMetricHostChartModel(vpsHostTrendPoints, "host_swap_pct"),
    [vpsHostTrendPoints]
  );
  const vpsHostLoadModel = useMemo(
    () => buildSingleMetricHostChartModel(vpsHostTrendPoints, "host_load_per_core_pct"),
    [vpsHostTrendPoints]
  );
  const vpsComparisonNodes = useMemo(() => {
    const sorted = [...vpsNodeOptions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (sorted.length === 0) return [];
    if (selectedVpsNode === "vps") {
      const preferred = sorted.filter((node) => node === "vps1" || node === "vps2");
      if (preferred.length >= 2) return preferred.slice(0, 2);
      return sorted.slice(0, 2);
    }
    if (!sorted.includes(selectedVpsNode)) return sorted.slice(0, 1);
    return [selectedVpsNode];
  }, [selectedVpsNode, vpsNodeOptions]);
  const vpsHostMetricModelsByNode = useMemo(() => {
    const byNode = {};
    for (const node of vpsComparisonNodes) {
      const points = Array.isArray(vpsHostSeriesByNode?.[node]) ? vpsHostSeriesByNode[node] : [];
      byNode[node] = {
        memory: buildSingleMetricHostChartModel(points, "host_memory_pct"),
        disk: buildSingleMetricHostChartModel(points, "host_disk_pct"),
        swap: buildSingleMetricHostChartModel(points, "host_swap_pct"),
        load: buildSingleMetricHostChartModel(points, "host_load_per_core_pct")
      };
    }
    return byNode;
  }, [vpsComparisonNodes, vpsHostSeriesByNode]);
  const vpsHostCompactMetrics = useMemo(() => {
    const rows = [
      { key: "memory", label: "Memory", unit: "%", point: vpsHostMemoryModel.latestPoint },
      { key: "disk", label: "Disk", unit: "%", point: vpsHostDiskModel.latestPoint },
      { key: "swap", label: "Swap", unit: "%", point: vpsHostSwapModel.latestPoint },
      { key: "load", label: "Load/Core", unit: "%", point: vpsHostLoadModel.latestPoint }
    ];
    return rows.map((row) => ({
      ...row,
      value: Number.isFinite(row?.point?.value) ? `${Math.round(row.point.value)}${row.unit}` : "n/a",
      at: row?.point?.label || ""
    }));
  }, [vpsHostDiskModel.latestPoint, vpsHostLoadModel.latestPoint, vpsHostMemoryModel.latestPoint, vpsHostSwapModel.latestPoint]);

  const trendWow = useMemo(() => {
    const points = Array.isArray(trendWowData?.points) ? trendWowData.points : [];
    const ordered = [...points].sort((a, b) => String(a?.bucket_key || "").localeCompare(String(b?.bucket_key || "")));
    const recent = ordered.slice(-14);
    if (recent.length < 14) {
      return {
        hasData: false,
        reason: `Need 14 daily points (have ${recent.length})`,
        healthy_delta_pct_points: null,
        down_delta_pct_points: null,
        latency_delta_ms: null
      };
    }

    const previousWeek = recent.slice(0, 7);
    const currentWeek = recent.slice(7);

    function average(list, accessor) {
      const values = list
        .map(accessor)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    const prevHealthy = average(previousWeek, (point) => Number(point?.healthy_rate) * 100);
    const currHealthy = average(currentWeek, (point) => Number(point?.healthy_rate) * 100);
    const prevDown = average(previousWeek, (point) => Number(point?.down_rate) * 100);
    const currDown = average(currentWeek, (point) => Number(point?.down_rate) * 100);
    const prevLatency = average(previousWeek, (point) => point?.avg_latency_ms);
    const currLatency = average(currentWeek, (point) => point?.avg_latency_ms);

    const healthyDelta =
      Number.isFinite(currHealthy) && Number.isFinite(prevHealthy)
        ? Number((currHealthy - prevHealthy).toFixed(1))
        : null;
    const downDelta =
      Number.isFinite(currDown) && Number.isFinite(prevDown)
        ? Number((currDown - prevDown).toFixed(1))
        : null;
    const latencyDelta =
      Number.isFinite(currLatency) && Number.isFinite(prevLatency)
        ? Math.round(currLatency - prevLatency)
        : null;

    const hasAnyDelta = healthyDelta != null || downDelta != null || latencyDelta != null;

    return {
      hasData: hasAnyDelta,
      reason: hasAnyDelta ? null : "Insufficient complete daily data in one of the two weeks",
      healthy_delta_pct_points:
        healthyDelta,
      down_delta_pct_points:
        downDelta,
      latency_delta_ms:
        latencyDelta
    };
  }, [trendWowData]);

  const trendVpsServiceOptions = useMemo(() => {
    return [...new Set(
      realServices
        .map((service) => String(service.service_key || ""))
        .filter((key) => {
          const suffix = String(parseServiceKey(key).nodeRole || "");
          if (selectedVpsNode === "vps") return suffix.startsWith("vps");
          return suffix === selectedVpsNode;
        })
    )].sort((a, b) => a.localeCompare(b));
  }, [realServices, selectedVpsNode]);
  const trendLocalServiceOptions = useMemo(() => {
    return [...new Set(
      realServices
        .map((service) => String(service.service_key || ""))
        .filter((key) => key.toLowerCase().endsWith("__local"))
    )].sort((a, b) => a.localeCompare(b));
  }, [realServices]);

  const keySystemStatuses = useMemo(() => {
    const services = realServices;
    return keySystems.map((system) => {
      const matches = services.filter((service) => {
        const parsed = parseServiceKey(service.service_key);
        return system.service_keys.includes(parsed.fullKey) || system.service_keys.includes(parsed.baseKey);
      });
      const isWhatsappBotSystem = String(system.label || "").toLowerCase() === "whatsapp bot";
      const scopedMatches = isWhatsappBotSystem
        ? matches.filter((service) => parseServiceKey(service.service_key).baseKey === "whatsapp_bot_response_sla_1m")
        : matches;
      const freshMatches = scopedMatches.filter(isFreshService);
      const sourceMatches = freshMatches.length > 0 ? freshMatches : scopedMatches;
      let status = sourceMatches.length > 0 ? worstStatus(sourceMatches.map((service) => service.status)) : "unknown";
      if (isWhatsappBotSystem && status === "down") {
        // For executive key tile, show SLA issues as degraded.
        status = "degraded";
      }
      const primaryMatch =
        sourceMatches.find((service) => service.status === status) ||
        sourceMatches.find((service) => isWhatsappBotSystem && service.status === "down") ||
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

  const serviceByBaseKey = useMemo(() => {
    const map = new Map();
    for (const service of realServices) {
      const baseKey = parseServiceKey(service?.service_key).baseKey;
      if (!baseKey || map.has(baseKey)) continue;
      map.set(baseKey, service);
    }
    return map;
  }, [realServices]);

  const managementMetrics = useMemo(() => {
    const botSla = serviceByBaseKey.get("whatsapp_bot_response_sla_1m");
    const botChats24h = serviceByBaseKey.get("whatsapp_bot_chats_24h");
    const botReports24h = serviceByBaseKey.get("whatsapp_bot_reports_24h");
    const botLastReport = serviceByBaseKey.get("whatsapp_bot_last_report");
    const botHelpWaits = serviceByBaseKey.get("whatsapp_bot_help_waits_24h");
    const botReportWaits = serviceByBaseKey.get("whatsapp_bot_report_waits_24h");
    const website = latest?.website_analytics || {};
    const openEvents = (eventsRows || []).filter((row) => String(row?.status || "open") !== "resolved").length;
    const positiveRate = typeof feedbackData?.summary?.positive_rate === "number"
      ? Math.round(feedbackData.summary.positive_rate * 100)
      : null;

    const slaPayload = botSla?.payload || {};
    const slaCount1h = toFiniteInt(slaPayload?.count_1h, 0);
    const slaWithin1h = toFiniteInt(slaPayload?.replied_within_sla_1h, 0);
    const slaLate1h = toFiniteInt(slaPayload?.late_replies_1h, 0);
    const slaNoReply1h = toFiniteInt(slaPayload?.no_reply_1h, 0);
    const slaPct1h = slaCount1h > 0 ? Math.round((slaWithin1h / slaCount1h) * 100) : null;

    return {
      botSlaWithin: botSla?.payload?.within_sla_pct ?? null,
      botChats24h: botChats24h?.payload?.chat_sessions_24h ?? null,
      botReports24h: toFiniteInt(botReports24h?.payload?.count_24h, 0),
      botReports1h: toFiniteInt(botReports24h?.payload?.count_1h, 0),
      botLastReportIst: botLastReport?.payload?.last_bot_report_sent_ist || null,
      botLastReportAgo: formatMinutesAgoCompact(botLastReport?.payload?.last_bot_report_minutes_ago),
      botHelpWaits24h: toFiniteInt(botHelpWaits?.payload?.count_24h, 0),
      botReportWaits24h: toFiniteInt(botReportWaits?.payload?.count_24h, 0),
      botSlaCount1h: slaCount1h,
      botSlaWithin1h: slaWithin1h,
      botSlaLate1h: slaLate1h,
      botSlaNoReply1h: slaNoReply1h,
      botSlaPct1h: slaPct1h,
      websiteActiveSessions15m:
        typeof website?.active_sessions_15m === "number" ? website.active_sessions_15m : null,
      websiteUniqueVisitorsToday:
        typeof website?.unique_visitors_today === "number" ? website.unique_visitors_today : null,
      websiteTopPages7d: Array.isArray(website?.top_pages_7d) ? website.top_pages_7d : [],
      openEvents,
      positiveRate
    };
  }, [eventsRows, feedbackData?.summary?.positive_rate, latest?.website_analytics, serviceByBaseKey]);

  const vpsHealth = useMemo(() => {
    const vpsServices = realServices.filter((service) => {
      if (!isVpsService(service)) return false;
      const suffix = String(parseServiceKey(service?.service_key).nodeRole || "");
      if (selectedVpsNode === "vps") return suffix.startsWith("vps");
      return suffix === selectedVpsNode;
    });
    const byStatus = vpsServices.reduce(
      (acc, service) => {
        acc.total += 1;
        acc[service.status] = (acc[service.status] || 0) + 1;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }
    );

    let maxCpu = null;
    let maxCpuService = null;
    let maxProcessMemoryMb = null;
    let maxProcessMemoryService = null;
    let hostMemoryPct = null;
    let hostSwapPct = null;
    let hostDiskPct = null;
    let hostLoad1 = null;
    let hostCpuCores = null;
    let hostLoadPerCorePct = null;

    for (const service of vpsServices) {
      const payload = service?.payload || {};
      const cpu = extractPayloadMetric(payload, ["cpu", "cpu_pct", "cpu_percent", "cpu_usage_percent"]);
      if (Number.isFinite(cpu) && (maxCpu == null || cpu > maxCpu)) {
        maxCpu = cpu;
        maxCpuService = service;
      }

      const memoryMb = normalizeMemoryMb(
        extractPayloadMetric(payload, ["memory_mb", "mem_mb", "rss_mb", "memory", "rss"])
      );
      if (Number.isFinite(memoryMb) && (maxProcessMemoryMb == null || memoryMb > maxProcessMemoryMb)) {
        maxProcessMemoryMb = memoryMb;
        maxProcessMemoryService = service;
      }

      const memPct = extractPayloadMetric(payload, ["memory_pct", "mem_pct", "memory_percent", "ram_used_pct"]);
      if (Number.isFinite(memPct) && (hostMemoryPct == null || memPct > hostMemoryPct)) hostMemoryPct = memPct;

      const swapPct = extractPayloadMetric(payload, ["swap_pct", "swap_used_pct", "swap_percent"]);
      if (Number.isFinite(swapPct) && (hostSwapPct == null || swapPct > hostSwapPct)) hostSwapPct = swapPct;

      const diskPct = extractPayloadMetric(payload, ["disk_pct", "disk_used_pct", "disk_percent", "root_disk_pct"]);
      if (Number.isFinite(diskPct) && (hostDiskPct == null || diskPct > hostDiskPct)) hostDiskPct = diskPct;

      const load = extractPayloadMetric(payload, ["load_1", "load1", "loadavg_1"]);
      if (Number.isFinite(load) && (hostLoad1 == null || load > hostLoad1)) hostLoad1 = load;

      const cores = extractPayloadMetric(payload, ["cpu_cores", "cores"]);
      if (Number.isFinite(cores) && (hostCpuCores == null || cores > hostCpuCores)) hostCpuCores = cores;

      const loadPct = extractPayloadMetric(payload, ["load_1_per_core_pct", "load_per_core_pct"]);
      if (Number.isFinite(loadPct) && (hostLoadPerCorePct == null || loadPct > hostLoadPerCorePct)) hostLoadPerCorePct = loadPct;
    }

    return {
      services: vpsServices,
      byStatus,
      maxCpu,
      maxCpuService,
      maxProcessMemoryMb,
      maxProcessMemoryService,
      hostMemoryPct,
      hostSwapPct,
      hostDiskPct,
      hostLoad1,
      hostCpuCores,
      hostLoadPerCorePct
    };
  }, [realServices, selectedVpsNode]);

  const vpsHealthAll = useMemo(() => {
    const allVpsServices = realServices.filter(isVpsService);
    return allVpsServices.reduce(
      (acc, service) => {
        acc.total += 1;
        acc[service.status] = (acc[service.status] || 0) + 1;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }
    );
  }, [realServices]);

  const hasVpsIncident = useMemo(
    () => (vpsHealth.byStatus.down || 0) > 0 || (vpsHealth.byStatus.degraded || 0) > 0,
    [vpsHealth.byStatus.degraded, vpsHealth.byStatus.down]
  );

  useEffect(() => {
    if (hasVpsIncident) setShowVpsRunbook(true);
  }, [hasVpsIncident]);

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

  function openSmartReportExperimental(mode = "open") {
    const mrno = String(smartMrnoInput || "").trim();
    if (!mrno) return;
    const baseParams = {
      mrno,
      report_mode: "smart",
      design_variant: "executive",
      force: "1"
    };
    if (selectedLabId) baseParams.lab_id = String(selectedLabId);

    if (mode === "download") {
      const pdfQuery = new URLSearchParams({
        ...baseParams,
        format: "pdf",
        download: "1"
      });
      const htmlQuery = new URLSearchParams({
        ...baseParams,
        format: "html",
        download: "1"
      });
      window.open(`/api/smart-reports/trend-data?${pdfQuery.toString()}`, "_blank", "noopener,noreferrer");
      window.open(`/api/smart-reports/trend-data?${htmlQuery.toString()}`, "_blank", "noopener,noreferrer");
      return;
    }

    const openQuery = new URLSearchParams({
      ...baseParams,
      format: "html"
    });
    window.open(`/api/smart-reports/trend-data?${openQuery.toString()}`, "_blank", "noopener,noreferrer");
  }

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
              Labit Operations
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
            {canSelectLab && (
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
              </Box>
            )}
            <Flex
              direction="column"
              gap={2}
              px={3}
              py={2}
              borderRadius="28px"
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.08)"
              maxW={{ base: "full", xl: "1000px" }}
            >
              <Text fontSize="xs" color="whiteAlpha.700" px={1}>
                Key Status
              </Text>
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
                <Tooltip
                  key="vps_health_tile"
                  hasArrow
                  placement="top"
                  bg="gray.900"
                  color="white"
                  label={`VPS Fleet: ${(vpsHealthAll.down || 0) > 0 ? `${vpsHealthAll.down} down` : (vpsHealthAll.degraded || 0) > 0 ? `${vpsHealthAll.degraded} degraded` : "healthy"} • ${vpsHealthAll.total || 0} services monitored`}
                >
                  <Flex
                    align="center"
                    gap={2}
                    px={3}
                    py={1.5}
                    borderRadius="full"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.05)"
                  >
                    <Box
                      w={2.5}
                      h={2.5}
                      borderRadius="full"
                      bg={
                        (vpsHealthAll.down || 0) > 0
                          ? "red.400"
                          : (vpsHealthAll.degraded || 0) > 0
                          ? "yellow.300"
                          : "green.400"
                      }
                    />
                    <Text fontSize="xs" color="whiteAlpha.900" noOfLines={1}>
                      VPS (All)
                    </Text>
                  </Flex>
                </Tooltip>

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
                      onClick={() => {
                        if (system.primaryServiceKey) openServiceRca(system.primaryServiceKey);
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
                      <Text fontSize="xs" color="whiteAlpha.900" noOfLines={1}>
                        {system.label}
                      </Text>
                    </Flex>
                  </Tooltip>
                ))}
              </SimpleGrid>
            </Flex>
            <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing={2} minW={{ base: "100%", xl: "700px" }}>
              <Button
                size="sm"
                bg="white"
                color="#0b1320"
                _hover={{ bg: "gray.100" }}
                borderRadius="full"
                leftIcon={<RepeatIcon />}
                onClick={() => refreshRef.current?.()}
              >
                Run Diagnostics
              </Button>
              <Button
                size="sm"
                as={Link}
                href="/admin"
                bg="rgba(126, 244, 215, 0.16)"
                color="white"
                _hover={{ bg: "rgba(126, 244, 215, 0.24)" }}
                borderRadius="full"
                leftIcon={<SettingsIcon />}
              >
                Admin
              </Button>
              <Button
                size="sm"
                as={Link}
                href="/admin/whatsapp"
                bg="rgba(56, 189, 248, 0.16)"
                color="white"
                _hover={{ bg: "rgba(56, 189, 248, 0.24)" }}
                borderRadius="full"
                leftIcon={<ExternalLinkIcon />}
              >
                Inbox
              </Button>
              <Button
                size="sm"
                as={Link}
                href="/cto/whatsapp-sim"
                variant="outline"
                borderColor="rgba(126, 244, 215, 0.55)"
                color="white"
                _hover={{ bg: "rgba(126, 244, 215, 0.16)" }}
                borderRadius="full"
                leftIcon={<ExternalLinkIcon />}
              >
                Simulator
              </Button>
              <Button
                size="sm"
                variant="outline"
                borderColor="rgba(244, 190, 126, 0.65)"
                color="white"
                _hover={{ bg: "rgba(244, 190, 126, 0.16)" }}
                borderRadius="full"
                leftIcon={<ExternalLinkIcon />}
                onClick={smartReportModal.onOpen}
              >
                SMART Report*
              </Button>
            </SimpleGrid>
          </Stack>
        </Flex>

        <HStack spacing={2} mb={5}>
          <Button
            size="sm"
            borderRadius="full"
            variant={dashboardTab === "cto" ? "solid" : "outline"}
            colorScheme={dashboardTab === "cto" ? "teal" : "whiteAlpha"}
            onClick={() => setDashboardTab("cto")}
          >
            CTO Ops
          </Button>
          <Button
            size="sm"
            borderRadius="full"
            variant={dashboardTab === "management" ? "solid" : "outline"}
            colorScheme={dashboardTab === "management" ? "teal" : "whiteAlpha"}
            onClick={() => setDashboardTab("management")}
          >
            Management Metrics
          </Button>
        </HStack>

        {dashboardTab === "management" && (
          <Box
            mb={6}
            p={{ base: 5, md: 6 }}
            borderRadius="26px"
            bg="rgba(255,255,255,0.05)"
            border="1px solid rgba(255,255,255,0.10)"
          >
            <Heading size="md" mb={1}>Management Metrics</Heading>
            <Text color="whiteAlpha.700" mb={4}>Simplified executive view with drill-down into CTO details.</Text>
            <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)" cursor="pointer" onClick={() => drillToSection(operationalSectionRef)}>
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Service Reliability</Text>
                <Text fontSize="2xl" fontWeight="800" color="green.300">{heroStats[1]?.value || "0"}/{heroStats[0]?.value || "0"}</Text>
                <Text fontSize="xs" color="whiteAlpha.700" mt={1}>Tap to open Operational Domains</Text>
              </Box>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)" cursor="pointer" onClick={() => drillToSection(vpsSectionRef)}>
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>{selectedVpsNode.toUpperCase()} Capacity</Text>
                <Text fontSize="2xl" fontWeight="800" color="cyan.200">
                  {Number.isFinite(vpsHealth.hostMemoryPct) ? `${Math.round(vpsHealth.hostMemoryPct)}%` : "n/a"}
                </Text>
                <Text fontSize="xs" color="whiteAlpha.700" mt={1}>
                  {`Host memory pressure (tap for ${selectedVpsNode.toUpperCase()} Health)`}
                </Text>
              </Box>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)" cursor="pointer" onClick={() => drillToSection(feedbackSectionRef)}>
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Patient Feedback</Text>
                <Text fontSize="2xl" fontWeight="800" color="teal.200">
                  {managementMetrics.positiveRate != null ? `${managementMetrics.positiveRate}%` : "n/a"}
                </Text>
                <Text fontSize="xs" color="whiteAlpha.700" mt={1}>Positive rate (4-5)</Text>
              </Box>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)" cursor="pointer" onClick={() => drillToSection(eventsSectionRef)}>
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Open Ops Events</Text>
                <Text fontSize="2xl" fontWeight="800" color={managementMetrics.openEvents > 0 ? "orange.300" : "green.300"}>
                  {managementMetrics.openEvents}
                </Text>
                <Text fontSize="xs" color="whiteAlpha.700" mt={1}>Tap to open Ops Events</Text>
              </Box>
            </SimpleGrid>
            <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3} mt={3}>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)" cursor="pointer" onClick={() => drillToSection(detailSectionRef)}>
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>WhatsApp SLA (1m)</Text>
                <Text fontSize="2xl" fontWeight="800" color="blue.200">
                  {managementMetrics.botSlaWithin != null ? `${Math.round(Number(managementMetrics.botSlaWithin))}%` : "n/a"}
                </Text>
              </Box>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)" cursor="pointer" onClick={() => drillToSection(trendsSectionRef)}>
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Bot Chats (24h)</Text>
                <Text fontSize="2xl" fontWeight="800" color="purple.200">
                  {managementMetrics.botChats24h != null ? String(managementMetrics.botChats24h) : "n/a"}
                </Text>
              </Box>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)">
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Website Active Sessions (15m)</Text>
                <Text fontSize="2xl" fontWeight="800" color="cyan.200">
                  {managementMetrics.websiteActiveSessions15m != null ? String(managementMetrics.websiteActiveSessions15m) : "n/a"}
                </Text>
              </Box>
              <Box p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)">
                <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Website Unique Visitors (Today)</Text>
                <Text fontSize="2xl" fontWeight="800" color="teal.200">
                  {managementMetrics.websiteUniqueVisitorsToday != null ? String(managementMetrics.websiteUniqueVisitorsToday) : "n/a"}
                </Text>
              </Box>
            </SimpleGrid>
            <Box mt={3} p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)">
              <HStack justify="space-between" align="center" mb={2}>
                <Text fontSize="xs" color="whiteAlpha.700">WhatsApp Engagement Snapshot</Text>
                <Text fontSize="xs" color="whiteAlpha.600">
                  Last report: {managementMetrics.botLastReportIst || "n/a"} ({managementMetrics.botLastReportAgo || "n/a"})
                </Text>
              </HStack>
              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={2}>
                <Box p={3} borderRadius="12px" bg="rgba(59,130,246,0.10)" border="1px solid rgba(96,165,250,0.25)">
                  <Text fontSize="xs" color="whiteAlpha.700">Reports Sent</Text>
                  <Text fontWeight="800" fontSize="lg">{managementMetrics.botReports24h} (24h)</Text>
                  <Text fontSize="xs" color="whiteAlpha.700">{managementMetrics.botReports1h} in last 1h</Text>
                </Box>
                <Box p={3} borderRadius="12px" bg="rgba(16,185,129,0.10)" border="1px solid rgba(74,222,128,0.25)">
                  <Text fontSize="xs" color="whiteAlpha.700">Reply SLA (1m)</Text>
                  <Text fontWeight="800" fontSize="lg">
                    {managementMetrics.botSlaPct1h != null ? `${managementMetrics.botSlaPct1h}%` : "n/a"}
                  </Text>
                  <Text fontSize="xs" color="whiteAlpha.700">
                    {managementMetrics.botSlaWithin1h}/{managementMetrics.botSlaCount1h} within SLA
                  </Text>
                </Box>
                <Box p={3} borderRadius="12px" bg="rgba(245,158,11,0.10)" border="1px solid rgba(251,191,36,0.25)">
                  <Text fontSize="xs" color="whiteAlpha.700">Late / No Reply (1h)</Text>
                  <Text fontWeight="800" fontSize="lg">
                    {managementMetrics.botSlaLate1h} / {managementMetrics.botSlaNoReply1h}
                  </Text>
                  <Text fontSize="xs" color="whiteAlpha.700">Escalation watch</Text>
                </Box>
                <Box p={3} borderRadius="12px" bg="rgba(139,92,246,0.10)" border="1px solid rgba(167,139,250,0.25)">
                  <Text fontSize="xs" color="whiteAlpha.700">Wait Messages (24h)</Text>
                  <Text fontWeight="800" fontSize="lg">
                    {managementMetrics.botHelpWaits24h} / {managementMetrics.botReportWaits24h}
                  </Text>
                  <Text fontSize="xs" color="whiteAlpha.700">Help wait / report wait</Text>
                </Box>
              </SimpleGrid>
            </Box>
            <Box mt={3} p={4} borderRadius="16px" bg="rgba(255,255,255,0.04)" border="1px solid rgba(255,255,255,0.08)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={2}>Top Website Pages (7d)</Text>
              {managementMetrics.websiteTopPages7d.length === 0 ? (
                <Text fontSize="sm" color="whiteAlpha.700">No page analytics available.</Text>
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                  {managementMetrics.websiteTopPages7d.slice(0, 6).map((row) => (
                    <Flex key={`${row.page_path}-${row.unique_visitors}`} justify="space-between" gap={3}>
                      <Text fontSize="sm" color="whiteAlpha.900" noOfLines={1}>{row.page_path}</Text>
                      <Text fontSize="sm" color="cyan.200" fontWeight="700">{row.unique_visitors}</Text>
                    </Flex>
                  ))}
                </SimpleGrid>
              )}
            </Box>
          </Box>
        )}

        {dashboardTab === "cto" && smartDiagnosis && (
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
                    setActiveStatusFilter("");
                    openServiceRca(firstDown.service_key);
                  }
                }}
              >
                Inspect Weak Link
              </Button>
            </HStack>
          </Box>
        )}

        {dashboardTab === "cto" && (
        <>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4} mb={8}>
          {heroStats.map((stat) => (
            <Tooltip
              key={stat.label}
              label={
                stat.filter
                  ? `${stat.note}\n${statusServicePreview[stat.filter] || ""}`
                  : stat.note
              }
              hasArrow
              placement="top"
              bg="gray.900"
              color="white"
              whiteSpace="pre-wrap"
            >
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
        <Text fontSize="xs" color="whiteAlpha.600" mb={6}>
          Note: PM2 restart-based degrade/down uses rolling 24h restart counts. For one-shot scheduled jobs, stopped state is treated healthy if last successful run was within 24h.
        </Text>

        <Box
          ref={vpsSectionRef}
          mb={8}
          p={{ base: 5, md: 6 }}
          borderRadius="28px"
          bg="rgba(8,15,28,0.82)"
          border="1px solid rgba(56, 189, 248, 0.24)"
          boxShadow="0 28px 80px rgba(0,0,0,0.22)"
        >
          <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <HStack spacing={2} mb={1}>
                <Heading size="md">VPS Health</Heading>
                <IconButton
                  aria-label={showVpsRunbook ? "Hide incident runbook" : "Show incident runbook"}
                  icon={<QuestionOutlineIcon />}
                  size="xs"
                  variant="outline"
                  borderColor="rgba(255,255,255,0.28)"
                  color="whiteAlpha.900"
                  _hover={{ bg: "whiteAlpha.120" }}
                  onClick={() => setShowVpsRunbook((prev) => !prev)}
                />
              </HStack>
              <Text color="whiteAlpha.700" fontSize="sm">
                Fast triage view for memory and host pressure across VPS services.
              </Text>
            </Box>
            <HStack
              spacing={2}
              flexWrap="wrap"
              justify={{ base: "flex-start", md: "flex-end" }}
              rowGap={2}
              maxW="100%"
            >
              <HStack
                spacing={1}
                mr={{ base: 0, md: 1 }}
                bg="rgba(255,255,255,0.06)"
                p={1}
                borderRadius="full"
                overflowX="auto"
                maxW={{ base: "100%", md: "none" }}
              >
                {vpsNodeSelectorOptions.map((node) => (
                  <Button
                    key={node}
                    size="xs"
                    borderRadius="full"
                    variant={selectedVpsNode === node ? "solid" : "ghost"}
                    colorScheme={selectedVpsNode === node ? "teal" : "whiteAlpha"}
                    onClick={() => setSelectedVpsNode(node)}
                  >
                    {node === "vps" ? "VPS" : node.toUpperCase()}
                  </Button>
                ))}
              </HStack>
              <Badge colorScheme={statusColor(vpsHealth.byStatus.down > 0 ? "down" : vpsHealth.byStatus.degraded > 0 ? "degraded" : "healthy")} borderRadius="full" px={3} py={1} whiteSpace="nowrap">
                {vpsHealth.byStatus.total} services
              </Badge>
              <Badge colorScheme={statusColor(vpsHealth.byStatus.down > 0 ? "down" : "healthy")} borderRadius="full" px={3} py={1} whiteSpace="nowrap">
                {vpsHealth.byStatus.down > 0 ? `${vpsHealth.byStatus.down} down` : "No down service"}
              </Badge>
              {hasVpsIncident && (
                <Badge colorScheme="red" borderRadius="full" px={3} py={1} whiteSpace="nowrap">
                  Incident Mode
                </Badge>
              )}
            </HStack>
          </Flex>

          {!trendLoading && vpsHostTrendPoints.length > 0 && (
            <Box mt={4} borderRadius="16px" bg="rgba(9,15,26,0.55)" p={3} border="1px solid rgba(255,255,255,0.08)">
              <HStack spacing={3} mb={3} justify="space-between" align="center" flexWrap="wrap">
                <Text fontSize="sm" color="whiteAlpha.900" fontWeight="700">
                  {vpsComparisonNodes.length > 1
                    ? `VPS Host Pressure Trend (${vpsComparisonNodes.map((node) => node.toUpperCase()).join(" vs ")})`
                    : `${selectedVpsNode.toUpperCase()} Host Pressure Trend`}
                </Text>
                <HStack spacing={2} flexWrap="wrap" justify="flex-end">
                  {vpsComparisonNodes.map((node, index) => (
                    <HStack
                      key={`legend-${node}`}
                      spacing={1.5}
                      px={2}
                      py={1}
                      borderRadius="999px"
                      bg="rgba(255,255,255,0.05)"
                      border="1px solid rgba(255,255,255,0.12)"
                    >
                      <Box as="svg" width="18" height="8" viewBox="0 0 18 8" role="img" aria-label={index === 0 ? "solid line" : "dashed line"}>
                        <line
                          x1="1"
                          y1="4"
                          x2="17"
                          y2="4"
                          stroke="rgba(255,255,255,0.9)"
                          strokeWidth="2"
                          strokeDasharray={index === 0 ? undefined : "5 3"}
                          strokeLinecap="round"
                        />
                      </Box>
                      <Text fontSize="10px" color="whiteAlpha.900">{node.toUpperCase()}</Text>
                    </HStack>
                  ))}
                  {vpsComparisonNodes.length > 1 && (
                    <Text fontSize="10px" color="whiteAlpha.600" px={1}>
                      Solid = {vpsComparisonNodes[0]?.toUpperCase()} | Dashed = {vpsComparisonNodes[1]?.toUpperCase()}
                    </Text>
                  )}
                  {vpsHostCompactMetrics.map((item) => (
                    <Box key={item.key} px={2.5} py={1.5} borderRadius="10px" bg="rgba(255,255,255,0.05)" border="1px solid rgba(255,255,255,0.12)">
                      <Text fontSize="10px" color="whiteAlpha.700" lineHeight="1.1">{item.label}</Text>
                      <Text fontSize="sm" color="whiteAlpha.950" fontWeight="700" lineHeight="1.1">{item.value}</Text>
                    </Box>
                  ))}
                  <Button
                    size="xs"
                    variant={trendRange === "today" ? "solid" : "outline"}
                    onClick={() => setTrendRange("today")}
                    colorScheme="teal"
                  >
                    Today
                  </Button>
                  <Button
                    size="xs"
                    variant={trendRange === "7d" ? "solid" : "outline"}
                    onClick={() => setTrendRange("7d")}
                    colorScheme="teal"
                    title="7-day historical trend"
                  >
                    7D History
                  </Button>
                </HStack>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                {[
                  {
                    label: "Memory %",
                    color: "#34d399",
                    model: vpsHostMemoryModel,
                    compareModel: vpsComparisonNodes[1] ? vpsHostMetricModelsByNode?.[vpsComparisonNodes[1]]?.memory : null
                  },
                  {
                    label: "Disk %",
                    color: "#60a5fa",
                    model: vpsHostDiskModel,
                    compareModel: vpsComparisonNodes[1] ? vpsHostMetricModelsByNode?.[vpsComparisonNodes[1]]?.disk : null
                  },
                  {
                    label: "Swap %",
                    color: "#f59e0b",
                    model: vpsHostSwapModel,
                    compareModel: vpsComparisonNodes[1] ? vpsHostMetricModelsByNode?.[vpsComparisonNodes[1]]?.swap : null
                  },
                  {
                    label: "Load/Core %",
                    color: "#f87171",
                    model: vpsHostLoadModel,
                    compareModel: vpsComparisonNodes[1] ? vpsHostMetricModelsByNode?.[vpsComparisonNodes[1]]?.load : null
                  }
                ].map((metric) => (
                  <Box key={metric.label} p={3} borderRadius="12px" border="1px solid rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)">
                    <HStack justify="space-between" mb={2} align="flex-start">
                      <Text fontSize="xs" color="whiteAlpha.800">{metric.label}</Text>
                      <VStack spacing={0} align="flex-end">
                        <Text fontSize="xs" color="whiteAlpha.900" fontWeight="700" lineHeight="1.1">
                          {(() => {
                            const hovered = hostMetricHover[metric.label];
                            const point = Number.isFinite(hovered?.value) ? hovered : metric.model.latestPoint;
                            return Number.isFinite(point?.value) ? `${point.value.toFixed(1)}%` : "n/a";
                          })()}
                        </Text>
                        <Text fontSize="10px" color="whiteAlpha.600" lineHeight="1.1">
                          {(() => {
                            const hovered = hostMetricHover[metric.label];
                            const point = Number.isFinite(hovered?.value) ? hovered : metric.model.latestPoint;
                            return point?.label || "";
                          })()}
                        </Text>
                      </VStack>
                    </HStack>
                    <svg
                      width="100%"
                      height={metric.model.height}
                      viewBox={`0 0 ${metric.model.width} ${metric.model.height}`}
                      role="img"
                      aria-label={`VPS ${metric.label} trend chart`}
                      onMouseLeave={() => setHostMetricHover((prev) => ({ ...prev, [metric.label]: null }))}
                      onMouseMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const xPx = event.clientX - rect.left;
                        const x = (xPx / rect.width) * metric.model.width;
                        const nearest = (metric.model.plotPoints || [])
                          .filter((point) => Number.isFinite(point?.value))
                          .reduce((best, point) => {
                            if (!best) return point;
                            return Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best;
                          }, null);
                        setHostMetricHover((prev) => ({ ...prev, [metric.label]: nearest }));
                      }}
                    >
                      {(metric.model.yTicks || [0, 25, 50, 75, 100]).map((level, levelIndex) => {
                        const y = toChartY(level, metric.model.height, metric.model.padding, metric.model.yDomain);
                        return (
                          <g key={`${metric.label}-${level}`}>
                          <line
                            x1={metric.model.padding}
                            x2={metric.model.width - metric.model.padding}
                            y1={y}
                            y2={y}
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth="1"
                            strokeDasharray={levelIndex === 0 || levelIndex === ((metric.model.yTicks || [0, 25, 50, 75, 100]).length - 1) ? "0" : "4 4"}
                          />
                          <text
                            x={metric.model.padding - 6}
                            y={y + 3}
                            fill="rgba(255,255,255,0.6)"
                            fontSize="9"
                            textAnchor="end"
                          >
                            {Math.round(level)}
                          </text>
                          </g>
                        );
                      })}
                      {metric.model.path && (
                        <path d={metric.model.path} stroke={metric.color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
                      )}
                      {metric.compareModel?.path && (
                        <path
                          d={metric.compareModel.path}
                          stroke={metric.color}
                          opacity="0.6"
                          strokeWidth="2"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray="6 4"
                        />
                      )}
                      {metric.model.singlePointY != null && (
                        <circle cx={metric.model.width / 2} cy={metric.model.singlePointY} r="3.5" fill={metric.color} />
                      )}
                    </svg>
                    <HStack justify="space-between" mt={1} color="whiteAlpha.650" fontSize="xs">
                      <Text noOfLines={1}>{metric.model.xLabels.start}</Text>
                      <Text noOfLines={1} textAlign="right">{metric.model.xLabels.end}</Text>
                    </HStack>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}
          {!trendLoading && vpsHostTrendPoints.length === 0 && (
            <Box mt={4} borderRadius="12px" bg="rgba(9,15,26,0.35)" p={3} border="1px dashed rgba(255,255,255,0.16)">
              <Text fontSize="sm" color="whiteAlpha.800">
                VPS host pressure trend is unavailable for the selected range.
              </Text>
              <Text fontSize="xs" color="whiteAlpha.600" mt={1}>
                Waiting for recent VPS host samples in CTO logs.
              </Text>
            </Box>
          )}

          <HStack mt={4} spacing={2} flexWrap="wrap">
            {keySystemStatuses
              .filter((system) => system.label === "Supabase" || system.label === "Labit")
              .map((system) => (
                <Badge
                  key={system.label}
                  borderRadius="full"
                  px={3}
                  py={1}
                  colorScheme={statusColor(system.status)}
                  variant="subtle"
                >
                  {system.label}: {system.status}
                </Badge>
              ))}
            <Text fontSize="xs" color="whiteAlpha.650">
              If these turn degraded/down with high memory or disk pressure, start incident triage from VPS first.
            </Text>
          </HStack>

          {showVpsRunbook && (
            <Box
              mt={4}
              p={4}
              borderRadius="16px"
              bg={hasVpsIncident ? "rgba(248, 113, 113, 0.12)" : "rgba(56, 189, 248, 0.10)"}
              border={hasVpsIncident ? "1px solid rgba(248, 113, 113, 0.28)" : "1px solid rgba(56, 189, 248, 0.22)"}
            >
              <Text fontSize="sm" fontWeight="700" mb={2}>
                Incident First Steps {hasVpsIncident ? "(Auto-opened)" : ""}
              </Text>
              <VStack align="flex-start" spacing={1.5}>
                <Text fontSize="sm" color="whiteAlpha.900">1. Check <b>Supabase</b> and <b>Labit</b> badges above. If either is down/degraded, start there.</Text>
                <Text fontSize="sm" color="whiteAlpha.900">2. If Host Memory or Disk is high, reduce load first, then restart only the affected service.</Text>
                <Text fontSize="sm" color="whiteAlpha.900">3. Open Service Detail for the worst service and read latest message + payload before taking action.</Text>
                <Text fontSize="sm" color="whiteAlpha.900">4. If issue persists for 5+ minutes, escalate with timestamp and affected services.</Text>
              </VStack>
            </Box>
          )}
        </Box>

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

        <Grid templateColumns={{ base: "1fr" }} gap={4} mb={5}>
          <GridItem order={1}>
            <Box
              p={{ base: 4, md: 5 }}
              borderRadius="24px"
              bg="linear-gradient(180deg, rgba(26,37,55,0.96) 0%, rgba(13,23,38,0.98) 100%)"
              border="1px solid rgba(255,255,255,0.08)"
            >
              <HStack justify="space-between" mb={2} flexWrap="wrap">
                <Heading size="sm">Priority Issues</Heading>
                <Badge colorScheme={incidentFeed.length ? "red" : "green"} borderRadius="full" px={3} py={1}>
                  {incidentFeed.length ? `${incidentFeed.length} active` : "No active issue"}
                </Badge>
              </HStack>
              <Text color="whiteAlpha.700" mb={3} fontSize="sm">
                Quick attention strip. Click an item to inspect details.
              </Text>

              {incidentFeed.length === 0 && !loading && (
                <Box
                  p={3}
                  borderRadius="16px"
                  bg="rgba(255,255,255,0.04)"
                  border="1px solid rgba(255,255,255,0.08)"
                >
                  <Text fontSize="sm" color="whiteAlpha.760">No active degraded or down services.</Text>
                </Box>
              )}

              {incidentFeed.length > 0 && (
                <Stack
                  direction={{ base: "column", md: "row" }}
                  spacing={3}
                  overflowX={{ base: "visible", md: "auto" }}
                  pb={1}
                  align="stretch"
                  w="full"
                >
                  {incidentFeed.map((incident) => (
                    <Box
                      key={incident.service_key}
                      minW={{ base: "0", md: "300px" }}
                      w={{ base: "full", md: "auto" }}
                      p={3}
                      borderRadius="16px"
                      bg={selectedService?.service_key === incident.service_key ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}
                      border={selectedService?.service_key === incident.service_key ? "1px solid rgba(126,244,215,0.32)" : "1px solid rgba(255,255,255,0.08)"}
                      cursor="pointer"
                      _hover={{ bg: "rgba(255,255,255,0.07)" }}
                      onClick={() => openServiceRca(incident.service_key)}
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
                      <Text fontWeight="700" mb={1} noOfLines={1}>{incident.label || incident.service_key}</Text>
                      <Text fontSize="sm" color="whiteAlpha.760" noOfLines={2}>
                        {incident.message || "Service needs review."}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </GridItem>

          <GridItem order={2}>
            <Box
              ref={operationalSectionRef}
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
                            w="full"
                            minW={0}
                            overflow="hidden"
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
                            onClick={() => openServiceRca(service.service_key)}
                          >
                            <Flex justify="space-between" align="center" gap={3} w="full" minW={0}>
                              <Text fontSize="sm" flex="1" minW={0} noOfLines={1}>
                                {service.label || service.service_key}
                              </Text>
                              {isWhatsappMetric(service) ? (
                                <Box flexShrink={0} minW={0} maxW="54%">
                                  {formatWhatsappMetricValue(service).map((line, index) => (
                                    <Text
                                      key={`${service.service_key}-wm-${index}`}
                                      fontSize="xs"
                                      color={index === 0 ? "whiteAlpha.900" : "whiteAlpha.700"}
                                      textAlign="right"
                                      noOfLines={1}
                                    >
                                      {line}
                                    </Text>
                                  ))}
                                </Box>
                              ) : (
                                <Text fontSize="xs" color="whiteAlpha.700" flexShrink={0} whiteSpace="nowrap">
                                  {typeof service.latency_ms === "number" ? `${service.latency_ms} ms` : "n/a"}
                                </Text>
                              )}
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
        </Grid>

        <Grid templateColumns={{ base: "1fr", lg: "1.05fr 1fr" }} gap={5} mb={5}>
          <GridItem>
            <Box
              ref={detailSectionRef}
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
                    onClick={() => openServiceRca(item.service_key)}
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

                  {selectedIssueSamples.length > 0 && (
                    <Box p={4} borderRadius="18px" bg="rgba(10, 18, 30, 0.55)">
                      <HStack justify="space-between" mb={3}>
                        <Text fontSize="xs" color="whiteAlpha.600">
                          SLA Issue Samples (Last 1h)
                        </Text>
                        <Text fontSize="xs" color="whiteAlpha.700">
                          Showing {selectedIssueSamples.length}
                        </Text>
                      </HStack>
                      <Stack spacing={2}>
                        {selectedIssueSamples.map((sample, index) => (
                          <Box
                            key={`${sample?.phone || "unknown"}-${sample?.inbound_ist || "na"}-${sample?.outbound_ist || "na"}-${index}`}
                            p={2.5}
                            borderRadius="12px"
                            bg="rgba(255,255,255,0.03)"
                            border="1px solid rgba(255,255,255,0.08)"
                          >
                            <HStack justify="space-between" align="start" spacing={3}>
                              <VStack align="start" spacing={0}>
                                <HStack spacing={2}>
                                  <Badge
                                    colorScheme={String(sample?.issue_type || "").toLowerCase() === "no_reply" ? "red" : "yellow"}
                                    borderRadius="full"
                                  >
                                    {String(sample?.issue_type || "issue").replace(/_/g, " ")}
                                  </Badge>
                                  {sample?.phone ? (
                                    <Link href={`/admin/whatsapp/${encodeURIComponent(String(sample.phone))}`} style={{ color: "#7ef4d7", fontSize: "12px" }}>
                                      {sample.phone}
                                    </Link>
                                  ) : (
                                    <Text fontSize="xs" color="whiteAlpha.800">Unknown phone</Text>
                                  )}
                                </HStack>
                                <Text fontSize="xs" color="whiteAlpha.700" mt={1}>
                                  Inbound: {sample?.inbound_ist || "n/a"}{sample?.outbound_ist ? ` • Outbound: ${sample.outbound_ist}` : ""}
                                </Text>
                                <Text fontSize="xs" color="whiteAlpha.700">
                                  Delay: {Number.isFinite(sample?.response_delay_seconds) ? `${sample.response_delay_seconds}s` : "No reply in window"}
                                </Text>
                              </VStack>
                            </HStack>
                            {sample?.inbound_text && (
                              <Text fontSize="xs" color="whiteAlpha.800" mt={2} noOfLines={2}>
                                "{sample.inbound_text}"
                              </Text>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}

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
                            {formatPayloadValue(key, value)}
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

        <Box
          ref={trendsSectionRef}
          p={{ base: 5, md: 6 }}
          borderRadius="28px"
          bg="rgba(255,255,255,0.05)"
          border="1px solid rgba(255,255,255,0.08)"
          mb={5}
        >
          <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} mb={4} flexWrap="wrap">
            <Box>
              <Heading size="md" mb={1}>Historical Trends</Heading>
              <Text color="whiteAlpha.700">Compact reliability trend over time.</Text>
            </Box>
            <HStack spacing={2}>
              <Select
                size="sm"
                value={trendRange}
                onChange={(e) => setTrendRange(e.target.value)}
                maxW="170px"
                bg="rgba(11, 19, 32, 0.72)"
                borderColor="rgba(255,255,255,0.18)"
              >
                {TREND_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </HStack>
          </Flex>

          {trendError && (
            <Box mb={4} p={3} borderRadius="14px" bg="rgba(248,113,113,0.12)" border="1px solid rgba(248,113,113,0.28)">
              <Text color="red.200" fontSize="sm">{trendError}</Text>
            </Box>
          )}

          <SimpleGrid columns={{ base: 2, md: 3, xl: 6 }} spacing={3} mb={4}>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Total checks</Text>
              <Text fontWeight="700">{trendData?.summary?.total_checks ?? 0}</Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Healthy rate</Text>
              <Text fontWeight="700">
                {typeof trendData?.summary?.healthy_rate === "number" ? `${Math.round(trendData.summary.healthy_rate * 100)}%` : "n/a"}
              </Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Down rate</Text>
              <Text fontWeight="700">
                {typeof trendData?.summary?.down_rate === "number" ? `${Math.round(trendData.summary.down_rate * 100)}%` : "n/a"}
              </Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Avg latency</Text>
              <Text fontWeight="700">
                {typeof trendData?.summary?.avg_latency_ms === "number" ? `${Math.round(trendData.summary.avg_latency_ms)} ms` : "n/a"}
              </Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Digest rows</Text>
              <Text fontWeight="700">{Number(trendSource?.digest_rows || 0)}</Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Raw rows</Text>
              <Text fontWeight="700">{Number(trendSource?.raw_rows || 0)}</Text>
            </Box>
          </SimpleGrid>

          <HStack spacing={2} mb={4} flexWrap="wrap">
            <Badge
              borderRadius="full"
              px={3}
              py={1}
              bg="rgba(16,185,129,0.18)"
              color="green.200"
            >
              WoW Healthy: {trendWow.hasData && trendWow.healthy_delta_pct_points != null ? `${trendWow.healthy_delta_pct_points >= 0 ? "+" : ""}${trendWow.healthy_delta_pct_points} pp` : "n/a"}
            </Badge>
            <Badge
              borderRadius="full"
              px={3}
              py={1}
              bg="rgba(248,113,113,0.18)"
              color="red.200"
            >
              WoW Down: {trendWow.hasData && trendWow.down_delta_pct_points != null ? `${trendWow.down_delta_pct_points >= 0 ? "+" : ""}${trendWow.down_delta_pct_points} pp` : "n/a"}
            </Badge>
            <Badge
              borderRadius="full"
              px={3}
              py={1}
              bg="rgba(56,189,248,0.18)"
              color="blue.200"
            >
              WoW Latency: {trendWow.hasData && trendWow.latency_delta_ms != null ? `${trendWow.latency_delta_ms >= 0 ? "+" : ""}${trendWow.latency_delta_ms} ms` : "n/a"}
            </Badge>
          </HStack>
          {!trendWow.hasData && trendWow.reason && (
            <Text fontSize="xs" color="whiteAlpha.700" mb={4}>
              WoW unavailable: {trendWow.reason}
            </Text>
          )}
          {!trendIsHourlyBucket && Number(trendSource?.digest_rows || 0) === 0 && (
            <Box mb={4} p={3} borderRadius="12px" bg="rgba(250,204,21,0.12)" border="1px solid rgba(250,204,21,0.28)">
              <Text fontSize="xs" color="yellow.200">
                Daily digest is empty. Long-range trends rely mostly on compacted daily digest data.
              </Text>
              <Text fontSize="xs" color="whiteAlpha.800" mt={1}>
                Raw rows in this range: {Number(trendSource?.raw_rows || 0)}. This usually means CTO compaction has not run yet for selected days.
              </Text>
              <Text fontSize="xs" color="whiteAlpha.700" mt={1}>
                Expected pipeline: collector ingest → `/api/cto/compact` daily compaction (token-auth) → digest-backed trends.
              </Text>
            </Box>
          )}

          {trendLoading && (
            <Text fontSize="sm" color="whiteAlpha.700">Loading trends...</Text>
          )}

          {!trendLoading && trendPoints.length === 0 && trendComparePoints.length === 0 && (
            <Text fontSize="sm" color="whiteAlpha.700">No historical points yet. Run digest once data is ingested.</Text>
          )}

          {!trendLoading && (trendPoints.length > 0 || trendComparePoints.length > 0) && (
            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
              {[
                {
                  key: trendVpsServiceKey || "all_vps",
                  label: trendVpsServiceKey || `All ${selectedVpsNode.toUpperCase()}`,
                  model: trendChartModel,
                  selectedServiceKey: trendVpsServiceKey,
                  options: trendVpsServiceOptions,
                  allLabel: `All ${selectedVpsNode.toUpperCase()}`,
                  onChange: (value) => setTrendVpsServiceKey(value),
                },
                {
                  key: trendLocalServiceKey || "all_local",
                  label: trendLocalServiceKey || "All Local",
                  model: trendCompareChartModel,
                  selectedServiceKey: trendLocalServiceKey,
                  options: trendLocalServiceOptions,
                  allLabel: "All Local",
                  onChange: (value) => setTrendLocalServiceKey(value),
                }
              ]
                .map((item) => (
                  <Box key={item.key} borderRadius="16px" bg="rgba(9,15,26,0.55)" p={3} border="1px solid rgba(255,255,255,0.08)">
                    {(() => {
                      const uptime = computeChartUptimeDowntime(item.model?.points || [], !item.selectedServiceKey);
                      return (
                        <HStack spacing={2} mb={2} flexWrap="wrap">
                          <Badge borderRadius="full" px={2} py={0.5} bg="rgba(74,222,128,0.14)" color="green.200">
                            Uptime: {uptime.uptimeLabel}
                          </Badge>
                          <Badge borderRadius="full" px={2} py={0.5} bg="rgba(248,113,113,0.14)" color="red.200">
                            Downtime: {uptime.downtimeLabel}
                          </Badge>
                        </HStack>
                      );
                    })()}
                    <HStack spacing={3} mb={2} justify="space-between" align="center" flexWrap="wrap">
                      <HStack spacing={2}>
                        <Box w={3} h={3} borderRadius="full" bg="#34d399" />
                        <Text fontSize="xs" color="whiteAlpha.900" fontWeight="700">
                          {item.label}
                        </Text>
                      </HStack>
                      <Select
                        size="xs"
                        value={item.selectedServiceKey}
                        onChange={(e) => item.onChange(e.target.value)}
                        maxW={{ base: "100%", md: "280px" }}
                        bg="rgba(11, 19, 32, 0.72)"
                        borderColor="rgba(255,255,255,0.18)"
                      >
                        <option value="">{item.allLabel}</option>
                        {item.options.map((serviceKey) => (
                          <option key={serviceKey} value={serviceKey}>
                            {serviceKey}
                          </option>
                        ))}
                      </Select>
                    </HStack>

                    <svg
                      width="100%"
                      height={item.model.height}
                      viewBox={`0 0 ${item.model.width} ${item.model.height}`}
                      role="img"
                      aria-label={`${item.label} historical trend chart`}
                    >
                      {[0, 25, 50, 75, 100].map((level) => {
                        const y = toChartY(level, item.model.height, item.model.padding);
                        return (
                          <g key={level}>
                            <line
                              x1={item.model.padding}
                              x2={item.model.width - item.model.padding}
                              y1={y}
                              y2={y}
                              stroke="rgba(255,255,255,0.14)"
                              strokeWidth="1"
                              strokeDasharray={level === 0 || level === 100 ? "0" : "4 4"}
                            />
                            <text
                              x={6}
                              y={y + 4}
                              fill="rgba(255,255,255,0.58)"
                              fontSize="10"
                            >
                              {level}
                            </text>
                          </g>
                        );
                      })}

                      <path d={item.model.healthyPath} stroke="#34d399" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    </svg>

                    {!item.model.hasPath && (
                      <Text mt={2} fontSize="xs" color="whiteAlpha.700">
                        Trend line unavailable for this selection and range.
                      </Text>
                    )}

                    <HStack justify="space-between" mt={2} color="whiteAlpha.700" fontSize="xs">
                      <Text noOfLines={1} maxW="32%">{item.model.xLabels.start}</Text>
                      <Text noOfLines={1} maxW="32%" textAlign="center">{item.model.xLabels.mid}</Text>
                      <Text noOfLines={1} maxW="32%" textAlign="right">{item.model.xLabels.end}</Text>
                    </HStack>
                  </Box>
                ))}
            </SimpleGrid>
          )}

        </Box>

        <Box
          ref={feedbackSectionRef}
          p={{ base: 5, md: 6 }}
          borderRadius="28px"
          bg="rgba(255,255,255,0.05)"
          border="1px solid rgba(255,255,255,0.08)"
          mb={5}
        >
          <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} mb={4} flexWrap="wrap">
            <Box>
              <Heading size="md" mb={1}>Feedback Insights</Heading>
              <Text color="whiteAlpha.700">Patient satisfaction trends by period.</Text>
            </Box>
            <HStack spacing={2}>
              <Select
                size="sm"
                value={feedbackPeriod}
                onChange={(e) => setFeedbackPeriod(e.target.value)}
                maxW="170px"
                bg="rgba(11, 19, 32, 0.72)"
                borderColor="rgba(255,255,255,0.18)"
              >
                <option value="day">Day</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </Select>
            </HStack>
          </Flex>

          {feedbackError && (
            <Box mb={4} p={3} borderRadius="14px" bg="rgba(248,113,113,0.12)" border="1px solid rgba(248,113,113,0.28)">
              <Text color="red.200" fontSize="sm">{feedbackError}</Text>
            </Box>
          )}

          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3} mb={4}>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Total feedback</Text>
              <Text fontWeight="700">{feedbackData?.summary?.total_feedback ?? 0}</Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Avg rating</Text>
              <Text fontWeight="700">
                {typeof feedbackData?.summary?.avg_rating === "number" ? `${feedbackData.summary.avg_rating}/5` : "n/a"}
              </Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Positive rate (4-5)</Text>
              <Text fontWeight="700">
                {typeof feedbackData?.summary?.positive_rate === "number" ? `${Math.round(feedbackData.summary.positive_rate * 100)}%` : "n/a"}
              </Text>
            </Box>
            <Box p={3} borderRadius="14px" bg="rgba(255,255,255,0.04)">
              <Text fontSize="xs" color="whiteAlpha.700" mb={1}>Negative rate (1-2)</Text>
              <Text fontWeight="700">
                {typeof feedbackData?.summary?.negative_rate === "number" ? `${Math.round(feedbackData.summary.negative_rate * 100)}%` : "n/a"}
              </Text>
            </Box>
          </SimpleGrid>

          {feedbackLoading && (
            <Text fontSize="sm" color="whiteAlpha.700">Loading feedback analytics...</Text>
          )}

          {!feedbackLoading && (
            <Grid templateColumns={{ base: "1fr", lg: "1.2fr 1fr" }} gap={4}>
              <Box borderRadius="16px" bg="rgba(9,15,26,0.55)" p={3} border="1px solid rgba(255,255,255,0.08)">
                <HStack spacing={2} mb={3} flexWrap="wrap">
                  {(feedbackData?.categories || []).map((category) => (
                    <Button
                      key={category.key}
                      size="xs"
                      variant={feedbackCategory === category.key ? "solid" : "outline"}
                      colorScheme={feedbackCategory === category.key ? "teal" : "whiteAlpha"}
                      onClick={() => setFeedbackCategory(category.key)}
                    >
                      {category.label} ({category?.summary?.total_feedback || 0})
                    </Button>
                  ))}
                </HStack>
                <Text fontSize="sm" mb={3} color="whiteAlpha.900" fontWeight="600">Trend by {feedbackPeriod}</Text>
                <Stack spacing={3}>
                  {(selectedFeedbackCategory?.points || []).length ? selectedFeedbackCategory.points.slice(-12).map((point) => (
                    <Box key={point.key}>
                      <Flex justify="space-between" mb={1}>
                        <Text fontSize="xs" color="whiteAlpha.700">{point.label}</Text>
                        <Text fontSize="xs" color="whiteAlpha.700">
                          {point.total} · {typeof point.avg_rating === "number" ? `${point.avg_rating}/5` : "n/a"}
                        </Text>
                      </Flex>
                      <Progress
                        value={typeof point.positive_rate === "number" ? Math.round(point.positive_rate * 100) : 0}
                        colorScheme="green"
                        borderRadius="full"
                        bg="whiteAlpha.200"
                        size="sm"
                      />
                      <Button
                        mt={2}
                        size="xs"
                        variant="ghost"
                        color="whiteAlpha.800"
                        onClick={() => openFeedbackDetails(point, selectedFeedbackCategory)}
                      >
                        View details
                      </Button>
                    </Box>
                  )) : (
                    <Text fontSize="sm" color="whiteAlpha.700">No feedback data for selected category/period.</Text>
                  )}
                </Stack>
              </Box>

              <Box borderRadius="16px" bg="rgba(9,15,26,0.55)" p={3} border="1px solid rgba(255,255,255,0.08)">
                <Text fontSize="sm" mb={3} color="whiteAlpha.900" fontWeight="600">Top feedback sources</Text>
                <Stack spacing={2}>
                  {feedbackData?.top_sources?.length ? feedbackData.top_sources.map((sourceRow) => (
                    <Flex key={sourceRow.source} justify="space-between">
                      <Text fontSize="sm" color="whiteAlpha.800">{sourceRow.source}</Text>
                      <Text fontSize="sm" color="whiteAlpha.900">{sourceRow.count}</Text>
                    </Flex>
                  )) : (
                    <Text fontSize="sm" color="whiteAlpha.700">No source breakdown yet.</Text>
                  )}
                </Stack>
              </Box>
            </Grid>
          )}
        </Box>

        <Box
          ref={eventsSectionRef}
          p={{ base: 5, md: 6 }}
          borderRadius="28px"
          bg="rgba(255,255,255,0.05)"
          border="1px solid rgba(255,255,255,0.08)"
          mb={5}
        >
          <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} mb={4} flexWrap="wrap">
            <Box>
              <Heading size="md" mb={1}>Ops Events</Heading>
              <Text color="whiteAlpha.700">Human-readable incident queue for CTO operations.</Text>
            </Box>
            <HStack spacing={2} flexWrap="wrap">
              <Select
                size="sm"
                value={eventsStatusFilter}
                onChange={(e) => setEventsStatusFilter(e.target.value)}
                maxW="170px"
                bg="rgba(11, 19, 32, 0.72)"
                borderColor="rgba(255,255,255,0.18)"
              >
                <option value="">All status</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </Select>
              <Select
                size="sm"
                value={eventsSeverityFilter}
                onChange={(e) => setEventsSeverityFilter(e.target.value)}
                maxW="170px"
                bg="rgba(11, 19, 32, 0.72)"
                borderColor="rgba(255,255,255,0.18)"
              >
                <option value="">All severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="info">Info</option>
              </Select>
            </HStack>
          </Flex>

          {eventsError && (
            <Box mb={3} p={3} borderRadius="14px" bg="rgba(248,113,113,0.12)" border="1px solid rgba(248,113,113,0.28)">
              <Text color="red.200" fontSize="sm">{eventsError}</Text>
            </Box>
          )}

          <Box overflowX="auto">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th color="whiteAlpha.800">Severity</Th>
                  <Th color="whiteAlpha.800">Status</Th>
                  <Th color="whiteAlpha.800">Service</Th>
                  <Th color="whiteAlpha.800">Type</Th>
                  <Th color="whiteAlpha.800">Message</Th>
                  <Th color="whiteAlpha.800">Source</Th>
                  <Th color="whiteAlpha.800">Count</Th>
                  <Th color="whiteAlpha.800">Last Seen</Th>
                  <Th color="whiteAlpha.800">Action</Th>
                </Tr>
              </Thead>
              <Tbody>
                {!eventsLoading && eventsRows.length === 0 && (
                  <Tr>
                    <Td colSpan={9} color="whiteAlpha.700">No events found. Events populate from complaint capture and `/api/cto/events` ingest.</Td>
                  </Tr>
                )}
                {eventsRows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <StatusChip status={row.severity || "info"} color={row.severity === "critical" ? "red" : row.severity === "high" ? "orange" : row.severity === "medium" ? "yellow" : "blue"} />
                    </Td>
                    <Td>
                      <StatusChip status={row.status || "open"} color={row.status === "resolved" ? "green" : row.status === "acknowledged" ? "purple" : "red"} />
                    </Td>
                    <Td color="whiteAlpha.900">{row.service_key || "-"}</Td>
                    <Td color="whiteAlpha.800">{row.event_type || "-"}</Td>
                    <Td maxW="360px" color="whiteAlpha.900">
                      <Text noOfLines={2}>{row.message || "-"}</Text>
                    </Td>
                    <Td color="whiteAlpha.700">{row.source || "-"}</Td>
                    <Td color="whiteAlpha.900">
                      {row.event_type === "pm2_restart_storm_24h" && Number.isFinite(Number(row?.payload?.restarts_24h))
                        ? Number(row.payload.restarts_24h)
                        : (row.occurrence_count ?? 1)}
                    </Td>
                    <Td color="whiteAlpha.700">
                      {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "-"}
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant="outline"
                          borderColor="rgba(255,255,255,0.25)"
                          color="whiteAlpha.900"
                          _hover={{ bg: "whiteAlpha.120" }}
                          isDisabled={row.status === "acknowledged" || row.status === "resolved" || eventActionBusy[row.id]}
                          onClick={() => updateEventStatus(row.id, "acknowledged")}
                        >
                          Ack
                        </Button>
                        <Button
                          size="xs"
                          colorScheme="green"
                          isDisabled={row.status === "resolved" || eventActionBusy[row.id]}
                          onClick={() => updateEventStatus(row.id, "resolved")}
                        >
                          Resolve
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>
        </>
        )}
      </Box>

      <Modal isOpen={smartReportModal.isOpen} onClose={smartReportModal.onClose} isCentered>
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent bg="#111827" color="white" border="1px solid rgba(255,255,255,0.12)">
          <ModalHeader>SMART Report* (Experimental)</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" color="whiteAlpha.800" mb={2}>
              Enter MRNO to open or download the Smart Trends PDF.
            </Text>
            <Input
              value={smartMrnoInput}
              onChange={(e) => setSmartMrnoInput(e.target.value)}
              placeholder="MRNO"
              bg="rgba(11, 19, 32, 0.72)"
              borderColor="rgba(255,255,255,0.2)"
            />
          </ModalBody>
          <ModalFooter>
            <HStack spacing={2}>
              <Button variant="ghost" onClick={smartReportModal.onClose}>Close</Button>
              <Button
                colorScheme="blue"
                variant="outline"
                onClick={() => openSmartReportExperimental("open")}
                isDisabled={!String(smartMrnoInput || "").trim()}
              >
                Open PDF
              </Button>
              <Button
                colorScheme="blue"
                onClick={() => openSmartReportExperimental("download")}
                isDisabled={!String(smartMrnoInput || "").trim()}
              >
                Download PDF
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={feedbackDetailsModal.isOpen} onClose={feedbackDetailsModal.onClose} size="4xl" isCentered>
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent bg="#111827" color="white" border="1px solid rgba(255,255,255,0.12)">
          <ModalHeader>{feedbackDetailsTitle || "Feedback details"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {feedbackDetailsError && (
              <Box mb={3} p={3} borderRadius="12px" bg="rgba(248,113,113,0.12)" border="1px solid rgba(248,113,113,0.28)">
                <Text color="red.200" fontSize="sm">{feedbackDetailsError}</Text>
              </Box>
            )}
            {feedbackDetailsLoading ? (
              <Text fontSize="sm" color="whiteAlpha.700">Loading details...</Text>
            ) : (
              <Box overflowX="auto">
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th color="whiteAlpha.800">Time</Th>
                      <Th color="whiteAlpha.800">Phone</Th>
                      <Th color="whiteAlpha.800">Rating</Th>
                      <Th color="whiteAlpha.800">Source</Th>
                      <Th color="whiteAlpha.800">Comment</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {feedbackDetailsRows.length === 0 && (
                      <Tr>
                        <Td colSpan={5} color="whiteAlpha.700">No feedback rows found for this bucket.</Td>
                      </Tr>
                    )}
                    {feedbackDetailsRows.map((row) => (
                      <Tr key={row.id || `${row.created_at}-${row.patient_phone}-${row.reqno || ""}`}>
                        <Td color="whiteAlpha.800">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                        </Td>
                        <Td color="whiteAlpha.900">{row.patient_phone || "-"}</Td>
                        <Td color="whiteAlpha.900">{row.rating || "-"}</Td>
                        <Td color="whiteAlpha.800">{row.source || row.captured_via || "-"}</Td>
                        <Td color="whiteAlpha.900">
                          <Text noOfLines={3}>{row.feedback || "-"}</Text>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={feedbackDetailsModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
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
