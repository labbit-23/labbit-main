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

export default function ShivamToolsTab({ labs = [], themeMode = "light", rolePermissions = [], activeRoleKey = "" }) {
  const toast = useToast();
  const reductionConfirmDialog = useDisclosure();
  const reductionCancelRef = React.useRef(null);
  const hasWildcard = Array.isArray(rolePermissions) && rolePermissions.includes("*");
  const canPriceSync = hasWildcard || rolePermissions.includes("shivam.pricelist.sync");

  const [selectedLabId, setSelectedLabId] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [blockedReductionRows, setBlockedReductionRows] = useState([]);
  const [toUpdateWithoutReduction, setToUpdateWithoutReduction] = useState(0);

  const [phoneInput, setPhoneInput] = useState("");
  const [mrnLookupLoading, setMrnLookupLoading] = useState(false);
  const [mrnLookupResult, setMrnLookupResult] = useState(null);

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
      const url = `/api/admin/live-sync/pricelist-sync?lab_id=${encodeURIComponent(effectiveLabId)}`;
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
          One-way Live Sync price sync (labit-core to Supabase) and untagged-requisition lookup.
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
            Price Sync
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
            MRN Management
          </Tab>
        </TabList>
        <TabPanels>
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
                    {canPriceSync && Number(syncResult?.to_update || 0) > 0 ? (
                      <Button size="sm" colorScheme="teal" onClick={() => runPriceSync(false, false, true)} isLoading={syncLoading}>
                        Update Increased to Website
                      </Button>
                    ) : null}
                  </HStack>

                  {syncResult ? (
                    <Stack spacing={2} pt={2}>
                      <HStack flexWrap="wrap">
                        <Badge colorScheme="blue">Live Sync Price: {syncResult?.upstream_rows || 0}</Badge>
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
                          <Th isNumeric>Live Sync Price</Th>
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
                          <Th isNumeric>Live Sync Price</Th>
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
                          <Th isNumeric>Live Sync Price</Th>
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
          <TabPanel px={0} pt={4}>
            <Grid templateColumns="1fr" gap={4}>
              <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
                <Heading size="sm" mb={4}>Find Untagged Requisitions</Heading>
                <Stack spacing={3}>
                  <FormControl>
                    <FormLabel fontSize="sm">Phone Number</FormLabel>
                    <Input
                      size="sm"
                      placeholder="Enter phone to find untagged requisitions"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                    />
                  </FormControl>
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="teal"
                    onClick={async () => {
                      if (!phoneInput.trim()) {
                        toast({ title: "Phone number is required", status: "warning" });
                        return;
                      }
                      setMrnLookupLoading(true);
                      try {
                        const res = await fetch(`/api/admin/mrn/untagged?phone=${encodeURIComponent(phoneInput.trim())}`, { cache: "no-store" });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error || "Lookup failed");
                        setMrnLookupResult({ ...data, isUntagged: true });
                        toast({ title: "Found untagged requisitions", status: "success" });
                      } catch (error) {
                        toast({ title: "Lookup failed", description: error?.message, status: "error" });
                      } finally {
                        setMrnLookupLoading(false);
                      }
                    }}
                    isLoading={mrnLookupLoading}
                  >
                    Search
                  </Button>
                </Stack>
              </GridItem>
            </Grid>
          </TabPanel>
        </TabPanels>
      </Tabs>

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
                      <Th isNumeric>Live Sync Price</Th>
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
