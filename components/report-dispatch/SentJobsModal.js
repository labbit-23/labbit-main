"use client";

// Shared "Sent Jobs" modal -- extracted 2026-09-27 from app/admin/whatsapp/page.js
// so the Dispatch screen (ReportDispatchWorkspace.js) can reuse the exact same
// tabs/data/View-link behavior instead of re-implementing three separate Chakra
// panels. User, 2026-09-27: "Its a resuse existing function instead of rewiring
// every call kind of a person" -- kept in Chakra (not migrated to the shadcn/
// labit-kit stack) per the same conversation: labit-main isn't moving off Chakra
// wholesale just for this, see that thread if this needs revisiting later.
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from "@chakra-ui/react";
import { humanizeDeliveryError } from "@/lib/whatsapp/deliveryErrors";

const IST_TIMEZONE = "Asia/Kolkata";

const SENT_JOBS_TABS = [
  { key: "reports", label: "Reports" },
  { key: "special_outsourced", label: "Special / Outsourced" },
  { key: "requisition_bill", label: "Requisition Bill", jobKey: "requisition_welcome" }
];

function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}

function formatMessageTime(value) {
  if (!value) return "";
  const parsed = parseServerDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString([], {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Reqno format is "R" + YYYYMMDD + a daily counter -- the date is embedded,
// not a separate field patient-message-job-logs returns.
function reqnoDate(reqno) {
  const m = String(reqno || "").match(/^R(\d{4})(\d{2})(\d{2})/);
  if (!m) return "-";
  const [, y, mo, d] = m;
  const parsed = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString([], { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

function normalizeDeliveryStatus(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "queued";
  return key;
}

function istTodayYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// Freshest-as-of-viewing, not a snapshot of what the patient actually received
// (Meta caches the PDF bytes at send time -- see [[report-delivery-status-vocabulary]]
// memory). Acceptable approximation per the user, 2026-09-27: "generated from
// live which is acceptable instead of storing actual payload."
function buildSentDocumentViewUrl(row, tabKey) {
  const reqid = String(row?.reqid || "").trim();
  if (!reqid) return null;
  const query = new URLSearchParams({ reqid, mode: "preview" });
  if (row?.reqno) query.set("reqno", String(row.reqno));
  if (tabKey === "requisition_bill") query.set("kind", "ebill");
  return `/api/admin/reports/document?${query.toString()}`;
}

export default function SentJobsModal({ isOpen, onClose, initialDate }) {
  const [date, setDate] = useState(initialDate || istTodayYmd());
  const [tab, setTab] = useState("reports");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(dateValue = date, tabKey = tab) {
    setError("");
    setLoading(true);
    try {
      const activeTab = SENT_JOBS_TABS.find((t) => t.key === tabKey) || SENT_JOBS_TABS[0];
      const selectedDate = String(dateValue || istTodayYmd());
      let response;
      if (activeTab.jobKey) {
        const query = new URLSearchParams({ selected_date: selectedDate, job_key: activeTab.jobKey, limit: "300" });
        response = await fetch(`/api/admin/reports/patient-message-job-logs?${query.toString()}`, {
          credentials: "include",
          cache: "no-store"
        });
      } else {
        const query = new URLSearchParams({ status: "sent", selected_date: selectedDate, limit: "300" });
        response = await fetch(`/api/admin/reports/auto-dispatch-logs?${query.toString()}`, {
          credentials: "include",
          cache: "no-store"
        });
      }
      if (!response.ok) throw new Error((await response.text()) || "Failed to load sent jobs");
      const json = await response.json();
      setRows(Array.isArray(json?.jobs) ? json.jobs : []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Failed to load sent jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setDate(initialDate || istTodayYmd());
    setTab("reports");
    load(initialDate || istTodayYmd(), "reports");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function switchTab(tabKey) {
    setTab(tabKey);
    await load(date, tabKey);
  }

  // "reports"/"special_outsourced" both come from the same auto-dispatch-logs
  // fetch (that endpoint has no concept of these sub-types) -- split client-side
  // by report_source/report_label. "requisition_bill" rows are already exactly
  // what was fetched (a distinct endpoint/tab), no further split needed.
  const tabFilteredRows = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    if (tab === "requisition_bill") return list;
    return list.filter((row) => {
      const rawMeta = row?.metadata;
      const meta = (rawMeta && typeof rawMeta === "object")
        ? rawMeta
        : (() => { try { return JSON.parse(rawMeta || "{}"); } catch { return {}; } })();
      const reportSource = String(meta?.report_source || "").trim().toLowerCase();
      const label = String(row?.report_label || "").trim().toLowerCase();
      const isOutsourced = reportSource === "outsourced_report";
      const isSpecial = label === "special report" || isOutsourced;
      if (tab === "special_outsourced") return isSpecial;
      return !isSpecial;
    });
  }, [rows, tab]);

  const filteredRows = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return tabFilteredRows;
    return tabFilteredRows.filter((row) => {
      const reasonText = String(
        row?.last_error || row?.state_hint || row?.last_event_message || row?.result_message || row?.comment || row?.remarks || ""
      ).toLowerCase();
      const hay = [row?.reqno, row?.patient_name, row?.phone, reasonText].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [tabFilteredRows, search]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Sent Jobs</ModalHeader>
        <ModalCloseButton isDisabled={loading} />
        <ModalBody pb={5}>
          <ButtonGroup size="sm" mb={3} isAttached variant="outline">
            {SENT_JOBS_TABS.map((t) => (
              <Button key={t.key} onClick={() => switchTab(t.key)} isActive={tab === t.key} isDisabled={loading}>
                {t.label}
              </Button>
            ))}
          </ButtonGroup>
          <Box display="flex" gap={2} mb={2} flexWrap="wrap">
            <Input
              type="date"
              size="sm"
              maxW="180px"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              isDisabled={loading}
            />
            <Button size="sm" onClick={() => load(date, tab)} isLoading={loading}>
              Load
            </Button>
            <Input
              type="search"
              size="sm"
              maxW="320px"
              placeholder="Search req no / patient / phone / reason"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              isDisabled={loading}
            />
          </Box>
          {error ? <Text fontSize="sm" color="red.500" mb={2}>{error}</Text> : null}
          {filteredRows.length === 0 && !loading ? (
            <Text fontSize="sm" color="gray.500">No sent {SENT_JOBS_TABS.find((t) => t.key === tab)?.label.toLowerCase() || "jobs"} for this date.</Text>
          ) : (
            <Box borderWidth="1px" borderColor="gray.200" borderRadius="md" overflowX="auto">
              <Table size="sm" variant="simple" sx={{ "th, td": { fontSize: "xs", py: 2, whiteSpace: "normal", wordBreak: "break-word" } }}>
                <Thead>
                  <Tr>
                    <Th>Req No</Th>
                    <Th>Req Date</Th>
                    <Th>Patient</Th>
                    <Th>Phone</Th>
                    <Th>Report Type</Th>
                    <Th>Job Status</Th>
                    <Th>Delivery</Th>
                    <Th>Sent (IST)</Th>
                    <Th>Message ID</Th>
                    <Th>Reason / Comment</Th>
                    <Th>View</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredRows.map((row) => {
                    const viewUrl = buildSentDocumentViewUrl(row, tab);
                    return (
                      <Tr key={row?.id || `${row?.reqno || ""}_${row?.phone || ""}`}>
                        <Td fontWeight="semibold">{String(row?.reqno || "-")}</Td>
                        <Td>{reqnoDate(row?.reqno)}</Td>
                        <Td>{String(row?.patient_name || "-")}</Td>
                        <Td>{String(row?.phone || "-")}</Td>
                        <Td>{String(row?.report_label || "-")}</Td>
                        <Td><Badge>{String(row?.status || "-")}</Badge></Td>
                        <Td>{normalizeDeliveryStatus(row?.delivery_status)}</Td>
                        <Td>{formatMessageTime(row?.sent_at || row?.updated_at)}</Td>
                        <Td title={String(row?.provider_message_id || "")}>{String(row?.provider_message_id || "-")}</Td>
                        <Td>
                          {row?.last_error
                            ? humanizeDeliveryError(row.last_error)
                            : String(row?.state_hint || row?.last_event_message || row?.result_message || row?.comment || row?.remarks || "-")}
                        </Td>
                        <Td>
                          {viewUrl ? (
                            <a href={viewUrl} target="_blank" rel="noreferrer" title="Opens the current version of this document, not a snapshot of what was sent">
                              View
                            </a>
                          ) : "-"}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
