// File: /app/admin/page.js
"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Box, Tabs, TabList, TabPanels, Tab, TabPanel,
  Button, useDisclosure, Flex, Text, Heading,
  useToast, IconButton, Badge, Tooltip
} from "@chakra-ui/react";
import { AddIcon, DownloadIcon } from "@chakra-ui/icons";
import dayjs from "dayjs";

import { supabase } from "../../lib/supabaseClient";

import ShortcutBar from "../../components/ShortcutBar";
import VisitsTable from "./components/VisitsTable";
import VisitModal from "../components/VisitModal";
import ExecutiveList from "./components/ExecutiveList";
import ExecutiveModal from "./components/ExecutiveModal";
import PatientsTab from "../components/PatientsTab";
import DashboardMetrics from "../../components/DashboardMetrics";
import RequireAuth from "../../components/RequireAuth";
import QuickBookTab from "./components/QuickBookTab";

export default function AdminDashboard() {
  const toast = useToast();

  const [tabIndex, setTabIndex] = useState(0);
  const [visits, setVisits] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [quickbookings, setQuickbookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));

  const visitModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [loadingVisitModal, setLoadingVisitModal] = useState(false);
  const [loadingExecutiveModal, setLoadingExecutiveModal] = useState(false);

  const visitsTableRef = useRef();

  const activePhlebos = React.useMemo(() => {
    return executives.filter(
      (exec) =>
        exec.active === true && (exec.type || "").toLowerCase() === "phlebo"
    );
  }, [executives]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const apiExecutivesFetch = fetch("/api/executives").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch executives");
        return res.json();
      });

      const [
        { data: visitsData, error: visitsError },
        executivesData,
        { data: labsData, error: labsError },
        { data: timeSlotsData, error: timeSlotsError },
        { data: quickbookData, error: quickbookError }
      ] = await Promise.all([
        supabase
          .from("visits")
          .select(`
            *,
            patient:patient_id(id, name, phone),
            executive:executive_id(id, name, email, lab_id),
            lab:lab_id(id, name),
            time_slot:time_slot(id, slot_name, start_time, end_time)
          `)
          .order("created_at", { ascending: false }),
        apiExecutivesFetch,
        supabase.from("labs").select("id, name").order("name"),
        supabase
          .from("visit_time_slots")
          .select("id, slot_name, start_time, end_time")
          .order("start_time"),
        supabase
          .from("quickbookings")
          .select(`
            *,
            time_slot:timeslot(id, slot_name, start_time, end_time)
          `)
          .eq("status", "PENDING")
          .order("created_at", { ascending: false })
      ]);

      if (visitsError) throw visitsError;
      if (!executivesData) throw new Error("Failed to load executives");
      if (labsError) throw labsError;
      if (timeSlotsError) throw timeSlotsError;
      if (quickbookError) throw quickbookError;

      setVisits(visitsData || []);
      setExecutives(executivesData || []);
      setLabs(labsData || []);
      setTimeSlots(timeSlotsData || []);
      setQuickbookings(quickbookData || []);
    } catch (error) {
      setErrorMsg("Failed to load data. Please try again.");
      toast({
        title: "Error Loading Data",
        description: error.message || "Unknown error",
        status: "error"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const uniquePatients = React.useMemo(() => {
    const map = new Map();
    visits.forEach((v) => {
      if (v.patient && v.patient.id) {
        map.set(v.patient.id, v.patient);
      }
    });
    return Array.from(map.values());
  }, [visits]);

  const handleVisitSave = async (formData) => {
    setLoadingVisitModal(true);
    try {
      if (!formData.patient_id) {
        toast({ title: "Please select a patient", status: "warning" });
        setLoadingVisitModal(false);
        return;
      }

      const payload = {
        patient_id: formData.patient_id,
        executive_id: formData.executive_id || null,
        lab_id: formData.lab_id,
        visit_date: formData.visit_date,
        time_slot: formData.time_slot,
        address: formData.address,
        address_id: formData.address_id || null,
        status: formData.status,
        notes: formData.notes || "",
        prescription: formData.prescription || ""
      };

      let method = "POST";
      if (editingVisit && editingVisit.id) {
        payload.id = editingVisit.id;
        method = "PUT";
      }

      const res = await fetch("/api/visits", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || (method === "PUT" ? "Update failed" : "Create failed"));
      }

      toast({ title: method === "PUT" ? "Visit updated" : "Visit created", status: "success" });

      visitModal.onClose();
      setEditingVisit(null);
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error saving visit",
        description: error.message,
        status: "error"
      });
    }
    setLoadingVisitModal(false);
  };

  const today = dayjs().format("YYYY-MM-DD");
  const upcomingVisits = visits.filter(
    (v) => v.visit_date && v.visit_date.slice(0, 10) >= today
  );
  const unassignedFutureVisits = upcomingVisits.filter(
    (v) => !v.executive_id && v.status !== "disabled"
  );
  const unassignedVisitCount = unassignedFutureVisits.length;
  const unassignedByDate = unassignedFutureVisits.reduce((acc, visit) => {
    const dateKey = visit.visit_date.slice(0, 10);
    acc[dateKey] = (acc[dateKey] || 0) + 1;
    return acc;
  }, {});
  const pendingQuickbookCount = quickbookings.length;

  // Only visits for the selected date
  const todaysVisits = visits.filter(
    (v) => v.visit_date?.slice(0, 10) === selectedDate
  );

  // Sort: Disabled visits last
  const sortedTodaysVisits = [...todaysVisits].sort((a, b) => {
    if (a.status === "disabled" && b.status !== "disabled") return 1;
    if (a.status !== "disabled" && b.status === "disabled") return -1;
    return 0;
  });

  // Per-exec daily counts (exclude Disabled)
  const nonDisabledTodaysVisits = sortedTodaysVisits.filter(
    (v) => v.status !== "disabled"
  );

  const perExecVisitCounts = nonDisabledTodaysVisits.reduce((acc, v) => {
    const execId = v.executive?.id ?? (typeof v.executive_id === "object" ? v.executive_id?.id : v.executive_id);
    if (execId) {
      acc[execId] = (acc[execId] || 0) + 1;
    }
    return acc;
  }, {});

  return (
    <RequireAuth roles={["admin", "manager", "director"]}>
      <Box minH="100vh" w="100vw">
        <ShortcutBar
          userRole="admin"
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          executives={executives}
        />

        <Flex align="flex-start" justify="center" minH="100vh" py={8} pt="64px">
          <Box
            w="full"
            maxW="7xl"
            mx="auto"
            bg="whiteAlpha.80"
            borderRadius="xl"
            boxShadow="2xl"
            px={[4, 8]}
            py={[8, 14]}
            ref={visitsTableRef}
          >
            <Flex align="center" mb={8} wrap="wrap" gap={3}>
              <Heading color="green.600" size="xl" flex="1 1 auto">
                Labbit Admin Dashboard
              </Heading>
              <IconButton
                icon={<DownloadIcon />}
                aria-label="Download Visits Schedule"
                size="md"
              />
            </Flex>

            {errorMsg && (
              <Text color="red.500" mb={6}>
                {errorMsg}
              </Text>
            )}

            <Box mb={6}>
              <DashboardMetrics hvExecutiveId={null} date={selectedDate} />
            </Box>

            <Tabs
              index={tabIndex}
              onChange={setTabIndex}
              variant="enclosed"
              colorScheme="green"
              isLazy
            >
              <TabList>
                <Tab>
                  Visits{" "}
                  {unassignedVisitCount > 0 && (
                    <Tooltip
                      label={
                        <Box>
                          {Object.entries(unassignedByDate)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([date, count]) => (
                              <Text key={date}>
                                {date} — {count}
                              </Text>
                            ))}
                        </Box>
                      }
                      hasArrow
                      bg="white"
                      color="black"
                      p={3}
                      borderRadius="md"
                    >
                      <Badge
                        ml={2}
                        colorScheme="red"
                        borderRadius="full"
                        cursor="default"
                      >
                        {unassignedVisitCount}
                      </Badge>
                    </Tooltip>
                  )}
                </Tab>
                <Tab>Patients</Tab>
                <Tab>
                  QuickBook{" "}
                  {pendingQuickbookCount > 0 && (
                    <Badge ml={2} colorScheme="red" borderRadius="full">
                      {pendingQuickbookCount}
                    </Badge>
                  )}
                </Tab>
                <Tab>Executives</Tab>
              </TabList>

              <TabPanels>
                <TabPanel>
                  {/* Per-executive visit chips for selected date */}
                  <Flex mb={4} wrap="wrap" gap={2}>
                    {executives
                      .filter((exec) => perExecVisitCounts[exec.id])
                      .map((exec) => (
                        <Flex
                          key={exec.id}
                          align="center"
                          bg="gray.100"
                          borderRadius="full"
                          px={3}
                          py={1}
                          fontSize="sm"
                        >
                          <Text fontWeight="medium" mr={2}>
                            {exec.name}
                          </Text>
                          <Badge borderRadius="full" px={2} colorScheme="blue">
                            {perExecVisitCounts[exec.id]}
                          </Badge>
                        </Flex>
                      ))}
                  </Flex>

                  <VisitsTable
                    visits={sortedTodaysVisits}
                    executives={activePhlebos}
                    timeSlots={timeSlots}
                    onEdit={(visit) => {
                      setEditingVisit(visit);
                      visitModal.onOpen();
                    }}
                    loading={loading}
                  />
                  <VisitModal
                    isOpen={visitModal.isOpen}
                    onClose={() => {
                      visitModal.onClose();
                      setEditingVisit(null);
                    }}
                    onSubmit={handleVisitSave}
                    visitInitialData={editingVisit}
                    isLoading={loadingVisitModal}
                    patients={uniquePatients}
                    executives={activePhlebos}
                    labs={labs}
                    timeSlots={timeSlots}
                  />
                </TabPanel>

                <TabPanel>
                  <PatientsTab fetchPatients={fetchAll} fetchVisits={fetchAll} />
                </TabPanel>

                <TabPanel>
                  <QuickBookTab
                    quickbookings={quickbookings}
                    onRefresh={fetchAll}
                  />
                </TabPanel>

                <TabPanel>
                  <Flex mb={4} justify="flex-end">
                    <Button
                      leftIcon={<AddIcon />}
                      colorScheme="green"
                      onClick={executiveModal.onOpen}
                    >
                      Add Executive
                    </Button>
                  </Flex>
                  <ExecutiveList
                    executives={executives}
                    labs={labs}
                    loading={loading}
                    onRefresh={fetchAll}
                  />
                  <ExecutiveModal
                    isOpen={executiveModal.isOpen}
                    onClose={executiveModal.onClose}
                    onSaveSuccess={async (data) => {
                      await supabase.from("executives").insert([data]);
                      fetchAll();
                    }}
                    isLoading={loadingExecutiveModal}
                    labs={labs}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
        </Flex>
      </Box>
    </RequireAuth>
  );
}
