"use client";

import React, { useState } from "react";
import {
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Box, Heading, Text
} from "@chakra-ui/react";
import ActiveVisitsTab from "./ActiveVisitsTab";
import PatientLookupTab from "./PatientLookupTab";
import VisitDetailTab from "./VisitDetailTab";
import DashboardMetrics from "../../components/DashboardMetrics";


export default function PhleboTabbedPage({ hvExecutiveId }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedVisit, setSelectedVisit] = useState(null);

  const handleVisitSelect = (visit) => {
    setSelectedVisit(visit);
    setTabIndex(2); // Switch to 'Visit Details' tab
  };

  return (
    <Box maxW="7xl" mx="auto" p={6} bg="gray.50" minH="100vh" rounded="md" boxShadow="sm">
      <Box mb={6} textAlign="center">
        <Heading size="xl" color="teal.600" fontWeight="extrabold">
          Welcome, HV Executive
        </Heading>
        <Text color="gray.600" mt={2}>
          Manage your visits efficiently from here.
        </Text>
      </Box>

      {/* --- Metrics Dashboard --- */}
      <DashboardMetrics hvExecutiveId={hvExecutiveId} />

      {/* --- Tabs Area --- */}
      <Tabs
        index={tabIndex}
        onChange={setTabIndex}
        variant="enclosed"
        colorScheme="teal"
        isFitted
      >
        <TabList bg="teal.50" borderRadius="md" boxShadow="sm" p={1}>
          <Tab flex="1" textAlign="center" px={4} py={3} fontWeight="semibold" fontSize="md">
            Active Visits
          </Tab>
          <Tab flex="1" textAlign="center" px={4} py={3} fontWeight="semibold" fontSize="md">
            Patient Lookup
          </Tab>
          <Tab
            flex="1"
            textAlign="center"
            px={4}
            py={3}
            fontWeight="semibold"
            fontSize="md"
            isDisabled={!selectedVisit}
          >
            Visit Details
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel p={6} bg="white" rounded="md" boxShadow="sm" minH="400px">
            <ActiveVisitsTab onSelectVisit={handleVisitSelect} selectedVisit={selectedVisit} />
          </TabPanel>
          <TabPanel p={6} bg="white" rounded="md" boxShadow="sm" minH="400px">
            <PatientLookupTab onSelectVisit={handleVisitSelect} />
          </TabPanel>
          <TabPanel p={6} bg="white" rounded="md" boxShadow="sm" minH="400px">
            {selectedVisit ? (
              <VisitDetailTab visit={selectedVisit} />
            ) : (
              <Box color="gray.500" textAlign="center" py={10} fontStyle="italic">
                Please select a visit to view details.
              </Box>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
