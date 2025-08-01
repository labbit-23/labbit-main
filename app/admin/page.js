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
import { supabase } from '../../lib/supabaseClient';
import dayjs from 'dayjs';

import VisitsTable from './components/VisitsTable';
import VisitModal from './components/VisitModal';
import ExecutiveList from './components/ExecutiveList';
import ExecutiveModal from './components/ExecutiveModal';

import PatientsTab from '../components/PatientsTab'; // Adjust path as needed

const DEFAULT_LAB_ID = 'b539909242';

async function generateNewVisitCode() {
  const today = dayjs().format('YYYYMMDD');
  const startOfDay = dayjs().startOf('day').toISOString();
  const endOfDay = dayjs().endOf('day').toISOString();

  const { count, error } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay);

  if (error) throw error;

  const seqNum = (count || 0) + 1;
  const seqNumPadded = seqNum.toString().padStart(4, '0');
  return `VISIT-${today}-${seqNumPadded}`;
}

export default function AdminDashboard() {
  const [tabIndex, setTabIndex] = useState(0);
  const [visits, setVisits] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const toast = useToast();

  const visitModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [loadingVisitModal, setLoadingVisitModal] = useState(false);
  const [loadingExecutiveModal, setLoadingExecutiveModal] = useState(false);

  // Fetch all relevant data for tabs
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // Fetch executives list via your API route /api/executives GET
      const apiExecutivesFetch = fetch('/api/executives')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch executives');
          return res.json();
        });

      // Parallel fetching of all required data
      const [
        { data: visitsData, error: visitsError },
        executivesData,
        { data: labsData, error: labsError },
        { data: timeSlotsData, error: timeSlotsError },
      ] = await Promise.all([
        supabase
          .from('visits')
          .select(
            `
            *,
            patient:patient_id(name, phone),
            executive:executive_id(name),
            lab:lab_id(name),
            time_slot:time_slot(id, slot_name, start_time, end_time)
          `
          )
          .order('created_at', { ascending: false }),
        apiExecutivesFetch, // use API call here instead of supabase direct
        supabase.from('labs').select('id, name').order('name'),
        supabase.from('visit_time_slots').select('id, slot_name, start_time, end_time').order('start_time'),
      ]);

      if (visitsError) throw visitsError;
      if (!executivesData) throw new Error('Failed to load executives'); // error handled in fetch

      if (labsError) throw labsError;
      if (timeSlotsError) throw timeSlotsError;

      setVisits(visitsData || []);
      setExecutives(executivesData || []);
      setLabs(labsData || []);
      setTimeSlots(timeSlotsData || []);
    } catch (error) {
      setErrorMsg('Failed to load data. Please try again.');
      toast({
        title: 'Error Loading Data',
        description: error.message || 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      console.error('fetchAll error:', error);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Keep your handlers unchanged (handleVisitSave, handleExecutiveCreate, handleVisitDelete) as they rely on Supabase directly or your existing logic:

  const handleVisitSave = async (formData) => {
    setLoadingVisitModal(true);
    try {
      if (!formData.patient_id) {
        toast({ title: 'Please select a patient', status: 'warning' });
        setLoadingVisitModal(false);
        return;
      }

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
          .from('visits')
          .update(visitPayload)
          .eq('id', editingVisit.id);
        if (error) throw error;
        toast({ title: 'Visit updated', status: 'success' });
      } else {
        const code = await generateNewVisitCode();
        visitPayload.visit_code = code;
        const { error } = await supabase.from('visits').insert([visitPayload]);
        if (error) throw error;
        toast({ title: 'Visit created', status: 'success' });
      }

      visitModal.onClose();
      setEditingVisit(null);
      await fetchAll();
    } catch (error) {
      toast({ title: 'Error saving visit', description: error.message, status: 'error' });
      console.error(error);
    }
    setLoadingVisitModal(false);
  };

  const handleExecutiveCreate = async (formData) => {
    setLoadingExecutiveModal(true);
    try {
      const { error } = await supabase.from('executives').insert([formData]);
      if (error) throw error;
      toast({ title: 'Executive added', status: 'success' });
      executiveModal.onClose();
      await fetchAll();
    } catch (error) {
      toast({ title: 'Error adding executive', description: error.message, status: 'error' });
      console.error(error);
    }
    setLoadingExecutiveModal(false);
  };

  const handleVisitDelete = async (id) => {
    if (!window.confirm('Delete this visit?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('visits').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Visit deleted', status: 'info' });
      await fetchAll();
    } catch (error) {
      toast({ title: 'Error deleting visit', description: error.message, status: 'error' });
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <Box minHeight="100vh" padding={[4, 8]} bg="gray.50">
      <Flex align="center" marginBottom="8">
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
        <Text color="red.500" marginBottom="6">
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
              isLoading={loadingVisitModal}
              patients={visits.map((v) => v.patient) || []} // or fetch separately
              executives={executives}
              labs={labs}
              timeSlots={timeSlots}
            />
          </TabPanel>

          {/* Patients Tab */}
          <TabPanel>
            <PatientsTab fetchPatients={fetchAll} />
          </TabPanel>

          {/* Executives Tab */}
          <TabPanel>
            <Flex marginBottom="4" justifyContent="flex-end">
              <Button leftIcon={<AddIcon />} colorScheme="green" onClick={executiveModal.onOpen}>
                Add Executive
              </Button>
            </Flex>
            <ExecutiveList executives={executives} />
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
