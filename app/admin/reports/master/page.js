"use client";

import { useEffect, useMemo, useState } from "react";
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
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useToast
} from "@chakra-ui/react";
import RequireAuth from "@/components/RequireAuth";

const REPORT_TYPES = [
  { value: "mis", label: "MIS" },
  { value: "transaction_print", label: "Transaction Print" }
];

const FORMATS = ["pdf", "xlsx", "csv"];

function toPrettyJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback, null, 2);
  } catch {
    return JSON.stringify(fallback, null, 2);
  }
}

function emptyForm() {
  return {
    report_key: "",
    report_name: "",
    report_title: "",
    report_type: "mis",
    engine: "jasper",
    jasper_report_name: "",
    jasper_file_name: "",
    jasper_path: "",
    data_source_key: "",
    procedure_name: "",
    query_template: "",
    description: "",
    help_doc_url: "",
    param_schema: "[]",
    ui_schema: "{}",
    export_options: '{\n  "pdf": true,\n  "xlsx": false,\n  "csv": false\n}',
    scope_rules: "{}",
    is_active: true,
    version: 1
  };
}

export default function ReportMasterPage() {
  return (
    <RequireAuth roles={["admin", "director"]}>
      <ReportMasterWorkspace />
    </RequireAuth>
  );
}

