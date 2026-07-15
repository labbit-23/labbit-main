// File: /app/patient-archive/page.js
// Standalone screen for the Shivam historical archive: search a patient,
// browse requisition history and numeric trends. New screen — touches no
// existing labit pages; entry buttons elsewhere come later, per approval.

'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
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
import ArchivePatientLookup from '@/components/archive/ArchivePatientLookup';
import PatientHistory from '@/components/archive/PatientHistory';
import ArchiveTrends from '@/components/archive/ArchiveTrends';

function PatientArchiveContent() {
  const searchParams = useSearchParams();
  const initialMrn = useMemo(() => String(searchParams.get('mrn') || searchParams.get('mrno') || '').trim(), [searchParams]);
  const initialView = String(searchParams.get('initialview') || '').trim().toLowerCase();
  const initialOption = String(searchParams.get('option') || '').trim().toLowerCase();
  const initialTabIndex = initialMrn && initialView === 'trends' ? 2 : (initialMrn ? 1 : 0);
  const initialTableView = initialView === 'trends' && initialOption === 'tableview';
  const [mrno, setMrno] = useState(initialMrn || null);
  const [tabIndex, setTabIndex] = useState(initialTabIndex);

  useEffect(() => {
    if (!initialMrn) return;
    setMrno(initialMrn);
    setTabIndex(initialView === 'trends' ? 2 : 1);
  }, [initialMrn, initialView]);

  return (
    <RequireAuth roles={['admin', 'manager', 'director', 'director_ceo', 'consultant']}>
      <Container maxW="6xl" py={6}>
        <Heading size="md" mb={1}>Patient Archive</Heading>
        <Text fontSize="sm" color="gray.500" mb={5}>
          Historical Shivam data (read-only, pre-cutover). Not live NeoSoft data.
        </Text>

        <Tabs size="sm" variant="enclosed" index={tabIndex} onChange={setTabIndex}>
          <TabList>
            <Tab>Search</Tab>
            <Tab isDisabled={!mrno}>History{mrno ? ` — ${mrno}` : ''}</Tab>
            <Tab isDisabled={!mrno}>Trends</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <ArchivePatientLookup
                onSelect={(selected) => {
                  setMrno(selected);
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
