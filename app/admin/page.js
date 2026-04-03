// File: /app/admin/page.js
"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Box, Tabs, TabList, TabPanels, Tab, TabPanel,
  Button, useDisclosure, Flex, Text, Heading,
  useToast, IconButton, Badge, Tooltip, HStack, Spacer, Icon
} from "@chakra-ui/react";
import { AddIcon, DownloadIcon, LinkIcon, RepeatIcon } from "@chakra-ui/icons";
import dayjs from "dayjs";

import { supabase } from "../../lib/supabaseClient";

import ShortcutBar from "../../components/ShortcutBar";
import VisitsTable from "./components/VisitsTable";
import VisitModal from "../components/VisitModal";
import ExecutiveList from "./components/ExecutiveList";
import ExecutiveModal from "./components/ExecutiveModal";
import CollectionCentresTab from "./components/CollectionCentresTab";
import PatientsTab from "../components/PatientsTab";
import DashboardMetrics from "../../components/DashboardMetrics";
import RequireAuth from "../../components/RequireAuth";
import QuickBookTab from "./components/QuickBookTab";
import html2canvas from "html2canvas";

const CLICKUP_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_CLICKUP_URL || "https://app.clickup.com/";
const WHATSAPP_ICON_URL =
  "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/whatsapp.svg";
const CLICKUP_ICON_URL =
  "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/clickup.svg";
