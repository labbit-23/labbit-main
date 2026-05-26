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
  IconButton,
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
import { Settings } from "lucide-react";

const DEPARTMENT_OPTIONS = [
  { label: "Radiology", value: "radiology" },
  { label: "Sonology", value: "sonology" },
  { label: "Cardiology", value: "cardiology" },
  { label: "Dopplers", value: "dopplers" },
];

const AUTO_REFRESH_MS = 30000;
const AUTO_PAGE_MS = 9000;
const QUEUE_ROTATE_MS = 12000;
const INFO_SLIDE_MS = 10000;
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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [fromReqDate, setFromReqDate] = useState(todayIso());
  const [toReqDate, setToReqDate] = useState(todayIso());
  const [fromReqDateDraft, setFromReqDateDraft] = useState(todayIso());
  const [toReqDateDraft, setToReqDateDraft] = useState(todayIso());
  const [departmentQueues, setDepartmentQueues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [isPortrait, setIsPortrait] = useState(false);
  const [infoSlides, setInfoSlides] = useState([]);
  const [infoSlideIndex, setInfoSlideIndex] = useState(0);

  const activeQueues = useMemo(() => {
    return DEPARTMENT_OPTIONS.map((option) => {
      const items = departmentQueues[option.value]?.items || [];
      const pendingItems = items.filter((x) => String(x?.performed || "").trim() !== "1");
      const pendingApprovalItems = items.filter(
        (x) =>
          String(x?.performed || "").trim() === "1" &&
          String(x?.approved_flg || "").trim() !== "1"
      );
      return {
        ...option,
        items,
        pendingItems,
        pendingApprovalItems,
        queuedCount: pendingItems.length
      };
    }).filter((queue) => queue.queuedCount > 0);
  }, [departmentQueues]);

  const currentQueue = useMemo(() => {
    return activeQueues.find((queue) => queue.value === department) || activeQueues[0] || null;
  }, [activeQueues, department]);

  const items = currentQueue?.items || [];

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

  const pendingApprovalCount = pendingApprovalItems.length;

  const pendingCount = pendingItems.length;

  const nextItem = useMemo(() => pendingItems[0] || null, [pendingItems]);
  const hasActiveQueue = activeQueues.length > 0;

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
  const currentInfoSlide = infoSlides.length ? infoSlides[infoSlideIndex % infoSlides.length] : null;

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

  async function fetchQueues(overrides = {}) {
    setLoading(true);
    setError("");
    try {
      const reqFromDate = String(overrides.fromreqdate || fromReqDate || "").trim();
      const reqToDate = String(overrides.toreqdate || toReqDate || reqFromDate).trim();
      const responses = await Promise.all(
        DEPARTMENT_OPTIONS.map(async (option) => {
          const params = new URLSearchParams({
            fromreqdate: reqFromDate,
            toreqdate: reqToDate,
            department: option.value,
          });
          const res = await fetch(`/api/kiosk/department-worklist?${params.toString()}`, {
            cache: "no-store",
          });

          if (res.status === 403) {
            setAuthOpen(true);
            return { department: option.value, forbidden: true, items: [] };
          }
          if (!res.ok) {
            throw new Error(await res.text());
          }

          const body = await res.json();
          return {
            department: option.value,
            items: Array.isArray(body?.items) ? body.items : []
          };
        })
      );

      if (responses.some((response) => response.forbidden)) return;

      const nextQueues = responses.reduce((acc, response) => {
        acc[response.department] = { items: response.items };
        return acc;
      }, {});
      const previousNextKeys = new Set(
        DEPARTMENT_OPTIONS.map((option) => {
          const previousItems = departmentQueues[option.value]?.items || [];
          const previousNext = previousItems.find((x) => String(x?.performed || "").trim() !== "1");
          return previousNext ? `${option.value}:${previousNext.reqno || previousNext.accession_no || ""}` : "";
        }).filter(Boolean)
      );
      const nextActive = DEPARTMENT_OPTIONS.map((option) => {
        const nextItems = nextQueues[option.value]?.items || [];
        const pendingItems = nextItems.filter((x) => String(x?.performed || "").trim() !== "1");
        const pendingApprovalItems = nextItems.filter(
          (x) =>
            String(x?.performed || "").trim() === "1" &&
            String(x?.approved_flg || "").trim() !== "1"
        );
        return { option, pendingItems, pendingApprovalItems };
      }).filter((queue) => queue.pendingItems.length > 0);
      const changedNext = nextActive.find((queue) => {
        const next = queue.pendingItems[0];
        if (!next) return false;
        return !previousNextKeys.has(`${queue.option.value}:${next.reqno || next.accession_no || ""}`);
      });

      setDepartmentQueues(nextQueues);
      if (changedNext) {
        setDepartment(changedNext.option.value);
        setPage(1);
      } else if (!nextActive.some((queue) => queue.option.value === department)) {
        setDepartment(nextActive[0]?.option.value || process.env.NEXT_PUBLIC_KIOSK_DEFAULT_DEPARTMENT || "radiology");
        setPage(1);
      }
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  async function fetchInfoSlides() {
    try {
      const res = await fetch("/api/kiosk/info-slides", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      setInfoSlides(Array.isArray(body?.slides) ? body.slides : []);
      setInfoSlideIndex(0);
    } catch {}
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
      if (ok) await Promise.all([fetchQueues(), fetchInfoSlides()]);
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
      if (ok && mounted) {
        await Promise.all([fetchQueues(), fetchInfoSlides()]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchQueues();
      fetchInfoSlides();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [departmentQueues, department, fromReqDate, toReqDate]);

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
    if (!hasActiveQueue || totalPages <= 1) return;
    const pager = setInterval(() => {
      setPage((p) => (p >= totalPages ? 1 : p + 1));
    }, AUTO_PAGE_MS);
    return () => clearInterval(pager);
  }, [hasActiveQueue, totalPages]);

  useEffect(() => {
    if (activeQueues.length <= 1) return;
    const rotator = setInterval(() => {
      setDepartment((current) => {
        const index = activeQueues.findIndex((queue) => queue.value === current);
        const nextIndex = index < 0 || index >= activeQueues.length - 1 ? 0 : index + 1;
        return activeQueues[nextIndex].value;
      });
      setPage(1);
    }, QUEUE_ROTATE_MS);
    return () => clearInterval(rotator);
  }, [activeQueues]);

  useEffect(() => {
    if (hasActiveQueue || infoSlides.length <= 1) return;
    const rotator = setInterval(() => {
      setInfoSlideIndex((index) => (index + 1) % infoSlides.length);
    }, INFO_SLIDE_MS);
    return () => clearInterval(rotator);
  }, [hasActiveQueue, infoSlides.length]);

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
            <Badge fontSize={{ base: "sm", md: "md" }} px={3} py={2} colorScheme={hasActiveQueue ? "teal" : "gray"}>
              {hasActiveQueue ? `Dept: ${titleFromDepartment(currentQueue?.value)}` : "Information"}
            </Badge>
            <IconButton
              size={{ base: "sm", md: "md" }}
              variant={controlsOpen ? "solid" : "outline"}
              colorScheme="teal"
              aria-label="Toggle display controls"
              icon={<Settings size={20} strokeWidth={2.2} />}
              onClick={() => setControlsOpen((open) => !open)}
            />
          </HStack>
        </Flex>

        {controlsOpen ? (
          <Flex
            bg="white"
            borderRadius="2xl"
            boxShadow="0 10px 26px rgba(15,23,42,0.08)"
            border="1px solid rgba(15,23,42,0.08)"
            p={{ base: 3, md: 4 }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={3}
            wrap="wrap"
          >
            <HStack spacing={2} wrap="wrap">
              <Button
                as="a"
                href="/kiosk"
                size={{ base: "sm", md: "md" }}
                variant="outline"
                colorScheme="teal"
              >
                Dispatch Kiosk
              </Button>
              <Button
                size={{ base: "sm", md: "md" }}
                variant={!showAll ? "solid" : "outline"}
                colorScheme="teal"
                fontWeight="700"
                onClick={() => {
                  setShowAll(false);
                  setPage(1);
                }}
              >
                Show Pending
              </Button>
              <Button
                size={{ base: "sm", md: "md" }}
                variant={showAll ? "solid" : "outline"}
                colorScheme="teal"
                fontWeight="700"
                onClick={() => {
                  setShowAll(true);
                  setPage(1);
                }}
              >
                Show All
              </Button>
            </HStack>

            <HStack spacing={2} wrap="wrap" justify={{ base: "stretch", md: "flex-end" }}>
              <Select
                size={{ base: "sm", md: "md" }}
                value={currentQueue?.value || department}
                maxW={{ base: "100%", md: "220px" }}
                isDisabled={!hasActiveQueue}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
              >
                {(hasActiveQueue ? activeQueues : DEPARTMENT_OPTIONS).map((queue) => (
                  <option key={queue.value} value={queue.value}>{queue.label}</option>
                ))}
              </Select>
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
        ) : null}

        {!hasActiveQueue ? (
          <Box
            bg="white"
            borderRadius="2xl"
            boxShadow="0 10px 26px rgba(15,23,42,0.08)"
            border="1px solid rgba(15,23,42,0.08)"
            minH={{ base: "calc(100vh - 128px)", md: "calc(100vh - 150px)" }}
            display="flex"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
          >
            {loading && !lastUpdated ? (
              <Spinner size="xl" />
            ) : currentInfoSlide ? (
              <Image
                src={currentInfoSlide.src}
                alt={currentInfoSlide.name || "Information"}
                w="100%"
                h="100%"
                maxH={{ base: "calc(100vh - 128px)", md: "calc(100vh - 150px)" }}
                objectFit="contain"
              />
            ) : (
              <VStack spacing={3} color="gray.600">
                <Heading size={{ base: "md", md: "lg" }}>No active queue</Heading>
                <Text fontSize={{ base: "md", md: "lg" }}>Please watch this screen for queue updates.</Text>
              </VStack>
            )}
          </Box>
        ) : (
          <>
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
            <Text fontSize={{ base: "sm", md: "md" }} color="gray.700" noOfLines={1}>{nextItem ? "Please be ready" : "No pending item"}</Text>
          </Box>
        </Flex>

        <Box
          bg="white"
          borderRadius="2xl"
          boxShadow="0 10px 26px rgba(15,23,42,0.08)"
          border="1px solid rgba(15,23,42,0.08)"
          p={{ base: 2, md: 3 }}
        >
          <Flex mb={2} justify="flex-end" align="center" gap={2} wrap="wrap">
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
          </>
        )}

        <Text fontSize={{ base: "sm", md: "md" }} color="gray.600" textAlign="right">
          {lastUpdated ? `Updated: ${lastUpdated.toLocaleTimeString()}` : "Not updated yet"}
        </Text>
      </VStack>


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
                    fetchQueues({ fromreqdate: nextFrom, toreqdate: nextTo });
                  } else {
                    setFromReqDate(nextTo);
                    setToReqDate(nextFrom);
                    fetchQueues({ fromreqdate: nextTo, toreqdate: nextFrom });
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
