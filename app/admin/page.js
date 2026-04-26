// File: /app/admin/page.js
"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Box, Tabs, TabPanels, TabPanel,
  Button, useDisclosure, Flex, Text, Heading,
  useToast, IconButton, Badge, HStack, Icon, Menu, MenuButton, MenuList, MenuItem, Tooltip, useBreakpointValue
} from "@chakra-ui/react";
import { AddIcon, DownloadIcon, HamburgerIcon, LinkIcon, RepeatIcon } from "@chakra-ui/icons";
import {
  FiCalendar,
  FiUsers,
  FiClipboard,
  FiUserCheck,
  FiMapPin,
  FiTool,
  FiShield,
  FiBarChart2,
  FiPlayCircle
} from "react-icons/fi";
import dayjs from "dayjs";

import { supabase } from "../../lib/supabaseClient";

import ShortcutBar from "../../components/ShortcutBar";
import VisitsTable from "./components/VisitsTable";
import VisitModal from "../components/VisitModal";
import ExecutiveList from "./components/ExecutiveList";
import ExecutiveModal from "./components/ExecutiveModal";
import CollectionCentresTab from "./components/CollectionCentresTab";
import UacTab from "./components/UacTab";
import ShivamToolsTab from "./components/ShivamToolsTab";
import PatientsTab from "../components/PatientsTab";
import DashboardMetrics from "../../components/DashboardMetrics";
import RequireAuth from "../../components/RequireAuth";
import QuickBookTab from "./components/QuickBookTab";
import BookingRequestStatusCards from "./components/BookingRequestStatusCards";
import html2canvas from "html2canvas";
import { useUser } from "@/app/context/UserContext";

const CLICKUP_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_CLICKUP_URL || "https://app.clickup.com/";
const WHATSAPP_ICON_URL =
  "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/whatsapp.svg";
const CLICKUP_ICON_URL =
  "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/clickup.svg";
const ADMIN_THEME_STORAGE_KEY = "labbit-admin-dashboard-theme";
const BOOKING_HISTORY_PAGE_SIZE = 120;
const ADMIN_SECTION_ORDER = [
  "visits",
  "patients",
  "bookings",
  "executives",
  "collection_centres",
  "shivam_tools",
  "uac"
];

function ReportDispatchIcon(props) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        fill="currentColor"
        d="M7 2a2 2 0 0 0-2 2v5h2V4h10v5h2V4a2 2 0 0 0-2-2H7Zm-3 8a2 2 0 0 0-2 2v5h3v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4h3v-5a2 2 0 0 0-2-2H4Zm3 9v-6h10v6H7Zm8-3h-2v-2h-2v2H9v2h2v2h2v-2h2v-2Z"
      />
    </Icon>
  );
}

function ShortcutAction({
  label,
  icon,
  onClick,
  href,
  target,
  rel,
  badgeCount = 0,
  colorScheme = "gray",
  variant = "outline",
  isActive = false,
  isDisabled = false,
}) {
  const safeCount = Number(badgeCount || 0);
  return (
    <Box position="relative">
      <Tooltip label={label} hasArrow>
        <IconButton
          size="sm"
          minW="36px"
          w={{ base: "36px", lg: "40px" }}
          variant={isActive ? "solid" : variant}
          colorScheme={isActive ? "teal" : colorScheme}
          icon={icon}
          aria-label={label}
          onClick={onClick}
          as={href ? "a" : undefined}
          href={href}
          target={target}
          rel={rel}
          isDisabled={isDisabled}
        />
      </Tooltip>
      {safeCount > 0 ? (
        <Badge
          position="absolute"
          top="-6px"
          right="-5px"
          colorScheme="red"
          borderRadius="full"
          fontSize="0.62rem"
          minW="18px"
          textAlign="center"
          px={1}
          py="2px"
          lineHeight="1"
          pointerEvents="none"
        >
          {safeCount > 99 ? "99+" : safeCount}
        </Badge>
      ) : null}
    </Box>
  );
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function hasLatLngInText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.test(text)) return true;
  if (/[?&](?:q|query)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i.test(text)) return true;
  if (/@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.test(text)) return true;
  return false;
}

function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isUnreadTodaySession(session) {
  const status = String(session?.status || "").toLowerCase();
  const unread = Number(session?.unread_count || 0);
  if (!["pending", "handoff", "human_handover"].includes(status) || unread <= 0) return false;

  const ts = parseServerDate(session?.last_user_message_at || session?.last_message_at || null);
  if (!ts) return false;

  const now = Date.now();
  const createdMs = ts.getTime();
  if (now - createdMs > 24 * 60 * 60 * 1000) return false;

  const startOfToday = dayjs().startOf("day").valueOf();
  return createdMs >= startOfToday;
}

function roleKeyFromUser(user) {
  if (!user) return "";
  if (user.userType === "executive") {
    return String(user.executiveType || user.roleKey || "").toLowerCase().trim();
  }
  return String(user.userType || user.roleKey || "").toLowerCase().trim();
}

