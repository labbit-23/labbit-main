"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter,
  AlertDialogHeader, AlertDialogOverlay,
  Box, Button, Flex, IconButton, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalHeader, ModalOverlay, Text, useDisclosure, useToast,
} from "@chakra-ui/react";
import { Bike, CheckCircle, MapPin, Navigation, Phone, Plus, Receipt, Search, TestTubes, UserPlus } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { supabase } from "../../lib/supabaseClient";
import { useUser } from "../context/UserContext";
import PatientsTab from "../components/PatientsTab";
import TestPackageSelector from "../../components/TestPackageSelector";
import VisitBillingPanel from "../../components/VisitBillingPanel";

const GPAY_LOGO = "/gpay-logo.jpeg";

// ── Status helpers ────────────────────────────────────────────────────────────

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

const ACTIVE_STATUSES = ["booked", "assigned", "accepted", "pending", "in_progress", "sample_picked", "sample_dropped"];
const DONE_STATUSES   = ["completed", "disabled", "cancelled", "rejected", "postponed"];

function nextStatus(s) {
  const n = norm(s);
  if (["booked", "assigned", "accepted", "pending"].includes(n)) return "in_progress";
  if (n === "in_progress")   return "sample_picked";
  if (n === "sample_picked") return "sample_dropped";
  if (n === "sample_dropped") return "completed";
  return null;
}

// Button label the phlebo sees
function actionLabel(s) {
  const n = norm(s);
  if (["booked", "assigned", "accepted", "pending"].includes(n)) return "Going to patient";
  // NOTE — in_progress → sample_picked will become a barcode scan once
  // ERPNext label integration is ready. Keep this button's position and size;
  // only the tap handler will change.
  if (n === "in_progress")    return "Sample picked";
  if (n === "sample_picked")  return "Dropped at lab";
  if (n === "sample_dropped") return "Visit done";
  return null;
}

// Small badge in the card header
function statusBadge(s) {
  const n = norm(s);
  if (["booked", "assigned", "accepted", "pending"].includes(n)) return "Not started";
  if (n === "in_progress")    return "At patient";
  if (n === "sample_picked")  return "Going to lab";
  if (n === "sample_dropped") return "Samples dropped";
  if (n === "completed")      return "Done";
  return n;
}

// ── Color maps ────────────────────────────────────────────────────────────────

const STRIP = {
  default:       { light: "#E8F2F1", dark: "rgba(63,142,137,0.14)", border: "#BCDAD7", dot: "var(--accent)" },
  in_progress:   { light: "#E8F2F1", dark: "rgba(63,142,137,0.14)", border: "#BCDAD7", dot: "var(--accent)" },
  sample_picked: { light: "#ECF5EF", dark: "rgba(91,163,122,0.14)", border: "#C8E2D2", dot: "var(--success)" },
  sample_dropped:{ light: "#F1EBF5", dark: "rgba(122,107,163,0.12)", border: "#D8C9E3", dot: "#8A6BA3" },
};

function stripColors(status, isDark) {
  const key = norm(status);
  const c = STRIP[key] || STRIP.default;
  return { bg: isDark ? c.dark : c.light, border: c.border, dot: c.dot };
}

// colorScheme for the big action button
function actionScheme(s) {
  const n = norm(s);
  if (n === "sample_dropped") return "teal";
  return "green";
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function localYmd(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYmd(d);
}

function slotTime(slotName) {
  if (!slotName) return "";
  const m = String(slotName).match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i);
  return m ? m[0] : slotName;
}

function slotDisplay(slotName) {
  if (!slotName) return "";
  return String(slotName).replace(/\s*-\s*/, " – ");
}

// ── Priority for choosing "current" visit ─────────────────────────────────────
// Lower number = higher priority

function visitPriority(v) {
  const n = norm(v?.status);
  if (n === "in_progress")    return 0;
  if (n === "sample_dropped") return 1;
  if (n === "sample_picked")  return 2;
  return 3;
}

