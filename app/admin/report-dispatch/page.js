"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
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
import { DownloadIcon, ExternalLinkIcon, RepeatIcon } from "@chakra-ui/icons";
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
        selectedReportMeta?.phoneno ||
        ""
      )
        .replace(/\D/g, "")
        .slice(-10);
      if (resolvedPhone) {
        setPhoneInput(resolvedPhone);
      }
    } catch (err) {
      setError(err?.message || "Failed to load dispatch status");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
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

  function openDocument(reportScope, extra = {}) {
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

    window.open(`/api/admin/reports/document?${query.toString()}`, "_blank", "noopener,noreferrer");
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
  const actionLabel = actionMode === "download" ? "Download" : "Open";

  const statusReqid = displayValue(status?.reqid || selectedReportMeta?.reqid);
  const statusReqno = displayValue(status?.reqno || reqnoInput || selectedReportMeta?.reqno);
  const statusPatient = displayValue(status?.live_status?.patient_name || selectedReportMeta?.patient_name);
  const statusTestDate = displayValue(status?.live_status?.test_date || selectedReportMeta?.reqdt);
  const statusPhone = displayValue(status?.live_status?.patient_phone || selectedReportMeta?.phoneno);
  const statusMrno = displayValue(status?.live_status?.mrno || selectedReportMeta?.mrno);

  return (
    <Box
      h="100vh"
      w="100vw"
      overflow="hidden"
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

      <Flex align="stretch" justify="center" h="calc(100vh - 64px)" pt="64px" px={4} pb={4} overflow="hidden">
        <Box
          w="full"
          maxW="7xl"
          className="dashboard-theme-card"
          borderRadius="xl"
          px={[3, 5]}
          py={[3, 4]}
          h="full"
          overflow="hidden"
          display="flex"
          flexDirection="column"
          gap={3}
        >
          <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
            <Heading className="dashboard-theme-heading" size="lg">Report Dispatch</Heading>
            <Button as="a" href="/admin" size="sm" variant="outline">Back to Dashboard</Button>
          </Flex>

          <Box
            borderWidth="1px"
            borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"}
            borderRadius="lg"
            p={3}
            bg={themeMode === "dark" ? "rgba(19,22,30,0.96)" : "rgba(255,255,255,0.97)"}
          >
            <Flex wrap="wrap" gap={2} align="center" justify="space-between">
              <form onSubmit={handleLookup}>
                <HStack spacing={2}>
                  <Input
                    size="sm"
                    w="240px"
                    value={reqnoInput}
                    onChange={(e) => setReqnoInput(e.target.value)}
                    placeholder="REQNO"
                  />
                  <Button type="submit" size="sm" colorScheme="blue" isLoading={loadingStatus}>Check Status</Button>
                </HStack>
              </form>

              <HStack spacing={2}>
                <Text fontSize="sm" fontWeight="semibold">Output:</Text>
                <ButtonGroup size="sm" isAttached variant="outline">
                  <Button
                    leftIcon={<ExternalLinkIcon />}
                    colorScheme={actionMode === "open" ? "blue" : "gray"}
                    variant={actionMode === "open" ? "solid" : "outline"}
                    onClick={() => setActionMode("open")}
                  >
                    Open
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
                <Checkbox isChecked={headerRequired} onChange={(e) => setHeaderRequired(e.target.checked)} size="sm">
                  <Text fontSize="sm">Header</Text>
                </Checkbox>
              </HStack>

              <HStack spacing={2}>
                <Button size="sm" colorScheme="blue" onClick={() => openDocument("all")} isDisabled={!hasStatus || !canDispatch || (!hasLab && !hasRadiology)}>
                  {actionLabel} All
                </Button>
                <Button size="sm" colorScheme="blue" onClick={() => openDocument("lab")} isDisabled={!hasStatus || !canDispatch || !hasLab}>
                  {actionLabel} Lab
                </Button>
                <Button size="sm" colorScheme="blue" onClick={() => openDocument("radiology")} isDisabled={!hasStatus || !canDispatch || !hasRadiology}>
                  {actionLabel} Radiology
                </Button>
                <Button size="sm" colorScheme="teal" onClick={openTrend} isDisabled={!hasStatus || !canTrend}>
                  {actionLabel} Trend
                </Button>
                <Button
                  size="sm"
                  colorScheme="yellow"
                  onClick={() => openDocument("all", { printtype: "0" })}
                  isDisabled={!hasStatus || !currentReqid() || !hasLab}
                >
                  {actionLabel} Pending
                </Button>
              </HStack>
            </Flex>
          </Box>

          {error ? <Text color="red.400" fontSize="sm">{error}</Text> : null}

          <Flex gap={3}>
            <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={3} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} flex="1">
              <Text fontWeight="semibold" mb={2}>Search by Mobile No</Text>
              <HStack spacing={2}>
                <Input size="sm" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="Phone (10-digit)" maxW="220px" />
                <Button size="sm" colorScheme="gray" onClick={handleOpenPhoneModal} isLoading={phoneLoading}>Requisition List</Button>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                  Cached: {(Array.isArray(phoneReports) ? phoneReports.length : 0)}
                </Text>
              </HStack>
            </Box>

            <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={3} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} flex="1">
              <Text fontWeight="semibold" mb={2}>Date-wise Requisitions ({selectedDate})</Text>
              <HStack spacing={2}>
                <Button size="sm" colorScheme="gray" onClick={handleOpenDateModal} isLoading={dailyLoading}>Search</Button>
                <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                  Cached: {(Array.isArray(dailyRows) ? dailyRows.length : 0)}
                </Text>
              </HStack>
            </Box>
          </Flex>

          <Box borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.300" : "gray.200"} borderRadius="lg" p={3} bg={themeMode === "dark" ? "whiteAlpha.50" : "gray.50"} flex="1" minH={0} display="flex" flexDirection="column">
            <HStack spacing={4} wrap="wrap" mb={2}>
              <Text fontSize="sm"><strong>REQNO:</strong> {statusReqno}</Text>
              <Text fontSize="sm"><strong>REQID:</strong> {statusReqid}</Text>
              <Text fontSize="sm"><strong>Patient:</strong> {statusPatient}</Text>
              <Text fontSize="sm"><strong>Date:</strong> {statusTestDate}</Text>
              <Text fontSize="sm"><strong>Phone:</strong> {statusPhone}</Text>
              <Text fontSize="sm"><strong>MRNO:</strong> {statusMrno}</Text>
              <Text fontSize="sm"><strong>Status:</strong> <Badge ml={1} colorScheme={tone}>{status?.live_status?.overall_status || "-"}</Badge></Text>
            </HStack>
            <Text fontSize="xs" mb={1}>Ready Lab: {status?.live_status?.lab_ready || 0}/{status?.live_status?.lab_total || 0} | Ready Radiology: {status?.live_status?.radiology_ready || 0}/{status?.live_status?.radiology_total || 0}</Text>
            <Progress mb={2} value={readyPct} borderRadius="full" colorScheme={tone} />
            <Box overflow="auto" borderWidth="1px" borderColor={themeMode === "dark" ? "whiteAlpha.200" : "gray.100"} borderRadius="md" flex="1" minH={0}>
              <Table size="sm" variant="simple" sx={{ "th, td": { fontSize: "xs", py: 1.5 } }}>
                <Thead>
                  <Tr>
                    <Th>Test</Th>
                    <Th>ID</Th>
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
                        <Td>{displayValue(row?.test_id)}</Td>
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
            <Text mt={1} fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>{displayValue(decision?.reason)}</Text>
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
