// File: /components/archive/PatientArchiveModal.js
// Modal wrapper: search the Shivam archive, then browse history / trends.
// Open with an mrno to jump straight to that patient, or without to search.

'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react';
import ArchivePatientLookup from './ArchivePatientLookup';
import PatientHistory from './PatientHistory';
import ArchiveTrends from './ArchiveTrends';

export default function PatientArchiveModal({ isOpen, onClose, mrno: initialMrno = null }) {
  const [mrno, setMrno] = useState(initialMrno);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          Patient Archive (Shivam, pre-cutover)
          {mrno && (
            <Text as="span" ml={3} fontSize="md" color="gray.500">
              MRN {mrno}
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Tabs size="sm" variant="enclosed" defaultIndex={mrno ? 1 : 0}>
            <TabList>
              <Tab>Search</Tab>
              <Tab isDisabled={!mrno}>History</Tab>
              <Tab isDisabled={!mrno}>Trends</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <ArchivePatientLookup onSelect={(selected) => setMrno(selected)} />
              </TabPanel>
              <TabPanel>{mrno && <PatientHistory mrno={mrno} />}</TabPanel>
              <TabPanel>{mrno && <ArchiveTrends mrno={mrno} />}</TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