function slotMinutes(slotName) {
  const m = String(slotName || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 9999;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = (m[3] || "").toUpperCase();
  if (p === "PM" && h < 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

// ── Navigation helper ─────────────────────────────────────────────────────────

function mapsUrl(visit) {
  const def = visit.patient?.addresses?.find(a => a.is_default) || visit.patient?.addresses?.[0];
  if (def?.lat && def?.lng)
    return `https://www.google.com/maps/search/?api=1&query=${def.lat},${def.lng}`;
  const addr = visit.address || def?.address_line || def?.area || "";
  if (addr) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  return null;
}

function displayAddress(visit) {
  if (visit.address) return visit.address;
  const def = visit.patient?.addresses?.find(a => a.is_default) || visit.patient?.addresses?.[0];
  if (!def) return "";
  return [def.address_line, def.area, def.city].filter(Boolean).join(", ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function YourDayView({ executiveId, themeMode = "light", selectedDate }) {
  const { user } = useUser();
  const toast = useToast();
  const isDark = themeMode === "dark";

  const [visits, setVisits]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [advancingId, setAdvancing] = useState(null);

  const contactModal    = useDisclosure();
  const assignDialog    = useDisclosure();
  const detailModal     = useDisclosure();
  const addVisitModal   = useDisclosure();
  const testModal       = useDisclosure();
  const drawModal       = useDisclosure();
  const estimateModal   = useDisclosure();
  const gpayModal       = useDisclosure();
  const locConfirmModal = useDisclosure();
  const estimateBillingRef = useRef(null);
  const [contactVisit, setContactVisit]     = useState(null);
  const [pendingAssign, setPendingAssign]   = useState(null);
  const [detailVisit, setDetailVisit]       = useState(null);
  const [pendingLocUpdate, setPendingLocUpdate] = useState(null); // { visit, coords }
  const [updatingLoc, setUpdatingLoc]           = useState(false);
  const [visitTestIds, setVisitTestIds]     = useState(new Set());
  const [loadingTests, setLoadingTests]     = useState(false);
  const [savingTests, setSavingTests]       = useState(false);
  const originalTestIds = useRef(new Set());
  const cancelRef = useRef(null);


  const today    = localYmd();
  const viewDate = selectedDate || today;
  const isToday  = viewDate === today;
  const tomorrow = addDays(today, 1);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchVisits = useCallback(async () => {
    if (!executiveId) return;
    try {
      let query = supabase
        .from("visits")
        .select(`
          id, status, visit_date, address, notes, executive_id,
          time_slot (slot_name, start_time, end_time),
          patient:patient_id (
            id, name, phone,
            addresses:patient_addresses (
              id, address_line, area, city, lat, lng, is_default
            )
          )
        `)
        .gte("visit_date", viewDate)
        .lte("visit_date", isToday ? tomorrow : viewDate);

      query = isToday
        ? query.or(`executive_id.eq.${executiveId},executive_id.is.null`)
        : query.eq("executive_id", executiveId);

      const { data, error } = await query;
      if (error) throw error;
      setVisits(data || []);
    } catch (err) {
      toast({ title: "Could not load visits", status: "error", duration: 2500 });
    } finally {
      setLoading(false);
    }
  }, [executiveId, viewDate, isToday, tomorrow, toast]);

  useEffect(() => {
    fetchVisits();
    const t = setInterval(fetchVisits, 60_000);
    return () => clearInterval(t);
  }, [fetchVisits]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const mine      = visits.filter(v => v.executive_id === executiveId && v.visit_date === viewDate);
  const active    = mine.filter(v => ACTIVE_STATUSES.includes(norm(v.status)));
  const done      = mine.filter(v => DONE_STATUSES.includes(norm(v.status)));
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const unassigned = isToday ? visits.filter(v =>
    !v.executive_id &&
    v.visit_date === today &&
    ACTIVE_STATUSES.includes(norm(v.status)) &&
    slotMinutes(v.time_slot?.slot_name) >= nowMinutes
  ) : [];
  const tomorrowMine = isToday
    ? visits.filter(v => v.executive_id === executiveId && v.visit_date === tomorrow)
    : [];

  const sorted = [...active].sort((a, b) =>
    visitPriority(a) - visitPriority(b) || slotMinutes(a.time_slot?.slot_name) - slotMinutes(b.time_slot?.slot_name)
  );
  const current  = sorted[0] || null;
  const carrying = sorted.filter(v => norm(v.status) === "sample_picked");
  const upcoming = sorted.slice(1).filter(v => norm(v.status) !== "sample_picked");

  const isAfter5pm = new Date().getHours() >= 17;
  const tomorrowSorted = [...tomorrowMine].sort((a, b) =>
    slotMinutes(a.time_slot?.slot_name) - slotMinutes(b.time_slot?.slot_name)
  );
  // After 5 PM with today all done → promote tomorrow's first visit as the hero
  const tomorrowHero  = !current && isAfter5pm ? (tomorrowSorted[0] || null) : null;
  const tomorrowRest  = tomorrowHero ? tomorrowSorted.slice(1) : tomorrowSorted;

  // ── Actions ───────────────────────────────────────────────────────────────

  async function advanceVisit(visit) {
    const next = nextStatus(visit.status);
    if (!next) return;

    // When leaving the patient, offer to pin their location
    if (norm(visit.status) === "in_progress") {
      setAdvancing(visit.id);
      try {
        const coords = await new Promise((resolve) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 6000, maximumAge: 30000 }
          )
        );
        if (coords) {
          setPendingLocUpdate({ visit, coords });
          locConfirmModal.onOpen();
          return;
        }
      } catch {
        // no GPS — skip the prompt and advance directly
      } finally {
        setAdvancing(null);
      }
    }

    await doAdvanceVisit(visit);
  }

  async function doAdvanceVisit(visit) {
    const next = nextStatus(visit.status);
    if (!next) return;
    setAdvancing(visit.id);
    try {
      const res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visit.id, status: next, updated_by: user?.id || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast({ title: actionLabel(visit.status), description: visit.patient?.name, status: "success", duration: 2000 });
      await fetchVisits();
    } catch (err) {
      toast({ title: "Update failed", description: err.message, status: "error", duration: 3000 });
    } finally {
      setAdvancing(null);
    }
  }

  async function confirmLocUpdate() {
    if (!pendingLocUpdate) return;
    const { visit, coords } = pendingLocUpdate;
    setUpdatingLoc(true);
    try {
      const def = visit.patient?.addresses?.find(a => a.is_default) || visit.patient?.addresses?.[0];
      if (def?.id) {
        await supabase
          .from("patient_addresses")
          .update({ lat: coords.lat, lng: coords.lng })
          .eq("id", def.id);
      } else {
        // No patient address — update the visit's own lat/lng so future booking can inherit it
        await supabase
          .from("visits")
          .update({ lat: coords.lat, lng: coords.lng })
          .eq("id", visit.id);
      }
    } catch {
      // non-fatal — still advance
    } finally {
      setUpdatingLoc(false);
      locConfirmModal.onClose();
      const v = visit;
      setPendingLocUpdate(null);
      await doAdvanceVisit(v);
    }
  }

  async function skipLocUpdate() {
    locConfirmModal.onClose();
    const v = pendingLocUpdate?.visit;
    setPendingLocUpdate(null);
    if (v) await doAdvanceVisit(v);
  }

  async function doAssign(visit, force = false) {
    try {
      const res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visit.id, executive_id: executiveId, status: "assigned", force_assign: force || undefined, updated_by: user?.id || null }),
      });
      if (res.status === 409 && !force) {
        setPendingAssign(visit);
        assignDialog.onOpen();
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Assignment failed");
      }
      toast({ title: "Visit claimed", status: "success", duration: 2000 });
      await fetchVisits();
    } catch (err) {
      toast({ title: "Could not claim visit", description: err.message, status: "error", duration: 3000 });
    }
  }

  async function openTestModal(visit) {
    testModal.onOpen();
    setLoadingTests(true);
    try {
      const { data } = await supabase
        .from("visit_details")
        .select("test_id")
        .eq("visit_id", visit.id);
      const loaded = new Set((data || []).map(d => d.test_id).filter(Boolean));
      originalTestIds.current = loaded;
      setVisitTestIds(new Set(loaded));
    } finally {
      setLoadingTests(false);
    }
  }

  async function saveVisitTests(visit) {
    setSavingTests(true);
    try {
      const orig = originalTestIds.current;
      const toRemove = [...orig].filter(id => !visitTestIds.has(id));
      const toAdd    = [...visitTestIds].filter(id => !orig.has(id));

      if (toRemove.length) {
        const { error } = await supabase
          .from("visit_details")
          .delete()
          .eq("visit_id", visit.id)
          .in("test_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase
          .from("visit_details")
          .insert(toAdd.map(id => ({ visit_id: visit.id, test_id: id, package_id: null })));
        if (error) throw error;
      }
      originalTestIds.current = new Set(visitTestIds);
      toast({ title: "Tests saved", status: "success", duration: 2000 });
      testModal.onClose();
    } catch {
      toast({ title: "Could not save tests", status: "error", duration: 3000 });
    } finally {
      setSavingTests(false);
    }
  }

  // ── Theme shortcuts ───────────────────────────────────────────────────────

  const bg      = isDark ? "var(--dashboard-page-bg)" : "var(--bg)";
  const surface = isDark ? "rgba(8,15,28,0.90)" : "var(--surface)";
  const text    = isDark ? "var(--dashboard-page-text)" : "var(--text)";
  const muted   = isDark ? "rgba(248,250,252,0.55)" : "var(--text-3)";
  const borderC = isDark ? "whiteAlpha.150" : "var(--border)";
  const softDiv = isDark ? "whiteAlpha.80"  : "var(--border-soft)";

  if (loading) {
    return (
      <Box pt="80px" textAlign="center" py={20} fontSize="sm" color={muted}>
        Loading your visits…
      </Box>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box minH="100vh" bg={bg} pt={{ base: "72px", md: "64px" }} pb="140px" position="relative">

      {/* Day header */}
      <Box px={4} pt={4} pb={2}>
        <Text fontSize="13px" color={muted} fontWeight="500">
          {new Date(`${viewDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          {!isToday && <Box as="span" ml={2} fontSize="11px" opacity={0.6}>(past)</Box>}
        </Text>
        <Flex align="center" justify="space-between" mt="3px">
          <Text
            as="a" href="/phlebo?view=classic"
            fontSize="11px" color={muted} opacity={0.65}
            _hover={{ opacity: 1 }} display="inline-block"
          >
            Switch to classic
          </Text>
          {mine.length > 0 && (
            <Flex align="center" gap="10px">
              <Text fontSize="12px" color={muted} fontWeight="500">
                {done.length} of {mine.length} done
              </Text>
              <Flex gap="5px">
                {mine.map((_, i) => (
                  <Box key={i} w="8px" h="8px" borderRadius="full"
                    bg={i < done.length ? "var(--success)" : i === done.length ? "var(--accent)" : borderC}
                  />
                ))}
              </Flex>
            </Flex>
          )}
        </Flex>
      </Box>

      <Box px={4} display="flex" flexDirection="column" gap={3}>

        {/* ── Past date: flat historical list ───────────────────────── */}
        {!isToday ? (
          mine.length === 0 ? (
            <Box bg={surface} borderRadius="2xl" border="1px solid" borderColor={borderC}
              p={8} textAlign="center">
              <Text fontSize="14px" color={muted}>No visits recorded for this date.</Text>
            </Box>
          ) : (
            <Box bg={surface} borderRadius="xl" border="1px solid" borderColor={borderC} overflow="hidden">
              {[...mine]
                .sort((a, b) => slotMinutes(a.time_slot?.slot_name) - slotMinutes(b.time_slot?.slot_name))
                .map((v, i) => (
                  <Box key={v.id}>
                    {i > 0 && <Box h="1px" bg={softDiv} />}
                    <DoneRow visit={v} text={text} muted={muted}
                      onTap={() => { setDetailVisit(v); detailModal.onOpen(); }} />
                  </Box>
                ))}
            </Box>
          )
        ) : (
        <>

        {/* Current visit card — or tomorrow's first as hero after 5 PM */}
        {current ? (
          <CurrentCard
            visit={current}
            isDark={isDark}
            isLoading={advancingId === current.id}
            onAdvance={() => advanceVisit(current)}
            onNavigate={() => {
              const url = mapsUrl(current);
              if (url) window.open(url, "_blank");
              else toast({ title: "No address to navigate", status: "warning" });
            }}
            onContact={() => { setContactVisit(current); contactModal.onOpen(); }}
            onAddTests={() => openTestModal(current)}
            onViewDraw={drawModal.onOpen}
            surface={surface} text={text} muted={muted} borderC={borderC}
          />
        ) : tomorrowHero ? (
          <TomorrowHeroCard
            visit={tomorrowHero}
            isDark={isDark}
            surface={surface} text={text} muted={muted} borderC={borderC}
            onNavigate={() => {
              const url = mapsUrl(tomorrowHero);
              if (url) window.open(url, "_blank");
              else toast({ title: "No address to navigate", status: "warning" });
            }}
            onContact={() => { setContactVisit(tomorrowHero); contactModal.onOpen(); }}
            onTap={() => { setDetailVisit(tomorrowHero); detailModal.onOpen(); }}
          />
        ) : (
          <Box bg={surface} borderRadius="2xl" border="1px solid" borderColor={borderC} p={8} textAlign="center">
            <CheckCircle size={36} color="var(--success)" style={{ margin: "0 auto 10px" }} />
            <Text fontWeight="700" color={text} fontSize="17px">All done for today</Text>
            <Text fontSize="13px" color={muted} mt={1}>No more visits remaining.</Text>
          </Box>
        )}

        {/* Unassigned banner */}
        {unassigned.length > 0 && (
          <Flex
            bg="var(--warn-soft)" border="1px solid #ECDDB8"
            borderRadius="var(--r)" px={4} py="12px"
            align="center" justify="space-between" cursor="pointer"
          >
            <Box>
              <Text fontSize="13px" fontWeight="700" color="var(--warn-ink)">
                {unassigned.length} visit{unassigned.length > 1 ? "s" : ""} not yet assigned
              </Text>
              <Text fontSize="11px" color="var(--warn)" mt="1px">Tap to view and claim</Text>
            </Box>
            <Text color="var(--warn)" fontSize="20px" lineHeight="1">›</Text>
          </Flex>
        )}

        {/* Carrying samples — sample_picked visits in transit to lab */}
        {carrying.length > 0 && (
          <Box>
            <Text fontSize="11px" fontWeight="600" color={muted}
              textTransform="uppercase" letterSpacing="0.06em" mb={2} px="2px">
              Carrying sample{carrying.length > 1 ? "s" : ""}
            </Text>
            <Box bg={surface} borderRadius="xl" border="1px solid" borderColor={borderC} overflow="hidden">
              {carrying.map((v, i) => (
                <Box key={v.id}>
                  {i > 0 && <Box h="1px" bg={isDark ? "whiteAlpha.100" : "gray.100"} />}
                  <Flex px={4} py={3} align="center" justify="space-between" gap={3}>
                    <Box flex={1} minW={0}>
                      <Text fontSize="14px" fontWeight="700" color={text} noOfLines={1}>
                        {v.patient?.name || "Patient"}
                      </Text>
                      <Text fontSize="12px" color={muted}>
                        {v.time_slot?.slot_name || ""}{v.address ? ` · ${v.address}` : ""}
                      </Text>
                    </Box>
                    <Button
                      size="sm" colorScheme="purple" variant="solid"
                      isLoading={advancingId === v.id}
                      onClick={() => doAdvanceVisit(v)}
                    >
                      Drop at lab
                    </Button>
                  </Flex>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <Box>
            <Text fontSize="11px" fontWeight="600" color={muted}
              textTransform="uppercase" letterSpacing="0.06em" mb={2} px="2px">
              Coming up
            </Text>
            <Box bg={surface} borderRadius="xl" border="1px solid" borderColor={borderC} overflow="hidden">
              {upcoming.map((v, i) => (
                <Box key={v.id}>
                  {i > 0 && <Box h="1px" bg={softDiv} />}
                  <UpcomingRow
                    visit={v}
                    isDark={isDark}
                    isLoading={advancingId === v.id}
                    text={text} muted={muted}
                    onStart={() => advanceVisit(v)}
                    onTap={() => { setDetailVisit(v); detailModal.onOpen(); }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Done today — tappable for detail review */}
        {done.length > 0 && (
          <Box opacity={0.7}>
            <Text fontSize="11px" fontWeight="600" color={muted}
              textTransform="uppercase" letterSpacing="0.06em" mb={2} px="2px">
              Done today
            </Text>
            <Box bg={surface} borderRadius="xl" border="1px solid" borderColor={borderC} overflow="hidden">
              {done.map((v, i) => (
                <Box key={v.id}>
                  {i > 0 && <Box h="1px" bg={softDiv} />}
                  <DoneRow visit={v} text={text} muted={muted}
                    onTap={() => { setDetailVisit(v); detailModal.onOpen(); }} />
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Tomorrow snapshot — visible after 5 PM, remaining visits after hero */}
        {isAfter5pm && tomorrowRest.length > 0 && (
          <Box opacity={0.65}>
            <Text fontSize="11px" fontWeight="600" color={muted}
              textTransform="uppercase" letterSpacing="0.06em" mb={2} px="2px">
              {tomorrowHero ? "Also tomorrow" : "Tomorrow"}
            </Text>
            <Box bg={surface} borderRadius="xl" border="1px solid" borderColor={borderC} overflow="hidden">
              {tomorrowRest.slice(0, 3).map((v, i) => (
                <Box key={v.id}>
                  {i > 0 && <Box h="1px" bg={softDiv} />}
                  <DoneRow visit={v} text={text} muted={muted}
                    onTap={() => { setDetailVisit(v); detailModal.onOpen(); }} />
                </Box>
              ))}
              {tomorrowRest.length > 3 && (
                <Box px={4} py="10px">
                  <Text fontSize="12px" color={muted}>+{tomorrowRest.length - 3} more tomorrow</Text>
                </Box>
              )}
            </Box>
          </Box>
        )}

        </>
        )}

      </Box>

      {/* Bottom toolbar */}
      <Box
        position="fixed" bottom={0} left={0} right={0} zIndex={20}
        bg={isDark ? "rgba(8,15,28,0.96)" : "rgba(255,255,255,0.97)"}
        borderTop="1px solid"
        borderColor={isDark ? "whiteAlpha.150" : "var(--border)"}
        boxShadow="0 -4px 20px rgba(0,0,0,0.10)"
        backdropFilter="blur(12px)"
        px={2} pt={2} pb="env(safe-area-inset-bottom, 8px)"
        display="flex" justifyContent="space-around" alignItems="flex-start"
      >
        <ToolbarBtn icon={<UserPlus size={22} />} label="Add Visit" onClick={addVisitModal.onOpen} isDark={isDark} />
        <ToolbarBtn
          icon={<Receipt size={22} />}
          label="Estimate"
          onClick={() => {
            const visit = current || detailVisit;
            if (visit) { estimateModal.onOpen(); }
            else { toast({ title: "No visit selected", status: "info", duration: 1500 }); }
          }}
          isDark={isDark}
          accent
        />
        <ToolbarBtn icon={<TestTubes size={22} />} label="Draw Order" onClick={drawModal.onOpen} isDark={isDark} />
        <ToolbarBtn
          icon={<img src={GPAY_LOGO} style={{ width: "22px", height: "22px", objectFit: "contain" }} alt="GPay" />}
          label="GPay QR"
          onClick={gpayModal.onOpen}
          isDark={isDark}
        />
      </Box>

      {/* Contact modal */}
      <Modal isOpen={contactModal.isOpen} onClose={contactModal.onClose} isCentered size="sm">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalHeader fontSize="md" pb={1}>{contactVisit?.patient?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5} display="flex" flexDirection="column" gap={3}>
            {contactVisit?.patient?.phone && (
              <>
                <Button
                  as="a"
                  href={`tel:+91${String(contactVisit.patient.phone).replace(/\D/g,"").slice(-10)}`}
                  leftIcon={<Phone size={16} />}
                  colorScheme="teal" size="lg" borderRadius="xl"
                >
                  Call patient
                </Button>
                <Button
                  as="a"
                  href={`https://wa.me/91${String(contactVisit.patient.phone).replace(/\D/g,"").slice(-10)}`}
                  target="_blank" rel="noopener"
                  leftIcon={<FaWhatsapp />}
                  bg="#25D366" color="white" size="lg" borderRadius="xl"
                  _hover={{ bg: "#1DA851" }}
                >
                  WhatsApp
                </Button>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Add visit modal — full screen PatientsTab */}
      <Modal isOpen={addVisitModal.isOpen} onClose={addVisitModal.onClose} size="full">
        <ModalOverlay />
        <ModalContent borderRadius={0} m={0}>
          <ModalHeader fontSize="md" fontWeight="700" borderBottom="1px solid var(--border)" py={3}>
            Add Visit
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody p={0} overflowY="auto">
            <PatientsTab
              phone=""
              defaultExecutiveId={executiveId}
              disablePhoneInput={false}
              themeMode={themeMode}
            />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Test selection modal */}
      <Modal isOpen={testModal.isOpen} onClose={testModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalHeader fontSize="md" fontWeight="700" pb={1}>
            Tests — {current?.patient?.name}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={3}>
            {loadingTests ? (
              <Text fontSize="12px" color={muted} textAlign="center" py={4}>Loading…</Text>
            ) : (
              <TestPackageSelector
                initialSelectedTests={visitTestIds}
                onSelectionChange={setVisitTestIds}
              />
            )}
          </ModalBody>
          <Box px={6} pb={5}>
            <Button
              w="100%" colorScheme="teal" fontWeight="700"
              isLoading={savingTests} loadingText="Saving…"
              onClick={() => saveVisitTests(current)}
            >
              Save tests
            </Button>
          </Box>
        </ModalContent>
      </Modal>

      {/* Order of draw */}
      <Modal isOpen={drawModal.isOpen} onClose={drawModal.onClose} isCentered size="sm">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalHeader fontSize="md" fontWeight="700" pb={1}>Order of Draw</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            <Box as="img" src="/order-of-draw.png" alt="Order of draw"
              w="100%" borderRadius="xl" display="block" />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Visit detail sheet */}
      <Modal isOpen={detailModal.isOpen} onClose={detailModal.onClose} isCentered size="sm">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalHeader fontSize="md" fontWeight="700" pb={1}>
            {detailVisit?.patient?.name}
            {detailVisit?.visit_date === tomorrow && (
              <Text as="span" fontSize="11px" fontWeight="500" color={muted} ml={2}>· tomorrow</Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5} display="flex" flexDirection="column" gap={3}>
            {detailVisit && detailVisit.visit_date === tomorrow
              ? <TomorrowPreviewContent visit={detailVisit} surface={surface} text={text} muted={muted} borderC={borderC} isDark={isDark} />
              : detailVisit && <VisitDetailSheet visit={detailVisit} muted={muted} />
            }
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Estimate modal */}
      <Modal isOpen={estimateModal.isOpen} onClose={estimateModal.onClose} size="xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" mx={3}>
          <ModalHeader fontSize="md" fontWeight="700" pb={1}>
            ₹ Estimate — {(current || detailVisit)?.patient?.name}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            {(current || detailVisit) && (
              <VisitBillingPanel
                ref={estimateBillingRef}
                visitId={(current || detailVisit).id}
                patientId={(current || detailVisit).patient?.id}
                muted={muted}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* GPay QR modal */}
      <Modal isOpen={gpayModal.isOpen} onClose={gpayModal.onClose} isCentered size="xs">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalCloseButton />
          <ModalBody pt={8} pb={6} textAlign="center">
            <img src="/sdrc-qr-gpay.png" alt="SDRC GPay QR"
              style={{ width: "100%", maxWidth: "260px", margin: "0 auto", display: "block",
                borderRadius: "12px", border: "1px solid var(--border)" }} />
            <Text fontSize="13px" color={muted} mt={3}>
              Scan to pay SDRC via Google Pay / UPI
            </Text>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Conflict dialog — replaces window.confirm */}
      <AlertDialog
        isOpen={assignDialog.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={assignDialog.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="2xl" mx={4}>
            <AlertDialogHeader fontSize="md" fontWeight="700">Scheduling conflict</AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color={muted}>
              This visit overlaps with another one on your schedule. Claim it anyway?
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} variant="ghost" onClick={assignDialog.onClose}>Cancel</Button>
              <Button colorScheme="teal" onClick={async () => {
                assignDialog.onClose();
                if (pendingAssign) { await doAssign(pendingAssign, true); setPendingAssign(null); }
              }}>
                Claim anyway
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* Location confirm dialog */}
      <AlertDialog
        isOpen={locConfirmModal.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={skipLocUpdate}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="2xl" mx={4}>
            <AlertDialogHeader fontSize="md" fontWeight="700">Update patient location?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color={muted}>
              Pin <strong>{pendingLocUpdate?.visit?.patient?.name || "this patient"}</strong>'s address to your current GPS location. Future visits will navigate here automatically.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} variant="ghost" onClick={skipLocUpdate} isDisabled={updatingLoc}>Skip</Button>
              <Button colorScheme="teal" onClick={confirmLocUpdate} isLoading={updatingLoc}>Update location</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

    </Box>
  );
}

// ── ToolbarBtn ────────────────────────────────────────────────────────────────

function ToolbarBtn({ icon, label, onClick, isDark, accent }) {
  return (
    <Box
      as="button"
      onClick={onClick}
      display="flex" flexDirection="column" alignItems="center" justifyContent="center"
      gap="3px" py={2} px={3} borderRadius="xl" flex="1"
      color={accent ? "var(--accent)" : isDark ? "rgba(248,250,252,0.75)" : "var(--text-2)"}
      _hover={{ bg: isDark ? "whiteAlpha.100" : "var(--surface-2)" }}
      _active={{ bg: isDark ? "whiteAlpha.150" : "var(--surface-3)" }}
      transition="background 0.1s"
      minW={0}
    >
      {icon}
      <Text fontSize="10px" fontWeight="600" letterSpacing="0.01em" lineHeight="1"
        color={accent ? "var(--accent)" : isDark ? "rgba(248,250,252,0.55)" : "var(--text-3)"}>
        {label}
      </Text>
    </Box>
  );
}

// ── CurrentCard ───────────────────────────────────────────────────────────────

function CurrentCard({ visit, isDark, isLoading, onAdvance, onNavigate, onContact, onAddTests, onViewDraw, surface, text, muted, borderC }) {
  const status    = norm(visit.status);
  const label     = actionLabel(status);
  const scheme    = actionScheme(status);
  const badge     = statusBadge(status);
  const sc        = stripColors(status, isDark);
  const addr      = displayAddress(visit);
  const slot      = visit.time_slot?.slot_name;
  const def       = visit.patient?.addresses?.find(a => a.is_default) || visit.patient?.addresses?.[0];
  const hasCoords = !!(def?.lat && def?.lng);

  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <Box
      bg={surface}
      borderRadius="2xl"
      border="1.5px solid"
      borderColor={isDark ? "whiteAlpha.200" : sc.border}
      boxShadow={isDark
        ? "0 8px 32px rgba(0,0,0,0.30)"
        : "0 4px 24px -4px rgba(15,20,25,0.10), 0 1px 4px rgba(15,20,25,0.06)"}
      overflow="hidden"
    >
      {/* Header strip */}
      <Flex bg={sc.bg} px={4} py="10px" align="center" justify="space-between">
        <Flex align="center" gap="7px">
          <Box w="7px" h="7px" borderRadius="full" bg={sc.dot}
            sx={{ animation: "pulse-dot 1.6s ease-in-out infinite",
              "@keyframes pulse-dot": {
                "0%,100%": { opacity: 1, transform: "scale(1)" },
                "50%":     { opacity: 0.4, transform: "scale(0.8)" },
              }
            }}
          />
          <Text fontSize="11px" fontWeight="700"
            color={isDark ? "var(--accent-line)" : "var(--accent-ink)"}
            textTransform="uppercase" letterSpacing="0.06em">
            {badge}
          </Text>
        </Flex>
        {slot && (
          <Text fontSize="12px" fontWeight="500"
            color={isDark ? "var(--accent-line)" : "var(--accent-ink)"} opacity={0.8}>
            {slotDisplay(slot)}
          </Text>
        )}
      </Flex>

      {/* Body */}
      <Box px={4} pt={4} pb={2}>
        <Text fontSize="22px" fontWeight="800" color={text}
          letterSpacing="-0.02em" lineHeight="1.1" mb={visit.notes ? 1 : 3}>
          {visit.patient?.name}
        </Text>
        {visit.notes && (
          <Text fontSize="12px" color={muted} mb={3} lineHeight="1.4">{visit.notes}</Text>
        )}

        {/* Address */}
        {addr ? (
          <Box
            bg={isDark ? "whiteAlpha.50" : "var(--surface-2)"}
            border="1px solid" borderColor={isDark ? "whiteAlpha.100" : "var(--border)"}
            borderRadius="var(--r)" px={3} py="10px" mb={3}
          >
            <Text fontSize="10px" fontWeight="600" color={isDark ? "whiteAlpha.400" : "var(--text-4)"}
              textTransform="uppercase" letterSpacing="0.06em" mb="3px">
              Address
            </Text>
            <Text fontSize="14px" fontWeight="500" color={text} lineHeight="1.4">{addr}</Text>
          </Box>
        ) : null}

        {/* Navigate — blue when we have exact coords, grey otherwise */}
        <Button
          w="100%" h="52px" mb={3}
          borderRadius="var(--r)"
          bg={hasCoords ? "#16A34A" : isDark ? "whiteAlpha.50" : "var(--surface)"}
          color={hasCoords ? "white" : text}
          border={hasCoords ? "none" : "1px solid"}
          borderColor={isDark ? "whiteAlpha.200" : "var(--border)"}
          fontSize="15px" fontWeight="600"
          leftIcon={hasCoords ? <Navigation size={18} /> : <MapPin size={18} color="var(--accent)" />}
          boxShadow={hasCoords ? "0 2px 8px rgba(22,163,74,0.35)" : "var(--shadow-sm)"}
          onClick={onNavigate}
          _hover={{ opacity: 0.9 }}
        >
          {hasCoords ? "Navigate" : "Open in Maps"}
        </Button>

        {/* Primary action — arm first, then confirm */}
        {label && (
          <>
            {["booked","assigned","accepted","pending"].includes(status) && (
              <Text fontSize="11px" color={muted} textAlign="center" mb="5px">
                Tap when you leave for this visit
              </Text>
            )}
            <Button
              w="100%" h="68px" mb={3}
              borderRadius="var(--r-lg)"
              colorScheme={armed ? "orange" : scheme}
              fontSize="18px" fontWeight="800"
              letterSpacing="-0.01em"
              leftIcon={armed ? <CheckCircle size={20} /> : ["booked","assigned","accepted","pending"].includes(status) ? <Bike size={20} /> : status === "in_progress" ? <MapPin size={20} /> : <CheckCircle size={20} />}
              boxShadow={armed
                ? "0 4px 14px -2px rgba(221,107,32,0.40), inset 0 -2px 0 rgba(0,0,0,0.10)"
                : "0 4px 14px -2px rgba(0,0,0,0.18), inset 0 -2px 0 rgba(0,0,0,0.10)"}
              onClick={armed ? () => { setArmed(false); onAdvance(); } : () => setArmed(true)}
              isLoading={isLoading}
              loadingText="Updating…"
            >
              {armed ? `Confirm: ${label}` : label}
            </Button>
            {armed && (
              <Text fontSize="11px" color={muted} textAlign="center" mt="-8px" mb="6px">
                Tap confirm or wait 3 s to cancel
              </Text>
            )}
          </>
        )}
        {/* Sample-collection shortcuts — visible when phlebo is at patient */}
        {["in_progress", "sample_picked"].includes(status) && (
          <Flex gap={2} mb={3}>
            <Button
              flex={1} h="44px"
              borderRadius="var(--r)"
              variant="outline"
              borderColor={isDark ? "whiteAlpha.200" : "var(--border)"}
              color={isDark ? "whiteAlpha.800" : "var(--text-2)"}
              fontSize="13px" fontWeight="600"
              leftIcon={<TestTubes size={15} />}
              onClick={onViewDraw}
              _hover={{ bg: isDark ? "whiteAlpha.100" : "var(--surface-2)" }}
            >
              Order of draw
            </Button>
            <Button
              flex={1} h="44px"
              borderRadius="var(--r)"
              variant="outline"
              borderColor={isDark ? "whiteAlpha.200" : "var(--border)"}
              color={isDark ? "whiteAlpha.800" : "var(--text-2)"}
              fontSize="13px" fontWeight="600"
              leftIcon={<Search size={15} />}
              onClick={onAddTests}
              _hover={{ bg: isDark ? "whiteAlpha.100" : "var(--surface-2)" }}
            >
              Add tests
            </Button>
          </Flex>
        )}
      </Box>

      {/* Contact row */}
      <Flex px={4} pb={4} gap={2}>
        <Button
          flex={1} h="44px" borderRadius="var(--r-sm)"
          variant="outline"
          borderColor={isDark ? "whiteAlpha.200" : "var(--border)"}
          color={isDark ? "whiteAlpha.800" : "var(--text-2)"}
          fontSize="13px" fontWeight="600"
          leftIcon={<Phone size={15} />}
          onClick={onContact}
        >
          Call patient
        </Button>
        <Button
          flex={1} h="44px" borderRadius="var(--r-sm)"
          bg={isDark ? "rgba(37,211,102,0.12)" : "#F0FBF2"}
          color="#1A8C43"
          border="1px solid"
          borderColor={isDark ? "rgba(37,211,102,0.22)" : "#C3EFCC"}
          fontSize="13px" fontWeight="600"
          leftIcon={<FaWhatsapp />}
          onClick={onContact}
          _hover={{ bg: isDark ? "rgba(37,211,102,0.18)" : "#E3F7E9" }}
        >
          WhatsApp
        </Button>
      </Flex>
    </Box>
  );
}

// ── TomorrowHeroCard ─────────────────────────────────────────────────────────

function TomorrowHeroCard({ visit, isDark, surface, text, muted, borderC, onNavigate, onContact, onTap }) {
  const addr      = displayAddress(visit);
  const slot      = visit.time_slot?.slot_name;
  const startTime = visit.time_slot?.start_time;
  const endTime   = visit.time_slot?.end_time;
  const hasNav    = !!mapsUrl(visit);

  function fmtTime(t) {
    if (!t) return null;
    const [h, m] = String(t).split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  const timeRange = startTime && endTime
    ? `${fmtTime(startTime)} – ${fmtTime(endTime)}`
    : startTime ? fmtTime(startTime) : null;

  return (
    <Box
      bg={surface} borderRadius="2xl" border="1.5px solid"
      borderColor={isDark ? "whiteAlpha.150" : "var(--border)"}
      boxShadow={isDark ? "0 8px 32px rgba(0,0,0,0.20)" : "0 4px 24px -4px rgba(15,20,25,0.07)"}
      overflow="hidden" cursor="pointer" onClick={onTap}
    >
      {/* Header: label left, time right */}
      <Flex px={4} py="10px" align="center" justify="space-between"
        bg={isDark ? "whiteAlpha.50" : "var(--surface-2)"}
        borderBottom="1px solid" borderColor={borderC}
      >
        <Text fontSize="11px" fontWeight="700" color={muted}
          textTransform="uppercase" letterSpacing="0.07em">
          First visit tomorrow
        </Text>
        {(timeRange || slot) && (
          <Text fontSize="12px" fontWeight="600" color={muted}
            sx={{ fontVariantNumeric: "tabular-nums" }}>
            {timeRange || slotDisplay(slot)}
          </Text>
        )}
      </Flex>

      {/* Body: name + slot label + address inline */}
      <Box px={4} pt={3} pb={3}>
        <Text fontSize="22px" fontWeight="700" color={text} letterSpacing="-0.02em" lineHeight="1.1">
          {visit.patient?.name}
        </Text>
        {slot && (
          <Text fontSize="12px" color={muted} mt="4px">{slotDisplay(slot)}</Text>
        )}
        {addr && (
          <Text fontSize="13px" color={muted} mt="6px" lineHeight="1.4" noOfLines={2}>{addr}</Text>
        )}
      </Box>

      {/* Actions */}
      <Flex px={4} pb={4} gap={2}>
        {hasNav && (
          <Button flex={1} size="sm" borderRadius="xl"
            bg={isDark ? "whiteAlpha.100" : "var(--surface-2)"}
            color={text} border="1px solid" borderColor={borderC}
            leftIcon={<Navigation size={14} />}
            _hover={{ bg: isDark ? "whiteAlpha.150" : "var(--surface-3)" }}
            onClick={e => { e.stopPropagation(); onNavigate(); }}
          >
            Open in Maps
          </Button>
        )}
        {visit.patient?.phone && (
          <Button flex={1} size="sm" borderRadius="xl"
            bg={isDark ? "whiteAlpha.100" : "var(--surface-2)"}
            color={text} border="1px solid" borderColor={borderC}
            leftIcon={<Phone size={14} />}
            _hover={{ bg: isDark ? "whiteAlpha.150" : "var(--surface-3)" }}
            onClick={e => { e.stopPropagation(); onContact(); }}
          >
            Contact
          </Button>
        )}
      </Flex>
    </Box>
  );
}

// ── UpcomingRow ───────────────────────────────────────────────────────────────

function UpcomingRow({ visit, isDark, isLoading, onStart, onTap, text, muted }) {
  const time = slotTime(visit.time_slot?.slot_name);
  const addr = displayAddress(visit);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <Flex align="center" gap={3} px={4} py="13px"
      cursor="pointer" onClick={onTap}
      _hover={{ bg: "var(--surface-2)" }} transition="background 0.1s"
    >
      <Text fontSize="13px" fontWeight="700" color={text} minW="52px" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {time}
      </Text>
      <Box w="1px" h="34px" bg={isDark ? "whiteAlpha.100" : "var(--border-soft)"} flexShrink={0} />
      <Box flex={1} minW={0}>
        <Text fontSize="15px" fontWeight="700" color={text} noOfLines={1} letterSpacing="-0.005em">
          {visit.patient?.name}
        </Text>
        <Text fontSize="12px" color={muted} noOfLines={1}>{addr || "—"}</Text>
      </Box>
      <Button
        h="32px" px={3} flexShrink={0}
        borderRadius="var(--r-sm)"
        bg={armed ? "orange.400" : "var(--accent-soft)"}
        color={armed ? "white" : "var(--accent-ink)"}
        border="1px solid"
        borderColor={armed ? "orange.400" : "var(--accent-line)"}
        fontSize="12px" fontWeight="600"
        onClick={e => {
          e.stopPropagation();
          armed ? (setArmed(false), onStart()) : setArmed(true);
        }}
        isLoading={isLoading}
        _hover={{ opacity: 0.85 }}
      >
        {armed ? "Confirm?" : "Start"}
      </Button>
    </Flex>
  );
}

// ── DoneRow ───────────────────────────────────────────────────────────────────

function DoneRow({ visit, text, muted, onTap }) {
  const slot = visit.time_slot?.slot_name ? slotDisplay(visit.time_slot.slot_name) : "—";
  const addr = displayAddress(visit);
  const s = norm(visit.status);
  const dotColor = s === "completed"                              ? "var(--success)"
    : ["cancelled", "rejected", "disabled"].includes(s)          ? "#FC8181"
    : s === "postponed"                                           ? "var(--warn)"
    : "var(--border-mid)";
  const statusNote = s !== "completed" ? s.replace(/_/g, " ") : null;

  return (
    <Flex
      align="center" gap={3} px={4} py="13px"
      cursor="pointer" onClick={onTap}
      _hover={{ bg: "var(--surface-2)" }} transition="background 0.1s"
    >
      <Box flex={1} minW={0}>
        <Text fontSize="15px" fontWeight="600" color={text} noOfLines={1} letterSpacing="-0.005em">
          {visit.patient?.name}
        </Text>
        <Text fontSize="11px" color={muted} noOfLines={1} mt="1px">
          {slot}{addr ? ` · ${addr}` : ""}{statusNote ? ` · ${statusNote}` : ""}
        </Text>
      </Box>
      <Box w="8px" h="8px" borderRadius="full" bg={dotColor} flexShrink={0} />
    </Flex>
  );
}

// ── VisitDetailSheet ──────────────────────────────────────────────────────────

const STATUS_LABELS = {
  booked:         "Visit booked",
  assigned:       "Assigned to phlebo",
  accepted:       "Accepted",
  in_progress:    "Going to patient",
  sample_picked:  "Sample picked",
  sample_dropped: "Dropped at lab",
  completed:      "Visit done",
  cancelled:      "Cancelled",
  disabled:       "Disabled",
  postponed:      "Postponed",
};

function fmtTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function VisitDetailSheet({ visit, muted }) {
  const slot      = visit.time_slot?.slot_name;
  const startTime = visit.time_slot?.start_time;
  const endTime   = visit.time_slot?.end_time;
  const addr      = displayAddress(visit);

  const [timeline, setTimeline] = useState([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("visit_activity_log")
      .select("created_at, old_value, new_value")
      .eq("visit_id", visit.id)
      .in("activity_type", ["visit_update", "visit_created"])
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const changes = (data || []).filter(
          e => e.new_value?.status && e.new_value.status !== e.old_value?.status
        );
        setTimeline(changes);
        setLogLoading(false);
      });
  }, [visit.id]);

  function fmtTime(t) {
    if (!t) return null;
    const [h, m] = String(t).split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  const timeRange = startTime && endTime
    ? `${fmtTime(startTime)} – ${fmtTime(endTime)}`
    : startTime ? fmtTime(startTime) : null;

  const infoRows = [
    slot        && { label: "Slot",    value: slotDisplay(slot) },
    addr        && { label: "Address", value: addr },
    visit.notes && { label: "Notes",   value: visit.notes },
  ].filter(Boolean);

  const isDone = DONE_STATUSES.includes(norm(visit.status));

  return (
    <Box display="flex" flexDirection="column" gap={3}>

      {/* Timeline — primary for done visits */}
      {logLoading ? (
        <Text fontSize="12px" color={muted} textAlign="center" py={2}>Loading history…</Text>
      ) : timeline.length > 0 ? (
        <Box bg="var(--surface-2)" borderRadius="var(--r)" overflow="hidden">
          {timeline.map((e, i) => (
            <Flex key={i} px={4} py="12px" align="center" justify="space-between"
              bg="var(--surface)" borderBottom="1px solid var(--border-soft)"
              _last={{ borderBottom: "none" }} gap={3}>
              <Flex align="center" gap="10px" flex={1} minW={0}>
                <Box w="8px" h="8px" borderRadius="full" flexShrink={0}
                  bg={norm(e.new_value.status) === "completed" ? "var(--success)"
                    : norm(e.new_value.status) === "in_progress" ? "var(--accent)"
                    : norm(e.new_value.status) === "sample_picked" ? "var(--warn)"
                    : "var(--border-mid)"}
                />
                <Text fontSize="14px" fontWeight="600" color="var(--text)" noOfLines={1}>
                  {STATUS_LABELS[norm(e.new_value.status)] || norm(e.new_value.status)}
                  {norm(e.new_value.status) === "in_progress" && (
                    <Box as="span" ml="6px" display="inline-flex" verticalAlign="middle" opacity={0.6}>
                      <Bike size={13} />
                    </Box>
                  )}
                </Text>
              </Flex>
              <Text fontSize="13px" fontWeight="600" color={muted} flexShrink={0}
                sx={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtTs(e.created_at)}
              </Text>
            </Flex>
          ))}
        </Box>
      ) : (
        <Box bg="var(--surface-2)" borderRadius="var(--r)" overflow="hidden">
          <Flex px={4} py="12px" align="center" justify="space-between"
            bg="var(--surface)" gap={3}>
            <Flex align="center" gap="10px" flex={1} minW={0}>
              <Box w="8px" h="8px" borderRadius="full" flexShrink={0}
                bg={norm(visit.status) === "completed" ? "var(--success)"
                  : norm(visit.status) === "in_progress" ? "var(--accent)"
                  : norm(visit.status) === "sample_picked" ? "var(--warn)"
                  : "var(--border-mid)"}
              />
              <Text fontSize="14px" fontWeight="600" color="var(--text)">
                {STATUS_LABELS[norm(visit.status)] || norm(visit.status)}
              </Text>
            </Flex>
            <Text fontSize="12px" color={muted}>no timestamp</Text>
          </Flex>
        </Box>
      )}

      {/* Info rows — always show for upcoming/tomorrow, secondary for done */}
      {(!isDone || timeline.length === 0) && infoRows.length > 0 && (
        <Box bg="var(--surface-2)" borderRadius="var(--r)" overflow="hidden">
          {infoRows.map(({ label, value }) => (
            <Flex key={label} px={4} py="10px" justify="space-between" align="flex-start" gap={4}
              bg="var(--surface)" borderBottom="1px solid var(--border-soft)"
              _last={{ borderBottom: "none" }}>
              <Text fontSize="12px" color={muted} fontWeight="500" flexShrink={0}>{label}</Text>
              <Text fontSize="13px" fontWeight="600" color="var(--text)" textAlign="right"
                sx={{ fontVariantNumeric: "tabular-nums" }}>
                {value}
              </Text>
            </Flex>
          ))}
        </Box>
      )}

      {/* Estimate */}
      <Box>
        <Text fontSize="11px" fontWeight="700" color={muted}
          textTransform="uppercase" letterSpacing="0.06em" mb={2}>
          ₹ Estimate
        </Text>
        <VisitBillingPanel visitId={visit.id} patientId={visit.patient?.id} muted={muted} />
      </Box>
    </Box>
  );
}

