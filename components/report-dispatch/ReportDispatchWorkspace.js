"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Flex,
  HStack,
  IconButton,
  Input,
  Switch,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Tooltip,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { Activity, ChevronLeft, ChevronRight, Clock, Download, ExternalLink, Files, FlaskConical, LayoutList, LineChart, List, Package, Pause, Play, Printer, RefreshCw, Scan, Search, Share2, TrendingUp, UploadCloud } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import dayjs from "dayjs";
import ShortcutBar from "@/components/ShortcutBar";
import SendReportTemplateModal from "@/components/report-dispatch/SendReportTemplateModal";
import { ActionBtn, DataCell, DeptChip, PageHeader, Pane, ReadyBar, SegmentedControl, StatusPill } from "@/components/ui";

const ADMIN_THEME_STORAGE_KEY = "labbit-admin-dashboard-theme";
const DAILY_PAGE_SIZE = 10;
const AUTO_JOBS_PAGE_SIZE = 12;
const IST_TIMEZONE = "Asia/Kolkata";
const ENABLE_OUTSOURCED_MANUAL_DISPATCH =
  String(process.env.NEXT_PUBLIC_ENABLE_OUTSOURCED_MANUAL_DISPATCH || "").trim() === "1";

function toneByMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  if (m === "allow_full" || m === "try_pending_print_once") return "green";
  if (m === "manual_review") return "orange";
  return "gray";
}

function derivePillStatus(tone, overallStatus) {
  if (tone === "green") return "ready";
  if (tone === "orange") return "pending";
  const s = String(overallStatus || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "FULL_REPORT" || s.includes("FULL")) return "ready";
  if (s.includes("PARTIAL") || s.includes("PENDING")) return "pending";
  return "closed";
}

function displayValue(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function yesNo(value) {
  const text = String(value || "").trim();
  if (text === "1" || /^y(es)?$/i.test(text) || /^true$/i.test(text)) return "Yes";
  if (!text) return "-";
  return "No";
}

function friendlyOutsourcedMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "attached_base" || mode === "attached_qr") return "PDF Attachment";
  if (mode === "transcribed") return "In Main Report";
  if (!mode || mode === "unavailable") return "Unavailable";
  return mode;
}

function friendlyResolver(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "ok") return "PDF Found";
  if (text === "denied") return "Not Allowed";
  if (!text) return "-";
  return text;
}

function friendlyRoute(value) {
  const text = String(value || "").trim();
  if (text.includes("Send separately")) return "Send as separate PDF";
  if (text.includes("Included in /report")) return "Already in main report";
  if (text.includes("SOURCE_CONFIDENTIAL_DO_NOT_SEND")) return "Do not send";
  return text || "-";
}

function istDayBounds(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const startMs = Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) - (5.5 * 60 * 60 * 1000);
  return { start: startMs, end: startMs + 86400000 };
}

function parseTimestamp(value, options = {}) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const naiveTz = String(options?.naiveTz || "ist").toLowerCase();
  // Normalize common SQL timestamp shapes to strict ISO before Date parsing.
  // Examples:
  // - 2026-05-05 15:31:00+00
  // - 2026-05-05 15:31:00+00:00
  // - 2026-05-05 15:31:00Z
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(raw)) {
    let iso = raw.replace(" ", "T");
    iso = iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"); // +0000 => +00:00
    const dt = new Date(iso);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
    if (naiveTz === "utc") return new Date(`${raw.replace(" ", "T")}Z`);
    return new Date(`${raw.replace(" ", "T")}+05:30`);
  }
  return new Date(raw);
}

function byReqnoDesc(a, b) {
  const ra = String(a?.reqno || "").trim();
  const rb = String(b?.reqno || "").trim();
  const na = Number(ra);
  const nb = Number(rb);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return nb - na;
  return rb.localeCompare(ra);
}

function formatIstDateTime(value, options = {}) {
  if (!value) return "-";
  const dt = parseTimestamp(value, options);
  if (Number.isNaN(dt.getTime())) return displayValue(value);
  return dt.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function formatIstDateAndTimeLines(value, options = {}) {
  if (!value) return { date: "-", time: "-" };
  const dt = parseTimestamp(value, options);
  if (Number.isNaN(dt.getTime())) return { date: displayValue(value), time: "-" };
  const date = dt.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short"
  });
  const time = dt.toLocaleTimeString("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return { date, time };
}

function queueTimeForDisplay(job) {
  const raw = job?.scheduled_at || job?.next_attempt_at;
  return raw;
}

function deriveDeliveryStatus(job) {
  const pr = job?.provider_response;
  const payload = typeof pr === "string" ? (() => { try { return JSON.parse(pr); } catch { return null; } })() : pr;
  const explicit = String(job?.delivery_status || "").trim().toLowerCase();
  const direct = String(
    payload?.delivery_status ||
      payload?.message_status ||
      payload?.status ||
      payload?.deliveryState ||
      payload?.provider_response?.status ||
      ""
  ).trim().toLowerCase();
  const nested = String(
    payload?.statuses?.[0]?.status ||
      payload?.messages?.[0]?.status ||
      payload?.provider_response?.statuses?.[0]?.status ||
      payload?.provider_response?.messages?.[0]?.status ||
      ""
  ).trim().toLowerCase();
  const baseStatus = String(job?.status || "").trim().toLowerCase();
  const candidates = [explicit, nested, direct].filter(Boolean);
  if (candidates.includes("read")) return "read";
  if (candidates.includes("delivered")) return "delivered";
  if (candidates.includes("sent")) return "sent";
  if (candidates.includes("failed")) return "failed";
  if (["queued", "retrying", "cooling_off"].includes(baseStatus)) return baseStatus;
  if (baseStatus === "sent") return "sent";
  return "queued";
}

function extractProviderMessageId(job) {
  const pr = job?.provider_response;
  const payload = typeof pr === "string" ? (() => { try { return JSON.parse(pr); } catch { return null; } })() : pr;
  const direct = String(payload?.provider_message_id || "").trim();
  if (direct) return direct;
  const nested = String(payload?.provider_response?.messages?.[0]?.id || "").trim();
  if (nested) return nested;
  const fallback = String(payload?.messages?.[0]?.id || payload?.message_id || payload?.id || "").trim();
  return fallback || null;
}

function stateHint(job) {
  if (job?.is_paused) {
    return `Paused manually${job?.updated_at ? ` at ${formatIstDateTime(job?.updated_at)}` : ""}`;
  }
  const status = String(job?.status || "").trim().toLowerCase();
  if (status === "cooling_off") {
    return `Cooling until ${formatIstDateTime(queueTimeForDisplay(job))}`;
  }
  if (status === "queued") {
    return `Waiting readiness check (next ${formatIstDateTime(queueTimeForDisplay(job))})`;
  }
  if (status === "retrying") {
    return `Retry scheduled at ${formatIstDateTime(queueTimeForDisplay(job))}`;
  }
  if (status === "eligible") {
    return "Ready to send on next worker cycle";
  }
  if (status === "processing") {
    return "Worker is evaluating readiness and dispatch rules";
  }
  if (status === "skipped") {
    return "Skipped in this cycle based on readiness/dispatch rules";
  }
  if (status === "sent") {
    return `Sent at ${formatIstDateTime(job?.sent_at)}`;
  }
  if (status === "failed") {
    return "Max retries reached or terminal send failure";
  }
  return "-";
}

function smartTimestamp(job) {
  if (job?.is_paused) return `PAUSED: ${formatIstDateTime(job?.updated_at || queueTimeForDisplay(job))}`;
  const status = String(job?.status || "").trim().toLowerCase();
  if (status === "cooling_off") return `COOLING_OFF: ${formatIstDateTime(queueTimeForDisplay(job))}`;
  if (status === "queued") return `QUEUED: ${formatIstDateTime(queueTimeForDisplay(job))}`;
  if (status === "retrying") return `RETRYING: ${formatIstDateTime(queueTimeForDisplay(job))}`;
  if (status === "eligible") return `ELIGIBLE: ${formatIstDateTime(queueTimeForDisplay(job))}`;
  if (status === "sending") return `SENDING: ${formatIstDateTime(job?.last_attempt_at)}`;
  if (status === "sent") return `SENT: ${formatIstDateTime(job?.sent_at)}`;
  if (status === "failed") return `FAILED: ${formatIstDateTime(job?.updated_at)}`;
  return `${String(status || "UPDATED").toUpperCase()}: ${formatIstDateTime(job?.updated_at)}`;
}

function timelineParts(job) {
  if (job?.is_paused) return { label: "PAUSED", ...formatIstDateAndTimeLines(job?.updated_at || queueTimeForDisplay(job)) };
  const status = String(job?.status || "").trim().toLowerCase();
  if (status === "cooling_off") return { label: "COOLING_OFF", ...formatIstDateAndTimeLines(queueTimeForDisplay(job)) };
  if (status === "queued") return { label: "QUEUED", ...formatIstDateAndTimeLines(queueTimeForDisplay(job)) };
  if (status === "retrying") return { label: "RETRYING", ...formatIstDateAndTimeLines(queueTimeForDisplay(job)) };
  if (status === "eligible") return { label: "ELIGIBLE", ...formatIstDateAndTimeLines(queueTimeForDisplay(job)) };
  if (status === "sending") return { label: "SENDING", ...formatIstDateAndTimeLines(job?.last_attempt_at) };
  if (status === "sent") return { label: "SENT", ...formatIstDateAndTimeLines(job?.sent_at) };
  if (status === "failed") return { label: "FAILED", ...formatIstDateAndTimeLines(job?.updated_at) };
  return { label: String(status || "UPDATED").toUpperCase(), ...formatIstDateAndTimeLines(job?.updated_at) };
}