const ADMIN_THEME_STORAGE_KEY = "labbit-admin-dashboard-theme";
const BOOKING_HISTORY_PAGE_SIZE = 120;

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

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export default function AdminDashboard() {
  const toast = useToast();

  const [tabIndex, setTabIndex] = useState(0);
  const [visits, setVisits] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [quickbookings, setQuickbookings] = useState([]);
  const [bookingRequestsLoading, setBookingRequestsLoading] = useState(false);
  const [bookingRequestsLoadingMore, setBookingRequestsLoadingMore] = useState(false);
  const [bookingRequestsHasMoreHistory, setBookingRequestsHasMoreHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [futureUnassignedSummary, setFutureUnassignedSummary] = useState({ count: 0, byDate: {} });
  const [statusOptions, setStatusOptions] = useState([]);
  const [unreadWhatsAppCount, setUnreadWhatsAppCount] = useState(0);
  const [agentPresence, setAgentPresence] = useState([]);
  const [themeMode, setThemeMode] = useState("light");
  const [collectionRefreshHandler, setCollectionRefreshHandler] = useState(null);

  const visitModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [loadingVisitModal, setLoadingVisitModal] = useState(false);
  const [loadingExecutiveModal, setLoadingExecutiveModal] = useState(false);

  const visitsTableRef = useRef();
  const bookingFetchSeqRef = useRef(0);
  const bookingHistoryOffsetRef = useRef(0);

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
    link.download = `Labbit-visits-${selectedDate}.jpg`;
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
            .or("status.is.null,status.eq.,status.eq.pending,status.eq.PENDING")
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

      const apiExecutivesFetch = fetch("/api/executives").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch executives");
        return res.json();
      });
      const whatsappSessionsFetch = fetch("/api/admin/whatsapp/sessions").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch WhatsApp sessions");
        return res.json();
      });
      const agentPresenceFetch = fetch("/api/admin/whatsapp/agent-presence").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch agent presence");
        return res.json();
      });

      const [
        executivesData,
        { data: labsData, error: labsError },
        { data: timeSlotsData, error: timeSlotsError },
        { data: statusOptionsData, error: statusOptionsError },
        whatsappSessionsBody,
        agentPresenceBody
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
          .order("order"),
        whatsappSessionsFetch,
        agentPresenceFetch
      ]);

      if (!executivesData) throw new Error("Failed to load executives");
      if (labsError) throw labsError;
      if (timeSlotsError) throw timeSlotsError;
      if (statusOptionsError) throw statusOptionsError;

      setExecutives(executivesData || []);
      setLabs(labsData || []);
      setTimeSlots(timeSlotsData || []);
      setStatusOptions(statusOptionsData || []);

      const unreadCount = ((whatsappSessionsBody?.sessions) || [])
        .reduce((acc, session) => acc + Number(session?.unread_count || 0), 0);
      setUnreadWhatsAppCount(unreadCount);
      setAgentPresence(Array.isArray(agentPresenceBody?.agents) ? agentPresenceBody.agents : []);

      await fetchBookingRequests({ eagerPending: true, resetHistory: true });
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

      toast({ title: method === "PUT" ? "Visit updated" : "Visit created", status: "success" });

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
  const onlineAgents = agentPresence.filter((a) => a.presence === "online").length;
  const awayAgents = agentPresence.filter((a) => a.presence === "away").length;
  const offlineAgents = agentPresence.filter((a) => a.presence === "offline").length;
  const darkActionButtonProps = themeMode === "dark"
    ? {
        bg: "rgba(255,255,255,0.10)",
        color: "white",
        borderColor: "whiteAlpha.400",
        _hover: { bg: "rgba(255,255,255,0.18)" },
      }
    : {};
  const refreshVisibleTab = useCallback(async () => {
    if (tabIndex === 4 && typeof collectionRefreshHandler === "function") {
      await collectionRefreshHandler();
      return;
    }
    if (tabIndex === 0) {
      await fetchVisitsData();
      return;
    }
    if (tabIndex === 2) {
      await fetchBaseData();
      return;
    }
    await fetchAll();
  }, [tabIndex, collectionRefreshHandler, fetchAll, fetchBaseData, fetchVisitsData]);

  const sortedTodaysVisits = [...visits].sort((a, b) => {
    if (a.status === "disabled" && b.status !== "disabled") return 1;
    if (a.status !== "disabled" && b.status === "disabled") return -1;
    return 0;
  });

  const nonDisabledTodaysVisits = sortedTodaysVisits.filter(
    (v) => v.status !== "disabled"
  );

  const adminTabBaseStyles = {
    borderWidth: "1px",
    borderColor: themeMode === "dark" ? "whiteAlpha.300" : "gray.300",
    borderRadius: "md",
    fontWeight: "semibold",
    bg: themeMode === "dark" ? "blackAlpha.300" : "gray.100",
    px: 4,
    minH: "38px",
    color: themeMode === "dark" ? "whiteAlpha.900" : "gray.800",
    _hover: {
      bg: themeMode === "dark" ? "whiteAlpha.200" : "gray.200"
    },
    _selected: {
      bg: themeMode === "dark" ? "teal.300" : "teal.500",
      color: themeMode === "dark" ? "gray.900" : "white",
      borderColor: themeMode === "dark" ? "teal.300" : "teal.600",
      boxShadow: themeMode === "dark" ? "none" : "0 1px 0 rgba(0,0,0,0.05)"
    }
  };

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
    const timer = setInterval(() => {
      fetchBaseData().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchBaseData]);

  useEffect(() => {
    if (tabIndex !== 2) return;
    fetchBaseData().catch(() => {});
  }, [tabIndex, fetchBaseData]);

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
            <Flex align="center" mb={8} wrap="wrap" gap={3}>
              <Heading className="dashboard-theme-heading" size="xl" flex="1 1 auto">
                Labbit Admin Dashboard
              </Heading>
              <Button
                className="no-export"
                as="a"
                href="/admin/whatsapp"
                colorScheme={unreadWhatsAppCount > 0 ? "red" : "green"}
                variant={unreadWhatsAppCount > 0 ? "solid" : "outline"}
                px={3}
                {...(themeMode === "dark" && unreadWhatsAppCount === 0 ? darkActionButtonProps : {})}
              >
                <img
                  src={WHATSAPP_ICON_URL}
                  alt="WhatsApp"
                  style={{ width: 18, height: 18 }}
                />
                {unreadWhatsAppCount > 0 && (
                  <Badge ml={2} colorScheme="whiteAlpha" borderRadius="full">
                    {unreadWhatsAppCount}
                  </Badge>
                )}
              </Button>
              <Button
                className="no-export"
                as="a"
                href={CLICKUP_DASHBOARD_URL}
                target="_blank"
                rel="noopener noreferrer"
                colorScheme="blue"
                variant="outline"
                px={3}
                {...darkActionButtonProps}
              >
                <img
                  src={CLICKUP_ICON_URL}
                  alt="ClickUp"
                  style={{
                    width: 18,
                    height: 18,
                    filter: themeMode === "dark" ? "invert(1) brightness(1.2)" : "none"
                  }}
                />
              </Button>
              <Tooltip label="Open Logistics">
                <IconButton
                  className="no-export"
                  as="a"
                  href="/collection-centre"
                  aria-label="Open logistics dashboard"
                  icon={<LinkIcon />}
                  size="md"
                  variant="outline"
                  {...(themeMode === "dark"
                    ? {
                        color: "white",
                        bg: "rgba(255,255,255,0.08)",
                        borderColor: "whiteAlpha.400",
                        _hover: { bg: "rgba(255,255,255,0.18)" },
                      }
                    : {
                        borderColor: "gray.300",
                      })}
                />
              </Tooltip>
              <Tooltip label="Report Dispatch">
                <IconButton
                  className="no-export"
                  as="a"
                  href="/admin/report-dispatch"
                  aria-label="Open report dispatch"
                  icon={<ReportDispatchIcon boxSize={5} />}
                  size="md"
                  variant="outline"
                  {...(themeMode === "dark"
                    ? {
                        color: "white",
                        bg: "rgba(255,255,255,0.08)",
                        borderColor: "whiteAlpha.400",
                        _hover: { bg: "rgba(255,255,255,0.18)" },
                      }
                    : {
                        borderColor: "gray.300",
                      })}
                />
              </Tooltip>
              <IconButton
                className="no-export"
                icon={<DownloadIcon />}
                aria-label="Download Visits Schedule"
                size="md"
                onClick={exportVisitsImage}
                {...darkActionButtonProps}
              />
            </Flex>

            <Text mb={4} fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.600"}>
              Team presence: {onlineAgents} online, {awayAgents} away, {offlineAgents} offline
            </Text>

            {errorMsg && (
              <Text color="red.400" mb={6}>
                {errorMsg}
              </Text>
            )}

            <Box
              mb={4}
              px={4}
              py={3}
              borderRadius="lg"
              borderWidth="2px"
              borderColor={pendingQuickbookCount > 0 ? "red.400" : "green.400"}
              bg={themeMode === "dark" ? "blackAlpha.300" : "white"}
            >
              <Text
                fontSize={{ base: "md", md: "lg" }}
                fontWeight="800"
                color={pendingQuickbookCount > 0 ? "red.400" : "green.500"}
              >
                Unprocessed Booking Requests: {pendingQuickbookCount}
              </Text>
            </Box>

            <Box mb={6}>
              <DashboardMetrics hvExecutiveId={null} date={selectedDate} themeMode={themeMode} />
            </Box>

            <Tabs
              index={tabIndex}
              onChange={setTabIndex}
              variant="enclosed"
              colorScheme="green"
              isLazy
            >
              <TabList
                alignItems="center"
                gap={2}
                borderWidth="1px"
                borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"}
                borderRadius="lg"
                px={2}
                py={2}
                bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"}
                mb={2}
              >
                <Tab
                  {...adminTabBaseStyles}
                >
                  Visits{" "}
                  {unassignedVisitCount > 0 && (
                    <Tooltip
                      label={
                        <Box>
                          {Object.entries(unassignedByDate)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([date, count]) => (
                              <Text key={date}>
                                {date} — {count}
                              </Text>
                            ))}
                        </Box>
                      }
                      hasArrow
                      bg="white"
                      color="black"
                      p={3}
                      borderRadius="md"
                    >
                      <Badge
                        ml={2}
                        colorScheme="red"
                        borderRadius="full"
                        cursor="default"
                      >
                        {unassignedVisitCount}
                      </Badge>
                    </Tooltip>
                  )}
                </Tab>
                <Tab
                  {...adminTabBaseStyles}
                >
                  Patients
                </Tab>
                <Tab
                  {...adminTabBaseStyles}
                >
                  Booking Requests{" "}
                  {bookingRequestsLoading ? (
                    <Badge ml={2} colorScheme="orange" borderRadius="full" variant="solid">
                      ...
                    </Badge>
                  ) : pendingQuickbookCount > 0 ? (
                    <Badge ml={2} colorScheme="red" borderRadius="full" variant="solid">
                      {pendingQuickbookCount}
                    </Badge>
                  ) : null}
                </Tab>
                <Tab
                  {...adminTabBaseStyles}
                >
                  Executives
                </Tab>
                <Tab
                  {...adminTabBaseStyles}
                >
                  Collection Centres
                </Tab>
                <Spacer />
                <HStack spacing={2} className="no-export">
                  <Tooltip label="Refresh visible tab">
                    <IconButton
                      aria-label="Refresh current tab"
                      icon={<RepeatIcon />}
                      size="sm"
                      variant="outline"
                      onClick={refreshVisibleTab}
                      {...(themeMode === "dark"
                        ? {
                            color: "white",
                            bg: "rgba(255,255,255,0.08)",
                            borderColor: "whiteAlpha.400",
                            _hover: { bg: "rgba(255,255,255,0.18)" },
                          }
                        : {
                            borderColor: "gray.300",
                          })}
                    />
                  </Tooltip>
                </HStack>
              </TabList>

              <TabPanels>
                <TabPanel>
                  {/* Per-executive visit chips for selected date */}
                  <Flex mb={4} wrap="wrap" gap={2}>
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

                  <VisitsTable
                    visits={sortedTodaysVisits}
                    executives={activePhlebos}
                    timeSlots={timeSlots}
                    onEdit={(visit) => {
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
                    }}
                    onSubmit={handleVisitSave}
                    visitInitialData={editingVisit}
                    isLoading={loadingVisitModal}
                    patients={uniquePatients}
                    executives={activePhlebos}
                    labs={labs}
                    timeSlots={timeSlots}
                    statusOptions={statusOptions}
                  />
                </TabPanel>

                <TabPanel>
                  <PatientsTab fetchPatients={fetchAll} fetchVisits={fetchAll} />
                </TabPanel>

                <TabPanel>
                  <QuickBookTab
                    quickbookings={quickbookings}
                    isLoading={bookingRequestsLoading}
                    isLoadingMore={bookingRequestsLoadingMore}
                    hasMoreHistory={bookingRequestsHasMoreHistory}
                    onLoadMoreHistory={loadMoreBookingRequestHistory}
                    onRefresh={fetchAll}
                    onAcceptVisitComplete={async () => {
                      setTabIndex(0);
                      await fetchVisitsData();
                    }}
                    themeMode={themeMode}
                  />
                </TabPanel>

                <TabPanel>
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

                <TabPanel>
                  <CollectionCentresTab
                    labs={labs}
                    themeMode={themeMode}
                    onRegisterRefresh={setCollectionRefreshHandler}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
        </Flex>
        <style jsx global>{`
          @media (max-width: 768px) {
            .chakra-tabs__tablist {
              overflow-x: auto;
              overflow-y: hidden;
              white-space: nowrap;
              flex-wrap: nowrap !important;
              -webkit-overflow-scrolling: touch;
            }
            .chakra-tabs__tab {
              flex: 0 0 auto;
            }
          }
        `}</style>
      </Box>
    </RequireAuth>
  );
}
