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
  Flex,
  Heading,
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
  Progress,
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
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, RepeatIcon, SearchIcon } from "@chakra-ui/icons";
import { FiActivity, FiList, FiMessageCircle, FiPause, FiPlay, FiPrinter, FiSend, FiShare2, FiUploadCloud } from "react-icons/fi";
import dayjs from "dayjs";
import ShortcutBar from "@/components/ShortcutBar";
import SendReportTemplateModal from "@/components/report-dispatch/SendReportTemplateModal";

const ADMIN_THEME_STORAGE_KEY = "labbit-admin-dashboard-theme";
const DAILY_PAGE_SIZE = 10;
const AUTO_JOBS_PAGE_SIZE = 12;
const IST_TIMEZONE = "Asia/Kolkata";

function toneByMode(mode) {
  if (mode === "allow_full" || mode === "try_pending_print_once") return "green";
  if (mode === "manual_review") return "orange";
  return "gray";
}

function displayValue(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function byReqnoDesc(a, b) {
  const ra = String(a?.reqno || "").trim();
  const rb = String(b?.reqno || "").trim();
  const na = Number(ra);
  const nb = Number(rb);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return nb - na;
  return rb.localeCompare(ra);
}

function formatIstDateTime(value) {
  if (!value) return "-";
  const dt = new Date(value);
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

function formatIstDateAndTimeLines(value) {
  if (!value) return { date: "-", time: "-" };
  const dt = new Date(value);
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
  if (explicit) return explicit;
  const direct = String(
    payload?.delivery_status || payload?.message_status || payload?.status || payload?.deliveryState || ""
  ).trim().toLowerCase();
  const nested = String(payload?.statuses?.[0]?.status || payload?.messages?.[0]?.status || "").trim().toLowerCase();
  const state = nested || direct;
  if (["read", "delivered", "sent", "failed", "queued", "accepted"].includes(state)) return state;
  return "sent";
}

function stateHint(job) {
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
  if (status === "sent") {
    return `Sent at ${formatIstDateTime(job?.sent_at)}`;
  }
  if (status === "failed") {
    return "Max retries reached or terminal send failure";
  }
  return "-";
}

function smartTimestamp(job) {
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
  const [autoStatusFilter, setAutoStatusFilter] = useState("");
  const [autoSearchInput, setAutoSearchInput] = useState("");
  const [autoSearch, setAutoSearch] = useState("");
  const [showSentInline, setShowSentInline] = useState(false);
  const [autoJobs, setAutoJobs] = useState([]);
  const [autoEvents, setAutoEvents] = useState([]);
  const [autoSummary, setAutoSummary] = useState(null);
  const [autoJobsCount, setAutoJobsCount] = useState(0);
  const [autoScopedLabIds, setAutoScopedLabIds] = useState([]);
  const [autoPage, setAutoPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [grantedPermissions, setGrantedPermissions] = useState([]);
  const [pushTemplateJob, setPushTemplateJob] = useState(null);

  const [status, setStatus] = useState(null);
  const [selectedReportMeta, setSelectedReportMeta] = useState(null);

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoActionLoading, setAutoActionLoading] = useState(false);
  const [error, setError] = useState("");

  const [headerRequired, setHeaderRequired] = useState(false);
  const [actionMode, setActionMode] = useState("open");

  const phoneModal = useDisclosure();
  const dateModal = useDisclosure();
  const autoEventsModal = useDisclosure();
  const pushTemplateModal = useDisclosure();
  const bulkConfirmDialog = useDisclosure();

  const phoneCacheRef = useRef(new Map());
  const dateCacheRef = useRef(new Map());
  const headerDefaultAppliedRef = useRef(false);
  const bulkCancelRef = useRef(null);
  const [bulkActionState, setBulkActionState] = useState({ action: "", jobIds: [] });
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewportResolved, setViewportResolved] = useState(false);

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

  const readyPct = useMemo(() => {
    const ready = Number(status?.live_status?.lab_ready || 0);
    const total = Number(status?.live_status?.lab_total || 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((ready / total) * 100)));
  }, [status]);

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
    const status = String(autoStatusFilter || "").trim().toLowerCase();
    const byStatus = !status ? rows : rows.filter((row) => String(row?.status || "").trim().toLowerCase() === status);
    const q = String(autoSearch || "").trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((row) => {
      const hay = [
        row?.reqno,
        row?.reqid,
        row?.patient_name,
        row?.phone,
        row?.status,
        row?.is_paused ? "paused" : "active",
        row?.report_label,
        row?.last_error
      ].map((v) => String(v || "").toLowerCase()).join(" ");
      return hay.includes(q);
    });
  }, [autoJobs, autoStatusFilter, autoSearch]);

  const sentDispatchRows = useMemo(() => {
    return [...(Array.isArray(autoJobs) ? autoJobs : [])]
      .filter((row) => String(row?.status || "").toLowerCase() === "sent")
      .sort(byReqnoDesc);
  }, [autoJobs]);

  const monitorDateStats = useMemo(() => {
    const key = String(selectedDate || "").replace(/-/g, "");
    const dateJobs = (Array.isArray(autoJobs) ? autoJobs : []).filter((row) =>
      String(row?.reqno || "").startsWith(key)
    );
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
      sent_only: 0
    };
    for (const row of dateJobs) {
      const status = String(row?.status || "").trim().toLowerCase();
      if (status in stats) stats[status] += 1;
      if (row?.is_paused) stats.paused += 1;
      if (status === "sent") {
        const d = deriveDeliveryStatus(row);
        if (d === "read") stats.read += 1;
        else if (d === "delivered") stats.delivered += 1;
        else stats.sent_only += 1;
      }
    }
    return stats;
  }, [autoJobs, selectedDate]);

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

  async function handleUseRow(row) {
    phoneModal.onClose();
    dateModal.onClose();
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
    await handleUseRow(mapped);
  }

  async function loadAutoDispatchJobs(options = {}) {
    setAutoLoading(true);
    try {
      const limit = Number(options?.limit || 120);
      const query = new URLSearchParams({ limit: String(limit) });
      if (autoStatusFilter) query.set("status", autoStatusFilter);
      if (selectedDate) query.set("selected_date", selectedDate);
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
    }
  }

  async function runAutoJobAction(jobIdValue, action, extra = {}) {
    const jobId = String(jobIdValue || "").trim();
    if (!action) return;
    if (!jobId && action !== "pause_all" && action !== "resume_all") return;
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
    }
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

  const decision = status?.decision || null;
  const tone = toneByMode(decision?.mode);
  const activeMeta =
    String(selectedReportMeta?.reqno || "").trim() === String(status?.reqno || reqnoInput || "").trim()
      ? selectedReportMeta
      : null;

  const statusReqid = displayValue(status?.reqid || activeMeta?.reqid);
  const statusReqno = displayValue(status?.reqno || reqnoInput || activeMeta?.reqno);
  const statusPatient = displayValue(status?.live_status?.patient_name || activeMeta?.patient_name);
  const statusTestDate = displayValue(status?.live_status?.test_date || activeMeta?.reqdt);
  const statusPhone = displayValue(status?.live_status?.patient_phone || activeMeta?.phoneno);
  const statusMrno = displayValue(status?.live_status?.mrno || activeMeta?.mrno);
  const statusSource = displayValue(status?.live_status?.source || activeMeta?.source);
  const outputPrimaryIcon =
    actionMode === "download" ? <DownloadIcon /> : isMobileViewport ? <FiShare2 /> : <ExternalLinkIcon />;

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

      <Flex align="stretch" justify="center" pt={{ base: "116px", md: "64px" }} px={[2, 4]} pb={[2, 4]}>
        <Box
          w="full"
          maxW={monitorOpen ? "100%" : "7xl"}
          className="dashboard-theme-card"
          borderRadius="xl"
          px={[3, 5]}
          py={[3, 4]}
          overflow="visible"
          display="flex"
          flexDirection="column"
          gap={3}
        >
          <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
            <Heading className="dashboard-theme-heading" size="lg">Report Dispatch</Heading>
            {canAutoView ? (
              <Button
                size="sm"
                variant={monitorOpen ? "solid" : "outline"}
                colorScheme="blue"
                onClick={async () => {
                  const next = !monitorOpen;
                  setMonitorOpen(next);
                  if (next) await loadAutoDispatchJobs({ limit: 120, resetPage: true });
                }}
                leftIcon={monitorOpen ? <FiPrinter /> : <FiMessageCircle />}
              >
                {monitorOpen ? "Report Dispatch" : "Dispatch Monitor"}
              </Button>
            ) : null}
          </Flex>

          {!monitorOpen ? (
            <Box
              borderWidth="1px"
              borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"}
              borderRadius="lg"
              p={3}
              bg={themeMode === "dark" ? "rgba(19,22,30,0.96)" : "rgba(255,255,255,0.97)"}
            >
              <Flex direction="column" gap={2}>
                <Flex direction={{ base: "column", xl: "row" }} gap={2} align={{ base: "stretch", xl: "center" }} justify="space-between">
                  <form onSubmit={handleLookup} style={{ width: "100%", minWidth: 0 }}>
                    <Flex direction="column" gap={2} maxW={{ base: "full", xl: "700px" }}>
                      {!isScopedMode && (
                        <Flex gap={2} wrap="nowrap" align="center">
                          <Input
                            size="sm"
                            flex="1"
                            minW={0}
                            maxW={{ base: "none", xl: "240px" }}
                            value={reqnoInput}
                            onChange={(e) => setReqnoInput(e.target.value)}
                            placeholder="REQNO"
                          />
                          <Button type="submit" leftIcon={<SearchIcon />} size="sm" colorScheme="blue" isLoading={loadingStatus} flexShrink={0}>
                            Check Status
                          </Button>
                        </Flex>
                      )}
                      <Button
                        size="sm"
                        leftIcon={<SearchIcon />}
                        colorScheme="blue"
                        onClick={handleOpenDateModal}
                        isLoading={dailyLoading}
                        flexShrink={0}
                        w={{ base: "full", sm: "auto" }}
                      >
                        Requisitions of {selectedDate}
                      </Button>
                      <Text
                        fontSize="xs"
                        color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}
                        whiteSpace="nowrap"
                        alignSelf="center"
                        display={{ base: "none", md: "block" }}
                      >
                        Cache: {(Array.isArray(dailyRows) ? dailyRows.length : 0)}
                      </Text>
                    </Flex>
                  </form>

                  <Flex gap={2} wrap={{ base: "wrap", lg: "nowrap" }} align="center" justify={{ base: "flex-start", xl: "flex-end" }}>
                    <Text fontSize="sm" fontWeight="semibold" whiteSpace="nowrap">Output:</Text>
                    <ButtonGroup size="sm" isAttached variant="outline">
                      <Button
                        leftIcon={isMobileViewport ? <FiShare2 /> : <ExternalLinkIcon />}
                        colorScheme={(actionMode === "open" || actionMode === "share") ? "blue" : "gray"}
                        variant={(actionMode === "open" || actionMode === "share") ? "solid" : "outline"}
                        onClick={() => setActionMode(isMobileViewport ? "share" : "open")}
                      >
                        {isMobileViewport ? "Share" : "Open"}
                      </Button>
                      <Button
                        leftIcon={<DownloadIcon />}
                        colorScheme={actionMode === "download" ? "blue" : "gray"}
                        variant={actionMode === "download" ? "solid" : "outline"}
                        onClick={() => setActionMode("download")}
                      >
                        Download
                      </Button>
                    </ButtonGroup>
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
          <Flex gap={2} direction={{ base: "column", md: "row" }}>
            {!isScopedMode && (
              <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={2} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} flex="1">
                <Text fontWeight="semibold" mb={2}>Search by Mobile No</Text>
                <Flex gap={2} wrap="nowrap" align="center">
                  <Input size="sm" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="Phone (10-digit)" flex="1" minW={0} maxW={{ base: "none", md: "220px" }} />
                  <Button size="sm" leftIcon={<SearchIcon />} colorScheme="blue" onClick={handleOpenPhoneModal} isLoading={phoneLoading} flexShrink={0}>Report List</Button>
                </Flex>
                <Text mt={1} fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                  Cached: {(Array.isArray(phoneReports) ? phoneReports.length : 0)}
                </Text>
              </Box>
            )}

            <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={2} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} flex="1">
              <Text fontWeight="semibold" mb={2}>Dispatch Actions</Text>
              <SimpleGrid columns={{ base: 2, md: 3 }} spacing={2}>
                <Button size="sm" w="full" leftIcon={outputPrimaryIcon} colorScheme="blue" onClick={() => openDocument("all")} isDisabled={!hasStatus || !canDispatch || (!hasLab && !hasRadiology)}>
                  All
                </Button>
                <Button size="sm" w="full" leftIcon={outputPrimaryIcon} colorScheme="blue" onClick={() => openDocument("lab")} isDisabled={!hasStatus || !canDispatch || !hasLab}>
                  Lab
                </Button>
                <Button size="sm" w="full" leftIcon={outputPrimaryIcon} colorScheme="blue" onClick={() => openDocument("radiology")} isDisabled={!hasStatus || !canDispatch || !hasRadiology}>
                  Radiology
                </Button>
                <Button size="sm" w="full" leftIcon={outputPrimaryIcon} colorScheme="teal" onClick={openTrend} isDisabled={!hasStatus || !canTrend}>
                  Trend
                </Button>
                <Button size="sm" w="full" leftIcon={outputPrimaryIcon} colorScheme="purple" onClick={openSmartTrends} isDisabled={!hasStatus || !canSmartTrends}>
                  Trends v2.0
                </Button>
                <Button
                  size="sm"
                  w="full"
                  leftIcon={outputPrimaryIcon}
                  colorScheme="yellow"
                  onClick={() => openDocument("all", { printtype: "0" })}
                  isDisabled={!hasStatus || !currentReqid() || !hasLab}
                >
                  Pending
                </Button>
              </SimpleGrid>
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
              <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} spacing={2} mb={3}>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "gray.800" : "gray.50"}><Text fontSize="xs" opacity={0.7}>Date</Text><Text fontWeight="bold">{selectedDate}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "blue.900" : "blue.50"}><Text fontSize="xs" opacity={0.7}>Total Jobs</Text><Text fontWeight="bold">{autoSummary?.total_jobs ?? monitorDateStats.total}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "orange.900" : "orange.50"}><Text fontSize="xs" opacity={0.7}>Pending Queue</Text><Text fontWeight="bold">{(autoSummary?.queued_jobs ?? monitorDateStats.queued) + (autoSummary?.cooling_off_jobs ?? monitorDateStats.cooling_off) + (autoSummary?.retrying_jobs ?? monitorDateStats.retrying)}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "red.900" : "red.50"}><Text fontSize="xs" opacity={0.7}>Lab Pending Approval (tests)</Text><Text fontWeight="bold">{autoSummary?.lab_pending_approval_tests ?? 0}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "yellow.900" : "yellow.50"}><Text fontSize="xs" opacity={0.7}>Lab Waiting Report (tests)</Text><Text fontWeight="bold">{autoSummary?.lab_waiting_tests ?? 0}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "green.900" : "green.50"}><Text fontSize="xs" opacity={0.7}>Lab Ready (tests)</Text><Text fontWeight="bold">{autoSummary?.lab_ready_tests ?? 0}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "red.900" : "red.50"}><Text fontSize="xs" opacity={0.7}>Scans Pending Approval (tests)</Text><Text fontWeight="bold">{autoSummary?.radiology_pending_approval_tests ?? 0}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "yellow.900" : "yellow.50"}><Text fontSize="xs" opacity={0.7}>Scans Waiting Report (tests)</Text><Text fontWeight="bold">{autoSummary?.radiology_waiting_tests ?? 0}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "green.900" : "green.50"}><Text fontSize="xs" opacity={0.7}>Scans Ready (tests)</Text><Text fontWeight="bold">{autoSummary?.radiology_ready_tests ?? 0}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "teal.900" : "teal.50"}><Text fontSize="xs" opacity={0.7}>Read / Delivered</Text><Text fontWeight="bold">{autoSummary?.delivery_read_jobs ?? monitorDateStats.read} / {autoSummary?.delivery_delivered_jobs ?? monitorDateStats.delivered}</Text></Box>
                <Box p={2} borderWidth="1px" borderRadius="md" bg={themeMode === "dark" ? "purple.900" : "purple.50"}><Text fontSize="xs" opacity={0.7}>Sent Only / Paused</Text><Text fontWeight="bold">{autoSummary?.delivery_sent_only_jobs ?? monitorDateStats.sent_only} / {autoSummary?.paused_jobs ?? monitorDateStats.paused}</Text></Box>
              </SimpleGrid>

              <Flex align="center" justify="space-between" wrap="wrap" gap={2} mb={3}>
                <HStack spacing={2} align="center">
                  <Text fontWeight="bold" fontSize="lg">Auto Dispatch Monitor</Text>
                  <Badge colorScheme="blue" px={2} py={1} borderRadius="md">{autoJobsCount} Total</Badge>
                  <Badge px={2} py={1} borderRadius="md">{autoScopedLabIds.length} Lab(s)</Badge>
                </HStack>
                <HStack spacing={2}>
                  <Button
                    type="button"
                    size="sm"
                    leftIcon={<FiList />}
                    variant="outline"
                    minW="120px"
                    onClick={() => {
                      setShowSentInline((v) => !v);
                    }}
                  >
                    {showSentInline ? "Hide Sent" : "View Sent"}
                  </Button>
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
                    icon={<RepeatIcon />}
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
                          icon={canResumeAllVisible ? <FiPlay /> : <FiPause />}
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
              <HStack spacing={2} mb={3}>
                <Input
                  size="sm"
                  maxW="320px"
                  value={autoSearchInput}
                  onChange={(e) => setAutoSearchInput(e.target.value)}
                  placeholder="Search reqno/patient/phone/status/error"
                />
                <Button type="button" size="sm" leftIcon={<SearchIcon />} onClick={() => { setAutoSearch(autoSearchInput); setAutoPage(1); }}>
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
                    icon={<ChevronLeftIcon />}
                    onClick={() => setAutoPage(1)}
                    isDisabled={safeAutoPage <= 1}
                    variant="outline"
                  />
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="Previous page"
                    icon={<ChevronLeftIcon />}
                    onClick={() => setAutoPage((p) => Math.max(1, p - 1))}
                    isDisabled={safeAutoPage <= 1}
                  />
                  <Text fontSize="xs">Page {safeAutoPage} / {totalAutoPages}</Text>
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="Next page"
                    icon={<ChevronRightIcon />}
                    onClick={() => setAutoPage((p) => Math.min(totalAutoPages, p + 1))}
                    isDisabled={safeAutoPage >= totalAutoPages}
                  />
                  <IconButton
                    size="xs"
                    type="button"
                    aria-label="Last page"
                    icon={<ChevronRightIcon />}
                    onClick={() => setAutoPage(totalAutoPages)}
                    isDisabled={safeAutoPage >= totalAutoPages}
                    variant="outline"
                  />
                </HStack>
              </Flex>
              {showSentInline ? (
              <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="md" p={2} mb={3}>
                <Flex align="center" justify="space-between" mb={2}>
                  <Text fontWeight="semibold" fontSize="sm">Sent Reports</Text>
                  <Badge colorScheme="green">{sentDispatchRows.length}</Badge>
                </Flex>
                {sentDispatchRows.length === 0 ? (
                  <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>No sent reports for selected date.</Text>
                ) : (
                  isMobileViewport ? (
                  <Box>
                    {sentDispatchRows.slice(0, 100).map((row) => {
                      const delivery = deriveDeliveryStatus(row);
                      const color = delivery === "read" ? "green" : delivery === "delivered" ? "blue" : delivery === "failed" ? "red" : "gray";
                      return (
                        <Box key={`sent_card_${row?.id || row?.reqno || row?.phone || Math.random()}`} borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="md" p={2} mb={2}>
                          <Text fontSize="xs" fontWeight="bold">{displayValue(row?.reqno)} • {displayValue(row?.patient_name)}</Text>
                          <Text fontSize="xs" color="gray.600">{displayValue(row?.phone)}</Text>
                          <Text fontSize="xs">Status sent: {displayValue(row?.report_label)}</Text>
                          <Text fontSize="xs">Sent: {formatIstDateTime(row?.sent_at)}</Text>
                          <HStack spacing={2} mt={1}>
                            <Badge colorScheme={color}>{delivery}</Badge>
                            <Text fontSize="10px">{formatIstDateTime(row?.delivery_status_at)}</Text>
                          </HStack>
                        </Box>
                      );
                    })}
                  </Box>
                  ) : (
                  <Box overflowX="auto">
                    <Table size="sm" variant="simple" sx={{ "th, td": { fontSize: "xs", py: 1.5 } }}>
                      <Thead>
                        <Tr>
                          <Th>Req No</Th>
                          <Th>Patient</Th>
                          <Th>Phone</Th>
                          <Th>Status Sent</Th>
                          <Th>Sent (IST)</Th>
                          <Th>Delivery</Th>
                          <Th>Receipt Time (IST)</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {sentDispatchRows.slice(0, 100).map((row) => (
                          <Tr key={`sent_${row?.id || row?.reqno || row?.phone || Math.random()}`}>
                            <Td fontWeight="bold">{displayValue(row?.reqno)}</Td>
                            <Td>{displayValue(row?.patient_name)}</Td>
                            <Td>{displayValue(row?.phone)}</Td>
                            <Td>{displayValue(row?.report_label)}</Td>
                            <Td>{formatIstDateTime(row?.sent_at)}</Td>
                            <Td>
                              <Badge colorScheme={deriveDeliveryStatus(row) === "read" ? "green" : deriveDeliveryStatus(row) === "delivered" ? "blue" : "gray"}>
                                {deriveDeliveryStatus(row)}
                              </Badge>
                            </Td>
                            <Td>{formatIstDateTime(row?.delivery_status_at)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                  )
                )}
              </Box>
              ) : null}

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
                    const pauseIcon = job?.is_paused ? <FiPlay /> : <FiPause />;
                    const pauseColor = job?.is_paused ? "green" : "orange";
                    const whyText =
                      displayValue(job?.last_error) !== "-"
                        ? displayValue(job?.last_error)
                        : String(job?.status || "").toLowerCase() === "queued" && queuedBlockers(job)
                          ? `Pending tests: ${queuedBlockers(job)}`
                          : stateHint(job);
                    return (
                      <Box key={jobId || `${job?.reqid || ""}_${job?.reqno || ""}`} borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="md" p={2} mb={2}>
                        <Flex justify="space-between" align="center" mb={1.5}>
                          <Badge colorScheme={statusValue === "sent" ? "green" : statusValue === "failed" ? "red" : statusValue === "queued" || statusValue === "cooling_off" || statusValue === "retrying" ? "orange" : "blue"} borderRadius="md" px={2} textTransform="lowercase">
                            {displayValue(statusValue)}
                          </Badge>
                          <Badge colorScheme={job?.is_paused ? "orange" : "green"}>{job?.is_paused ? "Paused" : (String(job?.status || "").toLowerCase() === "sent" ? deriveDeliveryStatus(job).toUpperCase() : "Active")}</Badge>
                        </Flex>
                        <Text fontSize="xs" fontWeight="semibold">
                          <Button
                            type="button"
                            size="xs"
                            variant="link"
                            minW="unset"
                            h="auto"
                            p={0}
                            fontWeight="bold"
                            onClick={() => handleUseAutoJob(job)}
                          >
                            {displayValue(job?.reqno)}
                          </Button>
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
                            <IconButton size="xs" type="button" aria-label="Events" variant="outline" icon={<FiActivity />} onClick={() => openAutoEvents(job)} isLoading={autoActionLoading} />
                          </Tooltip>
                          <Tooltip label="Push now" hasArrow openDelay={250}>
                            <IconButton size="xs" type="button" aria-label="Push now" colorScheme="blue" icon={<FiSend />} onClick={() => confirmAndPushJob(job)} isDisabled={!canPushRow} isLoading={autoActionLoading} />
                          </Tooltip>
                          <Tooltip label="Push to" hasArrow openDelay={250}>
                            <IconButton size="xs" type="button" aria-label="Push to" colorScheme="purple" icon={<FiUploadCloud />} onClick={() => openPushTemplateModal(job)} isDisabled={!canSendToRow} />
                          </Tooltip>
                          <Tooltip label={pauseLabel} hasArrow openDelay={250}>
                            <IconButton size="xs" type="button" aria-label={pauseLabel} colorScheme={pauseColor} variant={canTogglePause ? "solid" : "outline"} icon={pauseIcon} onClick={() => runAutoJobAction(jobId, pauseAction)} isDisabled={!canTogglePause} isLoading={autoActionLoading} />
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
                      const pauseIcon = job?.is_paused ? <FiPlay /> : <FiPause />;
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
                            <Button
                              type="button"
                              size="xs"
                              variant="link"
                              minW="unset"
                              h="auto"
                              p={0}
                              fontWeight="bold"
                              onClick={() => handleUseAutoJob(job)}
                            >
                              {displayValue(job?.reqno)}
                            </Button>
                          </Td>
                          <Td w="13%">{displayValue(job?.patient_name)}</Td>
                          <Td w="10%">{displayValue(job?.phone)}</Td>
                          <Td>{Number(job?.attempt_count || 0)}/{Number(job?.max_attempts || 0)}</Td>
                          <Td w="20%">
                            <Tooltip
                              label={
                                displayValue(job?.last_error) !== "-"
                                  ? displayValue(job?.last_error)
                                  : String(job?.status || "").toLowerCase() === "queued" && queuedBlockers(job)
                                    ? `Pending tests: ${queuedBlockers(job)}`
                                    : stateHint(job)
                              }
                              hasArrow
                              openDelay={250}
                            >
                              <Text noOfLines={2}>
                                {displayValue(job?.last_error) !== "-"
                                  ? displayValue(job?.last_error)
                                  : String(job?.status || "").toLowerCase() === "queued" && queuedBlockers(job)
                                    ? `Pending tests: ${queuedBlockers(job)}`
                                    : stateHint(job)}
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
                                  Delivery: {deriveDeliveryStatus(job)}
                                </Badge>
                                <Text fontSize="10px" mt={0.5}>{formatIstDateTime(job?.delivery_status_at)}</Text>
                              </Box>
                            ) : (
                              <Badge colorScheme="green">Active</Badge>
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
                                  icon={<FiActivity />}
                                  onClick={() => openAutoEvents(job)}
                                  isLoading={autoActionLoading}
                                  _hover={{ bg: "gray.100" }}
                                />
                              </Tooltip>
                              <Tooltip label="Push now" hasArrow openDelay={250}>
                                <IconButton
                                  size="xs"
                                  type="button"
                                  aria-label="Push now"
                                  colorScheme="blue"
                                  icon={<FiSend />}
                                  onClick={() => confirmAndPushJob(job)}
                                  isDisabled={!canPushRow}
                                  isLoading={autoActionLoading}
                                  _hover={{ transform: "translateY(-1px)" }}
                                />
                              </Tooltip>
                              <Tooltip label="Push to" hasArrow openDelay={250}>
                                <IconButton
                                  size="xs"
                                  type="button"
                                  aria-label="Push to"
                                  colorScheme="purple"
                                  icon={<FiUploadCloud />}
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
                                  isLoading={autoActionLoading}
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

          <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={2} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} display="flex" flexDirection="column">
            <SimpleGrid columns={{ base: 2, sm: 3, lg: 6 }} spacing={2} mb={1}>
              <Box>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>REQNO</Text>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{statusReqno}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>Patient</Text>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{statusPatient}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>Phone</Text>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{statusPhone}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>MRNO</Text>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{statusMrno}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>Status</Text>
                <Badge colorScheme={tone}>{status?.live_status?.overall_status || "-"}</Badge>
              </Box>
              <Box>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>Source</Text>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{statusSource}</Text>
              </Box>
            </SimpleGrid>
            <Flex justify="space-between" align="center" wrap="wrap" gap={2} mb={1}>
              <Text fontSize="xs">Ready Lab: {status?.live_status?.lab_ready || 0}/{status?.live_status?.lab_total || 0} | Ready Radiology: {status?.live_status?.radiology_ready || 0}/{status?.live_status?.radiology_total || 0}</Text>
              <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>{displayValue(decision?.reason)}</Text>
            </Flex>
            <Progress mb={1} value={readyPct} borderRadius="full" colorScheme={tone} />
            <Box overflow="auto" borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="md" maxH={{ base: "320px", md: "500px" }}>
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
                    const statusColor =
                      state === "ready_not_dispatched"
                        ? "green"
                        : state === "ready_dispatched"
                          ? "blue"
                          : "orange";
                    const dispatchLabel =
                      row?.department === "lab"
                        ? row?.dispatched
                          ? "Dispatched"
                          : "Not Dispatched"
                        : "-";

                    return (
                      <Tr key={row?.key || `${row?.test_id || ""}_${row?.test_name || ""}`}>
                        <Td>{displayValue(row?.test_name)}</Td>
                        <Td textTransform="capitalize">{displayValue(row?.department)}</Td>
                        <Td>
                          <Badge colorScheme={statusColor}>
                            {state === "ready_not_dispatched"
                              ? "READY"
                              : state === "ready_dispatched"
                                ? "READY (DONE)"
                                : "PENDING"}
                          </Badge>
                        </Td>
                        <Td>{dispatchLabel}</Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </Box>
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
                icon={<RepeatIcon />}
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
                  icon={<RepeatIcon />}
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

      <SendReportTemplateModal
        isOpen={pushTemplateModal.isOpen}
        onClose={pushTemplateModal.onClose}
        defaultPhone={String(pushTemplateJob?.phone || "")}
        registeredPhone={String(pushTemplateJob?.phone || "")}
        defaultPatientName={String(pushTemplateJob?.patient_name || "")}
        defaultReqno={String(pushTemplateJob?.reqno || "")}
        defaultMrno={String(pushTemplateJob?.mrno || "")}
        onSent={({ phone }) => {
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
