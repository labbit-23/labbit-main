"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Box, Button, Flex, HStack, SimpleGrid, Spinner, Table, Tbody, Td,
  Text, Th, Thead, Tr, VStack, Link as CLink
} from "@chakra-ui/react";
import RequireAuth from "@/components/RequireAuth";

const ROLES = ["admin", "manager", "director", "b2b", "logistics"];

function todayYmdIst() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).includes("Z") || String(iso).includes("+") ? iso : `${iso}Z`);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

const STATUS_COLOR = { read: "green", delivered: "teal", sent: "cyan", failed: "red" };

function Tile({ label, value, sub, color }) {
  return (
    <Box p={2} borderWidth="2px" borderRadius="md" borderColor="transparent"
      bg={`${color || "gray"}.50`} _dark={{ bg: `${color || "gray"}.900` }}>
      <Text fontSize="xs" opacity={0.7}>{label}</Text>
      <Text fontWeight="bold" fontSize="lg">{value}</Text>
      {sub ? <Text fontSize="10px" opacity={0.75}>{sub}</Text> : null}
    </Box>
  );
}

function JobCard({ job }) {
  const total = job.sent + job.failed;
  const delivRate = job.sent > 0 ? Math.round((100 * (job.delivered + job.read)) / job.sent) : 0;
  return (
    <Box borderWidth="1px" borderRadius="xl" p={3} mb={4}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={2} mb={2}>
        <HStack>
          <Text fontWeight="bold" fontSize="md">{job.key}</Text>
          {job.template ? <Badge colorScheme="purple">{job.template}</Badge> : <Badge colorScheme="red">no template</Badge>}
          {job.attachment ? <Badge>{job.attachment}</Badge> : null}
          {Array.isArray(job.trial?.numbers) && job.trial.numbers.length > 0
            ? <Badge colorScheme="orange">trial: {job.trial.numbers.length} number(s)</Badge> : null}
        </HStack>
        <Text fontSize="xs" opacity={0.7}>{total} today · {delivRate}% delivered</Text>
      </Flex>

      <SimpleGrid columns={{ base: 2, md: 5 }} spacing={2} mb={3}>
        <Tile label="Sent" value={job.sent} color="cyan" />
        <Tile label="Delivered" value={job.delivered} color="teal" />
        <Tile label="Read" value={job.read} color="green" />
        <Tile label="No callback" value={job.no_callback} color="gray" />
        <Tile label="Failed" value={job.failed} color="red" />
      </SimpleGrid>

      {job.recent?.length > 0 ? (
        <Box overflowX="auto">
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>Time</Th><Th>Req No</Th><Th>Phone</Th><Th>Status</Th><Th>Params</Th><Th>Attachment</Th>
              </Tr>
            </Thead>
            <Tbody>
              {job.recent.map((r, i) => (
                <Tr key={i}>
                  <Td>{fmtTime(r.at)}</Td>
                  <Td>{r.reqno || "-"}</Td>
                  <Td>{r.phone}</Td>
                  <Td>
                    <Badge colorScheme={STATUS_COLOR[r.status] || "gray"}>{r.status}</Badge>
                    {r.result_message ? <Text fontSize="10px" color="red.400">{r.result_message}</Text> : null}
                  </Td>
                  <Td><Text fontSize="xs">{Array.isArray(r.params) ? r.params.join(" | ") : "-"}</Text></Td>
                  <Td>{r.attachment ? <CLink href={r.attachment} isExternal fontSize="xs" color="blue.400">pdf</CLink> : "-"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      ) : (
        <Text fontSize="sm" opacity={0.6}>No sends {job.key} on this date.</Text>
      )}
    </Box>
  );
}

function Dashboard() {
  const [date, setDate] = useState(todayYmdIst());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (d) => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/admin/patient-message-jobs/activity?date=${encodeURIComponent(d)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setErr(e?.message || "failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);
  useEffect(() => {
    const t = setInterval(() => load(date), 60_000);
    return () => clearInterval(t);
  }, [date, load]);

  const jobs = data?.jobs || [];
  const totals = useMemo(
    () => jobs.reduce((a, j) => ({
      sent: a.sent + j.sent, delivered: a.delivered + j.delivered,
      read: a.read + j.read, failed: a.failed + j.failed
    }), { sent: 0, delivered: 0, read: 0, failed: 0 }),
    [jobs]
  );

  return (
    <Box p={4} maxW="1100px" mx="auto">
      <Flex align="center" justify="space-between" wrap="wrap" gap={3} mb={4}>
        <VStack align="start" spacing={0}>
          <Text fontWeight="bold" fontSize="xl">Patient Message Jobs</Text>
          <Text fontSize="sm" opacity={0.7}>Configured template sends riding the enqueue-watch loop — inspired by, separate from, Report Dispatch.</Text>
        </VStack>
        <HStack>
          <input type="date" value={date} max={todayYmdIst()} onChange={(e) => setDate(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }} />
          <Button size="sm" onClick={() => load(date)} isLoading={loading}>Refresh</Button>
        </HStack>
      </Flex>

      {jobs.length > 0 ? (
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2} mb={5}>
          <Tile label="Sent (all jobs)" value={totals.sent} color="cyan" />
          <Tile label="Delivered" value={totals.delivered} color="teal" />
          <Tile label="Read" value={totals.read} color="green" />
          <Tile label="Failed" value={totals.failed} color="red" />
        </SimpleGrid>
      ) : null}

      {err ? <Text color="red.400" mb={3}>{err}</Text> : null}
      {loading && !data ? <Spinner /> : null}

      {jobs.length === 0 && !loading ? (
        <Text opacity={0.6}>No patient-message-jobs configured for this lab. Add one to
          <code> labs_apis.templates.patient_message_jobs</code>.</Text>
      ) : null}

      {jobs.map((j) => <JobCard key={j.key} job={j} />)}
    </Box>
  );
}

export default function PatientMessageJobsPage() {
  return (
    <RequireAuth roles={ROLES}>
      <Dashboard />
    </RequireAuth>
  );
}