// ── TomorrowPreviewContent ────────────────────────────────────────────────────
// Shows exactly what the CurrentCard will look like tomorrow morning.

function TomorrowPreviewContent({ visit, isDark, surface, text, muted, borderC }) {
  const addr      = displayAddress(visit);
  const slot      = visit.time_slot?.slot_name;
  const startTime = visit.time_slot?.start_time;
  const endTime   = visit.time_slot?.end_time;
  const hasCoords = !!(
    visit.patient?.addresses?.find(a => a.is_default)?.lat ||
    visit.patient?.addresses?.[0]?.lat
  );
  const navUrl = mapsUrl(visit);

  function fmtTime(t) {
    if (!t) return null;
    const [h, m] = String(t).split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }
  const timeRange = startTime && endTime
    ? `${fmtTime(startTime)} – ${fmtTime(endTime)}`
    : startTime ? fmtTime(startTime) : slotDisplay(slot);

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Text fontSize="12px" color={muted} textAlign="center">
        This is what you'll see tomorrow morning
      </Text>

      {/* Card preview */}
      <Box borderRadius="2xl" border="1.5px solid" borderColor={isDark ? "whiteAlpha.150" : "var(--border)"} overflow="hidden">
        {/* Header strip — "Not started" */}
        <Flex px={4} py="10px" align="center" justify="space-between"
          bg={isDark ? "whiteAlpha.50" : "var(--accent-soft)"}
          borderBottom="1px solid" borderColor={isDark ? "whiteAlpha.100" : "var(--accent-line)"}>
          <Flex align="center" gap="7px">
            <Box w="7px" h="7px" borderRadius="full" bg="var(--accent)" />
            <Text fontSize="11px" fontWeight="700" color={isDark ? "var(--accent-line)" : "var(--accent-ink)"}
              textTransform="uppercase" letterSpacing="0.06em">Not started</Text>
          </Flex>
          {timeRange && (
            <Text fontSize="12px" fontWeight="500" color={isDark ? "var(--accent-line)" : "var(--accent-ink)"}
              sx={{ fontVariantNumeric: "tabular-nums" }}>{timeRange}</Text>
          )}
        </Flex>

        {/* Body */}
        <Box px={4} pt={4} pb={2} bg={surface}>
          <Text fontSize="22px" fontWeight="800" color={text} letterSpacing="-0.02em" lineHeight="1.1">
            {visit.patient?.name}
          </Text>
          {addr && (
            <Box mt={3} bg={isDark ? "whiteAlpha.50" : "var(--surface-2)"}
              border="1px solid" borderColor={borderC}
              borderRadius="var(--r)" px={3} py="10px">
              <Text fontSize="10px" fontWeight="600" color={isDark ? "whiteAlpha.400" : "var(--text-4)"}
                textTransform="uppercase" letterSpacing="0.06em" mb="3px">Address</Text>
              <Text fontSize="14px" fontWeight="500" color={text} lineHeight="1.4">{addr}</Text>
            </Box>
          )}
        </Box>

        {/* Action buttons preview */}
        <Box px={4} pb={4} bg={surface} display="flex" flexDirection="column" gap={2} pt={2}>
          {navUrl && (
            <Button w="100%" h="52px" borderRadius="var(--r)"
              bg={hasCoords ? "#16A34A" : isDark ? "whiteAlpha.100" : "var(--surface-2)"}
              color={hasCoords ? "white" : text}
              border={hasCoords ? "none" : "1px solid"} borderColor={borderC}
              leftIcon={hasCoords ? <Navigation size={16} /> : <MapPin size={16} />}
              fontSize="14px" fontWeight="600" isDisabled
              _disabled={{ opacity: 0.7, cursor: "default" }}
            >
              {hasCoords ? "Navigate" : "Open in Maps"}
            </Button>
          )}
          <Button w="100%" h="68px" borderRadius="var(--r)"
            colorScheme="green" fontSize="17px" fontWeight="700"
            leftIcon={<Bike size={20} />}
            isDisabled _disabled={{ opacity: 0.7, cursor: "default" }}>
            Going to patient
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
