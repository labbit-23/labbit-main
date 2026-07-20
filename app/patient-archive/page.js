// File: /app/patient-archive/page.js
// Standalone screen for the Shivam historical archive: search a patient,
// browse requisition history and numeric trends. New screen — touches no
// existing labit pages; entry buttons elsewhere come later, per approval.

'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Container,
  Flex,
  HStack,
  Heading,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react';
import { useSearchParams } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import ShortcutBar from '@/components/ShortcutBar';
import ArchivePatientLookup from '@/components/archive/ArchivePatientLookup';
import PatientHistory from '@/components/archive/PatientHistory';
import ArchiveTrends from '@/components/archive/ArchiveTrends';

function PatientIdentity({ patient, mrno, loading }) {
  if (!mrno) return null;
  const display = patient || {};
  const items = [
    ['MRN', display.mrn || mrno],
    ['Age', display.age ?? display.age_years],
    ['Gender', display.sex || display.gender],
    ['Phone', display.mobile],
    ['Last visit', display.last_visit ? String(display.last_visit).slice(0, 10) : null],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');

  return (
    <Box borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3} mb={4} bg="gray.50">
      <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} gap={3} direction={{ base: 'column', md: 'row' }}>
        <Box minW={0}>
          <Text fontSize="xs" color="gray.500" fontWeight="700">Patient</Text>
          <Heading size="sm" noOfLines={1}>{display.name || 'Loading patient...'}</Heading>
        </Box>
        {loading ? <Spinner size="sm" /> : null}
      </Flex>
      <HStack mt={3} spacing={2} flexWrap="wrap">
        {items.map(([label, value]) => (
          <Badge key={label} colorScheme="gray" variant="subtle" px={2} py={1} borderRadius="md">
            {label}: {String(value)}
          </Badge>
        ))}
      </HStack>
    </Box>
  );
}

function PatientArchiveContent() {
  const searchParams = useSearchParams();
  const initialMrn = useMemo(() => String(searchParams.get('mrn') || searchParams.get('mrno') || '').trim(), [searchParams]);
  const initialView = String(searchParams.get('initialview') || '').trim().toLowerCase();
  const initialOption = String(searchParams.get('option') || '').trim().toLowerCase();
  const initialTabIndex = initialMrn && initialView === 'trends' ? 2 : (initialMrn ? 1 : 0);
  const initialTableView = initialView === 'trends' && initialOption === 'tableview';
  const [mrno, setMrno] = useState(initialMrn || null);
  const [patient, setPatient] = useState(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState(initialTabIndex);

  useEffect(() => {
    if (!initialMrn) return;
    setMrno(initialMrn);
    setTabIndex(initialView === 'trends' ? 2 : 1);
  }, [initialMrn, initialView]);

  useEffect(() => {
    if (!mrno) {
      setPatient(null);
      return undefined;
    }
    if (patient?.mrn === mrno) return undefined;

    let cancelled = false;
    setPatientLoading(true);
    fetch(`/api/archive/patient/${encodeURIComponent(mrno)}`)
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || payload?.error || 'Patient lookup failed');
        if (!cancelled) setPatient(payload);
      })
      .catch(() => {
        if (!cancelled) setPatient({ mrn: mrno });
      })
      .finally(() => {
        if (!cancelled) setPatientLoading(false);
      });
    return () => { cancelled = true; };
  }, [mrno, patient?.mrn]);

  return (
    <RequireAuth roles={['admin', 'manager', 'director', 'director_ceo', 'consultant']}>
      <>
        <ShortcutBar />
        <Container maxW="6xl" py={6}>
          <Heading size="md" mb={1}>Patient Archive</Heading>
          <Text fontSize="sm" color="gray.500" mb={5}>
            Historical Shivam data (read-only, pre-cutover). Not live NeoSoft data.
          </Text>

          <PatientIdentity patient={patient} mrno={mrno} loading={patientLoading} />

          <Tabs size="sm" variant="enclosed" index={tabIndex} onChange={setTabIndex}>
            <TabList>
              <Tab>Search</Tab>
              <Tab isDisabled={!mrno}>History{mrno ? ` — ${mrno}` : ''}</Tab>
              <Tab isDisabled={!mrno}>Trends</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0}>
                <ArchivePatientLookup
                  onSelect={(selected, selectedPatient) => {
                    setMrno(selected);
                    setPatient(selectedPatient || null);
                    setTabIndex(1);
                  }}
                />
              </TabPanel>
              <TabPanel px={0}>
                {mrno && (
                  <Box>
                    <PatientHistory mrno={mrno} />
                  </Box>
                )}
              </TabPanel>
              <TabPanel px={0}>{mrno && <ArchiveTrends mrno={mrno} initialTableView={initialTableView} />}</TabPanel>
            </TabPanels>
          </Tabs>
        </Container>
      </>
    </RequireAuth>
  );
}

export default function PatientArchivePage() {
  return (
    <Suspense
      fallback={(
        <Container maxW="6xl" py={6}>
          <Spinner size="sm" />
        </Container>
      )}
    >
      <PatientArchiveContent />
    </Suspense>
  );
}
