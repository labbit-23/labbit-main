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
  HStack,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@chakra-ui/react";

const DEPARTMENT_OPTIONS = [
  { label: "Radiology", value: "radiology" },
  { label: "Sonology", value: "sonology" },
  { label: "Cardiology", value: "cardiology" },
  { label: "Dopplers", value: "dopplers" },
];

const AUTO_REFRESH_MS = 30000;
const AUTO_PAGE_MS = 9000;
const PAGE_SIZE_PORTRAIT = 10;
const PAGE_SIZE_LANDSCAPE = 6;

function titleFromDepartment(value) {
  const key = String(value || "").trim().toLowerCase();
  const match = DEPARTMENT_OPTIONS.find((opt) => opt.value === key);
  return match?.label || (key ? key.toUpperCase() : "-");
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function KioskQueueDisplayPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [labMeta, setLabMeta] = useState({
    name: process.env.NEXT_PUBLIC_APP_NAME || "Labit",
    logo_url: process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png",
  });

  const [department, setDepartment] = useState(
    process.env.NEXT_PUBLIC_KIOSK_DEFAULT_DEPARTMENT || "radiology"
  );
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [departmentDraft, setDepartmentDraft] = useState(department);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [fromReqDate, setFromReqDate] = useState(todayIso());
  const [toReqDate, setToReqDate] = useState(todayIso());
  const [fromReqDateDraft, setFromReqDateDraft] = useState(todayIso());
  const [toReqDateDraft, setToReqDateDraft] = useState(todayIso());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [isPortrait, setIsPortrait] = useState(false);

  const pendingItems = useMemo(
    () => items.filter((x) => String(x?.performed || "").trim() !== "1"),
    [items]
  );

  const completedItems = useMemo(
    () => items.filter((x) => String(x?.performed || "").trim() === "1"),
    [items]
  );

  const pendingApprovalItems = useMemo(
    () =>
      items.filter(
        (x) =>
          String(x?.performed || "").trim() === "1" &&
          String(x?.approved_flg || "").trim() !== "1"
      ),
    [items]
  );

  const pendingApprovalCount = useMemo(
    () =>
      items.filter(
        (x) =>
          String(x?.performed || "").trim() === "1" &&
          String(x?.approved_flg || "").trim() !== "1"
      ).length,
    [items]
  );

  const pendingCount = useMemo(
    () => items.filter((x) => String(x?.performed || "").trim() !== "1").length,
    [items]
  );

  const nextItem = useMemo(() => pendingItems[0] || null, [pendingItems]);

  const baseRows = useMemo(() => {
    return showAll
      ? [...pendingItems, ...pendingApprovalItems, ...completedItems]
      : [...pendingItems, ...pendingApprovalItems];
  }, [showAll, pendingItems, pendingApprovalItems, completedItems]);

  const filteredRows = useMemo(() => baseRows, [baseRows]);

  const pageSize = isPortrait ? PAGE_SIZE_PORTRAIT : PAGE_SIZE_LANDSCAPE;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const dateLabel = fromReqDate === toReqDate ? fromReqDate : `${fromReqDate} to ${toReqDate}`;

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  async function fetchLabMeta() {
    const res = await fetch("/api/kiosk/lab-meta", { cache: "no-store" });
    if (res.status === 401) {
      setAuthOpen(true);
      return false;
    }
    const body = await res.json().catch(() => ({}));
    setLabMeta((prev) => ({
      name: body?.name || prev.name,
      logo_url: body?.logo_url || prev.logo_url,
    }));
    return true;
  }

  async function fetchQueue(overrides = {}) {
    setLoading(true);
    setError("");
    try {
      const reqDepartment = String(overrides.department || department || "").trim();
      const reqFromDate = String(overrides.fromreqdate || fromReqDate || "").trim();
      const reqToDate = String(overrides.toreqdate || toReqDate || reqFromDate).trim();
      const params = new URLSearchParams({
        fromreqdate: reqFromDate,
        toreqdate: reqToDate,
        department: reqDepartment,
      });
      const res = await fetch(`/api/kiosk/department-worklist?${params.toString()}`, {
        cache: "no-store",
      });

      if (res.status === 403) {
        setAuthOpen(true);
        return;
      }
      if (!res.ok) {
        throw new Error(await res.text());
      }

      const body = await res.json();
      setItems(Array.isArray(body?.items) ? body.items : []);
      setLastUpdated(new Date());
      setPage(1);
    } catch (err) {
      setError(err?.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/kiosk/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (body?.status !== "OK") {
        setAuthError("Invalid kiosk credentials");
        return;
      }
      setAuthOpen(false);
      const ok = await fetchLabMeta();
      if (ok) await fetchQueue();
    } catch (err) {
      setAuthError(err?.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await fetchLabMeta();
      if (ok && mounted) await fetchQueue();
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [department, fromReqDate, toReqDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchQueue();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [department, fromReqDate, toReqDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(orientation: portrait)");
    const apply = () => setIsPortrait(Boolean(media.matches));
    apply();
    const onChange = (e) => setIsPortrait(Boolean(e.matches));
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (totalPages <= 1) return;
    const pager = setInterval(() => {
      setPage((p) => (p >= totalPages ? 1 : p + 1));
    }, AUTO_PAGE_MS);
    return () => clearInterval(pager);
  }, [totalPages]);

  return (
    <Box
      minH="100vh"
      bg="#f8fafc"
      p={{ base: 2, md: 4 }}
      color="#0f172a"
      fontFamily='"Inter", "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif'
    >
      <VStack align="stretch" spacing={3} maxW="1700px" mx="auto">
        <Flex
          bg="white"
          borderRadius="2xl"
          boxShadow="0 10px 26px rgba(15,23,42,0.08)"
          border="1px solid rgba(15,23,42,0.08)"
          p={{ base: 3, md: 4 }}
          align="center"
          justify="space-between"
          gap={3}
        >
          <HStack spacing={4} minW={0}>
            <Image
              src={labMeta.logo_url}
              alt="Lab"
              h={{ base: "52px", md: "64px" }}
              w={{ base: "140px", md: "180px" }}
              objectFit="contain"
              objectPosition="left center"
              flexShrink={0}
            />
            <Heading size={{ base: "md", md: "lg" }} color="#0f172a" noOfLines={1}>Queue Display</Heading>
          </HStack>

          <HStack spacing={2} flexShrink={0}>
            <Button
              size={{ base: "sm", md: "md" }}
              variant="ghost"
              fontWeight="700"
              color="#00695f"
              rightIcon={<Text as="span" fontSize="xs">▼</Text>}
              onClick={() => {
                setDepartmentDraft(department);
                setDepartmentPickerOpen(true);
              }}
            >
              Dept: {titleFromDepartment(department)}
            </Button>
            <Button
              size={{ base: "sm", md: "md" }}
              variant="ghost"
              fontWeight="700"
              color="#0f172a"
              rightIcon={<Text as="span" fontSize="xs">▼</Text>}
              onClick={() => {
                setFromReqDateDraft(fromReqDate);
                setToReqDateDraft(toReqDate);
                setDatePickerOpen(true);
              }}
            >
              {dateLabel}
            </Button>
          </HStack>
        </Flex>

        <Flex gap={3} wrap="wrap">
          <Box
            flex={{ base: "1 1 48%", md: "1 1 280px" }}
            minW={{ base: "48%", md: "280px" }}
            bg="white"
            borderRadius="2xl"
            boxShadow="0 10px 26px rgba(15,23,42,0.08)"
            border="1px solid rgba(15,23,42,0.08)"
            p={{ base: 3, md: 4 }}
          >
            <Text fontSize={{ base: "md", md: "lg" }} color="gray.600" mb={1}>Pending</Text>
            <Heading size={{ base: "xl", md: "2xl" }} color="#f26939">{pendingCount}</Heading>
          </Box>
          <Box
            flex={{ base: "1 1 48%", md: "1 1 280px" }}
            minW={{ base: "48%", md: "280px" }}
            bg="white"
            borderRadius="2xl"
            boxShadow="0 10px 26px rgba(15,23,42,0.08)"
            border="1px solid rgba(15,23,42,0.08)"
            p={{ base: 3, md: 4 }}
          >
            <Text fontSize={{ base: "md", md: "lg" }} color="gray.600" mb={1}>Pending Approval</Text>
            <Heading size={{ base: "xl", md: "2xl" }} color="#e53e3e">{pendingApprovalCount}</Heading>
          </Box>
          <Box
            flex={{ base: "1 1 100%", md: "1 1 320px" }}
            minW={{ base: "100%", md: "320px" }}
            bg="white"
            borderRadius="2xl"
            boxShadow="0 10px 26px rgba(15,23,42,0.08)"
            border="1px solid rgba(15,23,42,0.08)"
            p={{ base: 3, md: 4 }}
          >
            <Text fontSize={{ base: "md", md: "lg" }} color="gray.600" mb={1}>Next In Queue</Text>
            <Heading size={{ base: "md", md: "lg" }} color="#00695f">{nextItem?.reqno || nextItem?.accession_no || "-"}</Heading>
            <Text fontSize={{ base: "sm", md: "md" }} color="gray.700" noOfLines={1}>{nextItem?.procedure_name || "No pending item"}</Text>
          </Box>
        </Flex>

        <Box
          bg="white"
          borderRadius="2xl"
          boxShadow="0 10px 26px rgba(15,23,42,0.08)"
          border="1px solid rgba(15,23,42,0.08)"
          p={{ base: 2, md: 3 }}
        >
          <Flex mb={2} justify="space-between" align="center" gap={2} wrap="wrap">
            <HStack
              spacing={1}
              bg="teal.50"
              borderRadius="xl"
              p={1}
              border="1px solid"
              borderColor="teal.100"
            >
              <Button
                size={{ base: "sm", md: "md" }}
                variant={!showAll ? "solid" : "ghost"}
                colorScheme="teal"
                borderRadius="lg"
                px={{ base: 4, md: 6 }}
                fontWeight="700"
                onClick={() => {
                  if (!showAll) return;
                  setShowAll(false);
                  setPage(1);
                }}
              >
                Show Pending
              </Button>
              <Button
                size={{ base: "sm", md: "md" }}
                variant={showAll ? "solid" : "ghost"}
                colorScheme="teal"
                borderRadius="lg"
                px={{ base: 4, md: 6 }}
                fontWeight="700"
                onClick={() => {
                  if (showAll) return;
                  setShowAll(true);
                  setPage(1);
                }}
              >
                Show All
              </Button>
            </HStack>
            <HStack spacing={1} pr={1}>
              <Button
                size={{ base: "sm", md: "sm" }}
                variant="ghost"
                minW="32px"
                h="32px"
                px={0}
                color="gray.400"
                opacity={0.55}
                _hover={{ bg: "gray.50", color: "gray.600", opacity: 0.9 }}
                aria-label="Previous page"
                onClick={() => setPage((p) => (p <= 1 ? totalPages : p - 1))}
                isDisabled={totalPages <= 1}
              >
                ‹
              </Button>
              <Text fontSize={{ base: "md", md: "lg" }} fontWeight="700" color="gray.700" minW="84px" textAlign="center">
                Page {safePage}/{totalPages}
              </Text>
              <Button
                size={{ base: "sm", md: "sm" }}
                variant="ghost"
                minW="32px"
                h="32px"
                px={0}
                color="gray.400"
                opacity={0.55}
                _hover={{ bg: "gray.50", color: "gray.600", opacity: 0.9 }}
                aria-label="Next page"
                onClick={() => setPage((p) => (p >= totalPages ? 1 : p + 1))}
                isDisabled={totalPages <= 1}
              >
                ›
              </Button>
            </HStack>
          </Flex>

          {error ? <Text color="red.500" mb={2}>{error}</Text> : null}
          {loading && items.length === 0 ? (
            <Flex py={10} justify="center"><Spinner size="xl" /></Flex>
          ) : (
            <Table size={isPortrait ? "sm" : "md"} variant="simple" sx={{ "th, td": { fontSize: isPortrait ? "md" : "lg", py: isPortrait ? 2 : 3 } }}>
              <Thead>
                <Tr>
                  <Th>Req No</Th>
                  <Th>Procedure</Th>
                  <Th>Dept</Th>
                  <Th>Approved</Th>
                  <Th>Performed</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pageRows.map((row, idx) => {
                  const approved = String(row?.approved_flg || "") === "1";
                  const performed = String(row?.performed || "") === "1";
                  return (
                    <Tr key={`${row?.reqno || row?.accession_no || ""}_${row?.testid || ""}_${idx}`} opacity={showAll && performed ? 0.65 : 1}>
                      <Td fontWeight="700">{row?.reqno || row?.accession_no || "-"}</Td>
                      <Td>{row?.procedure_name || "-"}</Td>
                      <Td>{row?.department_name || row?.deptid || "-"}</Td>
                      <Td>
                        <Badge fontSize={isPortrait ? "sm" : "md"} px={3} py={1} colorScheme={approved ? "green" : "orange"}>
                          {approved ? "YES" : "NO"}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge fontSize={isPortrait ? "sm" : "md"} px={3} py={1} colorScheme={performed ? "green" : "gray"}>
                          {performed ? "YES" : "NO"}
                        </Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </Box>

        <Text fontSize={{ base: "sm", md: "md" }} color="gray.600" textAlign="right">
          {lastUpdated ? `Updated: ${lastUpdated.toLocaleTimeString()}` : "Not updated yet"}
        </Text>
      </VStack>

      <Modal isOpen={departmentPickerOpen} onClose={() => setDepartmentPickerOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Change Department</ModalHeader>
          <ModalBody>
            <FormControl>
              <FormLabel>Department</FormLabel>
              <Select value={departmentDraft} onChange={(e) => setDepartmentDraft(e.target.value)}>
                {DEPARTMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="ghost" onClick={() => setDepartmentPickerOpen(false)}>Cancel</Button>
              <Button colorScheme="blue" onClick={() => {
                const nextDepartment = String(departmentDraft || "").trim() || department;
                setDepartment(nextDepartment);
                setDepartmentPickerOpen(false);
                setPage(1);
                fetchQueue({ department: nextDepartment });
              }}>
                Apply
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={datePickerOpen} onClose={() => setDatePickerOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Change Date</ModalHeader>
          <ModalBody>
            <FormControl mb={3}>
              <FormLabel>From Date</FormLabel>
              <Input
                type="date"
                value={fromReqDateDraft}
                onChange={(e) => setFromReqDateDraft(e.target.value)}
                max={todayIso()}
              />
            </FormControl>
            <FormControl>
              <FormLabel>To Date</FormLabel>
              <Input
                type="date"
                value={toReqDateDraft}
                onChange={(e) => setToReqDateDraft(e.target.value)}
                max={todayIso()}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="ghost" onClick={() => setDatePickerOpen(false)}>Cancel</Button>
              <Button
                colorScheme="teal"
                onClick={() => {
                  const nextFrom = fromReqDateDraft || todayIso();
                  const nextTo = toReqDateDraft || nextFrom;
                  if (nextFrom <= nextTo) {
                    setFromReqDate(nextFrom);
                    setToReqDate(nextTo);
                    fetchQueue({ fromreqdate: nextFrom, toreqdate: nextTo });
                  } else {
                    setFromReqDate(nextTo);
                    setToReqDate(nextFrom);
                    fetchQueue({ fromreqdate: nextTo, toreqdate: nextFrom });
                  }
                  setDatePickerOpen(false);
                  setPage(1);
                }}
              >
                Apply
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={authOpen} onClose={() => {}} isCentered closeOnEsc={false} closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalBody p={6}>
            <form onSubmit={handleAuth}>
              <VStack align="stretch" spacing={3}>
                <Heading size="md">Kiosk Login</Heading>
                <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                {authError ? <Text color="red.500" fontSize="sm">{authError}</Text> : null}
                <Button type="submit" colorScheme="blue" isLoading={authLoading}>Sign in</Button>
              </VStack>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
