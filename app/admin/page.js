// app/admin/page.js
'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
  Spacer,
  Text,
  Heading,
  useToast,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';

import VisitsTable from './components/VisitsTable';
import PatientList from './components/PatientList';
import ExecutiveList from './components/ExecutiveList';
import VisitModal from './components/VisitModal';
import PatientModal from './components/PatientModal';
import ExecutiveModal from './components/ExecutiveModal';

// ✅ Use your existing Supabase client
import { supabase } from '../../lib/supabaseClient';

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

/**
 * Generates unique visit code in the format VISIT-YYYYMMDD-XXXX
 */
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

export default function AdminDashboard() {
  const [tabIndex, setTabIndex] = useState(0);
  const [visits, setVisits] = useState([]);
  const [patients, setPatients] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const toast = useToast();

  const visitModal = useDisclosure();
  const patientModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [loadingVisitModal, setLoadingVisitModal] = useState(false);
  const [loadingPatientModal, setLoadingPatientModal] = useState(false);
  const [loadingExecutiveModal, setLoadingExecutiveModal] = useState(false);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [
        { data: visitsData, error: visitsError },
        { data: patientsData, error: patientsError },
        { data: executivesData, error: executivesError },
        { data: labsData, error: labsError },
        { data: timeSlotsData, error: timeSlotsError },
      ] = await Promise.all([
        supabase
          .from("visits")
          .select(`
            *,
            patient:patient_id(name, phone),
            executive:executive_id(name),
            lab:lab_id(name),
            time_slot:time_slot(id, slot_name, start_time, end_time)
          `)
          .order("visit_date", { ascending: false }),
        supabase.from("patients").select("id, name, phone, dob, gender, email").order("name"),
        supabase.from("executives").select("id, name, phone, status").order("name"),
        supabase.from("labs").select("id, name").order("name"),
        supabase.from("visit_time_slots").select("id, slot_name, start_time, end_time").order("start_time"),
      ]);

      if (visitsError) throw visitsError;
      if (patientsError) throw patientsError;
      if (executivesError) throw executivesError;
      if (labsError) throw labsError;
      if (timeSlotsError) throw timeSlotsError;

      setVisits(visitsData || []);
      setPatients(patientsData || []);
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

  // Handle Visit Save
  const handleVisitSave = async (formData) => {
    setLoadingVisitModal(true);
    try {
      const timeSlotExists = timeSlots.some((slot) => slot.id === formData.time_slot_id);
      if (!timeSlotExists) throw new Error("Invalid time slot.");

      const visitPayload = {
        patient_id: formData.patient_id,
        executive_id: formData.executive_id || null,
        lab_id: formData.lab_id,
        visit_date: formData.visit_date,
        time_slot: formData.time_slot_id,
        address: formData.address,
        status: formData.status,
      };

      if (editingVisit && editingVisit.id) {
        const { error } = await supabase
          .from("visits")
          .update(visitPayload)
          .eq("id", editingVisit.id);
        if (error) throw error;
        toast({ title: "Visit updated", status: "success", duration: 3000, isClosable: true });
      } else {
        const visitCode = await generateNewVisitCode();
        visitPayload.visit_code = visitCode;
        const { error } = await supabase.from("visits").insert([visitPayload]);
        if (error) throw error;
        toast({ title: "Visit created", status: "success", duration: 3000, isClosable: true });
      }

      visitModal.onClose();
      setEditingVisit(null);
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error saving visit",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("handleVisitSave error:", error);
    }
    setLoadingVisitModal(false);
  };

  // ✅ Updated: Handle Patient Create (no direct savePatientExternalKey)
  const handlePatientCreate = async (formData) => {
    setLoadingPatientModal(true);
    try {
      const {  newPatient, error } = await supabase
        .from("patients")
        .insert([formData])
        .select()
        .single();
      if (error) throw error;

      // ✅ Save CREGNO via secure API route
      if (formData.cregno) {
        const res = await fetch('/api/save-external-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: newPatient.id,
            external_key: formData.cregno,
            lab_id: DEFAULT_LAB_ID
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          console.error('Failed to save CREGNO:', errData);
          // Don't throw — patient is saved, CREGNO is optional
        }
      }

      toast({ title: "Patient added", status: "success", duration: 3000, isClosable: true });
      patientModal.onClose();
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error adding patient",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("handlePatientCreate error:", error);
    }
    setLoadingPatientModal(false);
  };

  // Handle Executive Create
  const handleExecutiveCreate = async (formData) => {
    setLoadingExecutiveModal(true);
    try {
      const { error } = await supabase.from("executives").insert([formData]);
      if (error) throw error;
      toast({ title: "Executive added", status: "success", duration: 3000, isClosable: true });
      executiveModal.onClose();
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error adding executive",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("handleExecutiveCreate error:", error);
    }
    setLoadingExecutiveModal(false);
  };

  // Delete Visit
  const handleVisitDelete = async (id) => {
    if (!window.confirm("Delete this visit?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Visit deleted", status: "info", duration: 3000, isClosable: true });
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error deleting visit",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("handleVisitDelete error:", error);
    }
    setLoading(false);
  };

  return (
    <Box minH="100vh" p={[4, 8]} bg="gray.50">
      <Flex align="center" mb={8}>
        <Heading color="green.600" size="xl" fontWeight="extrabold">
          Labbit Admin Dashboard
        </Heading>
        <Spacer />
        <Button
          colorScheme="green"
          onClick={() => {
            setEditingVisit(null);
            visitModal.onOpen();
          }}
          leftIcon={<AddIcon />}
        >
          New Visit
        </Button>
      </Flex>

      {errorMsg && (
        <Text color="red.500" mb={6}>
          {errorMsg}
        </Text>
      )}

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
              visits={visits}
              timeSlots={timeSlots}
              onEdit={(visit) => {
                setEditingVisit(visit);
                visitModal.onOpen();
              }}
              onDelete={handleVisitDelete}
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
              patients={patients}
              executives={executives}
              labs={labs}
              timeSlots={timeSlots}
              isLoading={loadingVisitModal}
            />
          </TabPanel>

          {/* Patients Tab */}
          <TabPanel>
            <Flex mb={4} justifyContent="flex-end">
              <Button
                leftIcon={<AddIcon />}
                colorScheme="green"
                onClick={patientModal.onOpen}
                data-testid="add-patient-button"
              >
                Add Patient
              </Button>
            </Flex>
            {loading ? (
              <Text>Loading patients...</Text>
            ) : patients.length === 0 ? (
              <Text color="gray.500" textAlign="center" py={6}>
                No patients found. Click "Add Patient" to get started.
              </Text>
            ) : (
              <PatientList patients={patients} />
            )}
            <PatientModal
              isOpen={patientModal.isOpen}
              onClose={patientModal.onClose}
              onSubmit={handlePatientCreate}
              isLoading={loadingPatientModal}
            />
          </TabPanel>

          {/* Executives Tab */}
          <TabPanel>
            <Flex mb={4} justifyContent="flex-end">
              <Button leftIcon={<AddIcon />} colorScheme="green" onClick={executiveModal.onOpen}>
                Add Executive
              </Button>
            </Flex>
            {loading ? (
              <Text>Loading executives...</Text>
            ) : executives.length === 0 ? (
              <Text color="gray.500" textAlign="center" py={6}>
                No executives found.
              </Text>
            ) : (
              <ExecutiveList executives={executives} />
            )}
            <ExecutiveModal
              isOpen={executiveModal.isOpen}
              onClose={executiveModal.onClose}
              onSubmit={handleExecutiveCreate}
              isLoading={loadingExecutiveModal}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}