export default function AdminDashboard() {
  const toast = useToast();
  const { user } = useUser();
  const isMobileNav = useBreakpointValue({ base: true, md: false });

  const [activeSection, setActiveSection] = useState("visits");
  const [visits, setVisits] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [quickbookings, setQuickbookings] = useState([]);
  const [bookingRequestsLoading, setBookingRequestsLoading] = useState(false);
  const [bookingRequestsInitialized, setBookingRequestsInitialized] = useState(false);
  const [bookingRequestsLoadingMore, setBookingRequestsLoadingMore] = useState(false);
  const [bookingRequestsHasMoreHistory, setBookingRequestsHasMoreHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [futureUnassignedSummary, setFutureUnassignedSummary] = useState({ count: 0, byDate: {} });
  const [statusOptions, setStatusOptions] = useState([]);
  const [unreadWhatsAppCount, setUnreadWhatsAppCount] = useState(0);
  const [whatsappBlink, setWhatsappBlink] = useState(false);
  const [themeMode, setThemeMode] = useState("light");
  const [collectionRefreshHandler, setCollectionRefreshHandler] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const visitModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [loadingVisitModal, setLoadingVisitModal] = useState(false);
  const [visitModalViewOnly, setVisitModalViewOnly] = useState(false);
  const [loadingExecutiveModal, setLoadingExecutiveModal] = useState(false);

  const visitsTableRef = useRef();
  const bookingFetchSeqRef = useRef(0);
  const bookingHistoryOffsetRef = useRef(0);
  const prevUnreadRef = useRef(0);

  const handleSectionChange = useCallback((nextKey) => {
    setActiveSection((prev) => (prev === nextKey ? prev : nextKey));
  }, []);

  const isPendingBookingRequest = useCallback((booking) => {
    const status = String(booking?.status || "").trim().toLowerCase();
    return status === "" || status === "pending";
  }, []);

const exportVisitsImage = async () => {
  if (!visitsTableRef.current) return;

  // Hide all elements with .no-export class
  const hiddenEls = visitsTableRef.current.querySelectorAll(".no-export");
  hiddenEls.forEach(el => (el.style.visibility = "hidden"));
  const previousTheme = themeMode;

  try {
    if (previousTheme === "dark") {
      setThemeMode("light");
      await waitForPaint();
    }

    const canvas = await html2canvas(visitsTableRef.current, {
      backgroundColor: "#fff",
      scale: 2,
    });
    const link = document.createElement("a");
    link.download = `Labit-visits-${selectedDate}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.95);
    link.click();
  } catch (err) {
    toast({ title: "Error generating image", description: err.message, status: "error" });
  } finally {
    if (previousTheme === "dark") {
      setThemeMode("dark");
    }
    // Restore visibility after capture
    hiddenEls.forEach(el => (el.style.visibility = "visible"));
  }
};


  const activePhlebos = React.useMemo(() => {
    return executives.filter(
      (exec) =>
        exec.active === true && (exec.type || "").toLowerCase() === "phlebo"
    );
  }, [executives]);

  const fetchVisitsData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const todayKey = dayjs().format("YYYY-MM-DD");
      const [
        { data: visitsData, error: visitsError },
        { data: futureVisitsData, error: futureVisitsError },
      ] = await Promise.all([
        supabase
          .from("visits")
          .select(`
            *,
            patient:patient_id(id, name, phone),
            executive:executive_id(id, name, email, lab_id),
            lab:lab_id(id, name),
            time_slot:time_slot(id, slot_name, start_time, end_time)
          `)
          .eq("visit_date", selectedDate)
          .order("created_at", { ascending: false }),
        supabase
          .from("visits")
          .select("visit_date, executive_id, status")
          .gte("visit_date", todayKey),
      ]);

      if (visitsError) throw visitsError;
      if (futureVisitsError) throw futureVisitsError;

      setVisits(visitsData || []);
      const unassignedFutureVisits = (futureVisitsData || []).filter(
        (visit) => !visit.executive_id && String(visit.status || "").toLowerCase() !== "disabled"
      );
      const byDate = unassignedFutureVisits.reduce((acc, visit) => {
        const dateKey = String(visit.visit_date || "").slice(0, 10);
        if (!dateKey) return acc;
        acc[dateKey] = (acc[dateKey] || 0) + 1;
        return acc;
      }, {});
      setFutureUnassignedSummary({
        count: unassignedFutureVisits.length,
        byDate
      });
    } catch (error) {
      setErrorMsg("Failed to load data. Please try again.");
      toast({
        title: "Error Loading Visits",
        description: error.message || "Unknown error",
        status: "error"
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDate, toast]);

  useEffect(() => {
    fetchVisitsData();
  }, [fetchVisitsData]);

  const fetchBaseData = useCallback(async () => {
    setErrorMsg("");
    try {
      const fetchBookingRequests = async ({ eagerPending = true, resetHistory = true } = {}) => {
        const seq = bookingFetchSeqRef.current + 1;
        bookingFetchSeqRef.current = seq;
        if (resetHistory) {
          setBookingRequestsLoading(true);
          bookingHistoryOffsetRef.current = 0;
        } else {
          setBookingRequestsLoadingMore(true);
        }

        const bookingSelect = `
          *,
          time_slot:timeslot(id, slot_name, start_time, end_time)
        `;

        let pendingRows = [];
        if (eagerPending) {
          const { data: pendingData, error: pendingError } = await supabase
            .from("quickbookings")
            .select(bookingSelect)
            .or("status.is.null,status.eq.,status.eq.pending,status.eq.PENDING,status.eq.in_progress,status.eq.IN_PROGRESS")
            .order("created_at", { ascending: false })
            .limit(500);

          if (pendingError) throw pendingError;
          pendingRows = pendingData || [];
          if (bookingFetchSeqRef.current === seq) {
            setQuickbookings(pendingRows);
          }
        }

        const from = bookingHistoryOffsetRef.current;
        const to = from + BOOKING_HISTORY_PAGE_SIZE - 1;
        const { data: historyData, error: historyError } = await supabase
          .from("quickbookings")
          .select(bookingSelect)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (historyError) throw historyError;
        if (bookingFetchSeqRef.current === seq) {
          const historyRows = (historyData || []).filter((row) => !isPendingBookingRequest(row));
          const mergeById = (rows) => {
            const byId = new Map();
            for (const row of rows) {
              if (!row?.id) continue;
              byId.set(row.id, row);
            }
            return [...byId.values()].sort(
              (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
            );
          };

          if (resetHistory) {
            setQuickbookings(mergeById([...pendingRows, ...historyRows]));
          } else {
            setQuickbookings((prev) => {
              const prevPending = prev.filter(isPendingBookingRequest);
              const prevHistory = prev.filter((row) => !isPendingBookingRequest(row));
              return mergeById([...prevPending, ...prevHistory, ...historyRows]);
            });
          }

          bookingHistoryOffsetRef.current = from + BOOKING_HISTORY_PAGE_SIZE;
          setBookingRequestsHasMoreHistory((historyData || []).length === BOOKING_HISTORY_PAGE_SIZE);
        }
      };

      const bookingRequestsPromise = fetchBookingRequests({ eagerPending: true, resetHistory: true });

      // Fetch unread WhatsApp count in lightweight mode and do not block
      // quickbook/executive/lab loading on this call.
      fetch("/api/admin/whatsapp/sessions?lite=1&view=unread&limit=200", {
        credentials: "include",
        cache: "no-store"
      })
        .then(async (res) => {
          if (!res.ok) return null;
          return res.json().catch(() => null);
        })
        .then((body) => {
          const unreadCount = ((body?.sessions) || [])
            .filter(isUnreadTodaySession)
            .reduce((acc, session) => acc + Number(session?.unread_count || 0), 0);
          setUnreadWhatsAppCount(unreadCount);
        })
        .catch(() => {
          // Keep dashboard usable even if inbox summary fails.
        });

      const apiExecutivesFetch = fetch("/api/executives").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch executives");
        return res.json();
      });

      const [
        executivesData,
        { data: labsData, error: labsError },
        { data: timeSlotsData, error: timeSlotsError },
        { data: statusOptionsData, error: statusOptionsError }
      ] = await Promise.all([
        apiExecutivesFetch,
        supabase.from("labs").select("id, name").order("name"),
        supabase
          .from("visit_time_slots")
          .select("id, slot_name, start_time, end_time")
          .order("start_time"),
        supabase
          .from("visit_statuses")
          .select("code, label, color, order")
          .order("order")
      ]);

      if (!executivesData) throw new Error("Failed to load executives");
      if (labsError) throw labsError;
      if (timeSlotsError) throw timeSlotsError;
      if (statusOptionsError) throw statusOptionsError;

      setExecutives(executivesData || []);
      setLabs(labsData || []);
      setTimeSlots(timeSlotsData || []);
      setStatusOptions(statusOptionsData || []);

      await bookingRequestsPromise;
      setBookingRequestsInitialized(true);
    } catch (error) {
      setErrorMsg("Failed to load data. Please try again.");
      toast({
        title: "Error Loading Data",
        description: error.message || "Unknown error",
        status: "error"
      });
    } finally {
      setBookingRequestsLoading(false);
      setBookingRequestsLoadingMore(false);
    }
  }, [toast, isPendingBookingRequest]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchBaseData(), fetchVisitsData()]);
  }, [fetchBaseData, fetchVisitsData]);

  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  const activeRoleKey = roleKeyFromUser(user);
  const hasWildcard = rolePermissions.includes("*");
  const hasAnyPermission = useCallback((keys = []) => {
    if (hasWildcard) return true;
    return keys.some((key) => rolePermissions.includes(key));
  }, [hasWildcard, rolePermissions]);

  const adminSections = useMemo(() => ([
    {
      key: "visits",
      label: "Visits",
      shortLabel: "Visit",
      icon: FiCalendar,
      visible: hasAnyPermission(["visits.create", "visits.update"]),
    },
    {
      key: "patients",
      label: "Patients",
      shortLabel: "Pts",
      icon: FiUsers,
      visible: hasAnyPermission(["patients.create", "patients.update", "patients.update_identity"]),
    },
    {
      key: "bookings",
      label: "Booking Requests",
      shortLabel: "Bookings",
      icon: FiClipboard,
      visible: hasAnyPermission(["quickbook.update"]),
    },
    {
      key: "executives",
      label: "Executives",
      shortLabel: "Exec",
      icon: FiUserCheck,
      visible: hasAnyPermission(["executives.status.update"]),
    },
    {
      key: "collection_centres",
      label: "Collection Centres",
      shortLabel: "Centres",
      icon: FiMapPin,
      visible: hasAnyPermission(["visits.update", "executives.status.update"]),
    },
    {
      key: "shivam_tools",
      label: "Shivam Tools",
      shortLabel: "Shivam",
      icon: FiTool,
      visible:
        ["director", "admin"].includes(activeRoleKey) ||
        hasAnyPermission([
          "shivam.tools.view",
          "shivam.demographics.update",
          "shivam.pricelist.sync"
        ]),
    },
    {
      key: "uac",
      label: "UAC",
      shortLabel: "UAC",
      icon: FiShield,
      visible: ["director", "admin"].includes(activeRoleKey) || hasAnyPermission(["uac.view"]),
    },
  ]), [activeRoleKey, hasAnyPermission]);
  const canUseReportDispatch = hasAnyPermission(["reports.dispatch"]);
  const canUseReportSetup = hasAnyPermission(["reports.setup"]);
  const canRunReports = canUseReportSetup || hasAnyPermission(["reports.run.mis", "reports.run.transaction"]);
  const visibleSections = adminSections.filter((item) => item.visible);
  const activeTabIndex = Math.max(0, ADMIN_SECTION_ORDER.indexOf(activeSection));

  useEffect(() => {
    const fallbackForRole = () => {
      if (activeRoleKey === "director") return ["*"];
      if (activeRoleKey === "admin") {
        return [
          "uac.view",
          "uac.manage",
          "patients.create",
          "patients.update",
          "patients.update_identity",
          "visits.create",
          "visits.update",
          "quickbook.update",
          "executives.status.update",
          "reports.setup",
          "reports.run.mis",
          "reports.run.transaction",
          "reports.logs.view",
          "reports.dispatch",
          "shivam.tools.view",
          "shivam.demographics.update",
          "shivam.demographics.update_identity",
          "shivam.pricelist.sync",
          "cto.view"
        ];
      }
      if (activeRoleKey === "manager") {
        return [
          "patients.create",
          "patients.update",
          "visits.create",
          "visits.update",
          "quickbook.update",
          "reports.run.mis",
          "reports.run.transaction",
          "reports.logs.view",
          "reports.dispatch",
          "shivam.tools.view",
          "shivam.demographics.update",
          "cto.view"
        ];
      }
      return [];
    };

    const primaryLabId =
      String(user?.labId || "").trim() ||
      (Array.isArray(user?.labIds) ? String(user.labIds[0] || "").trim() : "") ||
      String(labs?.[0]?.id || "").trim();

    if (!activeRoleKey) {
      setPermissionsLoaded(false);
      setRolePermissions([]);
      return;
    }

    if (!primaryLabId) {
      setRolePermissions(fallbackForRole());
      setPermissionsLoaded(true);
      return;
    }

    setPermissionsLoaded(false);
    let cancelled = false;
    fetch(`/api/admin/uac/permissions?lab_id=${encodeURIComponent(primaryLabId)}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "Failed to load permissions");
        const policy = payload?.policy || {};
        const granted = Array.isArray(policy?.[activeRoleKey]) ? policy[activeRoleKey] : [];
        if (!cancelled) {
          setRolePermissions(granted);
          setPermissionsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRolePermissions(fallbackForRole());
          setPermissionsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRoleKey, labs, user]);

  useEffect(() => {
    if (!permissionsLoaded) return;
    if (!visibleSections.length) return;
    if (visibleSections.some((item) => item.key === activeSection)) return;
    if (visibleSections.some((item) => item.key === "visits")) {
      setActiveSection("visits");
    } else {
      setActiveSection(visibleSections[0].key);
    }
  }, [permissionsLoaded, visibleSections, activeSection]);

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
    const prev = Number(prevUnreadRef.current || 0);
    const next = Number(unreadWhatsAppCount || 0);
    if (next > prev) {
      setWhatsappBlink(true);
      const timer = setTimeout(() => setWhatsappBlink(false), 1800);
      prevUnreadRef.current = next;
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = next;
  }, [unreadWhatsAppCount]);

  const uniquePatients = React.useMemo(() => {
    const map = new Map();
    visits.forEach((v) => {
      if (v.patient && v.patient.id) {
        map.set(v.patient.id, v.patient);
      }
    });
    return Array.from(map.values());
  }, [visits]);

  const handleVisitSave = async (formData) => {
    setLoadingVisitModal(true);
    try {
      if (!formData.patient_id) {
        toast({ title: "Please select a patient", status: "warning" });
        setLoadingVisitModal(false);
        return;
      }

      const payload = {
        patient_id: formData.patient_id,
        executive_id: formData.executive_id || null,
        lab_id: formData.lab_id,
        visit_date: formData.visit_date,
        time_slot: formData.time_slot,
        address: formData.address,
        address_id: formData.address_id || null,
        lat: formData.lat ?? null,
        lng: formData.lng ?? null,
        location_text: formData.location_text || "",
        status: formData.status,
        notes: formData.notes || "",
        prescription: formData.prescription || ""
      };

      let method = "POST";
      if (editingVisit && editingVisit.id) {
        payload.id = editingVisit.id;
        method = "PUT";
      }

      let res = await fetch("/api/visits", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        const conflictData = await res.json().catch(() => ({}));
        const conflictText = (conflictData?.conflicts || [])
          .map((c) => `${c.patient_name} (${c.address || "No area"})`)
          .join("\n");
        const confirmed = window.confirm(
          `This executive already has visit(s) in this timeslot.\n\n${conflictText || "Conflict found"}\n\nAssign anyway?`
        );
        if (!confirmed) {
          setLoadingVisitModal(false);
          return;
        }

        res = await fetch("/api/visits", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, force_assign: true })
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || (method === "PUT" ? "Update failed" : "Create failed"));
      }

      const savedVisit = await res.json().catch(() => null);
      toast({ title: method === "PUT" ? "Visit updated" : "Visit created", status: "success" });

      const hadExplicitCoordinates =
        formData?.lat !== null &&
        typeof formData?.lat !== "undefined" &&
        formData?.lat !== "" &&
        formData?.lng !== null &&
        typeof formData?.lng !== "undefined" &&
        formData?.lng !== "";
      const pastedHasCoordinates = hasLatLngInText(formData?.address || formData?.location_text || "");
      const savedHasCoordinates =
        savedVisit &&
        savedVisit.lat !== null &&
        typeof savedVisit.lat !== "undefined" &&
        savedVisit.lng !== null &&
        typeof savedVisit.lng !== "undefined";

      if (!hadExplicitCoordinates && pastedHasCoordinates && savedHasCoordinates) {
        toast({
          title: "Location pin detected",
          description: "Coordinates were auto-captured from the pasted location text/link.",
          status: "success"
        });
      }
      if (!hadExplicitCoordinates && pastedHasCoordinates && !savedHasCoordinates) {
        toast({
          title: "Location pin not saved",
          description: "Coordinates were detected in text, but could not be persisted on this visit.",
          status: "warning"
        });
      }

      visitModal.onClose();
      setEditingVisit(null);
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error saving visit",
        description: error.message,
        status: "error"
      });
    }
    setLoadingVisitModal(false);
  };

  async function handleAssignToExec(visitId, execId) {
    try {
      let res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visitId, executive_id: execId, status: "booked" })
      });

      if (res.status === 409) {
        const conflictData = await res.json().catch(() => ({}));
        const conflictText = (conflictData?.conflicts || [])
          .map((c) => `${c.patient_name} (${c.address || "No area"})`)
          .join("\n");
        const confirmed = window.confirm(
          `Timeslot conflict found for selected executive.\n\n${conflictText || "Conflict found"}\n\nAssign anyway?`
        );
        if (!confirmed) return;

        res = await fetch("/api/visits", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: visitId, executive_id: execId, status: "booked", force_assign: true })
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Assignment failed");
      }
      await fetchAll(); // Refresh visits list after assignment
    } catch (error) {
      toast({
        title: "Failed to assign executive",
        description: error.message,
        status: "error"
      });
    }
  }

  const unassignedVisitCount = futureUnassignedSummary.count;
  const unassignedByDate = futureUnassignedSummary.byDate;
  const pendingQuickbookCount = quickbookings.filter((qb) => {
    const normalized = String(qb?.status || "").trim().toLowerCase();
    return normalized === "" || normalized === "pending";
  }).length;

  const normalizeQuickbookStatusBucket = (statusRaw) => {
    const s = String(statusRaw || "").trim().toLowerCase();
    if (!s || s === "pending") return "unprocessed";
    if (s === "in_progress") return "in_progress";
    if (s === "booked" || s === "processed") return "booked";
    if (s === "rejected") return "rejected";
    if (
      s === "closed" ||
      s === "resolved" ||
      s === "disabled" ||
      s === "cancelled" ||
      s === "canceled"
    ) return "closed";
    return "other";
  };

  const bookingRequestSummary = quickbookings.reduce(
    (acc, qb) => {
      const bucket = normalizeQuickbookStatusBucket(qb?.status);
      if (bucket === "unprocessed") acc.unprocessed += 1;
      else if (bucket === "in_progress") acc.in_progress += 1;
      else if (bucket === "booked") acc.booked += 1;
      else if (bucket === "rejected") acc.rejected += 1;
      else if (bucket === "closed") acc.closed += 1;
      else acc.other += 1;
      acc.total += 1;
      return acc;
    },
    { unprocessed: 0, in_progress: 0, booked: 0, rejected: 0, closed: 0, other: 0, total: 0 }
  );
  const showBookingRequestsLoadingState = !bookingRequestsInitialized || bookingRequestsLoading;
  const refreshVisibleTab = useCallback(async () => {
    if (activeSection === "collection_centres" && typeof collectionRefreshHandler === "function") {
      await collectionRefreshHandler();
      return;
    }
    if (activeSection === "visits") {
      await fetchVisitsData();
      return;
    }
    if (activeSection === "bookings") {
      await fetchBaseData();
      return;
    }
    await fetchAll();
  }, [activeSection, collectionRefreshHandler, fetchAll, fetchBaseData, fetchVisitsData]);

  const sortedTodaysVisits = [...visits].sort((a, b) => {
    if (a.status === "disabled" && b.status !== "disabled") return 1;
    if (a.status !== "disabled" && b.status === "disabled") return -1;
    return 0;
  });

  const nonDisabledTodaysVisits = sortedTodaysVisits.filter(
    (v) => v.status !== "disabled"
  );
  const sectionBadgeCounts = useMemo(() => ({
    visits: unassignedVisitCount,
    bookings: pendingQuickbookCount,
  }), [unassignedVisitCount, pendingQuickbookCount]);

  const shortcutActions = useMemo(() => {
    const sectionActions = visibleSections.map((section) => ({
      key: section.key,
      label: section.label,
      icon: <section.icon />,
      onClick: () => handleSectionChange(section.key),
      isActive: activeSection === section.key,
      badgeCount: sectionBadgeCounts[section.key] || 0,
    }));

    const common = [
      {
        key: "run_reports",
        label: "Run Reports",
        icon: <FiPlayCircle />,
        href: "/admin/reports/run",
        hidden: !canRunReports,
      },
      {
        key: "report_master",
        label: "Report Master",
        icon: <FiBarChart2 />,
        href: "/admin/reports/master",
        hidden: !canUseReportSetup,
      },
      ...(canUseReportDispatch
        ? [{
            key: "dispatch",
            label: "Dispatch",
            icon: <ReportDispatchIcon boxSize={4} />,
            href: "/admin/report-dispatch",
          }]
        : []),
      {
        key: "whatsapp",
        label: "WhatsApp",
        icon: (
          <img
            src={WHATSAPP_ICON_URL}
            alt=""
            style={{ width: 14, height: 14 }}
          />
        ),
        href: "/admin/whatsapp",
        badgeCount: unreadWhatsAppCount,
        colorScheme: unreadWhatsAppCount > 0 ? "red" : "green",
        variant: unreadWhatsAppCount > 0 || whatsappBlink ? "solid" : "outline",
      },
      {
        key: "collection",
        label: "Collection",
        icon: <LinkIcon />,
        href: "/collection-centre",
      },
      {
        key: "clickup",
        label: "ClickUp",
        icon: (
          <img
            src={CLICKUP_ICON_URL}
            alt=""
            style={{ width: 14, height: 14, filter: themeMode === "dark" ? "invert(1) brightness(1.2)" : "none" }}
          />
        ),
        href: CLICKUP_DASHBOARD_URL,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      {
        key: "refresh",
        label: "Refresh",
        icon: <RepeatIcon />,
        onClick: refreshVisibleTab,
      },
      {
        key: "export_visits",
        label: "Export Visits",
        icon: <DownloadIcon />,
        onClick: exportVisitsImage,
        isDisabled: activeSection !== "visits",
      },
    ];

    return [...sectionActions, ...common].filter((item) => !item.hidden);
  }, [
    activeSection,
    canUseReportDispatch,
    canUseReportSetup,
    canRunReports,
    handleSectionChange,
    refreshVisibleTab,
    sectionBadgeCounts,
    unreadWhatsAppCount,
    visibleSections,
    whatsappBlink,
    themeMode,
  ]);

  const shortcutMenu = (
    isMobileNav ? (
      <Menu isLazy>
        <MenuButton
          as={IconButton}
          aria-label="Open admin shortcuts"
          icon={<HamburgerIcon />}
          size="sm"
          variant="outline"
        />
        <MenuList minW="220px" maxH="70vh" overflowY="auto">
          {shortcutActions.map((action) => (
            <MenuItem
              key={action.key}
              icon={action.icon}
              as={action.href ? "a" : "button"}
              href={action.href}
              target={action.target}
              rel={action.rel}
              onClick={action.onClick}
              isDisabled={action.isDisabled}
              fontWeight={action.isActive ? "700" : "500"}
            >
              {action.label}{action.badgeCount > 0 ? ` (${action.badgeCount > 99 ? "99+" : action.badgeCount})` : ""}
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    ) : (
      <HStack spacing={1} align="center">
        {shortcutActions
          .filter((action) => ["dispatch", "whatsapp", "export_visits"].includes(action.key))
          .map((action) => (
          <ShortcutAction
            key={action.key}
            label={action.label}
            icon={action.icon}
            onClick={action.onClick}
            href={action.href}
            target={action.target}
            rel={action.rel}
            badgeCount={action.badgeCount}
            colorScheme={action.colorScheme}
            variant={action.variant}
            isActive={action.isActive}
            isDisabled={action.isDisabled}
          />
        ))}
        <Menu isLazy>
          <Tooltip label="More actions" hasArrow>
            <MenuButton
              as={IconButton}
              aria-label="More admin actions"
              icon={<HamburgerIcon />}
              size="sm"
              variant="outline"
            />
          </Tooltip>
          <MenuList minW="240px" maxH="70vh" overflowY="auto">
            {shortcutActions
              .filter((action) => !["dispatch", "whatsapp", "export_visits", "refresh"].includes(action.key))
              .map((action) => (
                <MenuItem
                  key={action.key}
                  icon={action.icon}
                  as={action.href ? "a" : "button"}
                  href={action.href}
                  target={action.target}
                  rel={action.rel}
                  onClick={action.onClick}
                  isDisabled={action.isDisabled}
                  fontWeight={action.isActive ? "700" : "500"}
                >
                  {action.label}
                  {action.badgeCount > 0 ? ` (${action.badgeCount > 99 ? "99+" : action.badgeCount})` : ""}
                </MenuItem>
              ))}
          </MenuList>
        </Menu>
        {shortcutActions
          .filter((action) => action.key === "refresh")
          .map((action) => (
            <ShortcutAction
              key={action.key}
              label={action.label}
              icon={action.icon}
              onClick={action.onClick}
              href={action.href}
              target={action.target}
              rel={action.rel}
              badgeCount={action.badgeCount}
              colorScheme={action.colorScheme}
              variant={action.variant}
              isActive={action.isActive}
              isDisabled={action.isDisabled}
            />
          ))}
      </HStack>
    )
  );

  const perExecVisitCounts = nonDisabledTodaysVisits.reduce((acc, v) => {
    const execId = v.executive?.id ?? (typeof v.executive_id === "object" ? v.executive_id?.id : v.executive_id);
    if (execId) {
      acc[execId] = (acc[execId] || 0) + 1;
    }
    return acc;
  }, {});

  async function handleDisableVisit(visitId, status) {
  try {
    const res = await fetch(`/api/visits/${visitId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || "Disable failed");
    }
    toast({ title: "Visit Disabled", status: "info" });
    await fetchAll(); // Refresh visits immediately
  } catch (err) {
    toast({
      title: "Error disabling visit",
      description: err.message,
      status: "error",
    });
  }
}

  useEffect(() => {
    if (activeSection !== "bookings") return;
    if (bookingRequestsInitialized) return;
    fetchBaseData().catch(() => {});
  }, [activeSection, bookingRequestsInitialized, fetchBaseData]);

  const loadMoreBookingRequestHistory = useCallback(async () => {
    setErrorMsg("");
    try {
      const seq = bookingFetchSeqRef.current + 1;
      bookingFetchSeqRef.current = seq;
      setBookingRequestsLoadingMore(true);

      const bookingSelect = `
        *,
        time_slot:timeslot(id, slot_name, start_time, end_time)
      `;
      const from = bookingHistoryOffsetRef.current;
      const to = from + BOOKING_HISTORY_PAGE_SIZE - 1;
      const { data: historyData, error } = await supabase
        .from("quickbookings")
        .select(bookingSelect)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      if (bookingFetchSeqRef.current !== seq) return;

      const historyRows = (historyData || []).filter((row) => !isPendingBookingRequest(row));
      const mergeById = (rows) => {
        const byId = new Map();
        for (const row of rows) {
          if (!row?.id) continue;
          byId.set(row.id, row);
        }
        return [...byId.values()].sort(
          (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
        );
      };

      setQuickbookings((prev) => {
        const prevPending = prev.filter(isPendingBookingRequest);
        const prevHistory = prev.filter((row) => !isPendingBookingRequest(row));
        return mergeById([...prevPending, ...prevHistory, ...historyRows]);
      });
      bookingHistoryOffsetRef.current = from + BOOKING_HISTORY_PAGE_SIZE;
      setBookingRequestsHasMoreHistory((historyData || []).length === BOOKING_HISTORY_PAGE_SIZE);
    } catch (error) {
      toast({
        title: "Error Loading Booking Requests",
        description: error.message || "Unknown error",
        status: "error"
      });
    } finally {
      setBookingRequestsLoadingMore(false);
    }
  }, [toast, isPendingBookingRequest]);

  return (
    <RequireAuth roles={["admin", "manager", "director"]}>
      <Box
        minH="100vh"
        w="100vw"
        className={`dashboard-theme-shell ${themeMode === "dark" ? "dashboard-theme-dark" : "dashboard-theme-light"}`}
        bg={themeMode === "dark" ? "var(--dashboard-shell-bg)" : "var(--dashboard-page-bg)"}
        color="var(--dashboard-page-text)"
        data-admin-dashboard-shell="true"
      >
        <ShortcutBar
          userRole="admin"
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          executives={executives}
          rightContent={shortcutMenu}
          themeMode={themeMode}
          onToggleTheme={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
        />

        <Flex align="flex-start" justify="center" minH="100vh" py={8} pt="64px">
          <Box
            w="full"
            maxW="7xl"
            mx="auto"
            className="dashboard-theme-card"
            borderRadius="xl"
            px={[4, 8]}
            py={[8, 14]}
            ref={visitsTableRef}
          >
            <Flex
              align={{ base: "stretch", md: "center" }}
              direction={{ base: "column", md: "row" }}
              mb={8}
              gap={3}
            >
              <Heading className="dashboard-theme-heading" size="xl" flex="1 1 auto">
                Labit Admin Dashboard
              </Heading>
            </Flex>

            {errorMsg && (
              <Text color="red.400" mb={6}>
                {errorMsg}
              </Text>
            )}

            {activeSection === "bookings" ? (
              <Box mb={6}>
                <BookingRequestStatusCards
                  summary={bookingRequestSummary}
                  themeMode={themeMode}
                  isLoading={showBookingRequestsLoadingState}
                  onCardClick={(item) => {
                    if (!item?.key) return;
                    if (item.key === "unprocessed" || item.key === "total") {
                      handleSectionChange("bookings");
                    }
                  }}
                />
              </Box>
            ) : (
              <>
                <Box
                  mb={4}
                  px={4}
                  py={3}
                  borderRadius="lg"
                  borderWidth="2px"
                  borderColor={
                    showBookingRequestsLoadingState
                      ? (themeMode === "dark" ? "whiteAlpha.500" : "orange.300")
                      : pendingQuickbookCount > 0 ? "red.400" : "green.400"
                  }
                  bg={themeMode === "dark" ? "blackAlpha.300" : "white"}
                  cursor="pointer"
                  _hover={{ bg: themeMode === "dark" ? "whiteAlpha.100" : "gray.50" }}
                  onClick={() => handleSectionChange("bookings")}
                >
                  <Text
                    fontSize={{ base: "md", md: "lg" }}
                    fontWeight="800"
                    color={
                      showBookingRequestsLoadingState
                        ? (themeMode === "dark" ? "whiteAlpha.900" : "orange.500")
                        : pendingQuickbookCount > 0 ? "red.400" : "green.500"
                    }
                  >
                    Unprocessed Booking Requests: {showBookingRequestsLoadingState ? "..." : pendingQuickbookCount}
                  </Text>
                </Box>

                <Box mb={6}>
                  <DashboardMetrics hvExecutiveId={null} date={selectedDate} themeMode={themeMode} />
                </Box>
              </>
            )}

            <Tabs
              index={activeTabIndex}
              onChange={(nextIndex) => {
                const nextKey = ADMIN_SECTION_ORDER[nextIndex];
                if (nextKey) handleSectionChange(nextKey);
              }}
              variant="enclosed"
              colorScheme="green"
              isLazy
              lazyBehavior="keepMounted"
            >
              <TabPanels>
                <TabPanel px={{ base: 0, md: 4 }} py={{ base: 3, md: 4 }}>
                  {/* Per-executive visit chips for selected date */}
                  <Flex mb={4} align="center" justify="space-between" gap={3} wrap="wrap">
                    <Flex wrap="wrap" gap={2}>
                      {executives
                        .filter((exec) => perExecVisitCounts[exec.id])
                        .map((exec) => (
                          <Flex
                            key={exec.id}
                            align="center"
                            className="dashboard-theme-chip"
                            borderRadius="full"
                            px={3}
                            py={1}
                            fontSize="sm"
                          >
                            <Text fontWeight="medium" mr={2}>
                              {exec.name}
                            </Text>
                            <Badge borderRadius="full" px={2} colorScheme="blue">
                              {perExecVisitCounts[exec.id]}
                            </Badge>
                          </Flex>
                        ))}
                    </Flex>
                    <Button
                      leftIcon={<AddIcon />}
                      colorScheme="teal"
                      size="sm"
                      onClick={() => handleSectionChange("patients")}
                    >
                      Book Patient
                    </Button>
                  </Flex>

                  <VisitsTable
                    visits={sortedTodaysVisits}
                    executives={activePhlebos}
                    timeSlots={timeSlots}
                    onEdit={(visit) => {
                      setVisitModalViewOnly(false);
                      setEditingVisit(visit);
                      visitModal.onOpen();
                    }}
                    onView={(visit) => {
                      setVisitModalViewOnly(true);
                      setEditingVisit(visit);
                      visitModal.onOpen();
                    }}
                    loading={loading}
                    onAssign={handleAssignToExec}
                    onDelete={handleDisableVisit} 
                    statusOptions={statusOptions}
                    themeMode={themeMode}
                  />
                  <VisitModal
                    isOpen={visitModal.isOpen}
                    onClose={() => {
                      visitModal.onClose();
                      setEditingVisit(null);
                      setVisitModalViewOnly(false);
                    }}
                    onSubmit={handleVisitSave}
                    visitInitialData={editingVisit}
                    isLoading={loadingVisitModal}
                    viewOnly={visitModalViewOnly}
                    patients={uniquePatients}
                    executives={activePhlebos}
                    labs={labs}
                    timeSlots={timeSlots}
                    statusOptions={statusOptions}
                  />
                </TabPanel>

                <TabPanel px={{ base: 0, md: 4 }} py={{ base: 3, md: 4 }}>
                  <PatientsTab fetchPatients={fetchAll} fetchVisits={fetchAll} />
                </TabPanel>

                <TabPanel px={{ base: 0, md: 4 }} py={{ base: 3, md: 4 }}>
                  <QuickBookTab
                    quickbookings={quickbookings}
                    isLoading={bookingRequestsLoading}
                    isLoadingMore={bookingRequestsLoadingMore}
                    hasMoreHistory={bookingRequestsHasMoreHistory}
                    onLoadMoreHistory={loadMoreBookingRequestHistory}
                    onRefresh={fetchBaseData}
                    onAcceptVisitComplete={async () => {
                      setActiveSection("visits");
                      await fetchVisitsData();
                    }}
                    themeMode={themeMode}
                  />
                </TabPanel>

                <TabPanel px={{ base: 0, md: 4 }} py={{ base: 3, md: 4 }}>
                  <Flex mb={4} justify="flex-end">
                    <Button
                      leftIcon={<AddIcon />}
                      colorScheme="green"
                      onClick={executiveModal.onOpen}
                    >
                      Add Executive
                    </Button>
                  </Flex>
                  <ExecutiveList
                    executives={executives}
                    labs={labs}
                    loading={loading}
                    onRefresh={fetchAll}
                    themeMode={themeMode}
                  />
                  <ExecutiveModal
                    isOpen={executiveModal.isOpen}
                    onClose={executiveModal.onClose}
                    onSaveSuccess={async (data) => {
                      fetchAll();
                    }}
                    isLoading={loadingExecutiveModal}
                    labs={labs}
                  />
                </TabPanel>

                <TabPanel px={{ base: 0, md: 4 }} py={{ base: 3, md: 4 }}>
                  <CollectionCentresTab
                    labs={labs}
                    executives={executives}
                    themeMode={themeMode}
                    onRegisterRefresh={setCollectionRefreshHandler}
                  />
                </TabPanel>

                <TabPanel px={{ base: 0, md: 4 }} py={{ base: 3, md: 4 }}>
                  <ShivamToolsTab
                    labs={labs}
                    themeMode={themeMode}
                    rolePermissions={rolePermissions}
                    activeRoleKey={activeRoleKey}
                  />
                </TabPanel>

                <TabPanel>
                  <UacTab
                    executives={executives}
                    labs={labs}
                    themeMode={themeMode}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
        </Flex>
        <style jsx global>{`
          @media (max-width: 768px) {
            .admin-header-actions {
              -webkit-overflow-scrolling: touch;
            }
            .admin-tabs-scroll {
              -webkit-overflow-scrolling: touch;
            }
            .admin-tabs-scroll .chakra-tabs__tablist {
              white-space: nowrap;
              flex-wrap: nowrap !important;
            }
            .admin-tabs-scroll .chakra-tabs__tab {
              flex: 0 0 auto;
            }
          }
        `}</style>
      </Box>
    </RequireAuth>
  );
}
