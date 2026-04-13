"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
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
  Select,
  Spinner,
  Stack,
  Text,
  useToast,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { CalendarIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { FiUser } from "react-icons/fi";
import ShortcutBar from "../../components/ShortcutBar";
import { useUser } from "../context/UserContext";

function formatDate(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status) {
  const key = String(status || "").toLowerCase();
  if (["pending", "unprocessed", "booked", "scheduled", "under review"].includes(key)) return "orange";
  if (["in progress", "in_progress"].includes(key)) return "yellow";
  if (["completed", "closed", "resolved"].includes(key)) return "green";
  if (["rejected", "cancelled", "canceled", "failed"].includes(key)) return "red";
  return "gray";
}

export default function PatientPortalPage() {
  const { user } = useUser();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [portal, setPortal] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [trendInlineHtml, setTrendInlineHtml] = useState("");
  const [trendInlineLoading, setTrendInlineLoading] = useState(false);

  const selectedPatient = useMemo(() => {
    const rows = Array.isArray(portal?.patients) ? portal.patients : [];
    return rows.find((row) => row.id === selectedPatientId) || rows[0] || null;
  }, [portal, selectedPatientId]);

  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    dob: "",
    age: "",
    gender: "",
  });

  const loadPortal = async (patientId = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (patientId) params.set("patient_id", patientId);
      const res = await fetch(`/api/patient/portal${params.toString() ? `?${params.toString()}` : ""}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load patient portal.");
      setPortal(json);
      const resolvedPatientId = patientId || json?.selected_patient_id || json?.selected_patient?.id || "";
      setSelectedPatientId(resolvedPatientId);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal("");
  }, []);

  useEffect(() => {
    if (!selectedPatient) return;
    setProfileForm({
      name: String(selectedPatient?.name || ""),
      email: String(selectedPatient?.email || ""),
      dob: String(selectedPatient?.dob || ""),
      age: selectedPatient?.age == null ? "" : String(selectedPatient.age),
      gender: String(selectedPatient?.gender || ""),
    });
  }, [selectedPatient?.id]);

  const reports = Array.isArray(portal?.reports) ? portal.reports : [];
  const quickbookLive = Array.isArray(portal?.bookings?.quickbook) ? portal.bookings.quickbook : [];
  const visits = Array.isArray(portal?.bookings?.visits) ? portal.bookings.visits : [];
  const reminders = portal?.reminders || {};
  const todayIso = new Date().toISOString().slice(0, 10);
  const isPatientSession = String(user?.userType || "").toLowerCase() === "patient";

  const trendHtmlUrl = portal?.selected_mrno
    ? `/api/smart-reports/trend-data?mrno=${encodeURIComponent(portal.selected_mrno)}&report_mode=trends&design_variant=executive&format=html`
    : "";
  const trendPdfUrl = portal?.selected_mrno
    ? `/api/smart-reports/trend-data?mrno=${encodeURIComponent(portal.selected_mrno)}&report_mode=trends&design_variant=executive&format=pdf`
    : "";
  const trendSimplePdfUrl = portal?.selected_mrno
    ? `/api/smart-reports/trend-data?mrno=${encodeURIComponent(portal.selected_mrno)}&report_mode=trends&design_variant=basic&format=pdf`
    : "";

  const openSimplifiedTrend = (dateIso = "") => {
    if (!portal?.selected_mrno) return;
    const query = new URLSearchParams({
      mrno: portal.selected_mrno,
      report_mode: "trends",
      design_variant: "basic",
      format: "pdf",
    });
    if (dateIso) query.set("asof", dateIso);
    window.open(`/api/smart-reports/trend-data?${query.toString()}`, "_blank", "noopener,noreferrer");
  };

  const saveProfile = async () => {
    if (!selectedPatient?.id) return;
    setSavingProfile(true);
    try {
      const payload = {
        patient_id: selectedPatient.id,
        name: profileForm.name,
        email: profileForm.email,
        dob: profileForm.dob,
        age: profileForm.age,
        gender: profileForm.gender,
      };
      const res = await fetch("/api/patient/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save profile.");
      toast({ title: "Profile updated", status: "success", duration: 2200, isClosable: true });
      await loadPortal(selectedPatient.id);
    } catch (err) {
      toast({
        title: "Profile update failed",
        description: String(err?.message || err),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!trendHtmlUrl) {
      setTrendInlineHtml("");
      return undefined;
    }

    const loadTrendInline = async () => {
      setTrendInlineLoading(true);
      try {
        const res = await fetch(trendHtmlUrl, { cache: "no-store" });
        const html = await res.text();
        if (!res.ok) throw new Error("Failed to load trend report");
        if (!alive) return;
        setTrendInlineHtml(extractBodyHtmlWithStyles(html));
      } catch {
        if (!alive) return;
        setTrendInlineHtml("");
      } finally {
        if (alive) setTrendInlineLoading(false);
      }
    };

    loadTrendInline();
    return () => {
      alive = false;
    };
  }, [trendHtmlUrl]);

  return (
    <Box minH="100vh" bg="#f4faf8">
      <ShortcutBar
        rightContent={
          <TooltipIconButton
            label="Profile"
            onClick={() => setProfileOpen(true)}
            icon={<FiUser />}
          />
        }
      />
      <Box maxW="1400px" mx="auto" px={{ base: 3, md: 5 }} pt="72px" pb={6}>
        <Flex
          mb={4}
          p={{ base: 4, md: 5 }}
          bg="linear-gradient(135deg, #e6f6f1 0%, #fff9f1 100%)"
          border="1px solid"
          borderColor="#d7ebe4"
          borderRadius="2xl"
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          direction={{ base: "column", md: "row" }}
          gap={3}
        >
          <VStack align="start" spacing={1}>
            <Heading size={{ base: "md", md: "lg" }} color="#0c6f5e">
              Health Summary
            </Heading>
            <Text color="#2f5f57" fontSize={{ base: "sm", md: "md" }}>
              Reports, trends, reminders, and booking progress in one place.
            </Text>
          </VStack>
          <HStack spacing={2} alignSelf={{ base: "stretch", md: "center" }}>
            <Select
              bg="white"
              borderColor="#cbe4dc"
              value={selectedPatientId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedPatientId(nextId);
                loadPortal(nextId);
              }}
              minW={{ base: "100%", md: "260px" }}
            >
              {(portal?.patients || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Patient"} · {p.phone || "-"}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              borderColor="#5ea796"
              color="#0b6f5f"
              onClick={() => loadPortal(selectedPatientId)}
            >
              Refresh
            </Button>
          </HStack>
        </Flex>

        {loading ? (
          <Flex minH="40vh" align="center" justify="center">
            <VStack spacing={3}>
              <Spinner size="lg" color="teal.500" />
              <Text color="gray.600">Loading patient dashboard…</Text>
            </VStack>
          </Flex>
        ) : error ? (
          <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="xl" p={4}>
            <Text color="red.700" fontWeight="600">Error loading dashboard</Text>
            <Text color="red.600" fontSize="sm">{error}</Text>
          </Box>
        ) : (
          <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 380px" }} gap={4}>
            <Box>
              <VStack spacing={4} align="stretch">
                <Box>
                  <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={2}>
                    <VStack align="start" spacing={0}>
                      <Heading size="sm" color="#186b5d">Health Trend</Heading>
                      <Text fontSize="sm" color="gray.600">Trend view is the main page section</Text>
                    </VStack>
                    <HStack spacing={2}>
                      <Button
                        size="sm"
                        leftIcon={<ExternalLinkIcon />}
                        variant="outline"
                        onClick={() => trendHtmlUrl && window.open(trendHtmlUrl, "_blank", "noopener,noreferrer")}
                        isDisabled={!trendHtmlUrl}
                      >
                        Open HTML
                      </Button>
                      <Button
                        size="sm"
                        leftIcon={<CalendarIcon />}
                        colorScheme="teal"
                        onClick={() => trendPdfUrl && window.open(trendPdfUrl, "_blank", "noopener,noreferrer")}
                        isDisabled={!trendPdfUrl}
                      >
                        Download PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSimplifiedTrend("")}
                        isDisabled={!trendSimplePdfUrl}
                      >
                        Simplified Summary
                      </Button>
                    </HStack>
                  </Flex>
                  <Box
                    mt={4}
                    minH={{ base: "76vh", md: "84vh", xl: "calc(100vh - 210px)" }}
                    p={0}
                  >
                    {trendInlineLoading ? (
                      <Flex h="100%" minH="240px" align="center" justify="center">
                        <VStack spacing={2}>
                          <Spinner size="md" color="teal.500" />
                          <Text color="gray.600" fontSize="sm">Loading trend report…</Text>
                        </VStack>
                      </Flex>
                    ) : trendInlineHtml ? (
                      <Box
                        className="patient-trend-inline-root"
                        sx={{
                          "& .page": { maxW: "100% !important", width: "100% !important", mx: "0 !important" },
                          "& .page-break": { pageBreakBefore: "auto !important" },
                          "& .summary-page, & .detail-page, & .end-page": {
                            mb: "14px",
                            boxShadow: "none !important",
                          },
                        }}
                        dangerouslySetInnerHTML={{ __html: trendInlineHtml }}
                      />
                    ) : (
                      <Flex h="100%" align="center" justify="center" p={6}>
                        <Text color="gray.600" textAlign="center">
                          Trend report not available yet. Once MRNO is linked and reports are present, it will appear here.
                        </Text>
                      </Flex>
                    )}
                  </Box>
                </Box>
              </VStack>
            </Box>

            <Box>
              <VStack spacing={4} align="stretch" position={{ xl: "sticky" }} top={{ xl: "74px" }}>
                <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" p={4}>
                  <Heading size="sm" mb={2} color="#186b5d">Report Dates</Heading>
                  <Text fontSize="sm" color="gray.600" mb={3}>
                    Patient-wise report history with direct PDF.
                  </Text>
                  <Stack spacing={2} maxH="220px" overflowY="auto" pr={1}>
                    {reports.length ? (
                      reports.map((r, idx) => (
                        <Flex
                          key={`${r.reqid || "report"}-${idx}`}
                          p={3}
                          border="1px solid"
                          borderColor="gray.200"
                          borderRadius="md"
                          align="center"
                          justify="space-between"
                          wrap="wrap"
                          gap={2}
                        >
                          <VStack align="start" spacing={0}>
                            <Text fontWeight="600" color="gray.800">{formatDate(r.reqdt)}</Text>
                            <Text fontSize="xs" color="gray.500">{r.patient_name || "Patient"}</Text>
                            <Text fontSize="xs" color="gray.500">
                              Req: {r.reqno || r.reqid || "-"} {r.mrno ? `· MRNO ${r.mrno}` : ""}
                            </Text>
                          </VStack>
                          <Button
                            size="sm"
                            rightIcon={<ExternalLinkIcon />}
                            onClick={() => r.report_url && window.open(r.report_url, "_blank", "noopener,noreferrer")}
                            isDisabled={!r.report_url}
                          >
                            Download PDF
                          </Button>
                        </Flex>
                      ))
                    ) : (
                      <Text color="gray.600" fontSize="sm">No reports found for this phone yet.</Text>
                    )}
                  </Stack>
                </Box>

                <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" p={4}>
                  <Heading size="sm" mb={3} color="#186b5d">Reminders</Heading>
                  <VStack align="stretch" spacing={3}>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Last package / tests</Text>
                      <Text fontSize="sm" fontWeight="600" color="gray.800">
                        {reminders?.latest_package_name || "No package history yet"}
                      </Text>
                    </Box>
                    <Divider />
                    <Box>
                      <Text fontSize="xs" color="gray.500">Suggested follow-up window</Text>
                      <Text fontSize="sm" fontWeight="600">
                        {reminders?.trend_followup_window || "None"}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        Suggested follow-up panels
                      </Text>
                      <Wrap spacing={2}>
                        {(Array.isArray(reminders?.trend_followup_tests) ? reminders.trend_followup_tests : []).length ? (
                          reminders.trend_followup_tests.map((test) => (
                            <WrapItem key={String(test)}>
                              <Badge colorScheme="purple" borderRadius="md" px={2} py={1}>
                                {String(test)}
                              </Badge>
                            </WrapItem>
                          ))
                        ) : (
                          <Text fontSize="sm" color="gray.600">None</Text>
                        )}
                      </Wrap>
                    </Box>
                  </VStack>
                </Box>

                <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" p={4}>
                  <Heading size="sm" mb={3} color="#186b5d">Booking Requests</Heading>
                  <VStack align="stretch" spacing={3} mb={3}>
                    <Button colorScheme="teal" onClick={() => window.open("/?quickbook=true", "_self")}>
                      New Booking Request
                    </Button>
                  </VStack>
                  <Stack spacing={2} maxH="250px" overflowY="auto" pr={1}>
                    {quickbookLive.length ? (
                      quickbookLive.map((q) => (
                        <Box key={q.id} p={3} border="1px solid" borderColor="gray.200" borderRadius="md">
                          <HStack justify="space-between" align="center">
                            <Badge colorScheme={statusColor(q.status)}>{q.status || "PENDING"}</Badge>
                            <Text fontSize="xs" color="gray.500">{formatDate(q.date || q.created_at)}</Text>
                          </HStack>
                          <Text fontSize="sm" mt={2} color="gray.800">{q.package_name || "Booking request"}</Text>
                          <Text fontSize="xs" color="gray.600" mt={1}>
                            {q.home_visit_required ? "Home Collection" : "Centre Visit"} · {q.area || "None"}
                          </Text>
                        </Box>
                      ))
                    ) : (
                      <Text fontSize="sm" color="gray.600">None</Text>
                    )}
                  </Stack>
                </Box>

                <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" p={4}>
                  <Heading size="sm" mb={3} color="#186b5d">Upcoming Visits</Heading>
                  <Stack spacing={2} maxH="320px" overflowY="auto" pr={1}>
                    {visits.length ? (
                      visits.map((v) => {
                        const visitIso = parseDateValue(v.visit_date);
                        const isPrevious = visitIso && visitIso < todayIso;
                        return (
                        <Box key={v.id} p={3} border="1px solid" borderColor="gray.200" borderRadius="md">
                          <HStack justify="space-between" align="center">
                            <Badge colorScheme={statusColor(v.status)}>{v.status || "BOOKED"}</Badge>
                            <Text fontSize="xs" color="gray.500">{formatDate(v.visit_date)}</Text>
                          </HStack>
                          <Text fontSize="sm" mt={2} color="gray.800" fontStyle={isPrevious ? "italic" : "normal"}>
                            {v.time_slot || "None"}
                          </Text>
                          <Text fontSize="xs" color="gray.600" fontStyle={isPrevious ? "italic" : "normal"}>
                            {v.address || "None"}
                          </Text>
                          {isPrevious ? (
                            <Text fontSize="xs" color="gray.500" fontStyle="italic">Previous visit</Text>
                          ) : null}
                          <Text fontSize="xs" color="gray.500" mt={1}>Updated: {formatDateTime(v.created_at)}</Text>
                        </Box>
                      )})
                    ) : (
                      <Text fontSize="sm" color="gray.600">None</Text>
                    )}
                  </Stack>
                </Box>
              </VStack>
            </Box>
          </Grid>
        )}
      </Box>

      <Modal isOpen={profileOpen} onClose={() => setProfileOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Profile</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel fontSize="sm">Name</FormLabel>
                <Input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                  bg="gray.50"
                  isReadOnly={isPatientSession}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Email</FormLabel>
                <Input
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                  bg="gray.50"
                  isReadOnly={isPatientSession}
                />
              </FormControl>
              <HStack align="start" spacing={3}>
                <FormControl>
                  <FormLabel fontSize="sm">DOB</FormLabel>
                  <Input
                    type="date"
                    value={profileForm.dob}
                    onChange={(e) => setProfileForm((p) => ({ ...p, dob: e.target.value }))}
                    bg="gray.50"
                    isReadOnly={isPatientSession}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Age</FormLabel>
                  <Input
                    type="number"
                    value={profileForm.age}
                    onChange={(e) => setProfileForm((p) => ({ ...p, age: e.target.value }))}
                    bg="gray.50"
                    min={0}
                    max={120}
                    isReadOnly={isPatientSession}
                  />
                </FormControl>
              </HStack>
              <FormControl>
                <FormLabel fontSize="sm">Gender</FormLabel>
                <Select
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))}
                  bg="gray.50"
                  isDisabled={isPatientSession}
                >
                  <option value="">Select</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </FormControl>
              {isPatientSession ? (
                <Text fontSize="xs" color="gray.500">
                  Profile edits are restricted. Contact support for changes.
                </Text>
              ) : null}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="ghost" onClick={() => setProfileOpen(false)}>Close</Button>
              {!isPatientSession ? (
                <Button
                  colorScheme="teal"
                  onClick={async () => {
                    await saveProfile();
                    setProfileOpen(false);
                  }}
                  isLoading={savingProfile}
                  loadingText="Saving"
                >
                  Save Profile
                </Button>
              ) : null}
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

function parseDateValue(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function TooltipIconButton({ label, icon, onClick }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} leftIcon={icon}>
      {label}
    </Button>
  );
}

function extractBodyHtmlWithStyles(inputHtml) {
  const html = String(inputHtml || "");
  if (!html) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const styles = Array.from(doc.querySelectorAll("style"))
      .map((el) => el.outerHTML)
      .join("\n");
    const body = doc.body?.innerHTML || "";
    if (styles || body) return `${styles}\n${body}`;
    return html;
  } catch {
    return html;
  }
}
