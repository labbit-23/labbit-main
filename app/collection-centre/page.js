//app/collection-centre/page.js

"use client";

import React, { useState } from "react";
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
  useToast,
  VStack,
} from "@chakra-ui/react";

import RequireAuth from "../../components/RequireAuth";
import PickupRequestForm from "./components/PickupRequestForm";
import PickupHistory from "./components/PickupHistory";
import CollectionCentreUsers from "./components/CollectionCentreUsers";
import { useUser } from "../../app/context/UserContext";

import ShortcutBar from "../../components/ShortcutBar";
import DashboardMetrics from "../../components/DashboardMetrics";

export default function CollectionCentreTabsPage({ collectionCentreId }) {
  const toast = useToast();
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const { user } = useUser();
  const execType = (user?.executiveType || "").toLowerCase();

  const refreshPickups = () => setRefreshFlag((f) => !f);

  // For ShortcutBar - you can extend with executives, patients etc as needed
  const [selectedExecutiveId, setSelectedExecutiveId] = useState(user?.id || "");

  return (
    <RequireAuth roles={["logistics", "b2b", "b2badmin"]}>
      <Box maxW="900px" mx="auto" py={8} px={4}>
        {/* Sticky ShortcutBar at top */}
        <Box mb={6}>
          <ShortcutBar
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedExecutiveId={selectedExecutiveId}
            setSelectedExecutiveId={setSelectedExecutiveId}
            lockExecutive={true} // optionally lock if required
          />
        </Box>

        {/* Dashboard Metrics */}
        <Box mb={8}>
          <DashboardMetrics
            collectionCentreId={collectionCentreId}
            date={selectedDate}
          />
        </Box>

        <Heading mb={6}>Collection Centre Dashboard</Heading>

        <Tabs variant="enclosed" colorScheme="teal" isLazy>
          <TabList mb={4}>
            {(execType === "b2b" || execType === "logistics") && <Tab>Request Pickup</Tab>}

            {(execType === "b2b" ||
              execType === "logistics" ||
              execType === "b2badmin") && <Tab>Pickup History</Tab>}

            {execType === "b2badmin" && <Tab>Users</Tab>}

            {execType === "b2badmin" && <Tab>Settings</Tab>}
          </TabList>

          <TabPanels>
            {(execType === "b2b" || execType === "logistics") && (
              <TabPanel>
                <PickupRequestForm
                  collectionCentreId={collectionCentreId}
                  onSuccess={() => {
                    toast({
                      title: "Pickup request created",
                      status: "success",
                    });
                    refreshPickups();
                  }}
                />
              </TabPanel>
            )}

            {(execType === "b2b" ||
              execType === "logistics" ||
              execType === "b2badmin") && (
              <TabPanel>
                <PickupHistory
                  collectionCentreId={collectionCentreId}
                  refreshFlag={refreshFlag}
                />
              </TabPanel>
            )}

            {execType === "b2badmin" && (
              <>
                <TabPanel>
                  <CollectionCentreUsers collectionCentreId={collectionCentreId} />
                </TabPanel>

                <TabPanel>
                  <Box>Settings content coming soon...</Box>
                </TabPanel>
              </>
            )}
          </TabPanels>
        </Tabs>
      </Box>
    </RequireAuth>
  );
}