function parseSnapshot(snapshot) {
  if (!snapshot) return null;
  if (typeof snapshot === "object") return snapshot;
  if (typeof snapshot === "string") {
    try {
      return JSON.parse(snapshot);
    } catch {
      return null;
    }
  }
  return null;
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function humanizeSkipReason(reason) {
  const key = String(reason || "").trim().toLowerCase();
  if (!key) return "";
  if (key === "no_lab_or_radiology_tests") return "No reportable lab/radiology tests";
  if (key === "non_reportable_by_policy") return "Non-reportable by policy";
  if (key === "reactivate_from_skipped_reportable") return "Reactivated when reportable tests appeared";
  return key.replaceAll("_", " ");
}

function reqDateFromReqno(reqno) {
  const raw = String(reqno || "").trim();
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function pickNewestJob(a, b) {
  const ta = parseTimestamp(a?.updated_at || a?.created_at)?.getTime() || 0;
  const tb = parseTimestamp(b?.updated_at || b?.created_at)?.getTime() || 0;
  if (tb !== ta) return tb > ta ? b : a;
  const ia = Number(a?.id || 0);
  const ib = Number(b?.id || 0);
  return ib >= ia ? b : a;
}

function collapseByReqno(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const reqno = String(row?.reqno || "").trim();
    if (!reqno) continue;
    const prev = map.get(reqno);
    map.set(reqno, prev ? pickNewestJob(prev, row) : row);
  }
  return Array.from(map.values());
}

function queuedBlockers(job) {
  const snap = parseSnapshot(job?.last_status_snapshot);
  const tests = Array.isArray(snap?.tests) ? snap.tests : [];
  const pending = tests
    .filter((row) => String(row?.SAMEDAYREPORT || row?.samedayreport || "").trim() === "1")
    .filter((row) => {
      const approved = String(row?.APPROVEDFLG || row?.approvedflg || "").trim() === "1";
      const reportStatus = String(row?.REPORT_STATUS || row?.report_status || "").trim().toUpperCase();
      return !(approved || reportStatus === "LAB_READY" || reportStatus === "RADIOLOGY_READY");
    })
    .map((row) => String(row?.TESTNM || row?.testnm || row?.test_name || "").trim())
    .filter(Boolean);
  if (!pending.length) return "";
  const short = pending.slice(0, 2).join(", ");
  return pending.length > 2 ? `${short} +${pending.length - 2} more` : short;
}

function buildWhyText(job) {
  const history = job?.reqno_history && typeof job.reqno_history === "object" ? job.reqno_history : null;
  const historyTotal = Number(history?.total_rows || 0);
  const historyCounts = history?.status_counts && typeof history.status_counts === "object" ? history.status_counts : {};
  const historyText =
    historyTotal > 1
      ? `History: ${historyTotal} rows (${Object.entries(historyCounts)
          .filter(([, count]) => Number(count) > 0)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .map(([st, count]) => `${count} ${String(st).toUpperCase()}`)
          .join(", ")})`
      : "";

  if (job?.is_paused) {
    const snap = parseSnapshot(job?.last_status_snapshot) || {};
    const labReady = Number(snap?.lab_ready ?? 0);
    const labTotal = Number(snap?.lab_total ?? 0);
    const radReady = Number(snap?.radiology_ready ?? 0);
    const radTotal = Number(snap?.radiology_total ?? 0);
    const blockers = queuedBlockers(job);
    const decision = snap?.decision && typeof snap.decision === "object" ? snap.decision : {};
    const decisionReason = String(decision?.reason || "").trim();
    const readyText =
      Number.isFinite(labTotal + radTotal) && (labTotal > 0 || radTotal > 0)
        ? `Ready Lab ${labReady}/${labTotal}, Scan ${radReady}/${radTotal}`
        : "";
    const parts = [];
    if (readyText) parts.push(readyText);
    if (blockers) parts.push(`Pending tests: ${blockers}`);
    if (decisionReason) parts.push(decisionReason);
    if (historyText) parts.push(historyText);
    return parts.join(" • ") || "-";
  }
  const status = String(job?.status || "").trim().toLowerCase();
  const snap = parseSnapshot(job?.last_status_snapshot) || {};
  const meta = parseMetadata(job?.metadata);
  const decision = snap?.decision && typeof snap.decision === "object" ? snap.decision : {};
  const labReady = Number(snap?.lab_ready ?? 0);
  const labTotal = Number(snap?.lab_total ?? 0);
  const radReady = Number(snap?.radiology_ready ?? 0);
  const radTotal = Number(snap?.radiology_total ?? 0);
  const readyText =
    Number.isFinite(labTotal + radTotal) && (labTotal > 0 || radTotal > 0)
      ? `Ready Lab ${labReady}/${labTotal}, Scan ${radReady}/${radTotal}`
      : "";

  const decisionReason = String(decision?.reason || "").trim();
  const skipReason = humanizeSkipReason(meta?.skip_reason);
  const skipEvent = job?.skip_event && typeof job.skip_event === "object" ? job.skip_event : null;
  const skipEventReason = String(skipEvent?.reason || "").trim();
  const decisionMode = String(decision?.mode || "").trim().toLowerCase();
  const blockers = queuedBlockers(job);
  const reportLabel = String(job?.report_label || "").trim().toLowerCase();
  const isPartial = reportLabel.includes("partial");

  if (displayValue(job?.last_error) !== "-") return displayValue(job?.last_error);

  if (status === "cooling_off") {
    const parts = [];
    if (readyText) parts.push(readyText);
    if (isPartial) parts.push("Partial dispatch path");
    if (decisionMode === "allow_full") parts.push("Full dispatch eligible");
    else if (decisionMode === "try_pending_print_once") parts.push("Trying pending-print-once");
    else if (decisionMode === "manual_review") parts.push("Manual review advised");
    if (decisionReason) parts.push(decisionReason);
    parts.push(`Cooling until ${formatIstDateTime(queueTimeForDisplay(job))}`);
    if (historyText) parts.push(historyText);
    return parts.join(" • ");
  }

  if (status === "queued") {
    const parts = [];
    if (readyText) parts.push(readyText);
    if (blockers) parts.push(`Pending tests: ${blockers}`);
    if (decisionReason) parts.push(decisionReason);
    parts.push(`Next check ${formatIstDateTime(queueTimeForDisplay(job))}`);
    if (historyText) parts.push(historyText);
    return parts.join(" • ");
  }

  if (status === "skipped") {
    const parts = [];
    if (readyText) parts.push(readyText);
    if (blockers) parts.push(`Pending tests: ${blockers}`);
    if (decisionReason) parts.push(decisionReason);
    if (skipReason) parts.push(`Skip reason: ${skipReason}`);
    if (!skipReason && skipEventReason) parts.push(`Skip reason: ${skipEventReason}`);
    if (!decisionReason && !skipReason && !skipEventReason && !blockers) parts.push("Skipped by dispatch rules for this cycle");
    if (historyText) parts.push(historyText);
    return parts.join(" • ");
  }

  if (status === "sent" && readyText) {
    const parts = [readyText];
    if (isPartial) parts.push("Sent as partial report");
    if (decisionReason) parts.push(decisionReason);
    if (historyText) parts.push(historyText);
    return parts.join(" • ");
  }

  if (decisionReason && readyText) return `${readyText} • ${decisionReason}${historyText ? ` • ${historyText}` : ""}`;
  if (decisionReason) return `${decisionReason}${historyText ? ` • ${historyText}` : ""}`;
  if (readyText) return `${readyText}${historyText ? ` • ${historyText}` : ""}`;
  const fallback = stateHint(job);
  return historyText ? `${fallback} • ${historyText}` : fallback;
}

function fallbackAutoPermissions(role) {
  const roleKey = String(role || "").trim().toLowerCase();
  if (roleKey === "director" || roleKey === "admin") {
    return [
      "reports.auto_dispatch.view",
      "reports.auto_dispatch.push",
      "reports.auto_dispatch.send_to",
      "reports.auto_dispatch.pause",
      "reports.auto_dispatch.pause_all"
    ];
  }
  if (roleKey === "manager") {
    return ["reports.auto_dispatch.view", "reports.auto_dispatch.push", "reports.auto_dispatch.send_to"];
  }
  if (roleKey === "agent" || roleKey === "executive") {
    return ["reports.auto_dispatch.view"];
  }
  return [];
}

export default function ReportDispatchWorkspace({
  dispatchMode = "admin",
  userRole = "admin",
  initialMonitorFilter = "",
}) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [themeMode, setThemeMode] = useState("light");
  const isScopedMode = dispatchMode === "scoped";

  const [reqnoInput, setReqnoInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [dailyFilter, setDailyFilter] = useState("");

  const [phoneReports, setPhoneReports] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyMeta, setDailyMeta] = useState({
    scoped: false,
    allowedOrgIds: [],
    scopeIssue: null,
    upstreamCalled: false
  });
  const [dailyPage, setDailyPage] = useState(1);
  const [autoStatusFilter, setAutoStatusFilter] = useState(initialMonitorFilter || "");
  const [autoViewFilter, setAutoViewFilter] = useState("pending");
  const [autoSearchInput, setAutoSearchInput] = useState("");
  const [autoSearch, setAutoSearch] = useState("");
  const [autoJobs, setAutoJobs] = useState([]);
  const [autoEvents, setAutoEvents] = useState([]);
  const [autoSummary, setAutoSummary] = useState(null);
  const [autoJobsCount, setAutoJobsCount] = useState(0);
  const [autoScopedLabIds, setAutoScopedLabIds] = useState([]);
  const [autoPage, setAutoPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState(null);
  const roleKey = String(userRole || "").trim().toLowerCase();
  const defaultMonitorOpen = roleKey === "admin" || roleKey === "director" || roleKey === "cto";
  const [monitorOpen, setMonitorOpen] = useState(defaultMonitorOpen);
  const [monitorMode, setMonitorMode] = useState("ops");
  const [grantedPermissions, setGrantedPermissions] = useState([]);
  const [pushTemplateJob, setPushTemplateJob] = useState(null);
  const [outsourcedTemplateContext, setOutsourcedTemplateContext] = useState(null);
  const [detailLoadedFromMonitor, setDetailLoadedFromMonitor] = useState(false);

  const [status, setStatus] = useState(null);
  const [selectedReportMeta, setSelectedReportMeta] = useState(null);

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoActionLoading, setAutoActionLoading] = useState(false);
  const [autoActionState, setAutoActionState] = useState({ jobId: "", action: "" });
  const [error, setError] = useState("");

  const [headerRequired, setHeaderRequired] = useState(false);
  const [actionMode, setActionMode] = useState("open");

  const phoneModal = useDisclosure();
  const dateModal = useDisclosure();
  const autoEventsModal = useDisclosure();
  const pushTemplateModal = useDisclosure();
  const outsourcedModal = useDisclosure();
  const bulkConfirmDialog = useDisclosure();

  const phoneCacheRef = useRef(new Map());
  const dateCacheRef = useRef(new Map());
  const headerDefaultAppliedRef = useRef(false);
  const bulkCancelRef = useRef(null);
  const [bulkActionState, setBulkActionState] = useState({ action: "", jobIds: [] });
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewportResolved, setViewportResolved] = useState(false);
  const [outsourcedRows, setOutsourcedRows] = useState([]);
  const [outsourcedLoading, setOutsourcedLoading] = useState(false);
  const [outsourcedError, setOutsourcedError] = useState("");
  const [outsourcedIncludeHeader, setOutsourcedIncludeHeader] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      setThemeMode(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1100px)");
    const apply = () => {
      setIsMobileViewport(media.matches);
      setViewportResolved(true);
    };
    apply();
    const onChange = (event) => setIsMobileViewport(Boolean(event.matches));
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (!viewportResolved) return;
    if (headerDefaultAppliedRef.current) return;
    setHeaderRequired(Boolean(isMobileViewport));
    setActionMode(isMobileViewport ? "share" : "open");
    headerDefaultAppliedRef.current = true;
  }, [isMobileViewport, viewportResolved]);

  useEffect(() => {
    setDailyFilter("");
    setDailyPage(1);
  }, [selectedDate]);

  useEffect(() => {
    setAutoPage(1);
  }, [autoStatusFilter]);

  useEffect(() => {
    if (!monitorOpen) return;
    loadAutoDispatchJobs({ limit: 120, resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    let active = true;
    async function loadPermissions() {
      try {
        const res = await fetch("/api/admin/uac/permissions", { cache: "no-store" });
        if (!res.ok) throw new Error("uac-permissions-unavailable");
        const json = await res.json();
        const rolePerms = Array.isArray(json?.policy?.[String(userRole || "").toLowerCase()])
          ? json.policy[String(userRole || "").toLowerCase()]
          : [];
        if (active) setGrantedPermissions(rolePerms);
      } catch {
        if (active) setGrantedPermissions(fallbackAutoPermissions(userRole));
      }
    }
    loadPermissions();
    return () => {
      active = false;
    };
  }, [userRole]);


  const filteredDailyRows = useMemo(() => {
    const sorted = [...(Array.isArray(dailyRows) ? dailyRows : [])].sort(byReqnoDesc);
    const q = String(dailyFilter || "").trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((row) => {
      const reqno = String(row?.reqno || "").toLowerCase();
      const patient = String(row?.patient_name || "").toLowerCase();
      const phone = String(row?.phoneno || "").toLowerCase();
      const mrno = String(row?.mrno || "").toLowerCase();
      const source = String(row?.source || "").toLowerCase();
      return reqno.includes(q) || patient.includes(q) || phone.includes(q) || mrno.includes(q) || source.includes(q);
    });
  }, [dailyRows, dailyFilter]);

  const totalDailyPages = Math.max(1, Math.ceil(filteredDailyRows.length / DAILY_PAGE_SIZE));
  const safeDailyPage = Math.min(dailyPage, totalDailyPages);
  const pagedDailyRows = filteredDailyRows.slice(
    (safeDailyPage - 1) * DAILY_PAGE_SIZE,
    safeDailyPage * DAILY_PAGE_SIZE
  );

  const autoFilteredJobs = useMemo(() => {
    const rows = [...(Array.isArray(autoJobs) ? autoJobs : [])].sort(byReqnoDesc);
    const q = String(autoSearch || "").trim().toLowerCase();
    // Search overrides status/view filters so operators can quickly find any row
    // (sent/pending/cancelled) from one input.
    if (q) {
      const searched = rows.filter((row) => {
        const historyCounts = row?.reqno_history?.status_counts && typeof row.reqno_history.status_counts === "object"
          ? Object.entries(row.reqno_history.status_counts).map(([k, v]) => `${k}:${v}`).join(" ")
          : "";
        const historyText = row?.reqno_history?.total_rows ? `history ${row.reqno_history.total_rows}` : "";
        const hay = [
          row?.reqno,
          row?.reqid,
          row?.patient_name,
          row?.phone,
          row?.status,
          extractProviderMessageId(row),
          row?.is_paused ? "paused" : "active",
          row?.report_label,
          row?.last_error,
          historyText,
          historyCounts
        ].map((v) => String(v || "").toLowerCase()).join(" ");
        return hay.includes(q);
      });
      return collapseByReqno(searched).sort(byReqnoDesc);
    }

    const viewFilter = String(autoViewFilter || "pending").trim().toLowerCase();
    const byView = viewFilter === "all"
      ? rows
      : rows.filter((row) => !["sent", "cancelled"].includes(String(row?.status || "").trim().toLowerCase()));
    const status = String(autoStatusFilter || "").trim().toLowerCase();
    const byStatus = !status ? byView : byView.filter((row) => String(row?.status || "").trim().toLowerCase() === status);
    const filtered = byStatus.filter((row) => {
      const hay = [
        row?.reqno,
        row?.reqid,
        row?.patient_name,
        row?.phone,
        row?.status,
        extractProviderMessageId(row),
        row?.is_paused ? "paused" : "active",
        row?.report_label,
        row?.last_error
      ].map((v) => String(v || "").toLowerCase()).join(" ");
      return hay.includes(q);
    });
    return collapseByReqno(filtered).sort(byReqnoDesc);
  }, [autoJobs, autoStatusFilter, autoSearch, autoViewFilter]);


  const monitorDateStats = useMemo(() => {
    const bounds = istDayBounds(selectedDate);
    const dateJobs = (Array.isArray(autoJobs) ? autoJobs : []).filter((row) => {
      if (!bounds) return true;
      const ca = row?.created_at ? new Date(row.created_at).getTime() : null;
      return Number.isFinite(ca) && ca >= bounds.start && ca < bounds.end;
    });
    const stats = {
      total: dateJobs.length,
      queued: 0,
      cooling_off: 0,
      retrying: 0,
      sent: 0,
      failed: 0,
      paused: 0,
      read: 0,
      delivered: 0,
      sent_only: 0,
      unknown: 0
    };
    for (const row of dateJobs) {
      const status = String(row?.status || "").trim().toLowerCase();
      if (status in stats) stats[status] += 1;
      if (row?.is_paused) stats.paused += 1;
      if (status === "sent") {
        const d = deriveDeliveryStatus(row);
        if (d === "read") stats.read += 1;
        else if (d === "delivered") stats.delivered += 1;
        else if (d === "sent" && extractProviderMessageId(row)) stats.sent_only += 1;
        else stats.unknown += 1;
      }
    }
    return stats;
  }, [autoJobs, selectedDate]);

  const monitorTopStats = useMemo(() => {
    const totalJobs = autoSummary?.total_jobs ?? monitorDateStats.total;
    const pendingQueue = (autoSummary?.queued_jobs ?? monitorDateStats.queued) + (autoSummary?.retrying_jobs ?? monitorDateStats.retrying);
    const coolingOff = autoSummary?.cooling_off_jobs ?? monitorDateStats.cooling_off;
    const failedUnpaused = autoSummary?.failed_today_total ?? (Array.isArray(autoJobs) ? autoJobs : []).filter((row) => {
      const st = String(row?.status || "").trim().toLowerCase();
      return st === "failed" && !row?.is_paused;
    }).length;
    const sentToday = autoSummary?.sent_today_total ?? autoSummary?.sent_jobs ?? monitorDateStats.sent;
    const prevDaySent = autoSummary?.previous_days_sent_jobs ?? 0;
    return { totalJobs, pendingQueue, coolingOff, failedUnpaused, sentToday, prevDaySent };
  }, [autoJobs, autoSummary, monitorDateStats, selectedDate]);

  const sentTodaySplit = useMemo(() => {
    const bounds = istDayBounds(selectedDate);
    const rows = (Array.isArray(autoJobs) ? autoJobs : []).filter((row) => {
      const st = String(row?.status || "").trim().toLowerCase();
      if (st !== "sent") return false;
      if (!bounds) return true;
      const sentMs = row?.sent_at ? new Date(row.sent_at).getTime() : null;
      return Number.isFinite(sentMs) && sentMs >= bounds.start && sentMs < bounds.end;
    });
    const out = { lab: 0, radiology: 0, hybrid: 0, other: 0 };
    for (const row of rows) {
      const label = String(row?.report_label || "").trim().toLowerCase();
      const hasLab = label.includes("lab");
      const hasRad = label.includes("radiology");
      if (hasLab && hasRad) out.hybrid += 1;
      else if (hasLab) out.lab += 1;
      else if (hasRad) out.radiology += 1;
      else out.other += 1;
    }
    return out;
  }, [autoJobs, selectedDate]);

  const monitorPipeline = useMemo(() => {
    const labPendingApproval = Number(autoSummary?.lab_pending_approval_tests ?? 0);
    const labWaiting = Number(autoSummary?.lab_waiting_tests ?? 0);
    const labReady = Number(autoSummary?.lab_ready_tests ?? 0);
    const scanPendingApproval = Number(autoSummary?.radiology_pending_approval_tests ?? 0);
    const scanWaiting = Number(autoSummary?.radiology_waiting_tests ?? 0);
    const scanReady = Number(autoSummary?.radiology_ready_tests ?? 0);
    return {
      ready: labReady + scanReady,
      waiting: labWaiting + scanWaiting,
      pendingApproval: labPendingApproval + scanPendingApproval,
      labReady,
      scanReady,
      labWaiting,
      scanWaiting,
      labPendingApproval,
      scanPendingApproval
    };
  }, [autoSummary]);

  const monitorRisk = useMemo(() => {
    if (autoSummary && (
      Number(autoSummary?.risk_invalid_phone_events || 0) > 0 ||
      Number(autoSummary?.risk_pdf_missing_events || 0) > 0 ||
      Number(autoSummary?.risk_timeout_5xx_events || 0) > 0
    )) {
      return {
        invalidPhone: Number(autoSummary?.risk_invalid_phone_events || 0),
        pdfMissing: Number(autoSummary?.risk_pdf_missing_events || 0),
        timeout5xx: Number(autoSummary?.risk_timeout_5xx_events || 0)
      };
    }
    const rows = Array.isArray(autoJobs) ? autoJobs : [];
    let invalidPhone = 0;
    let pdfMissing = 0;
    let timeout5xx = 0;
    for (const row of rows) {
      const err = String(row?.last_error || "").toLowerCase();
      if (!err || err === "-") continue;
      if (err.includes("invalid_phone")) invalidPhone += 1;
      if (err.includes("pdf was not found")) pdfMissing += 1;
      if (err.includes("timed out") || err.includes("timeout") || err.includes("503") || err.includes("502") || err.includes("service unavailable") || err.includes("bad gateway")) timeout5xx += 1;
    }
    return { invalidPhone, pdfMissing, timeout5xx };
  }, [autoJobs, autoSummary]);

  const diagnosticAlertCount = useMemo(() => {
    const failedActive = Number(monitorTopStats.failedUnpaused || 0);
    const invalid = Number(monitorRisk.invalidPhone || 0);
    const pdfMissing = Number(monitorRisk.pdfMissing || 0);
    const timeout5xx = Number(monitorRisk.timeout5xx || 0);
    return failedActive + invalid + pdfMissing + timeout5xx;
  }, [monitorRisk, monitorTopStats.failedUnpaused]);

  const totalAutoPages = Math.max(1, Math.ceil(autoFilteredJobs.length / AUTO_JOBS_PAGE_SIZE));
  const safeAutoPage = Math.min(autoPage, totalAutoPages);
  const pagedAutoJobs = autoFilteredJobs.slice(
    (safeAutoPage - 1) * AUTO_JOBS_PAGE_SIZE,
    safeAutoPage * AUTO_JOBS_PAGE_SIZE
  );

  function currentReqid() {
    return String(status?.reqid || selectedReportMeta?.reqid || "").trim();
  }

  function currentReqno() {
    return String(status?.reqno || reqnoInput || selectedReportMeta?.reqno || "").trim();
  }

  function currentMrno() {
    return String(status?.live_status?.mrno || selectedReportMeta?.mrno || "").trim();
  }

  function headerMode() {
    return headerRequired ? "default" : "plain";
  }

  function modeValue() {
    return actionMode === "download" ? "download" : "preview";
  }

  const hasStatus = Boolean(status);
  const hasLab = Number(status?.live_status?.lab_total || 0) > 0;
  const hasRadiology = Number(status?.live_status?.radiology_total || 0) > 0;
  const canTrend = Boolean(currentMrno());
  const canSmartTrends = Boolean(currentMrno());
  const canDispatch = Boolean(currentReqid() || currentReqno());
  const hasWildcard = grantedPermissions.includes("*");
  const canAutoView = hasWildcard || grantedPermissions.includes("reports.auto_dispatch.view");
  const canAutoPush = hasWildcard || grantedPermissions.includes("reports.auto_dispatch.push");
  const canAutoSendTo = hasWildcard || grantedPermissions.includes("reports.auto_dispatch.send_to");
  const canAutoPause = hasWildcard || grantedPermissions.includes("reports.auto_dispatch.pause");
  const canAutoPauseAll = hasWildcard || grantedPermissions.includes("reports.auto_dispatch.pause_all");

  useEffect(() => {
    if (!monitorOpen) return;
    if (typeof window === "undefined") return;
    const onKeyDown = (event) => {
      const tag = String(event?.target?.tagName || "").toLowerCase();
      const isTypingTarget = tag === "input" || tag === "textarea" || tag === "select" || Boolean(event?.target?.isContentEditable);
      if (isTypingTarget) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setAutoPage((p) => Math.max(1, p - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setAutoPage((p) => Math.min(totalAutoPages, p + 1));
      } else if (event.key === "Home") {
        event.preventDefault();
        setAutoPage(1);
      } else if (event.key === "End") {
        event.preventDefault();
        setAutoPage(totalAutoPages);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [monitorOpen, totalAutoPages]);

  function findPhoneFromDailyRows(reqnoValue) {
    const cleanReqno = String(reqnoValue || "").trim();
    if (!cleanReqno) return "";
    const match = (Array.isArray(dailyRows) ? dailyRows : []).find(
      (row) => String(row?.reqno || "").trim() === cleanReqno
    );
    return String(match?.phoneno || "").trim();
  }

  function findOrgIdFromDailyRows(reqnoValue) {
    const cleanReqno = String(reqnoValue || "").trim();
    if (!cleanReqno) return "";
    const match = (Array.isArray(dailyRows) ? dailyRows : []).find(
      (row) => String(row?.reqno || "").trim() === cleanReqno
    );
    return String(match?.org_id || "").trim();
  }

  async function lookupByReqno(reqnoValue, options = {}) {
    setError("");
    setStatus(null);

    const clean = String(reqnoValue || "").trim();
    if (!clean) {
      setError("Please enter REQNO");
      return;
    }

    setLoadingStatus(true);
    try {
      const query = new URLSearchParams({ reqno: clean });
      const preferredOrgId = String(
        options?.preferredOrgId ||
          selectedReportMeta?.org_id ||
          findOrgIdFromDailyRows(clean) ||
          ""
      ).trim();
      if (preferredOrgId) query.set("org_id", preferredOrgId);
      const res = await fetch(`/api/admin/reports/dispatch-status?${query.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setStatus(json);
      const preferredPhone = String(options?.preferredPhone || "").trim();
      const dailyPhone = findPhoneFromDailyRows(clean);
      const resolvedPhone = String(
        json?.live_status?.patient_phone ||
        preferredPhone ||
        dailyPhone ||
        ""
      )
        .replace(/\D/g, "")
        .slice(-10);
      setPhoneInput(resolvedPhone || "");
    } catch (err) {
      setError(err?.message || "Failed to load dispatch status");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    if (isScopedMode) return;
    setSelectedReportMeta(null);
    await lookupByReqno(reqnoInput, { preferredPhone: "" });
  }

  async function handleReqnoQuickLookup() {
    if (isScopedMode) return;
    setSelectedReportMeta(null);
    await lookupByReqno(reqnoInput, { preferredPhone: "" });
  }

  async function loadPhoneReports(rawPhone, options = {}) {
    const clean = String(rawPhone || "").replace(/\D/g, "").slice(-10);
    if (!clean) {
      setError("Please enter phone number");
      return [];
    }

    const force = options?.force === true;
    if (!force && phoneCacheRef.current.has(clean)) {
      const cached = phoneCacheRef.current.get(clean) || [];
      setPhoneReports(cached);
      return cached;
    }

    setPhoneLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/lookup?phone=${encodeURIComponent(clean)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const rows = Array.isArray(json?.latest_reports) ? json.latest_reports : [];
      phoneCacheRef.current.set(clean, rows);
      setPhoneReports(rows);
      return rows;
    } catch (err) {
      setPhoneReports([]);
      setError(err?.message || "Failed phone lookup");
      return [];
    } finally {
      setPhoneLoading(false);
    }
  }

  async function loadDateRows(dateValue, options = {}) {
    const date = String(dateValue || "").trim();
    if (!date) {
      setError("Please select date from shortcut bar");
      return [];
    }

    const force = options?.force === true;
    if (!force && dateCacheRef.current.has(date)) {
      const cachedEntry = dateCacheRef.current.get(date) || {};
      const cached = Array.isArray(cachedEntry?.rows) ? cachedEntry.rows : [];
      setDailyRows(cached);
      setDailyMeta({
        scoped: Boolean(cachedEntry?.scoped),
        allowedOrgIds: Array.isArray(cachedEntry?.allowedOrgIds) ? cachedEntry.allowedOrgIds : [],
        scopeIssue: String(cachedEntry?.scopeIssue || "").trim() || null,
        upstreamCalled: Boolean(cachedEntry?.upstreamCalled)
      });
      setDailyPage(1);
      return cached;
    }

    setDailyLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/requisitions?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const rows = Array.isArray(json?.requisitions) ? json.requisitions : [];
      const allowedOrgIds = Array.isArray(json?.allowed_org_ids) ? json.allowed_org_ids : [];
      const cacheEntry = {
        rows,
        scoped: Boolean(json?.scoped),
        allowedOrgIds,
        scopeIssue: String(json?.scope_issue || "").trim() || null,
        upstreamCalled: Boolean(json?.upstream_called)
      };
      dateCacheRef.current.set(date, cacheEntry);
      setDailyRows(rows);
      setDailyMeta({
        scoped: cacheEntry.scoped,
        allowedOrgIds: cacheEntry.allowedOrgIds,
        scopeIssue: cacheEntry.scopeIssue,
        upstreamCalled: cacheEntry.upstreamCalled
      });
      setDailyPage(1);
      return rows;
    } catch (err) {
      setDailyRows([]);
      setDailyMeta({
        scoped: false,
        allowedOrgIds: [],
        scopeIssue: null,
        upstreamCalled: false
      });
      setError(err?.message || "Failed date-wise requisition lookup");
      return [];
    } finally {
      setDailyLoading(false);
    }
  }

  async function handleOpenPhoneModal() {
    setError("");
    await loadPhoneReports(phoneInput, { force: false });
    phoneModal.onOpen();
  }

  async function handleOpenDateModal() {
    setError("");
    setDailyFilter("");
    setDailyPage(1);
    await loadDateRows(selectedDate, { force: false });
    dateModal.onOpen();
  }

  async function handleUseRow(row, options = {}) {
    phoneModal.onClose();
    dateModal.onClose();
    setDetailLoadedFromMonitor(Boolean(options?.fromMonitor));
    setSelectedReportMeta(row || null);
    const reqno = String(row?.reqno || "").trim();
    if (!reqno) return;
    setReqnoInput(reqno);
    toast({
      title: "Loading status",
      description: `Fetching requisition ${reqno}`,
      status: "info",
      duration: 1200,
      isClosable: true
    });
    await lookupByReqno(reqno, {
      preferredPhone: String(row?.phoneno || row?.phone || "").trim(),
      preferredOrgId: String(row?.org_id || "").trim()
    });
  }

  async function handleUseAutoJob(job) {
    if (!job) return;
    const mapped = {
      reqno: String(job?.reqno || "").trim(),
      reqid: String(job?.reqid || "").trim(),
      patient_name: String(job?.patient_name || "").trim(),
      phone: String(job?.phone || "").trim(),
      phoneno: String(job?.phone || "").trim(),
      org_id: String(job?.org_id || "").trim()
    };
    if (!mapped.reqno) return;
    await handleUseRow(mapped, { fromMonitor: true });
  }

  function handleReqnoClick(job) {
    const selected = typeof window !== "undefined" ? String(window.getSelection?.()?.toString?.() || "").trim() : "";
    if (selected) return;
    handleUseAutoJob(job);
  }

  async function loadAutoDispatchJobs(options = {}) {
    setAutoLoading(true);
    try {
      const skipDateScope = autoStatusFilter === "failed";
      // When a date is selected, always fetch 2000 rows regardless of caller's limit
      // so collapseByReqno gets the full day's unique-reqno set, not just the top N
      // by updated_at (which would be dominated by noise rows and miss sent jobs).
      const limit = (selectedDate && !skipDateScope) ? 2000 : Number(options?.limit || 120);
      const query = new URLSearchParams({ limit: String(limit) });
      if (autoStatusFilter) query.set("status", autoStatusFilter);
      if (selectedDate && !skipDateScope) query.set("selected_date", selectedDate);
      const res = await fetch(`/api/admin/reports/auto-dispatch-logs?${query.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setAutoJobs(Array.isArray(json?.jobs) ? json.jobs : []);
      setAutoSummary(json?.summary || null);
      setAutoJobsCount(Number(json?.count || 0));
      setAutoScopedLabIds(Array.isArray(json?.scoped_lab_ids) ? json.scoped_lab_ids : []);
      if (options?.resetPage) setAutoPage(1);
      return true;
    } catch (err) {
      setError(err?.message || "Failed to load auto-dispatch jobs");
      return false;
    } finally {
      setAutoLoading(false);
    }
  }

  async function openAutoEvents(job) {
    const jobId = String(job?.id || "").trim();
    if (!jobId) return;
    setAutoActionState({ jobId, action: "events" });
    setAutoActionLoading(true);
    try {
      const query = new URLSearchParams({ job_id: jobId, limit: "200" });
      const res = await fetch(`/api/admin/reports/auto-dispatch-logs?${query.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setSelectedJob(job);
      setAutoEvents(Array.isArray(json?.events) ? json.events : []);
      autoEventsModal.onOpen();
    } catch (err) {
      setError(err?.message || "Failed to load events");
    } finally {
      setAutoActionLoading(false);
      setAutoActionState({ jobId: "", action: "" });
    }
  }

  async function runAutoJobAction(jobIdValue, action, extra = {}) {
    const jobId = String(jobIdValue || "").trim();
    if (!action) return;
    if (!jobId && action !== "pause_all" && action !== "resume_all") return;
    setAutoActionState({ jobId, action: String(action || "").trim().toLowerCase() });
    setAutoActionLoading(true);
    try {
      const body = { action };
      if (jobId) body.job_id = jobId;
      if (extra?.phone) body.phone = String(extra.phone || "");
      if (Array.isArray(extra?.job_ids)) body.job_ids = extra.job_ids;
      const res = await fetch("/api/admin/reports/auto-dispatch-logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      toast({
        title: "Action queued",
        description:
          action === "pause_all"
            ? "Paused all visible eligible jobs."
            : action === "resume_all"
              ? "Resumed all paused jobs."
              : `Applied ${action} on job #${jobId}`,
        status: "success",
        duration: 1800,
        isClosable: true
      });
      await loadAutoDispatchJobs({ limit: 120, resetPage: false });
      if (selectedJob && String(selectedJob?.id || "") === jobId && autoEventsModal.isOpen) {
        await openAutoEvents({ id: jobId });
      }
    } catch (err) {
      setError(err?.message || "Failed to update job");
    } finally {
      setAutoActionLoading(false);
      setAutoActionState({ jobId: "", action: "" });
    }
  }

  function isRowActionLoading(jobIdValue, action) {
    if (!autoActionLoading) return false;
    const activeJobId = String(autoActionState?.jobId || "").trim();
    const activeAction = String(autoActionState?.action || "").trim().toLowerCase();
    const jobId = String(jobIdValue || "").trim();
    const normalized = String(action || "").trim().toLowerCase();
    if (!jobId || !normalized) return false;
    return activeJobId === jobId && activeAction === normalized;
  }

  function confirmAndPushJob(job) {
    const statusValue = String(job?.status || "").toLowerCase();
    if (statusValue === "sent" && typeof window !== "undefined") {
      const ok = window.confirm("Report already sent. Send again?");
      if (!ok) return;
    }
    runAutoJobAction(String(job?.id || ""), "push_now");
  }

  async function openPushTemplateModal(job) {
    setPushTemplateJob(job || null);
    pushTemplateModal.onOpen();
  }

  async function openOutsourcedModal() {
    const reqno = String(currentReqno() || "").trim();
    if (!reqno) {
      toast({
        title: "Missing requisition",
        description: "Load requisition status first.",
        status: "warning",
        duration: 2200,
        isClosable: true
      });
      return;
    }
    outsourcedModal.onOpen();
    setOutsourcedError("");
    setOutsourcedRows([]);
    setOutsourcedLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/outsourced-dispatch-context?reqno=${encodeURIComponent(reqno)}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || `Failed to load outsourced context (${res.status})`);
      }
      const json = await res.json();
      setOutsourcedRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (error) {
      setOutsourcedError(error?.message || "Failed to load outsourced context");
    } finally {
      setOutsourcedLoading(false);
    }
  }

  function openOutsourcedSendToModal(row) {
    const reqno = String(currentReqno() || row?.reqno || "").trim();
    const testid = String(row?.testid || "").trim();
    const phone = String(status?.live_status?.patient_phone || selectedReportMeta?.phoneno || "").trim();
    if (!reqno || !testid || !phone) {
      toast({
        title: "Missing send context",
        description: "Req no, test id, and phone are required.",
        status: "error",
        duration: 2400,
        isClosable: true
      });
      return;
    }
    setOutsourcedTemplateContext({
      phone,
      patient_name: String(status?.live_status?.patient_name || selectedReportMeta?.patient_name || "").trim(),
      reqno,
      testid
    });
    pushTemplateModal.onOpen();
  }

  function openOutsourcedDownload(row) {
    const downloadUrl = String(row?.download_url || "").trim();
    if (!downloadUrl) {
      toast({
        title: "Missing download context",
        description: "Download URL is not available for this row.",
        status: "error",
        duration: 2200,
        isClosable: true
      });
      return;
    }
    if (typeof window !== "undefined") {
      try {
        const url = new URL(downloadUrl);
        if (outsourcedIncludeHeader) {
          url.searchParams.delete("chkrephead");
        } else {
          url.searchParams.set("chkrephead", "0");
        }
        window.open(url.toString(), "_blank", "noopener,noreferrer");
      } catch {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      }
    }
  }

  function openBulkConfirm(action, jobIds) {
    const ids = Array.isArray(jobIds) ? jobIds.filter((id) => Number.isFinite(Number(id))) : [];
    if (!ids.length) return;
    setBulkActionState({ action, jobIds: ids });
    bulkConfirmDialog.onOpen();
  }

  async function confirmBulkAction() {
    const action = String(bulkActionState?.action || "").trim().toLowerCase();
    const jobIds = Array.isArray(bulkActionState?.jobIds) ? bulkActionState.jobIds : [];
    if (!action || !jobIds.length) {
      bulkConfirmDialog.onClose();
      return;
    }
    await runAutoJobAction("", action, { job_ids: jobIds });
    bulkConfirmDialog.onClose();
    setBulkActionState({ action: "", jobIds: [] });
  }

  async function openDocument(reportScope, extra = {}) {
    if (!canDispatch) return;

    const reqid = currentReqid();
    const reqno = currentReqno();
    const query = new URLSearchParams({
      report_scope: reportScope,
      mode: modeValue(),
      header_mode: headerMode(),
      patient_name: String(status?.live_status?.patient_name || selectedReportMeta?.patient_name || "").trim()
    });

    if (reqid) query.set("reqid", reqid);
    if (reqno) query.set("reqno", reqno);

    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null || String(value).trim() === "") continue;
      query.set(key, String(value));
    }

    const reportUrl = `/api/admin/reports/document?${query.toString()}`;
    const patientDisplayName = String(status?.live_status?.patient_name || selectedReportMeta?.patient_name || "patient").trim() || "patient";
    const shareText = `Please find reports of ${patientDisplayName}.`;

    if (
      actionMode === "share" &&
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        const response = await fetch(reportUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Unable to load report for sharing (${response.status})`);
        }
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const blob = await response.blob();
        const blobType = String(blob?.type || "").toLowerCase();
        const fileName = `${(reqno || reqid || "report").trim()}.pdf`;
        const file = new File([blob], fileName, {
          type: blobType || contentType || "application/pdf"
        });
        const canShareFiles =
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] });
        const absoluteReportUrl = new URL(reportUrl, window.location.origin).toString();

        if (canShareFiles) {
          try {
            await navigator.share({
              title: `Report ${reqno || reqid || ""}`.trim(),
              text: shareText,
              files: [file]
            });
            return;
          } catch (fileShareError) {
            console.warn("[report-dispatch] file-share failed, trying URL share fallback", {
              reqno,
              reqid,
              reportScope,
              fileName,
              blobBytes: Number(blob?.size || 0),
              contentType,
              blobType,
              error: fileShareError?.message || String(fileShareError)
            });
          }
        }

        try {
          await navigator.share({
            title: `Report ${reqno || reqid || ""}`.trim(),
            text: `${shareText}\n${absoluteReportUrl}`.trim(),
            url: absoluteReportUrl
          });
          toast({
            title: "Link shared",
            description: "File share was unavailable for this report, so report link was shared.",
            status: "info",
            duration: 2600,
            isClosable: true
          });
          return;
        } catch (urlShareError) {
          console.warn("[report-dispatch] URL-share failed, falling back to download", {
            reqno,
            reqid,
            reportScope,
            fileName,
            blobBytes: Number(blob?.size || 0),
            contentType,
            blobType,
            error: urlShareError?.message || String(urlShareError)
          });
        }

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        toast({
          title: "Downloaded",
          description: "Direct file sharing is unavailable on this device. PDF downloaded instead.",
          status: "info",
          duration: 2200,
          isClosable: true
        });
        return;
      } catch (err) {
        console.error("[report-dispatch] share failed", {
          reqno,
          reqid,
          reportScope,
          error: err?.message || String(err)
        });
        toast({
          title: "Share failed",
          description: err?.message || "Could not share this report. Please try again.",
          status: "error",
          duration: 2800,
          isClosable: true
        });
        return;
      }
    }

    window.open(reportUrl, "_blank", "noopener,noreferrer");
  }

  function openTrend() {
    const mrno = currentMrno();
    if (!mrno) return;

    const query = new URLSearchParams({
      mrno,
      mode: modeValue(),
      reqid: currentReqid(),
      reqno: currentReqno()
    });
    window.open(`/api/admin/reports/trend?${query.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openSmartTrends() {
    const mrno = currentMrno();
    if (!mrno) return;

    const baseParams = {
      mrno,
      report_mode: "trends",
      reqid: currentReqid(),
      reqno: currentReqno()
    };

    if (actionMode === "download") {
      const pdfQuery = new URLSearchParams({
        ...baseParams,
        format: "pdf",
        download: "1"
      });
      window.open(`/api/smart-reports/trend-data?${pdfQuery.toString()}`, "_blank", "noopener,noreferrer");
      return;
    }

    const openQuery = new URLSearchParams({
      ...baseParams,
      format: "html"
    });
    window.open(`/api/smart-reports/trend-data?${openQuery.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openSmartSummary() {
    const mrno = currentMrno();
    if (!mrno) return;

    const baseParams = {
      mrno,
      reqid: currentReqid(),
      reqno: currentReqno()
    };

    if (actionMode === "download") {
      const pdfQuery = new URLSearchParams({
        ...baseParams,
        format: "pdf",
        download: "1"
      });
      window.open(`/api/report-summary?${pdfQuery.toString()}`, "_blank", "noopener,noreferrer");
      return;
    }

    const openQuery = new URLSearchParams({
      ...baseParams,
      format: "html"
    });
    window.open(`/api/report-summary?${openQuery.toString()}`, "_blank", "noopener,noreferrer");
  }

  const decision = status?.decision || null;
  const tone = toneByMode(decision?.mode);
  const activeMeta =
    String(selectedReportMeta?.reqno || "").trim() === String(status?.reqno || reqnoInput || "").trim()
      ? selectedReportMeta
      : null;

  const statusReqno = displayValue(status?.reqno || reqnoInput || activeMeta?.reqno);
  const statusPatient = displayValue(status?.live_status?.patient_name || activeMeta?.patient_name);
  const statusPhone = displayValue(status?.live_status?.patient_phone || activeMeta?.phoneno);
  const statusMrno = displayValue(status?.live_status?.mrno || activeMeta?.mrno);
  const statusSource = displayValue(status?.live_status?.source || activeMeta?.source);
  const activeAutoJob = useMemo(() => {
    const reqno = String(status?.reqno || reqnoInput || activeMeta?.reqno || "").trim();
    if (!reqno) return null;
    return (Array.isArray(autoJobs) ? autoJobs : []).find((row) => String(row?.reqno || "").trim() === reqno) || null;
  }, [autoJobs, status?.reqno, reqnoInput, activeMeta?.reqno]);

  return (
    <Box
      minH="100vh"
      w="100vw"
      overflow="auto"
      className={`dashboard-theme-shell ${themeMode === "dark" ? "dashboard-theme-dark" : "dashboard-theme-light"}`}
      bg={themeMode === "dark" ? "var(--dashboard-shell-bg)" : "var(--dashboard-page-bg)"}
      color="var(--dashboard-page-text)"
      data-admin-dashboard-shell="true"
    >
      <ShortcutBar
        userRole={userRole || "admin"}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        executives={[]}
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
      />

      <Flex align="stretch" justify="center" pt={{ base: "116px", md: "64px" }} px={[2, 3]} pb={[2, 3]}>
        <Box
          w="full"
          maxW={monitorOpen ? "100%" : "7xl"}
          className="dashboard-theme-card"
          borderRadius="xl"
          px={[3, 5]}
          py={[2, 3]}
          overflow="visible"
          display="flex"
          flexDirection="column"
          gap={2}
        >
          <PageHeader
            title="Report Dispatch"
            mb={2}
            actions={canAutoView ? (
              <Button
                size="sm"
                variant={monitorOpen ? "solid" : "outline"}
                colorScheme="purple"
                onClick={async () => {
                  const next = !monitorOpen;
                  setMonitorOpen(next);
                  if (next) await loadAutoDispatchJobs({ limit: 120, resetPage: true });
                }}
                leftIcon={monitorOpen ? <Printer size={14} /> : <FaWhatsapp />}
              >
                {monitorOpen ? "Report Dispatch" : "Dispatch Monitor"}
              </Button>
            ) : null}
          />

          {!monitorOpen ? (
            <Box
              borderWidth="1px"
              borderColor={themeMode === "dark" ? "whiteAlpha.300" : "var(--border)"}
              borderRadius="lg"
              px={3}
              py={2}
              bg={themeMode === "dark" ? "rgba(19,22,30,0.96)" : "var(--surface)"}
            >
              <Flex direction="column" gap={2}>
                <Flex direction={{ base: "column", xl: "row" }} gap={2} align={{ base: "stretch", xl: "center" }} justify="space-between">
                  <form onSubmit={handleLookup} style={{ minWidth: 0 }}>
                    <Flex align="center" gap={3}>
                      <Button
                        size="sm"
                        leftIcon={<List size={14} />}
                        colorScheme="purple"
                        variant="solid"
                        onClick={handleOpenDateModal}
                        isLoading={dailyLoading}
                        flexShrink={0}
                      >
                        List Requisitions
                      </Button>
                      <Text fontSize="xs" color="var(--text-3)" whiteSpace="nowrap">
                        {(Array.isArray(dailyRows) ? dailyRows.length : 0)} cached
                      </Text>
                    </Flex>
                  </form>

                  <Flex gap={2} wrap={{ base: "wrap", lg: "nowrap" }} align="center" justify={{ base: "flex-start", xl: "flex-end" }}>
                    <SegmentedControl
                      value={actionMode === "download" ? "download" : (isMobileViewport ? "share" : "open")}
                      onChange={(v) => setActionMode(v)}
                      options={[
                        { value: isMobileViewport ? "share" : "open", label: isMobileViewport ? "Share" : "Open", icon: isMobileViewport ? <Share2 size={12} /> : <ExternalLink size={12} /> },
                        { value: "download", label: "Download", icon: <Download size={12} /> },
                      ]}
                    />
                    <HStack spacing={2}>
                      <Text fontSize="sm">Header</Text>
                      <Switch colorScheme="purple" size="md" isChecked={headerRequired} onChange={(e) => setHeaderRequired(e.target.checked)} />
                    </HStack>
                  </Flex>
                </Flex>
              </Flex>
            </Box>
          ) : null}

          {error ? <Text color="red.400" fontSize="sm">{error}</Text> : null}

          {!monitorOpen ? (
          <Flex gap={2} direction={{ base: "column", lg: "row" }} align="stretch">
            {!isScopedMode && (
              <Box flexGrow={1} flexShrink={1} flexBasis="0%" minW={0}>
                <Pane title="Search" bodyPx={3} bodyPy={2}>
                  <Flex gap={2} align="center" mb={2}>
                    <Input size="sm" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="Phone (10-digit)" flex="1" minW={0} />
                    <Button size="sm" w="110px" leftIcon={<Search size={14} />} colorScheme="purple" variant="solid" onClick={handleOpenPhoneModal} isLoading={phoneLoading} flexShrink={0}>Report List</Button>
                  </Flex>
                  <Flex gap={2} align="center" mb={2}>
                    <Input size="sm" value={reqnoInput} onChange={(e) => setReqnoInput(e.target.value)} placeholder="REQNO" flex="1" minW={0} />
                    <Button size="sm" w="110px" leftIcon={<Search size={14} />} variant="outline" onClick={handleReqnoQuickLookup} isLoading={loadingStatus} flexShrink={0}>
                      Check Status
                    </Button>
                  </Flex>
                  <Text fontSize="11px" fontWeight="600" color="var(--text-4)">
                    {Array.isArray(phoneReports) ? phoneReports.length : 0} cached
                  </Text>
                </Pane>
              </Box>
            )}

            {!isScopedMode && (
            <Box flexGrow={1} flexShrink={1} flexBasis="0%" minW={0}>
              <Pane
                title={statusReqno !== "-" ? statusReqno : "Patient"}
                badge={statusReqno !== "-" ? (
                  <StatusPill status={derivePillStatus(tone, status?.live_status?.overall_status)}>
                    {status?.live_status?.overall_status || "-"}
                  </StatusPill>
                ) : null}
                bodyPx={3}
                bodyPy={3}
              >
                <SimpleGrid columns={2} spacing={3} mb={2}>
                  <DataCell label="Patient" value={statusPatient} />
                  <DataCell label="Phone" value={statusPhone} mono />
                  <DataCell label="MRNO" value={statusMrno} mono />
                  <DataCell label="Source" value={statusSource} />
                </SimpleGrid>
                <ReadyBar items={[
                  { label: "Lab", ready: status?.live_status?.lab_ready || 0, total: status?.live_status?.lab_total || 0 },
                  { label: "Radiology", ready: status?.live_status?.radiology_ready || 0, total: status?.live_status?.radiology_total || 0 },
                ]} />
                {displayValue(decision?.reason) !== "-" ? (
                  <Text fontSize="11px" color="var(--text-3)" mt={2} lineHeight="1.4">{displayValue(decision?.reason)}</Text>
                ) : null}
                {activeAutoJob ? (
                  <Flex gap={2} align="center" mt={2}>
                    <Text fontSize="11px" fontWeight="600" color="var(--text-3)" textTransform="uppercase" letterSpacing="0.05em">Auto</Text>
                    <Text fontSize="12px" color="var(--text-3)">{String(activeAutoJob?.status || "-").toUpperCase()}{activeAutoJob?.sent_at ? ` · ${formatIstDateTime(activeAutoJob.sent_at)}` : ""}</Text>
                  </Flex>
                ) : null}
              </Pane>
            </Box>
            )}

            <Box flexGrow={1} flexShrink={1} flexBasis="0%" minW={0}>
              <Pane title="Dispatch Actions" bodyPx={3} bodyPy={3}>
                <SimpleGrid columns={{ base: 2, md: 3 }} spacing={1.5}>
                  <ActionBtn compact icon={<Files size={14} />}       label="All"              variant="lab"        onClick={() => openDocument("all")} disabled={!hasStatus || !canDispatch || (!hasLab && !hasRadiology)} />
                  <ActionBtn compact icon={<FlaskConical size={14} />} label="Lab"              variant="lab"        onClick={() => openDocument("lab")} disabled={!hasStatus || !canDispatch || !hasLab} />
                  <ActionBtn compact icon={<Scan size={14} />}         label="Radiology"        variant="rad"        onClick={() => openDocument("radiology")} disabled={!hasStatus || !canDispatch || !hasRadiology} />
                  <ActionBtn compact icon={<TrendingUp size={14} />}   label="Trend"            variant="trend"      onClick={openTrend} disabled={!hasStatus || !canTrend} />
                  <ActionBtn compact icon={<LineChart size={14} />}    label="Trends v2.0"      variant="trendv2"    onClick={openSmartTrends} disabled={!hasStatus || !canSmartTrends} />
                  <ActionBtn compact icon={<LayoutList size={14} />}   label="Summary"          variant="summary"    onClick={openSmartSummary} disabled={!hasStatus || !canSmartTrends} />
                  <ActionBtn compact icon={<Clock size={14} />}        label="Pending"          variant="pending"    onClick={() => openDocument("all", { printtype: "0" })} disabled={!hasStatus || !currentReqid() || !hasLab} />
                  {ENABLE_OUTSOURCED_MANUAL_DISPATCH ? (
                    <ActionBtn compact icon={<Package size={14} />}    label="Outsourced"       variant="outsourced" onClick={openOutsourcedModal} disabled={!hasStatus || !currentReqno()} />
                  ) : null}
                </SimpleGrid>
              </Pane>
            </Box>
          </Flex>
          ) : null}

          {monitorOpen ? (
            <Box
              borderWidth="1px"
              borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"}
              borderRadius="xl"
              p={3}
              bg={themeMode === "dark" ? "rgba(255,255,255,0.03)" : "white"}
              boxShadow={themeMode === "dark" ? "none" : "sm"}
            >
              <Flex align="center" justify="space-between" wrap="wrap" gap={2} mb={2}>
                <HStack spacing={2} align="center">
                  <Text fontWeight="bold" fontSize="lg">Auto Dispatch Monitor</Text>
                  <Badge colorScheme="blue" px={2} py={1} borderRadius="md">{autoJobsCount} Total</Badge>
                  <Badge px={2} py={1} borderRadius="md">{autoScopedLabIds.length} Lab(s)</Badge>
                </HStack>
                <ButtonGroup isAttached size="xs" variant="outline">
                  <Button
                    type="button"
                    colorScheme={monitorMode === "ops" ? "blue" : undefined}
                    variant={monitorMode === "ops" ? "solid" : "outline"}
                    onClick={() => setMonitorMode("ops")}
                  >
                    Ops
                  </Button>
                  <Button
                    type="button"
                    colorScheme={monitorMode === "diagnostic" ? "orange" : undefined}
                    variant={monitorMode === "diagnostic" ? "solid" : "outline"}
                    onClick={() => setMonitorMode("diagnostic")}
                  >
                    Diagnostic ({diagnosticAlertCount})
                  </Button>
                </ButtonGroup>
              </Flex>

              <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={2} mb={2}>
                <Box p={2} borderWidth="2px" borderRadius="md" cursor="pointer"
                  bg={themeMode === "dark" ? "orange.900" : "orange.50"}
                  borderColor={autoStatusFilter === "queued" ? "orange.400" : "transparent"}
                  _hover={{ borderColor: "orange.300" }}
                  onClick={() => setAutoStatusFilter(autoStatusFilter === "queued" ? "" : "queued")}
                ><Text fontSize="xs" opacity={0.7}>Pending Queue</Text><Text fontWeight="bold">{monitorTopStats.pendingQueue}</Text></Box>
                <Box p={2} borderWidth="2px" borderRadius="md" cursor="pointer"
                  bg={themeMode === "dark" ? "yellow.800" : "yellow.100"}
                  borderColor={autoStatusFilter === "cooling_off" ? "yellow.500" : "transparent"}
                  _hover={{ borderColor: "yellow.400" }}
                  onClick={() => setAutoStatusFilter(autoStatusFilter === "cooling_off" ? "" : "cooling_off")}
                ><Text fontSize="xs" opacity={0.7}>Cooling Off</Text><Text fontWeight="bold">{monitorTopStats.coolingOff}</Text></Box>
                <Box p={2} borderWidth="2px" borderRadius="md" cursor="pointer"
                  bg={themeMode === "dark" ? "red.900" : "red.50"}
                  borderColor={autoStatusFilter === "failed" ? "red.400" : "transparent"}
                  _hover={{ borderColor: "red.300" }}
                  onClick={() => setAutoStatusFilter(autoStatusFilter === "failed" ? "" : "failed")}
                ><Text fontSize="xs" opacity={0.7}>Failed (today)</Text><Text fontWeight="bold">{monitorTopStats.failedUnpaused}</Text></Box>
                <Box p={2} borderWidth="2px" borderRadius="md" cursor="pointer"
                  bg={themeMode === "dark" ? "teal.900" : "teal.50"}
                  borderColor={autoStatusFilter === "sent" ? "teal.400" : "transparent"}
                  _hover={{ borderColor: "teal.300" }}
                  onClick={() => setAutoStatusFilter(autoStatusFilter === "sent" ? "" : "sent")}
                >
                  <Text fontSize="xs" opacity={0.7}>Sent Today{monitorTopStats.prevDaySent > 0 ? ` (+${monitorTopStats.prevDaySent} prev)` : ""}</Text>
                  <Text fontWeight="bold">{monitorTopStats.sentToday}</Text>
                  <Text fontSize="10px" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.700"}>
                    Lab {sentTodaySplit.lab} • Scan {sentTodaySplit.radiology} • Both {sentTodaySplit.hybrid}{sentTodaySplit.other > 0 ? ` • Other ${sentTodaySplit.other}` : ""}
                  </Text>
                </Box>
                <Box p={2} borderWidth="2px" borderRadius="md" cursor="pointer"
                  bg={themeMode === "dark" ? "green.900" : "green.50"}
                  borderColor={autoStatusFilter === "sent" ? "green.400" : "transparent"}
                  _hover={{ borderColor: "green.300" }}
                  onClick={() => setAutoStatusFilter(autoStatusFilter === "sent" ? "" : "sent")}
                >
                  <Text fontSize="xs" opacity={0.7}>Delivery Status</Text>
                  <Text fontWeight="bold">{(autoSummary?.delivery_read_jobs ?? monitorDateStats.read) + (autoSummary?.delivery_delivered_jobs ?? monitorDateStats.delivered)}</Text>
                  <Text fontSize="10px" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.700"}>
                    Read {autoSummary?.delivery_read_jobs ?? monitorDateStats.read} • Delivered {autoSummary?.delivery_delivered_jobs ?? monitorDateStats.delivered}
                  </Text>
                </Box>
              </SimpleGrid>

              <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"} mb={3}>
                <Text fontSize="xs" opacity={0.7} mb={1}>Pipeline (tests)</Text>
                <HStack spacing={2} mb={1}>
                  <Badge colorScheme="green">Ready {monitorPipeline.ready}</Badge>
                  <Badge colorScheme="yellow">Waiting {monitorPipeline.waiting}</Badge>
                  <Badge colorScheme="red">Pending Approval {monitorPipeline.pendingApproval}</Badge>
                </HStack>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.700"}>
                  Lab: ready {monitorPipeline.labReady}, waiting {monitorPipeline.labWaiting}, approval {monitorPipeline.labPendingApproval} •
                  Scans: ready {monitorPipeline.scanReady}, waiting {monitorPipeline.scanWaiting}, approval {monitorPipeline.scanPendingApproval}
                </Text>
              </Box>

              <Flex align="center" justify="space-between" wrap="wrap" gap={2} mb={3}>
                <HStack spacing={2} align="center">
                  <Text fontWeight="bold" fontSize="lg">Auto Dispatch Monitor</Text>
                </HStack>
                <HStack spacing={2}>
                  <ButtonGroup isAttached size="sm" variant="outline">
                    <Button
                      type="button"
                      colorScheme={autoViewFilter === "pending" ? "orange" : undefined}
                      variant={autoViewFilter === "pending" ? "solid" : "outline"}
                      onClick={() => setAutoViewFilter("pending")}
                    >
                      Pending
                    </Button>
                    <Button
                      type="button"
                      colorScheme={autoViewFilter === "all" ? "blue" : undefined}
                      variant={autoViewFilter === "all" ? "solid" : "outline"}
                      onClick={() => setAutoViewFilter("all")}
                    >
                      All
                    </Button>
                  </ButtonGroup>
                  <Select size="sm" maxW="220px" borderRadius="md" value={autoStatusFilter} onChange={(e) => setAutoStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    <option value="queued">queued</option>
                    <option value="cooling_off">cooling_off</option>
                    <option value="retrying">retrying</option>
                    <option value="eligible">eligible</option>
                    <option value="sending">sending</option>
                    <option value="sent">sent</option>
                    <option value="failed">failed</option>
                    <option value="cancelled">cancelled</option>
                  </Select>
                  <IconButton
                    type="button"
                    size="sm"
                    aria-label="Refresh"
                    icon={<RefreshCw size={14} />}
                    variant="outline"
                    onClick={() => loadAutoDispatchJobs({ limit: 120 })}
                    isLoading={autoLoading}
                  />
                  {canAutoPauseAll ? (
                    (() => {
                      const pausableVisibleJobIds = autoFilteredJobs
                        .filter((row) => ["queued", "cooling_off", "retrying", "eligible"].includes(String(row?.status || "").toLowerCase()))
                        .map((row) => row?.id);
                      const pausedVisibleJobIds = autoFilteredJobs
                        .filter((row) => Boolean(row?.is_paused))
                        .map((row) => row?.id);
                      const canResumeAllVisible =
                        pausedVisibleJobIds.length > 0 &&
                        pausableVisibleJobIds.length > 0 &&
                        pausedVisibleJobIds.length >= pausableVisibleJobIds.length;
                      return (
                        <IconButton
                          size="sm"
                          type="button"
                          aria-label={canResumeAllVisible ? "Resume all paused" : "Pause all visible"}
                          icon={canResumeAllVisible ? <Play size={14} /> : <Pause size={14} />}
                          colorScheme={canResumeAllVisible ? "green" : "orange"}
                          variant="solid"
                          onClick={() => {
                            if (canResumeAllVisible) {
                              openBulkConfirm("resume_all", pausedVisibleJobIds);
                              return;
                            }
                            openBulkConfirm("pause_all", pausableVisibleJobIds);
                          }}
                          isLoading={autoActionLoading}
                        />
                      );
                    })()
                  ) : null}
                </HStack>
              </Flex>

              {monitorMode === "diagnostic" ? (
                <SimpleGrid columns={{ base: 2, md: 4, lg: 5 }} spacing={2} mb={3}>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "blue.900" : "blue.50"}><Text fontSize="xs" opacity={0.7}>Total Jobs</Text><Text fontWeight="bold">{monitorTopStats.totalJobs}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "green.900" : "green.50"}><Text fontSize="xs" opacity={0.7}>Lab Ready (tests)</Text><Text fontWeight="bold">{monitorPipeline.labReady}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "green.900" : "green.50"}><Text fontSize="xs" opacity={0.7}>Scans Ready (tests)</Text><Text fontWeight="bold">{monitorPipeline.scanReady}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "orange.900" : "orange.50"}><Text fontSize="xs" opacity={0.7}>Invalid Phone (day)</Text><Text fontWeight="bold">{monitorRisk.invalidPhone}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "purple.900" : "purple.50"}><Text fontSize="xs" opacity={0.7}>PDF Missing (day)</Text><Text fontWeight="bold">{monitorRisk.pdfMissing}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "orange.900" : "orange.50"}><Text fontSize="xs" opacity={0.7}>Timeout / 5xx (day)</Text><Text fontWeight="bold">{monitorRisk.timeout5xx}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "purple.900" : "purple.50"}>
                    <Tooltip
                      label="Sent jobs without final delivery/read callback mapping. Includes sent-only and no-callback cases."
                      hasArrow
                      openDelay={250}
                    >
                      <Text fontSize="xs" opacity={0.7}>Sent Only / No Callback</Text>
                    </Tooltip>
                    <Text fontWeight="bold">{autoSummary?.sent_only_no_callback_jobs ?? ((autoSummary?.delivery_sent_only_jobs ?? monitorDateStats.sent_only) + (autoSummary?.delivery_unknown_jobs ?? monitorDateStats.unknown))}</Text>
                  </Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "blue.900" : "blue.50"}><Text fontSize="xs" opacity={0.7}>Previous Days Sent</Text><Text fontWeight="bold">{autoSummary?.previous_days_sent_jobs ?? 0}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "teal.900" : "teal.50"}><Text fontSize="xs" opacity={0.7}>Outsourced Sent</Text><Text fontWeight="bold">{autoSummary?.outsourced_sent_jobs ?? 0}</Text></Box>
                  <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "gray.800" : "gray.50"}><Text fontSize="xs" opacity={0.7}>Paused</Text><Text fontWeight="bold">{monitorDateStats.paused}</Text></Box>
                </SimpleGrid>
              ) : null}
              <HStack spacing={2} mb={3}>
                <Input
                  size="sm"
                  maxW="320px"
                  value={autoSearchInput}
                  onChange={(e) => setAutoSearchInput(e.target.value)}
                  placeholder="Search reqno/patient/phone/status/error"
                />
                <Button type="button" size="sm" leftIcon={<Search size={14} />} onClick={() => { setAutoSearch(autoSearchInput); setAutoPage(1); }}>
                  Search
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setAutoSearchInput(""); setAutoSearch(""); setAutoPage(1); }}>
                  Clear
                </Button>
              </HStack>
              <AlertDialog
                isOpen={bulkConfirmDialog.isOpen}
                leastDestructiveRef={bulkCancelRef}
                onClose={() => {
                  bulkConfirmDialog.onClose();
                  setBulkActionState({ action: "", jobIds: [] });
                }}
                isCentered
              >
                <AlertDialogOverlay>
                  <AlertDialogContent>
                    <AlertDialogHeader fontSize="lg" fontWeight="700">
                      {String(bulkActionState?.action || "").toLowerCase() === "resume_all" ? "Resume All Dispatches" : "Pause All Dispatches"}
                    </AlertDialogHeader>
                    <AlertDialogBody>
                      {String(bulkActionState?.action || "").toLowerCase() === "resume_all"
                        ? "Are you sure you want to resume all paused dispatches?"
                        : "Are you sure you want to pause ALL dispatches?"}
                    </AlertDialogBody>
                    <AlertDialogFooter>
                      <Button ref={bulkCancelRef} onClick={() => {
                        bulkConfirmDialog.onClose();
                        setBulkActionState({ action: "", jobIds: [] });
                      }}>
                        No
                      </Button>
                      <Button
                        colorScheme={String(bulkActionState?.action || "").toLowerCase() === "resume_all" ? "green" : "orange"}
                        onClick={confirmBulkAction}
                        ml={3}
                        isLoading={autoActionLoading}
                      >
                        Yes, I&apos;m sure
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialogOverlay>
              </AlertDialog>
              <Flex mb={3} align="center" justify="space-between" wrap="wrap" gap={2}>
                <Text fontSize="xs">{autoFilteredJobs.length} records</Text>
                <HStack spacing={2}>
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="First page"
                    icon={<ChevronLeft size={14} />}
                    onClick={() => setAutoPage(1)}
                    isDisabled={safeAutoPage <= 1}
                    variant="outline"
                  />
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="Previous page"
                    icon={<ChevronLeft size={14} />}
                    onClick={() => setAutoPage((p) => Math.max(1, p - 1))}
                    isDisabled={safeAutoPage <= 1}
                  />
                  <Text fontSize="xs">Page {safeAutoPage} / {totalAutoPages}</Text>
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="Next page"
                    icon={<ChevronRight size={14} />}
                    onClick={() => setAutoPage((p) => Math.min(totalAutoPages, p + 1))}
                    isDisabled={safeAutoPage >= totalAutoPages}
                  />
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="Last page"
                    icon={<ChevronRight size={14} />}
                    onClick={() => setAutoPage(totalAutoPages)}
                    isDisabled={safeAutoPage >= totalAutoPages}
                    variant="outline"
                  />
                </HStack>
              </Flex>

              {isMobileViewport ? (
                <Box>
                  {pagedAutoJobs.map((job) => {
                    const jobId = String(job?.id || "");
                    const statusValue = String(job?.status || "");
                    const canResumeRow = canAutoPause && Boolean(job?.is_paused);
                    const canPauseRow = canAutoPause && !job?.is_paused;
                    const canPushRow = canAutoPush;
                    const canSendToRow = canAutoSendTo;
                    const isTerminalRow = ["sent", "cancelled"].includes(String(job?.status || "").toLowerCase());
                    const canTogglePause = (canPauseRow || canResumeRow) && !isTerminalRow;
                    const pauseAction = job?.is_paused ? "resume" : "pause";
                    const pauseLabel = job?.is_paused ? "Resume" : "Pause";
                    const pauseIcon = job?.is_paused ? <Play size={14} /> : <Pause size={14} />;
                    const pauseColor = job?.is_paused ? "green" : "orange";
                    const whyText = buildWhyText(job);
                    return (
                      <Box key={jobId || `${job?.reqid || ""}_${job?.reqno || ""}`} borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="md" p={2} mb={2}>
                        <Flex justify="space-between" align="center" mb={1.5}>
                          <Badge colorScheme={statusValue === "sent" ? "green" : statusValue === "failed" ? "red" : statusValue === "queued" || statusValue === "cooling_off" || statusValue === "retrying" ? "orange" : "blue"} borderRadius="md" px={2} textTransform="lowercase">
                            {displayValue(statusValue)}
                          </Badge>
                          <Badge colorScheme={job?.is_paused ? "orange" : "green"}>{job?.is_paused ? "Paused" : (String(job?.status || "").toLowerCase() === "sent" ? deriveDeliveryStatus(job).toUpperCase() : "Active")}</Badge>
                        </Flex>
                        <Text fontSize="xs" fontWeight="semibold">
                          <Text
                            as="span"
                            fontWeight="bold"
                            cursor="pointer"
                            userSelect="text"
                            onClick={() => handleReqnoClick(job)}
                          >
                            {displayValue(job?.reqno)}
                          </Text>
                          {" • "}
                          {displayValue(job?.patient_name)}
                        </Text>
                        <Text fontSize="xs" color="gray.600">{displayValue(job?.phone)} • {Number(job?.attempt_count || 0)}/{Number(job?.max_attempts || 0)}</Text>
                        <Tooltip label={whyText} hasArrow openDelay={250}>
                          <Text fontSize="xs" mt={1} noOfLines={2}>Why: {whyText}</Text>
                        </Tooltip>
                        <Tooltip label={smartTimestamp(job)} hasArrow openDelay={250}>
                          <Text fontSize="xs" noOfLines={1}>Time: {smartTimestamp(job)}</Text>
                        </Tooltip>
                        <HStack spacing={1.5} mt={2} wrap="nowrap">
                          <Tooltip label="Events" hasArrow openDelay={250}>
                            <IconButton size="xs" type="button" aria-label="Events" variant="outline" icon={<Activity size={14} />} onClick={() => openAutoEvents(job)} isLoading={isRowActionLoading(jobId, "events")} />
                          </Tooltip>
                          <Tooltip label="WhatsApp dispatch now" hasArrow openDelay={250}>
                            <IconButton
                              size="xs"
                              type="button"
                              aria-label="WhatsApp dispatch now"
                              colorScheme="green"
                              variant="solid"
                              bg="green.500"
                              color="white"
                              icon={<FaWhatsapp />}
                              onClick={() => confirmAndPushJob(job)}
                              isDisabled={!canPushRow}
                              isLoading={isRowActionLoading(jobId, "push_now")}
                              _hover={{ bg: "green.600", transform: "translateY(-1px)" }}
                              _disabled={{ bg: "gray.200", color: "gray.500", opacity: 1, cursor: "not-allowed" }}
                            />
                          </Tooltip>
                          <Tooltip label="Push to" hasArrow openDelay={250}>
                            <IconButton size="xs" type="button" aria-label="Push to" colorScheme="purple" icon={<UploadCloud size={14} />} onClick={() => openPushTemplateModal(job)} isDisabled={!canSendToRow} />
                          </Tooltip>
                          <Tooltip label={pauseLabel} hasArrow openDelay={250}>
                            <IconButton size="xs" type="button" aria-label={pauseLabel} colorScheme={pauseColor} variant={canTogglePause ? "solid" : "outline"} icon={pauseIcon} onClick={() => runAutoJobAction(jobId, pauseAction)} isDisabled={!canTogglePause} isLoading={isRowActionLoading(jobId, pauseAction)} />
                          </Tooltip>
                        </HStack>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="md" overflowX="auto" overflowY="visible">
                  <Table
                    size="sm"
                    variant="simple"
                    sx={{
                      tableLayout: "fixed",
                      minWidth: "1080px",
                      "th, td": { fontSize: "xs", py: 2, verticalAlign: "top", whiteSpace: "normal", wordBreak: "break-word" },
                      th: {
                        bg: themeMode === "dark" ? "gray.800" : "gray.50",
                        letterSpacing: "0.08em"
                      }
                    }}
                  >
                    <Thead>
                      <Tr>
                        <Th>Status</Th>
                        <Th>REQNO</Th>
                        <Th>Patient</Th>
                        <Th>Phone</Th>
                        <Th>Attempts</Th>
                        <Th>Why / State</Th>
                        <Th>Timeline (IST)</Th>
                        <Th>Send Status</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {pagedAutoJobs.map((job) => {
                      const jobId = String(job?.id || "");
                      const statusValue = String(job?.status || "");
                      const canResumeRow = canAutoPause && Boolean(job?.is_paused);
                      const canPauseRow = canAutoPause && !job?.is_paused;
                      const canPushRow = canAutoPush;
                      const canSendToRow = canAutoSendTo;
                      const isTerminalRow = ["sent", "cancelled"].includes(String(job?.status || "").toLowerCase());
                      const canTogglePause = (canPauseRow || canResumeRow) && !isTerminalRow;
                      const pauseAction = job?.is_paused ? "resume" : "pause";
                      const pauseLabel = job?.is_paused ? "Resume" : "Pause";
                      const pauseIcon = job?.is_paused ? <Play size={14} /> : <Pause size={14} />;
                      const pauseColor = job?.is_paused ? "green" : "orange";
                      return (
                        <Tr key={jobId || `${job?.reqid || ""}_${job?.reqno || ""}`}>
                          <Td>
                            <Badge
                              colorScheme={
                                statusValue === "sent"
                                  ? "green"
                                  : statusValue === "failed"
                                    ? "red"
                                    : statusValue === "queued" || statusValue === "cooling_off" || statusValue === "retrying"
                                      ? "orange"
                                      : "blue"
                              }
                              borderRadius="md"
                              px={2}
                              textTransform="lowercase"
                            >
                              {displayValue(statusValue)}
                            </Badge>
                          </Td>
                          <Td w="10%" fontWeight="bold">
                            <Text
                              as="span"
                              fontWeight="bold"
                              cursor="pointer"
                              userSelect="text"
                              onClick={() => handleReqnoClick(job)}
                            >
                              {displayValue(job?.reqno)}
                            </Text>
                          </Td>
                          <Td w="13%">{displayValue(job?.patient_name)}</Td>
                          <Td w="10%">{displayValue(job?.phone)}</Td>
                          <Td>{Number(job?.attempt_count || 0)}/{Number(job?.max_attempts || 0)}</Td>
                          <Td w="20%">
                            <Tooltip
                              label={
                                buildWhyText(job)
                              }
                              hasArrow
                              openDelay={250}
                            >
                              <Text noOfLines={2}>
                                {buildWhyText(job)}
                              </Text>
                            </Tooltip>
                          </Td>
                          <Td w="14%">
                            {(() => {
                              const tp = timelineParts(job);
                              return (
                                <Tooltip label={smartTimestamp(job)} hasArrow openDelay={250}>
                                  <Box>
                                    <Text noOfLines={1}>{tp.label}: {tp.date}</Text>
                                    <Text noOfLines={1}>{tp.time}</Text>
                                  </Box>
                                </Tooltip>
                              );
                            })()}
                          </Td>
                          <Td>
                            {job?.is_paused ? (
                              <Badge colorScheme="orange">Paused</Badge>
                            ) : String(job?.status || "").toLowerCase() === "sent" ? (
                              <Box>
                                <Badge colorScheme={deriveDeliveryStatus(job) === "read" ? "green" : deriveDeliveryStatus(job) === "delivered" ? "blue" : deriveDeliveryStatus(job) === "failed" ? "red" : "gray"}>
                                  {deriveDeliveryStatus(job)}
                                </Badge>
                                <Text fontSize="10px" mt={0.5}>{formatIstDateTime(job?.delivery_status_at, { naiveTz: "utc" })}</Text>
                              </Box>
                            ) : (
                              <Badge colorScheme="yellow">Active</Badge>
                            )}
                          </Td>
                          <Td w="24%">
                            <HStack spacing={1.5} mb={1.5} wrap="nowrap">
                              <Tooltip label="Events" hasArrow openDelay={250}>
                                <IconButton
                                  size="xs"
                                  type="button"
                                  aria-label="Events"
                                  variant="outline"
                                  icon={<Activity size={14} />}
                                  onClick={() => openAutoEvents(job)}
                                  isLoading={isRowActionLoading(jobId, "events")}
                                  _hover={{ bg: "gray.100" }}
                                />
                              </Tooltip>
                              <Tooltip label="WhatsApp dispatch now" hasArrow openDelay={250}>
                                <IconButton
                                  size="xs"
                                  type="button"
                                  aria-label="WhatsApp dispatch now"
                                  colorScheme="green"
                                  variant="solid"
                                  bg="green.500"
                                  color="white"
                                  icon={<FaWhatsapp />}
                                  onClick={() => confirmAndPushJob(job)}
                                  isDisabled={!canPushRow}
                                  isLoading={isRowActionLoading(jobId, "push_now")}
                                  _hover={{ bg: "green.600", transform: "translateY(-1px)" }}
                                  _disabled={{ bg: "gray.200", color: "gray.500", opacity: 1, cursor: "not-allowed" }}
                                />
                              </Tooltip>
                              <Tooltip label="Push to" hasArrow openDelay={250}>
                                <IconButton
                                  size="xs"
                                  type="button"
                                  aria-label="Push to"
                                  colorScheme="purple"
                                  icon={<UploadCloud size={14} />}
                                  onClick={() => openPushTemplateModal(job)}
                                  isDisabled={!canSendToRow}
                                  _hover={{ transform: "translateY(-1px)" }}
                                />
                              </Tooltip>
                              <Tooltip label={pauseLabel} hasArrow openDelay={250}>
                                <IconButton
                                  size="xs"
                                  type="button"
                                  aria-label={pauseLabel}
                                  colorScheme={pauseColor}
                                  variant={canTogglePause ? "solid" : "outline"}
                                  icon={pauseIcon}
                                  onClick={() => runAutoJobAction(jobId, pauseAction)}
                                  isDisabled={!canTogglePause}
                                  isLoading={isRowActionLoading(jobId, pauseAction)}
                                  _hover={{ transform: "translateY(-1px)" }}
                                />
                              </Tooltip>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                      })}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </Box>
          ) : null}

          <Pane
            title={isScopedMode && statusReqno !== "-" ? statusReqno : (isScopedMode ? "Report Detail" : "Tests")}
            badge={isScopedMode && statusReqno !== "-" ? (
              <StatusPill status={tone === "green" ? "ready" : tone === "orange" ? "pending" : "closed"}>
                {status?.live_status?.overall_status || "-"}
              </StatusPill>
            ) : null}
            noPad
          >
            {isScopedMode && (
              <>
                <SimpleGrid columns={{ base: 2, sm: 3, lg: 6 }} spacing={4} px={5} py={4} borderBottom="1px solid var(--border-soft)">
                  <DataCell label="Patient" value={statusPatient} />
                  <DataCell label="Phone" value={statusPhone} mono />
                  <DataCell label="MRNO" value={statusMrno} mono />
                  <DataCell label="Source" value={statusSource} />
                  <DataCell label="Reason" value={displayValue(decision?.reason)} dim />
                </SimpleGrid>
                <Box px={5} py={3} borderBottom="1px solid var(--border-soft)">
                  <ReadyBar items={[
                    { label: "Lab", ready: status?.live_status?.lab_ready || 0, total: status?.live_status?.lab_total || 0 },
                    { label: "Radiology", ready: status?.live_status?.radiology_ready || 0, total: status?.live_status?.radiology_total || 0 },
                  ]} />
                </Box>
              </>
            )}
            <Box overflow="auto">
              <Table size="sm" variant="simple" sx={{ "th, td": { fontSize: "xs", py: 1.5 } }}>
                <Thead>
                  <Tr>
                    <Th>Test</Th>
                    <Th>Dept</Th>
                    <Th>Status</Th>
                    <Th>Dispatch</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(Array.isArray(status?.live_status?.tests) ? status.live_status.tests : []).map((row) => {
                    const state = String(row?.state || "").trim();
                    const dept = String(row?.department || "").toLowerCase();
                    const pillStatus = state === "ready_not_dispatched" ? "ready" : state === "ready_dispatched" ? "dispatched" : "pending";
                    const dispatchLabel =
                      dept === "lab"
                        ? row?.dispatched ? "Dispatched" : detailLoadedFromMonitor ? "-" : "Not Dispatched"
                        : "-";
                    return (
                      <Tr key={row?.key || `${row?.test_id || ""}_${row?.test_name || ""}`}>
                        <Td>{displayValue(row?.test_name)}</Td>
                        <Td>
                          <DeptChip dept={dept === "radiology" ? "rad" : "bio"}>
                            {dept || "-"}
                          </DeptChip>
                        </Td>
                        <Td>
                          <StatusPill status={pillStatus}>
                            {state === "ready_not_dispatched" ? "Ready" : state === "ready_dispatched" ? "Dispatched" : "Pending"}
                          </StatusPill>
                        </Td>
                        <Td color="var(--text-3)" fontSize="11px">{dispatchLabel}</Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </Pane>
        </Box>
      </Flex>

      <Modal isOpen={phoneModal.isOpen} onClose={phoneModal.onClose} size="7xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader pr="3.5rem">
            <Flex align="center" justify="space-between">
              <Text>Phone Lookup Results</Text>
              <IconButton
                size="sm"
                aria-label="Refresh phone results"
                icon={<RefreshCw size={14} />}
                mr="2.5rem"
                onClick={() => loadPhoneReports(phoneInput, { force: true })}
                isLoading={phoneLoading}
              />
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Box overflow="auto" maxH="60vh" borderWidth="1px" borderColor="gray.200" borderRadius="md">
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th>REQNO</Th>
                      <Th>Patient</Th>
                      <Th>Date</Th>
                      <Th>MRNO</Th>
                      <Th>Source</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(Array.isArray(phoneReports) ? phoneReports : []).map((row) => (
                    <Tr
                      key={`${row?.reqid || ""}_${row?.reqno || ""}`}
                      cursor="pointer"
                      onClick={() => handleUseRow(row)}
                      _hover={{ bg: "blue.50" }}
                    >
                      <Td>{displayValue(row?.reqno)}</Td>
                      <Td>{displayValue(row?.patient_name)}</Td>
                      <Td>{displayValue(row?.reqdt)}</Td>
                      <Td>{displayValue(row?.mrno)}</Td>
                      <Td>{displayValue(row?.source)}</Td>
                    </Tr>
                  ))}
                  </Tbody>
                </Table>
              </Box>
          </ModalBody>
          <ModalFooter>
            <Button onClick={phoneModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={dateModal.isOpen} onClose={dateModal.onClose} size="7xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader pr="3.5rem">
            <Flex align="center" justify="space-between" gap={2}>
              <Text>Date-wise Requisitions ({selectedDate})</Text>
              <HStack mr="2.5rem">
                <Input size="sm" maxW="220px" value={dailyFilter} onChange={(e) => setDailyFilter(e.target.value)} placeholder="Filter list" />
                <IconButton
                  size="sm"
                  aria-label="Refresh date results"
                  icon={<RefreshCw size={14} />}
                  onClick={() => loadDateRows(selectedDate, { force: true })}
                  isLoading={dailyLoading}
                />
              </HStack>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {dailyMeta.scopeIssue === "missing_allowed_org_ids" ? (
              <Box mb={3} borderWidth="1px" borderColor="orange.300" bg="orange.50" borderRadius="md" p={2}>
                <Text fontSize="sm" color="orange.800">
                  This login is scoped but has no mapped org IDs, so Shivam lookup was skipped.
                </Text>
                <Text fontSize="xs" color="orange.700" mt={1}>
                  Assign org mapping on collection centre for this user and retry.
                </Text>
              </Box>
            ) : null}
            {dailyMeta.scoped ? (
              <Text fontSize="xs" color="gray.600" mb={2}>
                Scoped mode: {dailyMeta.allowedOrgIds.length} org ID(s) | Upstream called: {dailyMeta.upstreamCalled ? "Yes" : "No"}
              </Text>
            ) : null}
            <Box overflow="auto" maxH="60vh" borderWidth="1px" borderColor="gray.200" borderRadius="md">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>REQNO</Th>
                    <Th>Patient</Th>
                    <Th>Phone</Th>
                    <Th>MRNO</Th>
                    <Th>Source</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pagedDailyRows.map((row) => (
                    <Tr
                      key={`${row?.reqno || ""}_${row?.reqid || ""}`}
                      cursor="pointer"
                      onClick={() => handleUseRow(row)}
                      _hover={{ bg: "blue.50" }}
                    >
                      <Td>{displayValue(row?.reqno)}</Td>
                      <Td>{displayValue(row?.patient_name)}</Td>
                      <Td>{displayValue(row?.phoneno)}</Td>
                      <Td>{displayValue(row?.mrno)}</Td>
                      <Td>{displayValue(row?.source)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
            <Flex mt={2} align="center" justify="space-between">
              <Text fontSize="xs">{filteredDailyRows.length} records</Text>
              <HStack spacing={2}>
                <Button size="xs" onClick={() => setDailyPage((p) => Math.max(1, p - 1))} isDisabled={safeDailyPage <= 1}>Prev</Button>
                <Text fontSize="xs">Page {safeDailyPage} / {totalDailyPages}</Text>
                <Button size="xs" onClick={() => setDailyPage((p) => Math.min(totalDailyPages, p + 1))} isDisabled={safeDailyPage >= totalDailyPages}>Next</Button>
              </HStack>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button onClick={dateModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={autoEventsModal.isOpen} onClose={autoEventsModal.onClose} size="4xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Dispatch Events: Job #{displayValue(selectedJob?.id)}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Box overflow="auto" maxH="60vh" borderWidth="1px" borderColor="gray.200" borderRadius="md">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Time</Th>
                    <Th>Event</Th>
                    <Th>Message</Th>
                    <Th>Phone</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(Array.isArray(autoEvents) ? autoEvents : []).map((row) => (
                    <Tr key={String(row?.id || `${row?.job_id || ""}_${row?.created_at || ""}`)}>
                      <Td>{formatIstDateTime(row?.created_at)}</Td>
                      <Td>{displayValue(row?.event_type)}</Td>
                      <Td>{displayValue(row?.message)}</Td>
                      <Td>{displayValue(row?.phone)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button onClick={autoEventsModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={outsourcedModal.isOpen} onClose={outsourcedModal.onClose} size="5xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Outsourced Reports: {statusReqno}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {outsourcedError ? (
              <Text color="red.400" mb={2}>{outsourcedError}</Text>
            ) : null}
            <HStack mb={2} justify="flex-end">
              <Checkbox
                size="sm"
                isChecked={outsourcedIncludeHeader}
                onChange={(e) => setOutsourcedIncludeHeader(Boolean(e.target.checked))}
              >
                Include Header
              </Checkbox>
            </HStack>
            <Box overflow="auto" maxH="60vh" borderWidth="1px" borderColor="gray.200" borderRadius="md">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Test</Th>
                    <Th>Approved</Th>
                    <Th>Type</Th>
                    <Th>PDF Status</Th>
                    <Th>Send Method</Th>
                    <Th>Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {outsourcedLoading ? (
                    <Tr>
                      <Td colSpan={6}>Loading...</Td>
                    </Tr>
                  ) : null}
                  {!outsourcedLoading && outsourcedRows.length === 0 ? (
                    <Tr>
                      <Td colSpan={6}>No outsourced approved tests found.</Td>
                    </Tr>
                  ) : null}
                  {outsourcedRows.map((row) => {
                    const mode = String(row?.outsourced_mode || "unavailable").trim().toLowerCase();
                    const canSend = mode === "attached_base" || mode === "attached_qr";
                    const denied = Boolean(row?.denied) || String(row?.resolver_error || "").includes("SOURCE_CONFIDENTIAL_DO_NOT_SEND");
                    const rowKey = `${String(row?.reqid || "").trim()}_${String(row?.testid || "").trim()}`;
                    return (
                      <Tr key={rowKey}>
                        <Td>
                          <Text fontWeight="semibold">{displayValue(row?.test_name)}</Text>
                        </Td>
                        <Td>{yesNo(row?.approved_flg)}</Td>
                        <Td>{friendlyOutsourcedMode(row?.outsourced_mode)}</Td>
                        <Td>
                          <Text>{friendlyResolver(row?.resolver_status)}</Text>
                          {row?.resolver_error ? (
                            <Text fontSize="xs" color={denied ? "orange.500" : "red.400"}>{String(row.resolver_error)}</Text>
                          ) : null}
                        </Td>
                        <Td>{friendlyRoute(row?.route_hint)}</Td>
                        <Td>
                          {canSend ? (
                            <HStack spacing={1}>
                              <IconButton
                                size="xs"
                                aria-label="Download outsourced report"
                                icon={<Download size={14} />}
                                variant="outline"
                                onClick={() => openOutsourcedDownload(row)}
                              />
                              <IconButton
                                size="xs"
                                aria-label="Send outsourced report on WhatsApp"
                                icon={<FaWhatsapp />}
                                bg="#25D366"
                                color="white"
                                _hover={{ bg: "#1ebe5d" }}
                                _active={{ bg: "#179f4c" }}
                                onClick={() => openOutsourcedSendToModal(row)}
                                isDisabled={denied}
                              />
                            </HStack>
                          ) : (
                            <Text fontSize="xs" color="gray.500">Not required</Text>
                          )}
                          {row?.send_result === "sent" ? (
                            <Text fontSize="10px" color="green.600" mt={1}>Sent</Text>
                          ) : null}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button onClick={outsourcedModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <SendReportTemplateModal
        isOpen={pushTemplateModal.isOpen}
        onClose={() => {
          setOutsourcedTemplateContext(null);
          pushTemplateModal.onClose();
        }}
        defaultPhone={String(outsourcedTemplateContext?.phone || pushTemplateJob?.phone || "")}
        registeredPhone={String(outsourcedTemplateContext?.phone || pushTemplateJob?.phone || "")}
        defaultPatientName={String(outsourcedTemplateContext?.patient_name || pushTemplateJob?.patient_name || "")}
        defaultReqno={String(outsourcedTemplateContext?.reqno || pushTemplateJob?.reqno || "")}
        defaultMrno={String(pushTemplateJob?.mrno || "")}
        defaultTestid={String(outsourcedTemplateContext?.testid || "")}
        defaultReportSource={outsourcedTemplateContext ? "outsourced_report" : ""}
        onSent={({ phone, reportSource, testid }) => {
          if (reportSource === "outsourced_report" && testid) {
            setOutsourcedRows((prev) =>
              (Array.isArray(prev) ? prev : []).map((row) =>
                String(row?.testid || "").trim() === String(testid || "").trim()
                  ? { ...row, send_result: "sent" }
                  : row
              )
            );
          }
          toast({
            title: "Template sent",
            description: `Report template queued for ${phone}`,
            status: "success",
            duration: 2200,
            isClosable: true
          });
        }}
      />
    </Box>
  );
}
