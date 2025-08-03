// File: /app/phlebo/page.js

"use client";

import React, { useState, useEffect } from "react";
import {
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Box,
} from "@chakra-ui/react";
import { supabase } from "../../lib/supabaseClient";

import ShortcutBar from "../../components/ShortcutBar"; // Adjust if needed
import ActiveVisitsTab from "./ActiveVisitsTab";
import PatientLookupTab from "./PatientLookupTab";
import VisitDetailTab from "./VisitDetailTab";
import DashboardMetrics from "../../components/DashboardMetrics";

export default function PhleboTabbedPage({ hvExecutiveId: loggedInExecutiveId, userRole = "executive" }) {
  // State to hold loaded executives list
  const [executives, setExecutives] = useState([]);
  // Selected executiveId and name
  const [selectedExecutiveId, setSelectedExecutiveId] = useState(null);
  const [selectedExecutiveName, setSelectedExecutiveName] = useState(null);

  // Tab and visit selection state
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedVisit, setSelectedVisit] = useState(null);

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // Define lockExecutive - disable executive selector when logged-in executive fixed
  const lockExecutive = Boolean(loggedInExecutiveId);

  // Fetch executives on mount
  useEffect(() => {
    async function fetchExecutives() {
      try {
        const { data, error } = await supabase
          .from("executives")
          .select("id, name")
          .in("status", ["active", "available"])
          .eq("type", "Phlebo");  // or .in("role", ["phlebo", "executive"]) as needed

        if (error) throw error;

        setExecutives(data || []);

        // If logged-in executive provided, use that; else pick first from list
        if (loggedInExecutiveId) {
          setSelectedExecutiveId(loggedInExecutiveId);
          const exec = data.find((e) => e.id === loggedInExecutiveId);
          setSelectedExecutiveName(exec ? exec.name : null);
        } else if (data?.length > 0) {
          setSelectedExecutiveId(data[0].id);
          setSelectedExecutiveName(data[0].name);
        }
      } catch (error) {
        console.error("Failed to fetch executives", error);
        // Optionally handle error UI or toast here
      }
    }
    fetchExecutives();
  }, [loggedInExecutiveId]);

  // Update selected executive name when selectedExecutiveId changes
  useEffect(() => {
    if (!selectedExecutiveId || executives.length === 0) {
      setSelectedExecutiveName(null);
      return;
    }
    const exec = executives.find((e) => e.id === selectedExecutiveId);
    if (exec) setSelectedExecutiveName(exec.name);
  }, [selectedExecutiveId, executives]);

  const handleVisitSelect = (visit) => {
    setSelectedVisit(visit);
    setTabIndex(2); // Switch to 'Visit Details' tab
  };

  return (
    <>
      <ShortcutBar
        userRole={userRole}
        hvExecutiveName={selectedExecutiveName}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        executives={executives}
        selectedExecutiveId={selectedExecutiveId}
        setSelectedExecutiveId={lockExecutive ? undefined : setSelectedExecutiveId} 
        // If executive is locked, do not allow setter to disable selector
        lockExecutive={lockExecutive} // Pass lockExecutive explicitly
      />

      <Box
        maxW="7xl"
        mx="auto"
        p={6}
        bg="gray.50"
        minH="calc(100vh - 72px)" // account for ShortcutBar height
        rounded="md"
        boxShadow="sm"
        mt="72px" // offset for fixed ShortcutBar
      >
        <DashboardMetrics hvExecutiveId={selectedExecutiveId} date={selectedDate} />

        <Tabs
          index={tabIndex}
          onChange={setTabIndex}
          variant="enclosed"
          colorScheme="teal"
          isFitted
          mt={6}
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
              <ActiveVisitsTab
                onSelectVisit={handleVisitSelect}
                selectedVisit={selectedVisit}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                hvExecutiveId={selectedExecutiveId}
              />
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
    </>
  );
}
