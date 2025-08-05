// File: /app/admin/page.js

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Button,
  useDisclosure,
  Flex,
  Text,
  Heading,
  useToast,
  Input,
  IconButton,
} from "@chakra-ui/react";
import { AddIcon, DownloadIcon } from "@chakra-ui/icons";
import html2canvas from "html2canvas";
import dayjs from "dayjs";

import { supabase } from "../../lib/supabaseClient";

import ShortcutBar from "../../components/ShortcutBar";
import VisitsTable from "./components/VisitsTable";
import VisitModal from "./components/VisitModal";
import ExecutiveList from "./components/ExecutiveList";
import ExecutiveModal from "./components/ExecutiveModal";
import PatientsTab from "../components/PatientsTab";
import DashboardMetrics from "../../components/DashboardMetrics";

const DEFAULT_LAB_ID = "b539909242"; // Update as needed

export default function AdminDashboard() {
  const [tabIndex, setTabIndex] = useState(0);
  const [visits, setVisits] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const toast = useToast();

  const visitModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [loadingVisitModal, setLoadingVisitModal] = useState(false);
  const [loadingExecutiveModal, setLoadingExecutiveModal] = useState(false);

  const visitsTableRef = useRef();

  // Fetch all data for tabs
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const apiExecutivesFetch = fetch("/api/executives?active=true&type=Phlebo").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch executives");
        return res.json();
      });

      const [
        { data: visitsData, error: visitsError },
        executivesData,
        { data: labsData, error: labsError },
        { data: timeSlotsData, error: timeSlotsError },
      ] = await Promise.all([
        supabase
          .from("visits")
          .select(
            `
            *,
            patient:patient_id(id, name, phone),
            executive:executive_id(id, name, email, lab_id),
            lab:lab_id(id, name),
            time_slot:time_slot(id, slot_name, start_time, end_time)
          `
          )
          .order("created_at", { ascending: false }),
        apiExecutivesFetch,
        supabase.from("labs").select("id, name").order("name"),
        supabase.from("visit_time_slots").select("id, slot_name, start_time, end_time").order("start_time"),
      ]);

      if (visitsError) throw visitsError;
      if (!executivesData) throw new Error("Failed to load executives");
      if (labsError) throw labsError;
      if (timeSlotsError) throw timeSlotsError;

      setVisits(visitsData || []);
      setExecutives(executivesData || []);
      setLabs(labsData || []);
      setTimeSlots(timeSlotsData || []);
    } catch (error) {
      setErrorMsg("Failed to load data. Please try again.");
      toast({
        title: "Error Loading Data",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("fetchAll error:", error);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Create a deduplicated patient list for Select field (in modal)
  const uniquePatients = React.useMemo(() => {
    const map = new Map();
    visits.forEach((v) => {
      if (v.patient && v.patient.id) {
        map.set(v.patient.id, v.patient);
      }
    });
    return Array.from(map.values());
  }, [visits]);

  // Visit save handler - FIX time_slot as the key sent to DB
  const handleVisitSave = async (formData) => {
    setLoadingVisitModal(true);
    try {
      if (!formData.patient_id) {
        toast({ title: "Please select a patient", status: "warning" });
        setLoadingVisitModal(false);
        return;
      }

      const visitPayload = {
        patient_id: formData.patient_id,
        executive_id: formData.executive_id || null,
        lab_id: formData.lab_id,
        visit_date: formData.visit_date,
        time_slot: formData.time_slot,
        address: formData.address,
        status: formData.status,
      };

      if (editingVisit && editingVisit.id) {
        const { error } = await supabase.from("visits").update(visitPayload).eq("id", editingVisit.id);
        if (error) throw error;
        toast({ title: "Visit updated", status: "success" });
      } else {
        const code = await generateNewVisitCode();
        visitPayload.visit_code = code;
        const { error } = await supabase.from("visits").insert([visitPayload]);
        if (error) throw error;
        toast({ title: "Visit created", status: "success" });
      }

      visitModal.onClose();
      setEditingVisit(null);
      await fetchAll();
    } catch (error) {
      toast({ title: "Error saving visit", description: error.message, status: "error" });
      console.error(error);
    }
    setLoadingVisitModal(false);
  };

  // Executive create handler
  const handleExecutiveCreate = async (formData) => {
    setLoadingExecutiveModal(true);
    try {
      const { error } = await supabase.from("executives").insert([formData]);
      if (error) throw error;
      toast({ title: "Executive added", status: "success" });
      executiveModal.onClose();
      await fetchAll();
    } catch (error) {
      toast({ title: "Error adding executive", description: error.message, status: "error" });
      console.error(error);
    }
    setLoadingExecutiveModal(false);
  };

  // Delete visit handler
  const handleVisitDelete = async (id) => {
    if (!window.confirm("Delete this visit?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Visit deleted", status: "info" });
      await fetchAll();
    } catch (error) {
      toast({ title: "Error deleting visit", description: error.message, status: "error" });
      console.error(error);
    }
    setLoading(false);
  };

  // Generate new visit code helper
  async function generateNewVisitCode() {
    const today = dayjs().format("YYYYMMDD");
    const startOfDay = dayjs().startOf("day").toISOString();
    const endOfDay = dayjs().endOf("day").toISOString();

    const { count, error } = await supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfDay)
      .lt("created_at", endOfDay);

    if (error) throw error;

    const seqNum = (count || 0) + 1;
    const seqNumPadded = seqNum.toString().padStart(4, "0");
    return `VISIT-${today}-${seqNumPadded}`;
  }

  // onAssign handler to update unassigned visit with executive and accepted status
  const onAssign = async (visitId, executiveId) => {
    try {
      const { error } = await supabase
        .from("visits")
        .update({
          executive_id: executiveId,
          status: "accepted",
        })
        .eq("id", visitId);

      if (error) throw error;
      await fetchAll();
      toast({
        title: "Visit assigned",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: "Error assigning visit",
        description: err.message || "Could not assign the visit",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Download visits table as PNG using html2canvas with temporary hide-on-export class
  const handleDownloadSchedule = async () => {
    if (!visitsTableRef.current) {
      toast({
        title: "Table not ready for download",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    visitsTableRef.current.classList.add("hide-on-export"); // Hide actions column temporarily
    try {
      const canvas = await html2canvas(visitsTableRef.current, { backgroundColor: "#fff", scale: 2 });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `Visit_Schedule_${selectedDate}.png`;
      link.click();
      toast({
        title: "Download started",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: "Download error",
        description: err.message || "",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      visitsTableRef.current.classList.remove("hide-on-export"); // Restore visibility
    }
  };

  return (
    <Box
      minH="100vh"
      w="100vw"
      style={{
        backgroundImage: 'url("/visual.png")',
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
      }}
    >
      <ShortcutBar />

      <Flex align="flex-start" justify="center" minH="100vh" py={8} pt="64px">
        <Box
          w="full"
          maxW="7xl"
          mx="auto"
          bg="rgba(255, 255, 255, 0.5)"
          borderRadius="xl"
          boxShadow="2xl"
          px={[4, 8]}
          py={[8, 14]}
          ref={visitsTableRef}
        >
          <Flex align="center" marginBottom="8" wrap="wrap" gap={3}>
            <Heading color="green.600" size="xl" fontWeight="extrabold" flex="1 1 auto">
              Labbit Admin Dashboard
            </Heading>

            <Input
              type="date"
              value={selectedDate}
              max={dayjs().add(1, "year").format("YYYY-MM-DD")}
              onChange={(e) => setSelectedDate(e.target.value)}
              maxW="160px"
              size="md"
              aria-label="Select date to filter visits"
            />

            <IconButton
              icon={<DownloadIcon />}
              aria-label="Download Visits Schedule"
              size="md"
              onClick={handleDownloadSchedule}
              title="Download Visits Schedule"
            />
          </Flex>

          {errorMsg && (
            <Text color="red.500" marginBottom="6">
              {errorMsg}
            </Text>
          )}

          <Box mb={6}>
            <DashboardMetrics hvExecutiveId={null} date={selectedDate} />
          </Box>

          <Tabs index={tabIndex} onChange={setTabIndex} variant="enclosed" colorScheme="green" isLazy>
            <TabList>
              <Tab>Visits</Tab>
              <Tab>Patients</Tab>
              <Tab>Executives</Tab>
            </TabList>

            <TabPanels>
              {/* Visits Tab */}
              <TabPanel>
                <VisitsTable
                  visits={visits.filter((v) => v.visit_date?.slice(0, 10) === selectedDate)}
                  executives={executives}
                  timeSlots={timeSlots}
                  onEdit={(visit) => {
                    setEditingVisit(visit);
                    visitModal.onOpen();
                  }}
                  onDelete={handleVisitDelete}
                  onAssign={onAssign}
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
                  executives={executives}
                  labs={labs}
                  timeSlots={timeSlots}
                />
              </TabPanel>

              {/* Patients Tab */}
              <TabPanel>
                <PatientsTab fetchPatients={fetchAll} fetchVisits={fetchAll} />
              </TabPanel>

              {/* Executives Tab */}
              <TabPanel>
                <Flex marginBottom="4" justifyContent="flex-end">
                  <Button leftIcon={<AddIcon />} colorScheme="green" onClick={executiveModal.onOpen}>
                    Add Executive
                  </Button>
                </Flex>
                <ExecutiveList executives={executives} labs={labs} loading={loading} onRefresh={fetchAll} />
                <ExecutiveModal
                  isOpen={executiveModal.isOpen}
                  onClose={executiveModal.onClose}
                  onSaveSuccess={handleExecutiveCreate}
                  isLoading={loadingExecutiveModal}
                  labs={labs}
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </Flex>
    </Box>
  );
}
