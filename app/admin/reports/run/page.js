"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useToast,
} from "@chakra-ui/react";
import RequireAuth from "@/components/RequireAuth";

const FORMATS = ["pdf", "xlsx", "csv"];
const TYPE_FILTERS = [
  { value: "all", label: "All Reports" },
  { value: "mis", label: "MIS" },
  { value: "transaction_print", label: "Transaction Print" },
];
const DATE_RANGE_PRESETS = [
  { value: "", label: "Custom Range" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_financial_year", label: "Last Financial Year (Apr-Mar)" },
  { value: "fy_q1", label: "Q1 (Apr-Jun)" },
  { value: "fy_q2", label: "Q2 (Jul-Sep)" },
  { value: "fy_q3", label: "Q3 (Oct-Dec)" },
  { value: "fy_q4", label: "Q4 (Jan-Mar)" },
];

function toIsoDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDays(dateValue, deltaDays) {
  const d = new Date(dateValue);
  d.setDate(d.getDate() + deltaDays);
  return d;
}

function getFinancialYearStartYear(dateValue = new Date()) {
  const d = new Date(dateValue);
  const y = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 4 ? y : y - 1;
}

function getPresetRange(presetValue) {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const yesterdayIso = toIsoDate(shiftDays(today, -1));

  if (presetValue === "yesterday") {
    return { from: yesterdayIso, to: yesterdayIso };
  }
  if (presetValue === "this_month") {
    const y = today.getFullYear();
    const m = today.getMonth();
    return {
      from: toIsoDate(new Date(y, m, 1)),
      to: todayIso,
    };
  }
  if (presetValue === "last_month") {
    const y = today.getFullYear();
    const m = today.getMonth();
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }

  const fyStartYear = getFinancialYearStartYear(today);
  if (presetValue === "last_financial_year") {
    const from = new Date(fyStartYear - 1, 3, 1);
    const to = new Date(fyStartYear, 2, 31);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  if (presetValue === "fy_q1") {
    return {
      from: toIsoDate(new Date(fyStartYear, 3, 1)),
      to: toIsoDate(new Date(fyStartYear, 5, 30)),
    };
  }
  if (presetValue === "fy_q2") {
    return {
      from: toIsoDate(new Date(fyStartYear, 6, 1)),
      to: toIsoDate(new Date(fyStartYear, 8, 30)),
    };
  }
  if (presetValue === "fy_q3") {
    return {
      from: toIsoDate(new Date(fyStartYear, 9, 1)),
      to: toIsoDate(new Date(fyStartYear, 11, 31)),
    };
  }
  if (presetValue === "fy_q4") {
    return {
      from: toIsoDate(new Date(fyStartYear + 1, 0, 1)),
      to: toIsoDate(new Date(fyStartYear + 1, 2, 31)),
    };
  }
  return null;
}

function isLabFieldKey(key) {
  const k = String(key || "").toLowerCase();
  return k === "lab_id" || k === "lab" || (k.includes("lab") && k.endsWith("_id"));
}

function isCollectionCentreFieldKey(key) {
  const k = String(key || "").toLowerCase();
  return (
    k === "collection_centre_id" ||
    k === "collection_center_id" ||
    k === "centre_id" ||
    k === "center_id" ||
    k.includes("collection_centre") ||
    k.includes("collection_center")
  );
}

function isFromDateFieldKey(key) {
  const k = String(key || "").toLowerCase();
  return ["from_date", "date_from", "start_date", "from"].includes(k) || k.includes("from_date");
}

function isToDateFieldKey(key) {
  const k = String(key || "").toLowerCase();
  return ["to_date", "date_to", "end_date", "to"].includes(k) || k.includes("to_date");
}

function asKey(field) {
  return String(field?.key || field?.name || field?.id || "").trim();
}

function asLabel(field, fallback) {
  return String(field?.label || field?.title || fallback || "").trim();
}

function fieldType(field) {
  return String(field?.type || field?.control_type || "text").toLowerCase().trim();
}

function parseJsonObject(text, fallback = {}) {
  const raw = String(text || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toPrettyJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback, null, 2);
  } catch {
    return JSON.stringify(fallback, null, 2);
  }
}

function getFieldOptions(field) {
  const options = field?.options;
  if (!Array.isArray(options)) return [];
  return options
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          value: String(item.value ?? item.id ?? item.key ?? "").trim(),
          label: String(item.label ?? item.name ?? item.value ?? "").trim(),
        };
      }
      const value = String(item || "").trim();
      return { value, label: value };
    })
    .filter((opt) => opt.value);
}