function ReportMasterWorkspace() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [runFormat, setRunFormat] = useState("pdf");
  const [runParamsText, setRunParamsText] = useState("{}");
  const [runOutput, setRunOutput] = useState(null);

  const selectedReport = useMemo(
    () => reports.find((row) => Number(row.id) === Number(selectedId)) || null,
    [reports, selectedId]
  );

  async function loadReports() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports/master", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load reports");
      const rows = Array.isArray(json?.reports) ? json.reports : [];
      setReports(rows);
    } catch (error) {
      toast({ title: "Load failed", description: error?.message || "Failed to load reports", status: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(reportId = null) {
    try {
      const query = new URLSearchParams();
      query.set("limit", "20");
      if (reportId) query.set("report_id", String(reportId));
      const res = await fetch(`/api/admin/reports/run/logs?${query.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load logs");
      setLogs(Array.isArray(json?.logs) ? json.logs : []);
    } catch (error) {
      toast({ title: "Log load failed", description: error?.message || "Failed to load run logs", status: "error" });
    }
  }

  useEffect(() => {
    loadReports();
    loadLogs();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadLogs(selectedId);
  }, [selectedId]);

  function selectReport(row) {
    setSelectedId(row.id);
    setForm({
      report_key: row.report_key || "",
      report_name: row.report_name || "",
      report_title: row.report_title || "",
      report_type: row.report_type || "mis",
      engine: row.engine || "jasper",
      jasper_report_name: row.jasper_report_name || "",
      jasper_file_name: row.jasper_file_name || "",
      jasper_path: row.jasper_path || "",
      data_source_key: row.data_source_key || "",
      procedure_name: row.procedure_name || "",
      query_template: row.query_template || "",
      description: row.description || "",
      help_doc_url: row.help_doc_url || "",
      param_schema: toPrettyJson(row.param_schema, []),
      ui_schema: toPrettyJson(row.ui_schema, {}),
      export_options: toPrettyJson(row.export_options, { pdf: true, xlsx: false, csv: false }),
      scope_rules: toPrettyJson(row.scope_rules, {}),
      is_active: Boolean(row.is_active),
      version: Number(row.version || 1)
    });
    setRunOutput(null);
  }

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm());
    setRunOutput(null);
    setRunParamsText("{}");
    loadLogs();
  }

  function parseJsonField(label, text, fallbackValue) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return fallbackValue;
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`${label} is not valid JSON`);
    }
  }

  async function saveReport() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        param_schema: parseJsonField("Param Schema", form.param_schema, []),
        ui_schema: parseJsonField("UI Schema", form.ui_schema, {}),
        export_options: parseJsonField("Export Options", form.export_options, {}),
        scope_rules: parseJsonField("Scope Rules", form.scope_rules, {})
      };
      const endpoint = selectedId
        ? `/api/admin/reports/master/${encodeURIComponent(selectedId)}`
        : "/api/admin/reports/master";
      const method = selectedId ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save report");

      toast({
        title: selectedId ? "Report updated" : "Report created",
        description: `${json?.report?.report_name || "Report"} saved successfully`,
        status: "success"
      });

      await loadReports();
      if (json?.report?.id) {
        const created = json.report;
        selectReport({
          ...created,
          param_schema: created.param_schema,
          ui_schema: created.ui_schema,
          export_options: created.export_options,
          scope_rules: created.scope_rules
        });
      }
    } catch (error) {
      toast({ title: "Save failed", description: error?.message || "Could not save report", status: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function runReport() {
    const reportId = selectedId || selectedReport?.id;
    if (!reportId) {
      toast({ title: "Select a report", description: "Choose a report before running", status: "warning" });
      return;
    }

    setRunning(true);
    setRunOutput(null);
    try {
      const params = parseJsonField("Run Params", runParamsText, {});
      const res = await fetch("/api/admin/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          format: runFormat,
          params,
          source_page: "report_master"
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Run failed");
      setRunOutput(json);
      toast({ title: "Run completed", description: `Run ID: ${json?.run_id}`, status: "success" });
      await loadLogs(reportId);
    } catch (error) {
      toast({ title: "Run failed", description: error?.message || "Could not run report", status: "error" });
    } finally {
      setRunning(false);
    }
  }

  const titleLabel = selectedId ? `Edit Report #${selectedId}` : "Create Report";

  return (
    <Box p={{ base: 4, md: 6 }}>
      <Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
        <Box>
          <Heading size="md">Report Master</Heading>
          <Text color="gray.600" fontSize="sm">
            One form for MIS and transaction-print definitions (Jasper-backed).
          </Text>
        </Box>
        <HStack>
          <Button as={Link} href="/admin" variant="outline">Back to Admin</Button>
          <Button as={Link} href="/admin/reports/run" variant="outline">Run Reports</Button>
          <Button variant="outline" onClick={resetForm}>New</Button>
          <Button colorScheme="blue" onClick={saveReport} isLoading={saving}>
            {selectedId ? "Update" : "Create"}
          </Button>
        </HStack>
      </Flex>

      {loading ? (
        <Flex py={10} justify="center"><Spinner /></Flex>
      ) : (
        <Grid templateColumns={{ base: "1fr", xl: "1.3fr 1fr" }} gap={6}>
          <GridItem>
            <Box borderWidth="1px" borderRadius="md" p={4}>
              <Heading size="sm" mb={4}>{titleLabel}</Heading>
              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3}>
                <FormControl isRequired>
                  <FormLabel>Report Key</FormLabel>
                  <Input
                    value={form.report_key}
                    onChange={(e) => setForm((s) => ({ ...s, report_key: e.target.value }))}
                    placeholder="mis_revenue_monthly"
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Report Type</FormLabel>
                  <Select
                    value={form.report_type}
                    onChange={(e) => setForm((s) => ({ ...s, report_type: e.target.value }))}
                  >
                    {REPORT_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </Select>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Report Name</FormLabel>
                  <Input
                    value={form.report_name}
                    onChange={(e) => setForm((s) => ({ ...s, report_name: e.target.value }))}
                    placeholder="Revenue Monthly Summary"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Report Title</FormLabel>
                  <Input
                    value={form.report_title}
                    onChange={(e) => setForm((s) => ({ ...s, report_title: e.target.value }))}
                    placeholder="Revenue Summary"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Jasper Report Name</FormLabel>
                  <Input
                    value={form.jasper_report_name}
                    onChange={(e) => setForm((s) => ({ ...s, jasper_report_name: e.target.value }))}
                    placeholder="RevenueMonthly"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Jasper File Name</FormLabel>
                  <Input
                    value={form.jasper_file_name}
                    onChange={(e) => setForm((s) => ({ ...s, jasper_file_name: e.target.value }))}
                    placeholder="revenue_monthly.jasper"
                  />
                </FormControl>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>Jasper Path</FormLabel>
                    <Input
                      value={form.jasper_path}
                      onChange={(e) => setForm((s) => ({ ...s, jasper_path: e.target.value }))}
                      placeholder="/reports/mis/revenue_monthly.jasper"
                    />
                  </FormControl>
                </GridItem>
                <FormControl>
                  <FormLabel>Data Source Key</FormLabel>
                  <Input
                    value={form.data_source_key}
                    onChange={(e) => setForm((s) => ({ ...s, data_source_key: e.target.value }))}
                    placeholder="labbit_primary"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Procedure Name</FormLabel>
                  <Input
                    value={form.procedure_name}
                    onChange={(e) => setForm((s) => ({ ...s, procedure_name: e.target.value }))}
                    placeholder="sp_mis_revenue_summary"
                  />
                </FormControl>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>Description</FormLabel>
                    <Textarea
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    />
                  </FormControl>
                </GridItem>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>Query Template</FormLabel>
                    <Textarea
                      rows={3}
                      value={form.query_template}
                      onChange={(e) => setForm((s) => ({ ...s, query_template: e.target.value }))}
                    />
                  </FormControl>
                </GridItem>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>Param Schema (JSON array)</FormLabel>
                    <Textarea
                      rows={5}
                      fontFamily="mono"
                      value={form.param_schema}
                      onChange={(e) => setForm((s) => ({ ...s, param_schema: e.target.value }))}
                    />
                  </FormControl>
                </GridItem>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>Export Options (JSON object)</FormLabel>
                    <Textarea
                      rows={4}
                      fontFamily="mono"
                      value={form.export_options}
                      onChange={(e) => setForm((s) => ({ ...s, export_options: e.target.value }))}
                    />
                  </FormControl>
                </GridItem>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>Scope Rules (JSON object)</FormLabel>
                    <Textarea
                      rows={4}
                      fontFamily="mono"
                      value={form.scope_rules}
                      onChange={(e) => setForm((s) => ({ ...s, scope_rules: e.target.value }))}
                    />
                    <Text mt={1} fontSize="xs" color="gray.500">
                      Use `allowed_roles`, `denied_roles`, and `required_permissions` to control report access.
                    </Text>
                  </FormControl>
                </GridItem>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <FormControl>
                    <FormLabel>UI Schema (JSON object)</FormLabel>
                    <Textarea
                      rows={4}
                      fontFamily="mono"
                      value={form.ui_schema}
                      onChange={(e) => setForm((s) => ({ ...s, ui_schema: e.target.value }))}
                    />
                  </FormControl>
                </GridItem>
                <FormControl display="flex" alignItems="center" gap={3}>
                  <FormLabel mb="0">Active</FormLabel>
                  <Switch
                    isChecked={form.is_active}
                    onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                  />
                </FormControl>
              </Grid>
            </Box>
          </GridItem>

          <GridItem>
            <Box borderWidth="1px" borderRadius="md" p={4} mb={4}>
              <Heading size="sm" mb={3}>Reports</Heading>
              <Box overflowX="auto" maxH="300px" overflowY="auto">
                <Table size="sm">
                  <Thead position="sticky" top="0" bg="white" zIndex={1}>
                    <Tr>
                      <Th>Key</Th>
                      <Th>Type</Th>
                      <Th>Active</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {reports.map((row) => (
                      <Tr
                        key={row.id}
                        cursor="pointer"
                        bg={Number(selectedId) === Number(row.id) ? "blue.50" : undefined}
                        onClick={() => selectReport(row)}
                      >
                        <Td>{row.report_key}</Td>
                        <Td textTransform="uppercase" fontSize="xs">{row.report_type}</Td>
                        <Td>{row.is_active ? <Badge colorScheme="green">Yes</Badge> : <Badge>No</Badge>}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>

            <Box borderWidth="1px" borderRadius="md" p={4} mb={4}>
              <Heading size="sm" mb={3}>Run Report</Heading>
              <HStack mb={3} align="end">
                <FormControl>
                  <FormLabel>Format</FormLabel>
                  <Select value={runFormat} onChange={(e) => setRunFormat(e.target.value)}>
                    {FORMATS.map((fmt) => <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>)}
                  </Select>
                </FormControl>
                <Button colorScheme="teal" onClick={runReport} isLoading={running}>Run</Button>
              </HStack>
              <FormControl>
                <FormLabel>Run Params (JSON object)</FormLabel>
                <Textarea
                  rows={5}
                  fontFamily="mono"
                  value={runParamsText}
                  onChange={(e) => setRunParamsText(e.target.value)}
                />
              </FormControl>
              {runOutput ? (
                <Box mt={3} p={3} borderWidth="1px" borderRadius="md" bg="gray.50">
                  <Text fontWeight="600" mb={1}>Last Run</Text>
                  <Text fontSize="sm">Run ID: {runOutput?.run_id}</Text>
                  <Text fontSize="sm">Mode: {runOutput?.mode}</Text>
                  <Textarea mt={2} rows={4} value={toPrettyJson(runOutput?.output, {})} readOnly fontFamily="mono" />
                </Box>
              ) : null}
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
