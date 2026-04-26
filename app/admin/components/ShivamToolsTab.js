"use client";

import React, { useMemo, useState } from "react";
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
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Select,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
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

const GENDER_OPTIONS = ["Male", "Female", "Other"];

function toNumberOrEmpty(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function computeAgePartsFromDob(dobValue) {
  const dobText = String(dobValue || "").trim();
  if (!dobText) return null;
  const dob = new Date(`${dobText}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  if (dob > today) return null;

  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  let days = today.getDate() - dob.getDate();

  if (days < 0) {
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  if (years < 0) return null;

  return { age: years, ageyrs: years, agemonths: months, agedays: days };
}

function formatDateInput(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeDobFromAgeParts({ years = 0, months = 0, days = 0 }) {
  const y = Number(years);
  const m = Number(months);
  const d = Number(days);
  if (![y, m, d].every((v) => Number.isFinite(v) && v >= 0)) return null;

  const dob = new Date();
  dob.setHours(0, 0, 0, 0);
  if (d > 0) dob.setDate(dob.getDate() - d);
  if (m > 0) dob.setMonth(dob.getMonth() - m);
  if (y > 0) dob.setFullYear(dob.getFullYear() - y);
  return formatDateInput(dob);
}

function applyDemographicsState(setter, d, prevMrno = "") {
  setter({
    mrno: d?.mrno || prevMrno || "",
    patient_name: d?.patient_name || "",
    mobile_no: d?.mobile_no || "",
    age: d?.age ?? "",
    ageyrs: d?.ageyrs ?? "",
    agemonths: d?.agemonths ?? "",
    agedays: d?.agedays ?? "",
    gender: d?.gender || "",
    dob: d?.dob || ""
  });
}

export default function ShivamToolsTab({ labs = [], themeMode = "light", rolePermissions = [], activeRoleKey = "" }) {
  const toast = useToast();
  const confirmDialog = useDisclosure();
  const reductionConfirmDialog = useDisclosure();
  const cancelRef = React.useRef(null);
  const reductionCancelRef = React.useRef(null);
  const hasWildcard = Array.isArray(rolePermissions) && rolePermissions.includes("*");
  const canEditCore = hasWildcard || rolePermissions.includes("shivam.demographics.update");
  const canEditIdentity =
    hasWildcard ||
    ["director", "admin"].includes(String(activeRoleKey || "").toLowerCase()) ||
    rolePermissions.includes("shivam.demographics.update_identity");
  const canPriceSync = hasWildcard || rolePermissions.includes("shivam.pricelist.sync");
  const canOpenEditMode = canEditCore || canEditIdentity;
  const [isEditMode, setIsEditMode] = useState(false);

  const [demographics, setDemographics] = useState({
    mrno: "",
    patient_name: "",
    mobile_no: "",
    age: "",
    ageyrs: "",
    agemonths: "",
    agedays: "",
    gender: "",
    dob: ""
  });
  const [demographicsLoading, setDemographicsLoading] = useState(false);
  const [demographicsFetchLoading, setDemographicsFetchLoading] = useState(false);
  const [loadedDemographics, setLoadedDemographics] = useState(null);
  const [pendingUpdateBody, setPendingUpdateBody] = useState(null);
  const [changePreviewRows, setChangePreviewRows] = useState([]);

  const [selectedLabId, setSelectedLabId] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [blockedReductionRows, setBlockedReductionRows] = useState([]);
  const [toUpdateWithoutReduction, setToUpdateWithoutReduction] = useState(0);

  const panelBg = themeMode === "dark" ? "whiteAlpha.100" : "white";
  const panelBorder = themeMode === "dark" ? "whiteAlpha.300" : "gray.200";
  const previewRows = Array.isArray(syncResult?.comparison_rows)
    ? syncResult.comparison_rows.filter((row) => row.status !== "matched")
    : [];
  const increasedRows = previewRows.filter((row) => row.status === "changed");
  const decreasedRows = previewRows.filter((row) => row.status === "blocked_reduction");
  const missingRows = previewRows.filter((row) => row.status === "missing_local");

  const effectiveLabId = useMemo(() => {
    return selectedLabId || String(labs?.[0]?.id || "").trim();
  }, [labs, selectedLabId]);

  const onChangeDemographics = (key, value) => {
    setDemographics((prev) => ({ ...prev, [key]: value }));
  };

  const doSubmitDemographics = async (body) => {
    setDemographicsLoading(true);
    try {
      const res = await fetch("/api/admin/shivam/demographics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to update demographics");

      const verifyRes = await fetch(
        `/api/admin/shivam/demographics?mrno=${encodeURIComponent(String(body?.mrno || demographics.mrno || "").trim())}`,
        { cache: "no-store" }
      );
      const verifyPayload = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(verifyPayload?.error || "Update sent but verify read failed");
      }
      const d = verifyPayload?.demographics || {};
      applyDemographicsState(setDemographics, d, String(body?.mrno || demographics.mrno || ""));
      setLoadedDemographics({
        mrno: d.mrno || "",
        patient_name: d.patient_name || "",
        mobile_no: d.mobile_no || "",
        age: d.age ?? "",
        ageyrs: d.ageyrs ?? "",
        agemonths: d.agemonths ?? "",
        agedays: d.agedays ?? "",
        gender: d.gender || "",
        dob: d.dob || ""
      });

      const normalizedBody = {
        patient_name: body?.patient_name ?? "",
        mobile_no: body?.mobile_no ?? "",
        age: body?.age ?? "",
        ageyrs: body?.ageyrs ?? "",
        agemonths: body?.agemonths ?? "",
        agedays: body?.agedays ?? "",
        gender: body?.gender ?? "",
        dob: body?.dob ?? ""
      };
      const effective = {
        patient_name: d?.patient_name ?? "",
        mobile_no: d?.mobile_no ?? "",
        age: d?.age ?? "",
        ageyrs: d?.ageyrs ?? "",
        agemonths: d?.agemonths ?? "",
        agedays: d?.agedays ?? "",
        gender: d?.gender ?? "",
        dob: d?.dob ?? ""
      };
      const unchanged = Object.keys(normalizedBody).every(
        (k) => String(normalizedBody[k] ?? "") === "" || String(normalizedBody[k] ?? "") === String(effective[k] ?? "")
      );

      if (unchanged) {
        toast({ title: "Shivam demographics updated", status: "success" });
      } else {
        toast({
          title: "Update not fully applied",
          description: "Some fields were not persisted by upstream. Re-check allowed Shivam fields.",
          status: "warning",
          duration: 5000
        });
      }
      setIsEditMode(false);
    } catch (error) {
      toast({
        title: "Demographics update failed",
        description: error?.message || "Unknown error",
        status: "error"
      });
    } finally {
      setDemographicsLoading(false);
    }
  };

  const submitDemographics = async () => {
    if (!isEditMode) {
      toast({
        title: "Enable edit mode",
        description: "Click Edit before updating demographics.",
        status: "info"
      });
      return;
    }

    const body = {
      mrno: demographics.mrno || null,
      patient_name: demographics.patient_name || null,
      mobile_no: demographics.mobile_no || null,
      age: demographics.age === "" ? null : toNumberOrEmpty(demographics.age),
      ageyrs: demographics.ageyrs === "" ? null : toNumberOrEmpty(demographics.ageyrs),
      agemonths: demographics.agemonths === "" ? null : toNumberOrEmpty(demographics.agemonths),
      agedays: demographics.agedays === "" ? null : toNumberOrEmpty(demographics.agedays),
      gender: demographics.gender || null,
      dob: demographics.dob || null
    };

    const fieldLabels = {
      patient_name: "Patient Name",
      mobile_no: "Mobile No",
      age: "Age",
      ageyrs: "AgeYrs",
      agemonths: "AgeMonths",
      agedays: "AgeDays",
      gender: "Gender",
      dob: "DOB"
    };
    const keys = Object.keys(fieldLabels);
    const rows = [];
    for (const key of keys) {
      const oldValue = loadedDemographics?.[key] ?? "";
      const newValue = body?.[key] ?? "";
      if (String(oldValue ?? "") === String(newValue ?? "")) continue;
      rows.push({
        field: fieldLabels[key],
        oldValue: oldValue === "" || oldValue == null ? "-" : String(oldValue),
        newValue: newValue === "" || newValue == null ? "-" : String(newValue)
      });
    }

    if (rows.length === 0) {
      toast({
        title: "No changes detected",
        description: "Modify at least one field before updating.",
        status: "info"
      });
      return;
    }

    setPendingUpdateBody(body);
    setChangePreviewRows(rows);
    confirmDialog.onOpen();
  };

  const loadDemographicsByMrno = async () => {
    const typedMrno = String(demographics.mrno || "").trim();
    if (!typedMrno) {
      toast({
        title: "MRNO is required",
        description: "Enter MRNO to fetch demographics.",
        status: "warning"
      });
      return;
    }
    setDemographicsFetchLoading(true);
    try {
      const res = await fetch(
        `/api/admin/shivam/demographics?mrno=${encodeURIComponent(typedMrno)}`,
        { cache: "no-store" }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to fetch demographics");
      const d = payload?.demographics || {};
      const hasDemographics =
        Boolean(String(d.patient_name || "").trim()) ||
        Boolean(String(d.mobile_no || "").trim()) ||
        Boolean(String(d.dob || "").trim()) ||
        d.age !== null && d.age !== undefined ||
        d.ageyrs !== null && d.ageyrs !== undefined ||
        d.agemonths !== null && d.agemonths !== undefined ||
        d.agedays !== null && d.agedays !== undefined;
      applyDemographicsState(
        setDemographics,
        d,
        String(demographics.mrno || "").trim()
      );
      setLoadedDemographics({
        mrno: d.mrno || "",
        patient_name: d.patient_name || "",
        mobile_no: d.mobile_no || "",
        age: d.age ?? "",
        ageyrs: d.ageyrs ?? "",
        agemonths: d.agemonths ?? "",
        agedays: d.agedays ?? "",
        gender: d.gender || "",
        dob: d.dob || ""
      });
      if (hasDemographics) {
        toast({ title: "Demographics loaded", status: "success" });
      } else {
        toast({
          title: "No demographics found",
          description: "No patient details found for this MRNO.",
          status: "warning"
        });
      }
    } catch (error) {
      toast({
        title: "Fetch failed",
        description: error?.message || "Unknown error",
        status: "error"
      });
    } finally {
      setDemographicsFetchLoading(false);
    }
  };

  const runPriceSync = async (dryRun = true, allowPriceReduction = false, applyIncreasesOnly = false) => {
    if (!effectiveLabId) {
      toast({
        title: "Lab is required",
        description: "Select a lab before running sync.",
        status: "warning"
      });
      return;
    }
    setSyncLoading(true);
    try {
      const url = `/api/admin/shivam/pricelist-sync?lab_id=${encodeURIComponent(effectiveLabId)}`;
      const res = dryRun
        ? await fetch(url, { cache: "no-store" })
        : await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lab_id: effectiveLabId,
              dry_run: false,
              allow_price_reduction: allowPriceReduction,
              apply_increases_only: applyIncreasesOnly
            })
          });
      const payload = await res.json().catch(() => ({}));
      if (!dryRun && res.status === 409 && payload?.requires_confirmation) {
        setBlockedReductionRows(Array.isArray(payload?.blocked_reduction_rows) ? payload.blocked_reduction_rows : []);
        setToUpdateWithoutReduction(Number(payload?.to_update_without_reduction || 0));
        reductionConfirmDialog.onOpen();
        return;
      }
      if (!res.ok) throw new Error(payload?.error || "Pricelist sync failed");
      setSyncResult(payload);
      toast({
        title: dryRun ? "Preview loaded" : "Price sync completed",
        status: "success"
      });
    } catch (error) {
      toast({
        title: "Pricelist sync failed",
        description: error?.message || "Unknown error",
        status: "error"
      });
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <Stack spacing={5}>
      <Box borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
        <Heading size="md" mb={1}>Shivam Tools</Heading>
        <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.600"}>
          Controlled updates for Shivam demographics and one-way price sync (NeoSoft to Supabase).
        </Text>
      </Box>

      <Tabs colorScheme="teal" variant="unstyled">
        <TabList gap={2} mb={1}>
          <Tab
            borderWidth="1px"
            borderColor={panelBorder}
            borderRadius="md"
            px={4}
            py={2}
            bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"}
            _selected={{
              bg: themeMode === "dark" ? "teal.900" : "teal.50",
              borderColor: "teal.400",
              boxShadow: "0 0 0 1px var(--chakra-colors-teal-400)",
              fontWeight: 700
            }}
          >
            Demographics
          </Tab>
          <Tab
            borderWidth="1px"
            borderColor={panelBorder}
            borderRadius="md"
            px={4}
            py={2}
            bg={themeMode === "dark" ? "whiteAlpha.100" : "gray.50"}
            _selected={{
              bg: themeMode === "dark" ? "teal.900" : "teal.50",
              borderColor: "teal.400",
              boxShadow: "0 0 0 1px var(--chakra-colors-teal-400)",
              fontWeight: 700
            }}
          >
            Price Sync
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0} pt={4}>
            <Grid templateColumns="1fr" gap={4}>
              <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
                <Heading size="sm" mb={4}>Update Demographics</Heading>
                <Stack spacing={3}>
            <HStack justify="space-between" align="center">
              <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                Name and phone are highlighted fields.
              </Text>
              <Button
                size="sm"
                variant={isEditMode ? "solid" : "outline"}
                colorScheme={isEditMode ? "orange" : "teal"}
                onClick={() => setIsEditMode((prev) => !prev)}
                isDisabled={!canOpenEditMode}
              >
                {isEditMode ? "Cancel" : "Edit"}
              </Button>
            </HStack>
            <HStack spacing={3} align="start" flexWrap="wrap">
              <FormControl maxW="220px">
                <FormLabel fontSize="sm">MRNO</FormLabel>
                <Input size="sm" value={demographics.mrno} onChange={(e) => onChangeDemographics("mrno", e.target.value)} />
              </FormControl>
              <Button
                size="sm"
                mt={{ base: 0, md: 7 }}
                variant="outline"
                onClick={loadDemographicsByMrno}
                isLoading={demographicsFetchLoading}
              >
                Load by MRNO
              </Button>
            </HStack>

            <FormControl>
              <FormLabel fontSize="sm">Patient Name</FormLabel>
              <Input
                size="sm"
                value={demographics.patient_name}
                onChange={(e) => onChangeDemographics("patient_name", e.target.value)}
                isDisabled={!isEditMode || !canEditIdentity}
                fontWeight="700"
              />
            </FormControl>

            <HStack spacing={3} align="start" flexWrap="wrap">
              <FormControl maxW="220px">
                <FormLabel fontSize="sm">Mobile No</FormLabel>
                <Input
                  size="sm"
                  value={demographics.mobile_no}
                  onChange={(e) => onChangeDemographics("mobile_no", e.target.value)}
                  isDisabled={!isEditMode || !canEditIdentity}
                  fontWeight="700"
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="sm">Age</FormLabel>
                <Input
                  size="sm"
                  type="number"
                  value={demographics.age}
                  onChange={(e) => {
                    const value = e.target.value;
                    const years = Number(value || 0);
                    const computedDob = computeDobFromAgeParts({ years, months: 0, days: 0 });
                    setDemographics((prev) => ({
                      ...prev,
                      age: value,
                      ageyrs: value,
                      agemonths: 0,
                      agedays: 0,
                      dob: computedDob || prev.dob
                    }));
                  }}
                  isDisabled={!isEditMode || !canEditCore}
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="sm">AgeYrs</FormLabel>
                <Input
                  size="sm"
                  type="number"
                  value={demographics.ageyrs}
                  onChange={(e) => {
                    const value = e.target.value;
                    const years = Number(value || 0);
                    const months = Number(demographics.agemonths || 0);
                    const days = Number(demographics.agedays || 0);
                    const computedDob = computeDobFromAgeParts({ years, months, days });
                    setDemographics((prev) => ({
                      ...prev,
                      ageyrs: value,
                      age: value,
                      dob: computedDob || prev.dob
                    }));
                  }}
                  isDisabled={!isEditMode || !canEditCore}
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="sm">AgeMonths</FormLabel>
                <Input
                  size="sm"
                  type="number"
                  value={demographics.agemonths}
                  onChange={(e) => {
                    const value = e.target.value;
                    const years = Number(demographics.ageyrs || demographics.age || 0);
                    const months = Number(value || 0);
                    const days = Number(demographics.agedays || 0);
                    const computedDob = computeDobFromAgeParts({ years, months, days });
                    setDemographics((prev) => ({
                      ...prev,
                      agemonths: value,
                      dob: computedDob || prev.dob
                    }));
                  }}
                  isDisabled={!isEditMode || !canEditCore}
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="sm">AgeDays</FormLabel>
                <Input
                  size="sm"
                  type="number"
                  value={demographics.agedays}
                  onChange={(e) => {
                    const value = e.target.value;
                    const years = Number(demographics.ageyrs || demographics.age || 0);
                    const months = Number(demographics.agemonths || 0);
                    const days = Number(value || 0);
                    const computedDob = computeDobFromAgeParts({ years, months, days });
                    setDemographics((prev) => ({
                      ...prev,
                      agedays: value,
                      dob: computedDob || prev.dob
                    }));
                  }}
                  isDisabled={!isEditMode || !canEditCore}
                />
              </FormControl>
              <FormControl maxW="180px">
                <FormLabel fontSize="sm">Gender</FormLabel>
                <Select
                  size="sm"
                  value={demographics.gender}
                  onChange={(e) => onChangeDemographics("gender", e.target.value)}
                  isDisabled={!isEditMode || !canEditCore}
                >
                  <option value="">Select</option>
                  {GENDER_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel fontSize="sm">DOB</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  value={demographics.dob}
                  onChange={(e) => {
                    const value = e.target.value;
                    const computed = computeAgePartsFromDob(value);
                    setDemographics((prev) => ({
                      ...prev,
                      dob: value,
                      age: computed ? computed.age : prev.age,
                      ageyrs: computed ? computed.ageyrs : prev.ageyrs,
                      agemonths: computed ? computed.agemonths : prev.agemonths,
                      agedays: computed ? computed.agedays : prev.agedays
                    }));
                  }}
                  isDisabled={!isEditMode || !canEditCore}
                />
              </FormControl>
            </HStack>

            <HStack justify="flex-end">
              <Button
                size="sm"
                colorScheme="teal"
                onClick={submitDemographics}
                isLoading={demographicsLoading}
                isDisabled={!isEditMode || !canOpenEditMode}
              >
                Update Shivam
              </Button>
            </HStack>
                </Stack>
              </GridItem>
            </Grid>
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <Grid templateColumns="1fr" gap={4}>
              <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
                <Heading size="sm" mb={4}>Update to Website (One-way)</Heading>
                <Stack spacing={3}>
                  <FormControl>
                    <FormLabel fontSize="sm">Lab</FormLabel>
                    <Select
                      size="sm"
                      value={effectiveLabId}
                      onChange={(e) => setSelectedLabId(e.target.value)}
                    >
                      {(labs || []).map((lab) => (
                        <option key={lab.id} value={lab.id}>{lab.name || lab.id}</option>
                      ))}
                    </Select>
                  </FormControl>

                  <HStack>
                    <Button size="sm" variant="outline" onClick={() => runPriceSync(true)} isLoading={syncLoading}>
                      Preview
                    </Button>
                    {canPriceSync ? (
                      <Button size="sm" colorScheme="teal" onClick={() => runPriceSync(false, false, true)} isLoading={syncLoading}>
                        Update Increased to Website
                      </Button>
                    ) : null}
                  </HStack>

                  {syncResult ? (
                    <Stack spacing={2} pt={2}>
                      <HStack flexWrap="wrap">
                        <Badge colorScheme="blue">Shivam Price: {syncResult?.upstream_rows || 0}</Badge>
                        <Badge colorScheme="purple">Website Price: {syncResult?.local_rows || 0}</Badge>
                        <Badge colorScheme="green">Matched: {syncResult?.matched_count || 0}</Badge>
                        <Badge colorScheme="orange">Increased: {syncResult?.to_update || 0}</Badge>
                        <Badge colorScheme="red">Decreased: {syncResult?.blocked_reduction_count || 0}</Badge>
                        <Badge colorScheme="red">Missing in Supabase: {syncResult?.missing_in_supabase || 0}</Badge>
                        <Badge colorScheme="teal">Updated: {syncResult?.updated_count || 0}</Badge>
                      </HStack>
                      {(syncResult?.to_update || 0) > 0 || (syncResult?.blocked_reduction_count || 0) > 0 ? (
                        <Box
                          borderWidth="1px"
                          borderColor="red.300"
                          bg={themeMode === "dark" ? "red.900" : "red.50"}
                          borderRadius="md"
                          px={3}
                          py={2}
                        >
                          <Text fontSize="xs" color={themeMode === "dark" ? "red.100" : "red.700"} fontWeight="700">
                            Rate changes detected. Review increased/decreased tables before updating website prices.
                          </Text>
                        </Box>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </GridItem>

              {increasedRows.length > 0 ? (
                <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
                  <HStack justify="space-between" mb={3} flexWrap="wrap">
                    <Heading size="sm">INCREASED ({increasedRows.length})</Heading>
                    {canPriceSync ? (
                      <Button
                        size="sm"
                        colorScheme="teal"
                        onClick={() => runPriceSync(false, false, true)}
                        isLoading={syncLoading}
                      >
                        Update Increased to Website
                      </Button>
                    ) : null}
                  </HStack>
                  <Box overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>Code</Th>
                          <Th>Test Name</Th>
                          <Th isNumeric>Website Price</Th>
                          <Th isNumeric>Shivam Price</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {increasedRows.map((row, idx) => (
                          <Tr key={`${row.internal_code}-${idx}`}>
                            <Td>{row.internal_code}</Td>
                            <Td>{row.lab_test_name || "-"}</Td>
                            <Td isNumeric>{row.local_price ?? "-"}</Td>
                            <Td isNumeric>{row.upstream_price ?? "-"}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                  <Text mt={2} fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                    Review and update only increased prices to website.
                  </Text>
                </GridItem>
              ) : null}

              {decreasedRows.length > 0 ? (
                <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
                  <HStack justify="space-between" mb={3} flexWrap="wrap">
                    <Heading size="sm">DECREASED ({decreasedRows.length})</Heading>
                    {canPriceSync ? (
                      <Button
                        size="sm"
                        colorScheme="red"
                        variant="outline"
                        onClick={() => runPriceSync(false)}
                        isLoading={syncLoading}
                      >
                        Update Decreased to Website
                      </Button>
                    ) : null}
                  </HStack>
                  <Box overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>Code</Th>
                          <Th>Test Name</Th>
                          <Th isNumeric>Website Price</Th>
                          <Th isNumeric>Shivam Price</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {decreasedRows.map((row, idx) => (
                          <Tr key={`${row.internal_code}-${idx}`}>
                            <Td>{row.internal_code}</Td>
                            <Td>{row.lab_test_name || "-"}</Td>
                            <Td isNumeric>{row.local_price ?? "-"}</Td>
                            <Td isNumeric color="red.500" fontWeight="700">{row.upstream_price ?? "-"}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                  <Text mt={2} fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.600"}>
                    Decreased prices require confirmation before update.
                  </Text>
                </GridItem>
              ) : null}

              {missingRows.length > 0 ? (
                <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
                  <Heading size="sm" mb={3}>MISSING IN WEBSITE ({missingRows.length})</Heading>
                  <Box overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>Code</Th>
                          <Th>Test Name</Th>
                          <Th isNumeric>Shivam Price</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {missingRows.map((row, idx) => (
                          <Tr key={`${row.internal_code}-${idx}`}>
                            <Td>{row.internal_code}</Td>
                            <Td>{row.lab_test_name || "-"}</Td>
                            <Td isNumeric>{row.upstream_price ?? "-"}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                </GridItem>
              ) : null}
            </Grid>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <AlertDialog
        isOpen={confirmDialog.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={confirmDialog.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="700">
              Confirm Demographics Update
            </AlertDialogHeader>
            <AlertDialogBody>
              <Text fontSize="sm" mb={3}>
                MRNO: <Text as="span" fontWeight="700">{demographics.mrno || "-"}</Text>
              </Text>
              <Box borderWidth="1px" borderRadius="md" overflow="hidden">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Field</Th>
                      <Th>Previous</Th>
                      <Th>New</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {changePreviewRows.map((row) => (
                      <Tr key={row.field}>
                        <Td>{row.field}</Td>
                        <Td>{row.oldValue}</Td>
                        <Td fontWeight="700">{row.newValue}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={confirmDialog.onClose}>
                Cancel
              </Button>
              <Button
                colorScheme="teal"
                ml={3}
                isLoading={demographicsLoading}
                onClick={async () => {
                  confirmDialog.onClose();
                  if (pendingUpdateBody) {
                    await doSubmitDemographics(pendingUpdateBody);
                  }
                }}
              >
                Confirm Update
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      <AlertDialog
        isOpen={reductionConfirmDialog.isOpen}
        leastDestructiveRef={reductionCancelRef}
        onClose={reductionConfirmDialog.onClose}
        isCentered
        size="2xl"
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="700">
              Confirm Rate Reductions
            </AlertDialogHeader>
            <AlertDialogBody>
              <Text fontSize="sm" mb={3}>
                Some Shivam rates are lower than Supabase. Confirm to apply these reductions as well.
              </Text>
              <Box borderWidth="1px" borderRadius="md" overflowX="auto" maxH="320px" overflowY="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Code</Th>
                      <Th isNumeric>Website Price</Th>
                      <Th isNumeric>Shivam Price</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {blockedReductionRows.map((row, idx) => (
                      <Tr key={`${row.internal_code || "code"}-${idx}`}>
                        <Td>{row.internal_code || "-"}</Td>
                        <Td isNumeric>{row.local_price ?? "-"}</Td>
                        <Td isNumeric>{row.upstream_price ?? "-"}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={reductionCancelRef} onClick={reductionConfirmDialog.onClose}>
                Cancel
              </Button>
              <Button
                colorScheme="teal"
                ml={3}
                isLoading={syncLoading}
                onClick={async () => {
                  reductionConfirmDialog.onClose();
                  await runPriceSync(false, false, true);
                }}
              >
                Apply Increased Prices Only ({toUpdateWithoutReduction})
              </Button>
              <Button
                colorScheme="red"
                ml={3}
                isLoading={syncLoading}
                onClick={async () => {
                  reductionConfirmDialog.onClose();
                  await runPriceSync(false, true);
                }}
              >
                Confirm and Apply
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Stack>
  );
}