function buildDefaultParams(paramSchema) {
  const defaults = {};
  for (const field of Array.isArray(paramSchema) ? paramSchema : []) {
    const key = asKey(field);
    if (!key) continue;
    if (field?.default !== undefined && field?.default !== null) {
      defaults[key] = field.default;
    }
  }
  return defaults;
}

export default function ReportRunnerPage() {
  return (
    <RequireAuth roles={["admin", "manager", "director"]}>
      <ReportRunnerWorkspace />
    </RequireAuth>
  );
}

function ReportRunnerWorkspace() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [format, setFormat] = useState("pdf");
  const [paramValues, setParamValues] = useState({});
  const [datePreset, setDatePreset] = useState("");
  const [labOptions, setLabOptions] = useState([]);
  const [centreOptions, setCentreOptions] = useState([]);
  const [extraParamsText, setExtraParamsText] = useState("{}");
  const [runOutput, setRunOutput] = useState(null);

  const visibleReports = useMemo(() => {
    const activeRows = reports.filter((row) => row?.is_active !== false);
    if (typeFilter === "all") return activeRows;
    return activeRows.filter((row) => String(row?.report_type || "").toLowerCase() === typeFilter);
  }, [reports, typeFilter]);

  const selectedReport = useMemo(
    () => visibleReports.find((row) => Number(row.id) === Number(selectedId)) || null,
    [visibleReports, selectedId]
  );

  const selectedParamSchema = useMemo(() => {
    const schema = selectedReport?.param_schema;
    return Array.isArray(schema) ? schema : [];
  }, [selectedReport]);
  const orderedParamSchema = useMemo(() => {
    const rank = (field) => {
      const key = asKey(field);
      if (isLabFieldKey(key)) return 0;
      if (isCollectionCentreFieldKey(key)) return 1;
      if (isFromDateFieldKey(key)) return 2;
      if (isToDateFieldKey(key)) return 3;
      return 4;
    };
    return [...selectedParamSchema].sort((a, b) => rank(a) - rank(b));
  }, [selectedParamSchema]);
  const selectedDateKeys = useMemo(() => {
    const fromField = selectedParamSchema.find((field) => isFromDateFieldKey(asKey(field)));
    const toField = selectedParamSchema.find((field) => isToDateFieldKey(asKey(field)));
    const fromKey = fromField ? asKey(fromField) : null;
    const toKey = toField ? asKey(toField) : null;
    return { fromKey, toKey };
  }, [selectedParamSchema]);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports/master?active=1", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load reports");
      const rows = Array.isArray(json?.reports) ? json.reports : [];
      setReports(rows);
      if (!selectedId && rows[0]?.id) {
        setSelectedId(rows[0].id);
      }
    } catch (error) {
      toast({ title: "Load failed", description: error?.message || "Could not load reports", status: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(reportId = null) {
    try {
      const query = new URLSearchParams();
      query.set("limit", "25");
      if (reportId) query.set("report_id", String(reportId));
      const res = await fetch(`/api/admin/reports/run/logs?${query.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load run logs");
      setLogs(Array.isArray(json?.logs) ? json.logs : []);
    } catch (error) {
      toast({ title: "Log load failed", description: error?.message || "Could not load logs", status: "error" });
    }
  }

  useEffect(() => {
    loadReports();
    loadLogs();
  }, []);

  useEffect(() => {
    fetch("/api/labs?my_labs=true", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => []);
        if (!res.ok) return [];
        return Array.isArray(json) ? json : [];
      })
      .then((rows) => {
        setLabOptions(rows.map((row) => ({
          value: String(row?.id || ""),
          label: String(row?.name || row?.id || ""),
        })).filter((x) => x.value));
      })
      .catch(() => setLabOptions([]));

    fetch("/api/collection-centres?my_labs=true", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => []);
        if (!res.ok) return [];
        return Array.isArray(json) ? json : [];
      })
      .then((rows) => {
        setCentreOptions(rows.map((row) => ({
          value: String(row?.id || ""),
          label: String(row?.centre_name || row?.id || ""),
        })).filter((x) => x.value));
      })
      .catch(() => setCentreOptions([]));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadLogs(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedReport) return;
    setParamValues(buildDefaultParams(selectedReport.param_schema));
    setDatePreset("");
    setRunOutput(null);
  }, [selectedReport?.id]);

  useEffect(() => {
    if (!visibleReports.length) return;
    if (visibleReports.some((row) => Number(row.id) === Number(selectedId))) return;
    setSelectedId(visibleReports[0].id);
  }, [visibleReports, selectedId]);

  function updateParamValue(key, value) {
    setParamValues((prev) => ({ ...prev, [key]: value }));
  }

  function applyDatePreset(nextPreset) {
    setDatePreset(nextPreset);
    if (!nextPreset) return;
    if (String(selectedReport?.report_type || "").toLowerCase() !== "mis") return;
    const range = getPresetRange(nextPreset);
    if (!range) return;
    const { fromKey, toKey } = selectedDateKeys;
    if (!fromKey || !toKey) return;
    setParamValues((prev) => ({
      ...prev,
      [fromKey]: range.from,
      [toKey]: range.to,
    }));
  }

  async function runReport() {
    if (!selectedReport?.id) {
      toast({ title: "Select a report", description: "Choose a report to run", status: "warning" });
      return;
    }
    setRunning(true);
    setRunOutput(null);

    try {
      const extra = parseJsonObject(extraParamsText, {});
      const params = {
        ...paramValues,
        ...extra,
      };
      const res = await fetch("/api/admin/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: selectedReport.id,
          format,
          params,
          source_page: "report_runner",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Run failed");
      setRunOutput(json);
      await loadLogs(selectedReport.id);
      toast({ title: "Report run complete", description: `Run ID: ${json?.run_id}`, status: "success" });
    } catch (error) {
      toast({ title: "Run failed", description: error?.message || "Could not run report", status: "error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Box p={{ base: 4, md: 6 }}>
      <Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
        <Box>
          <Heading size="md">Run Reports</Heading>
          <Text color="gray.600" fontSize="sm">
            User-friendly runner for MIS and transaction-print reports.
          </Text>
        </Box>
        <HStack>
          <Button as={Link} href="/admin" variant="outline">Back to Admin</Button>
          <Button as={Link} href="/admin/reports/master" variant="outline">Open Report Master</Button>
          <Button colorScheme="teal" onClick={runReport} isLoading={running} isDisabled={!selectedReport}>
            Run
          </Button>
        </HStack>
      </Flex>

      {loading ? (
        <Flex py={10} justify="center"><Spinner /></Flex>
      ) : (
        <Grid templateColumns={{ base: "1fr", xl: "0.95fr 1.05fr" }} gap={6}>
          <GridItem>
            <Box borderWidth="1px" borderRadius="md" p={4}>
              <HStack justify="space-between" mb={3} wrap="wrap">
                <Heading size="sm">Report List</Heading>
                <Select
                  maxW="220px"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  {TYPE_FILTERS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </HStack>
              <Box overflowX="auto" maxH="520px" overflowY="auto">
                <Table size="sm">
                  <Thead position="sticky" top="0" bg="white" zIndex={1}>
                    <Tr>
                      <Th>Report</Th>
                      <Th>Type</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {visibleReports.map((row) => (
                      <Tr
                        key={row.id}
                        cursor="pointer"
                        bg={Number(selectedId) === Number(row.id) ? "blue.50" : undefined}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <Td>
                          <Text fontWeight="600">{row.report_name || row.report_key}</Text>
                          <Text fontSize="xs" color="gray.600">{row.report_key}</Text>
                        </Td>
                        <Td>
                          <Badge colorScheme={row.report_type === "mis" ? "purple" : "cyan"}>
                            {row.report_type === "mis" ? "MIS" : "TXN"}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          </GridItem>

          <GridItem>
            <Box borderWidth="1px" borderRadius="md" p={4} mb={4}>
              {selectedReport ? (
                <>
                  <Heading size="sm" mb={1}>{selectedReport.report_name || selectedReport.report_key}</Heading>
                  <Text fontSize="sm" color="gray.600" mb={4}>
                    {selectedReport.report_title || selectedReport.description || "Configure parameters and run export."}
                  </Text>

                  <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3}>
                    <FormControl>
                      <FormLabel>Export Format</FormLabel>
                      <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                        {FORMATS.map((fmt) => (
                          <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                        ))}
                      </Select>
                    </FormControl>

                    {selectedParamSchema.length === 0 ? (
                      <GridItem colSpan={{ base: 1, md: 2 }}>
                        <Text color="gray.600" fontSize="sm">
                          No required form parameters configured for this report.
                        </Text>
                      </GridItem>
                    ) : null}

                    {orderedParamSchema.map((field, idx) => {
                      const key = asKey(field);
                      if (!key) return null;
                      const label = asLabel(field, key);
                      const type = fieldType(field);
                      const required = Boolean(field?.required);
                      const value = paramValues?.[key] ?? "";
                      const inferredOptions = isLabFieldKey(key)
                        ? labOptions
                        : isCollectionCentreFieldKey(key)
                          ? centreOptions
                          : [];
                      const options = inferredOptions.length > 0 ? inferredOptions : getFieldOptions(field);
                      const forceSelect = inferredOptions.length > 0;

                      const showDatePresetBeforeField =
                        String(selectedReport?.report_type || "").toLowerCase() === "mis" &&
                        isFromDateFieldKey(key) &&
                        Boolean(selectedDateKeys?.fromKey) &&
                        selectedDateKeys.fromKey === key;

                      if (((type === "select" || type === "dropdown") || forceSelect) && options.length > 0) {
                        return (
                          <Fragment key={`field_${key}_${idx}`}>
                            {showDatePresetBeforeField ? (
                              <FormControl key={`date_preset_${key}`}>
                                <FormLabel>Date Preset</FormLabel>
                                <Select value={datePreset} onChange={(e) => applyDatePreset(e.target.value)}>
                                  {DATE_RANGE_PRESETS.map((preset) => (
                                    <option key={preset.value || "custom"} value={preset.value}>{preset.label}</option>
                                ))}
                              </Select>
                            </FormControl>
                          ) : null}
                          <FormControl key={key} isRequired={required}>
                              <FormLabel>{label}</FormLabel>
                              <Select
                                value={String(value)}
                                onChange={(e) => updateParamValue(key, e.target.value)}
                              >
                                <option value="">Select</option>
                                {options.map((opt) => (
                                  <option key={`${key}_${opt.value}`} value={opt.value}>{opt.label}</option>
                              ))}
                            </Select>
                          </FormControl>
                          </Fragment>
                        );
                      }

                      if (type === "boolean") {
                        return (
                          <Fragment key={`field_${key}_${idx}`}>
                            {showDatePresetBeforeField ? (
                              <FormControl key={`date_preset_${key}`}>
                                <FormLabel>Date Preset</FormLabel>
                                <Select value={datePreset} onChange={(e) => applyDatePreset(e.target.value)}>
                                  {DATE_RANGE_PRESETS.map((preset) => (
                                    <option key={preset.value || "custom"} value={preset.value}>{preset.label}</option>
                                  ))}
                                </Select>
                              </FormControl>
                            ) : null}
                            <FormControl key={key} isRequired={required}>
                              <FormLabel>{label}</FormLabel>
                              <Select
                                value={String(value)}
                                onChange={(e) => updateParamValue(key, e.target.value === "true")}
                              >
                                <option value="">Select</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </Select>
                            </FormControl>
                          </Fragment>
                        );
                      }

                      const inputType = type === "date"
                        ? "date"
                        : type === "datetime" || type === "datetime-local"
                          ? "datetime-local"
                          : type === "number" || type === "int" || type === "float"
                            ? "number"
                            : "text";

                      return (
                        <Fragment key={`field_${key}_${idx}`}>
                          {showDatePresetBeforeField ? (
                            <FormControl key={`date_preset_${key}`}>
                              <FormLabel>Date Preset</FormLabel>
                              <Select value={datePreset} onChange={(e) => applyDatePreset(e.target.value)}>
                                {DATE_RANGE_PRESETS.map((preset) => (
                                  <option key={preset.value || "custom"} value={preset.value}>{preset.label}</option>
                                ))}
                              </Select>
                            </FormControl>
                          ) : null}
                          <FormControl key={`${key}_${idx}`} isRequired={required}>
                            <FormLabel>{label}</FormLabel>
                            <Input
                              type={inputType}
                              value={String(value)}
                              onChange={(e) => updateParamValue(key, inputType === "number" ? Number(e.target.value) : e.target.value)}
                              placeholder={String(field?.placeholder || "")}
                            />
                          </FormControl>
                        </Fragment>
                      );
                    })}

                    <GridItem colSpan={{ base: 1, md: 2 }}>
                      <FormControl>
                        <FormLabel>Additional Params (JSON)</FormLabel>
                        <Textarea
                          rows={4}
                          fontFamily="mono"
                          value={extraParamsText}
                          onChange={(e) => setExtraParamsText(e.target.value)}
                        />
                      </FormControl>
                    </GridItem>
                  </Grid>

                  {runOutput ? (
                    <Box mt={4} p={3} borderWidth="1px" borderRadius="md" bg="gray.50">
                      <Text fontWeight="600" mb={1}>Last Run</Text>
                      <Text fontSize="sm">Run ID: {runOutput?.run_id}</Text>
                      <Text fontSize="sm">Mode: {runOutput?.mode}</Text>
                      <Textarea mt={2} rows={5} value={toPrettyJson(runOutput?.output, {})} readOnly fontFamily="mono" />
                    </Box>
                  ) : null}
                </>
              ) : (
                <Text color="gray.600">No report found for this filter.</Text>
              )}
            </Box>

            <Box borderWidth="1px" borderRadius="md" p={4}>
              <Heading size="sm" mb={3}>Recent Runs</Heading>
              <Box overflowX="auto" maxH="260px" overflowY="auto">
                <Table size="sm">
                  <Thead position="sticky" top="0" bg="white" zIndex={1}>
                    <Tr>
                      <Th>ID</Th>
                      <Th>Status</Th>
                      <Th>Format</Th>
                      <Th>At</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {logs.map((row) => (
                      <Tr key={row.id}>
                        <Td>{row.id}</Td>
                        <Td>
                          <Badge colorScheme={row.status === "success" ? "green" : row.status === "failed" ? "red" : "blue"}>
                            {row.status}
                          </Badge>
                        </Td>
                        <Td>{String(row.requested_format || "").toUpperCase()}</Td>
                        <Td>{String(row.created_at || "").slice(0, 19).replace("T", " ")}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          </GridItem>
        </Grid>
      )}
    </Box>
  );
}
