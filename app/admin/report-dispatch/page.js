"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { DownloadIcon, ExternalLinkIcon, RepeatIcon, SearchIcon } from "@chakra-ui/icons";
import dayjs from "dayjs";
import ShortcutBar from "@/components/ShortcutBar";

const ADMIN_THEME_STORAGE_KEY = "labbit-admin-dashboard-theme";
const DAILY_PAGE_SIZE = 10;

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

export default function ReportDispatchPage() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [themeMode, setThemeMode] = useState("light");

  const [reqnoInput, setReqnoInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [dailyFilter, setDailyFilter] = useState("");

  const [phoneReports, setPhoneReports] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyPage, setDailyPage] = useState(1);

  const [status, setStatus] = useState(null);
  const [selectedReportMeta, setSelectedReportMeta] = useState(null);

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [error, setError] = useState("");

  const [headerRequired, setHeaderRequired] = useState(false);
  const [actionMode, setActionMode] = useState("open");

  const phoneModal = useDisclosure();
  const dateModal = useDisclosure();

  const phoneCacheRef = useRef(new Map());
  const dateCacheRef = useRef(new Map());
  const headerDefaultAppliedRef = useRef(false);
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
    const media = window.matchMedia("(max-width: 767px)");
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
      return reqno.includes(q) || patient.includes(q) || phone.includes(q) || mrno.includes(q);
    });
  }, [dailyRows, dailyFilter]);

  const totalDailyPages = Math.max(1, Math.ceil(filteredDailyRows.length / DAILY_PAGE_SIZE));
  const safeDailyPage = Math.min(dailyPage, totalDailyPages);
  const pagedDailyRows = filteredDailyRows.slice(
    (safeDailyPage - 1) * DAILY_PAGE_SIZE,
    safeDailyPage * DAILY_PAGE_SIZE
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
  const canDispatch = Boolean(currentReqid() || currentReqno());

  function findPhoneFromDailyRows(reqnoValue) {
    const cleanReqno = String(reqnoValue || "").trim();
    if (!cleanReqno) return "";
    const match = (Array.isArray(dailyRows) ? dailyRows : []).find(
      (row) => String(row?.reqno || "").trim() === cleanReqno
    );
    return String(match?.phoneno || "").trim();
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
      const cached = dateCacheRef.current.get(date) || [];
      setDailyRows(cached);
      setDailyPage(1);
      return cached;
    }

    setDailyLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/requisitions?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const rows = Array.isArray(json?.requisitions) ? json.requisitions : [];
      dateCacheRef.current.set(date, rows);
      setDailyRows(rows);
      setDailyPage(1);
      return rows;
    } catch (err) {
      setDailyRows([]);
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
      preferredPhone: String(row?.phoneno || row?.phone || "").trim()
    });
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

    if (
      actionMode === "share" &&
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        const response = await fetch(reportUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load report for sharing");
        const blob = await response.blob();
        const fileName = `${(reqno || reqid || "report").trim()}.pdf`;
        const file = new File([blob], fileName, {
          type: blob?.type || "application/pdf"
        });

        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Report ${reqno || reqid || ""}`.trim(),
            files: [file]
          });
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        return;
      } catch {
        window.open(reportUrl, "_blank", "noopener,noreferrer");
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
        userRole="admin"
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        executives={[]}
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
      />

      <Flex align="stretch" justify="center" pt={{ base: "116px", md: "64px" }} px={[2, 4]} pb={[2, 4]}>
        <Box
          w="full"
          maxW="7xl"
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
          </Flex>

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
                      leftIcon={<ExternalLinkIcon />}
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

          {error ? <Text color="red.400" fontSize="sm">{error}</Text> : null}

          <Flex gap={2} direction={{ base: "column", md: "row" }}>
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

            <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={2} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} flex="1">
              <Text fontWeight="semibold" mb={2}>Dispatch Actions</Text>
              <Flex gap={2} wrap="wrap" align="center">
                <Button size="sm" leftIcon={actionMode === "open" ? <ExternalLinkIcon /> : <DownloadIcon />} minW={{ base: "48%", md: "108px" }} colorScheme="blue" onClick={() => openDocument("all")} isDisabled={!hasStatus || !canDispatch || (!hasLab && !hasRadiology)}>
                  All
                </Button>
                <Button size="sm" leftIcon={actionMode === "open" ? <ExternalLinkIcon /> : <DownloadIcon />} minW={{ base: "48%", md: "108px" }} colorScheme="blue" onClick={() => openDocument("lab")} isDisabled={!hasStatus || !canDispatch || !hasLab}>
                  Lab
                </Button>
                <Button size="sm" leftIcon={actionMode === "open" ? <ExternalLinkIcon /> : <DownloadIcon />} minW={{ base: "48%", md: "108px" }} colorScheme="blue" onClick={() => openDocument("radiology")} isDisabled={!hasStatus || !canDispatch || !hasRadiology}>
                  Radiology
                </Button>
                <Button size="sm" leftIcon={actionMode === "open" ? <ExternalLinkIcon /> : <DownloadIcon />} minW={{ base: "48%", md: "108px" }} colorScheme="teal" onClick={openTrend} isDisabled={!hasStatus || !canTrend}>
                  Trend
                </Button>
                <Button
                  size="sm"
                  leftIcon={actionMode === "open" ? <ExternalLinkIcon /> : <DownloadIcon />}
                  minW={{ base: "48%", md: "108px" }}
                  colorScheme="yellow"
                  onClick={() => openDocument("all", { printtype: "0" })}
                  isDisabled={!hasStatus || !currentReqid() || !hasLab}
                >
                  Pending
                </Button>
              </Flex>
            </Box>
          </Flex>

          <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={2} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} display="flex" flexDirection="column">
            <SimpleGrid columns={{ base: 2, sm: 3, lg: 5 }} spacing={2} mb={1}>
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
            <Box overflow="auto" maxH="60vh" borderWidth="1px" borderColor="gray.200" borderRadius="md">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>REQNO</Th>
                    <Th>Patient</Th>
                    <Th>Phone</Th>
                    <Th>MRNO</Th>
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
    </Box>
  );
}
