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

import ShortcutBar from "../../components/ShortcutBar";
import ActiveVisitsTab from "./ActiveVisitsTab";
import PatientsTab from "../components/PatientsTab";  // Use PatientsTab here
import VisitDetailTab from "./VisitDetailTab";
import DashboardMetrics from "../../components/DashboardMetrics";

import { useUser } from "../context/UserContext";
import RequireAuth from "../../components/RequireAuth";

function PhleboContent({ userRole = "executive" }) {
  const { user } = useUser();

  const [executives, setExecutives] = useState([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState(null);
  const [selectedExecutiveName, setSelectedExecutiveName] = useState(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Lock executive to self if user is phlebo
  const lockExecutive =
    !!user &&
    user.userType === "executive" &&
    (user.executiveType || "").toLowerCase() === "phlebo";

  useEffect(() => {
    if (lockExecutive) {
      setSelectedExecutiveId(user.id);
      setSelectedExecutiveName(user.name ?? null);
    }
  }, [user, lockExecutive]);

  useEffect(() => {
    async function fetchExecutives() {
      try {
        const { data, error } = await supabase
          .from("executives")
          .select("id, name")
          .in("status", ["active", "available"])
          .eq("type", "Phlebo");
        if (error) throw error;
        setExecutives(data || []);
        if (!lockExecutive && data?.length > 0) {
          setSelectedExecutiveId(data[0].id);
          setSelectedExecutiveName(data.name);
        }
      } catch (error) {
        console.error("Failed to fetch executives", error);
      }
    }
    fetchExecutives();
  }, [lockExecutive]);

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
    setTabIndex(2);
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
        lockExecutive={lockExecutive}
      />

      <Box
        maxW="7xl"
        mx="auto"
        p={6}
        bg="gray.50"
        minH="calc(100vh - 72px)"
        rounded="md"
        boxShadow="sm"
        mt="72px"
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
            <Tab flex="1">Active Visits</Tab>
            <Tab flex="1">Patient Lookup</Tab>
            <Tab flex="1" isDisabled={!selectedVisit}>
              Visit Details
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel p={6} bg="white" rounded="md" boxShadow="sm">
              <ActiveVisitsTab
                onSelectVisit={handleVisitSelect}
                selectedVisit={selectedVisit}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                hvExecutiveId={selectedExecutiveId}
              />
            </TabPanel>

            <TabPanel p={6} bg="white" rounded="md" boxShadow="sm">
              <PatientsTab
                // Optionally pass quickbookContext here if relevant
                //onPatientSelected={() => setTabIndex(0)} // example: go back to Active Visits on patient select
                phone="" // or any default phone number if needed
                defaultExecutiveId={selectedExecutiveId}     // Pass this prop!
                disablePhoneInput={false}
              />
            </TabPanel>

            <TabPanel p={6} bg="white" rounded="md" boxShadow="sm">
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

export default function PhleboPageWrapper(props) {
  return (
    <RequireAuth roles={['phlebo']}>
      <PhleboContent {...props} />
    </RequireAuth>
  );
}
