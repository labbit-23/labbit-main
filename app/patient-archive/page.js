// File: /app/patient-archive/page.js
// Standalone screen for the Shivam historical archive: search a patient,
// browse requisition history and numeric trends. New screen — touches no
// existing labit pages; entry buttons elsewhere come later, per approval.

'use client';

import React, { useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react';
import RequireAuth from '@/components/RequireAuth';
import ArchivePatientLookup from '@/components/archive/ArchivePatientLookup';
import PatientHistory from '@/components/archive/PatientHistory';
import ArchiveTrends from '@/components/archive/ArchiveTrends';

export default function PatientArchivePage() {
  const [mrno, setMrno] = useState(null);
  const [tabIndex, setTabIndex] = useState(0);

  return (
    <RequireAuth>
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
            <TabPanel px={0}>{mrno && <ArchiveTrends mrno={mrno} />}</TabPanel>
          </TabPanels>
        </Tabs>
      </Container>
    </RequireAuth>
  );
}
