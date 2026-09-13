"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  useToast
} from "@chakra-ui/react";
import { Trash2 } from "lucide-react";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * "Set Half Days" -- lets staff seed calendar dates ahead of time where the
 * lab shuts early (festival half-days etc.), so py_utils' report-sender
 * worker runs the same-day partial-report cutoff earlier on those dates
 * (worker.partial_send_cutoff_overrides.half_day, same mechanism as the
 * existing Sunday-earlier-cutoff override). Backed by
 * /api/admin/reports/half-days (public.report_half_days table).
 */
export default function SetHalfDaysModal({ isOpen, onClose }) {
  const toast = useToast();
  const [halfDays, setHalfDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [note, setNote] = useState("");

  async function loadHalfDays() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/half-days?from=${todayIso()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not load half days");
      setHalfDays(Array.isArray(body?.half_days) ? body.half_days : []);
    } catch (err) {
      toast({ status: "error", title: err instanceof Error ? err.message : "Could not load half days" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) loadHalfDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function addHalfDay() {
    if (!newDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/reports/half-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates: [newDate], note: note.trim() || null })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save half day");
      setNote("");
      await loadHalfDays();
      toast({ status: "success", title: `${formatDate(newDate)} marked as a half day` });
    } catch (err) {
      toast({ status: "error", title: err instanceof Error ? err.message : "Could not save half day" });
    } finally {
      setSaving(false);
    }
  }

  async function removeHalfDay(row) {
    try {
      const res = await fetch(`/api/admin/reports/half-days?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not remove half day");
      setHalfDays((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      toast({ status: "error", title: err instanceof Error ? err.message : "Could not remove half day" });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Set Half Days</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Dates marked here run the same-day partial-report cutoff earlier
            (same idea as Sunday), so a report isn&apos;t held waiting for the
            lab to reopen. Seed a date ahead of a known early-closure day.
          </Text>
          <HStack align="flex-end" spacing={2} mb={4}>
            <Box>
              <Text fontSize="xs" color="gray.500" mb={1}>Date</Text>
              <Input type="date" size="sm" value={newDate} min={todayIso()} onChange={(e) => setNewDate(e.target.value)} />
            </Box>
            <Box flex="1">
              <Text fontSize="xs" color="gray.500" mb={1}>Note (optional)</Text>
              <Textarea size="sm" rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Festival half day" />
            </Box>
            <Button size="sm" colorScheme="purple" onClick={addHalfDay} isLoading={saving} flexShrink={0}>
              Add
            </Button>
          </HStack>

          <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1}>Upcoming half days</Text>
          {loading ? (
            <Text fontSize="sm" color="gray.500">Loading…</Text>
          ) : halfDays.length === 0 ? (
            <Text fontSize="sm" color="gray.500">None seeded yet.</Text>
          ) : (
            <List spacing={1} maxH="240px" overflowY="auto">
              {halfDays.map((row) => (
                <ListItem key={row.id}>
                  <HStack justify="space-between" borderWidth="1px" borderRadius="md" px={2} py={1.5}>
                    <Box>
                      <Text fontSize="sm" fontWeight="medium">{formatDate(row.half_date)}</Text>
                      {row.note ? <Text fontSize="xs" color="gray.500">{row.note}</Text> : null}
                      {row.created_by_name ? (
                        <Text fontSize="xs" color="gray.400">added by {row.created_by_name}</Text>
                      ) : null}
                    </Box>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      aria-label="Remove"
                      icon={<Trash2 size={14} />}
                      onClick={() => removeHalfDay(row)}
                    />
                  </HStack>
                </ListItem>
              ))}
            </List>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
