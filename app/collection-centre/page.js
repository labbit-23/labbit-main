//app/collection-centre/page.js

"use client";

import React, { useState } from "react";
import dayjs from "dayjs";
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
  useToast
} from "@chakra-ui/react";

import RequireAuth from "../../components/RequireAuth";
import PickupRequestForm from "./components/PickupRequestForm";
import PickupHistory from "./components/PickupHistory";
import { useUser } from "../../app/context/UserContext";

import ShortcutBar from "../../components/ShortcutBar";
import DashboardMetrics from "../../components/DashboardMetrics";

export default function CollectionCentreTabsPage() {
  const toast = useToast();
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const { user } = useUser();
  const execType = (user?.executiveType || "").toLowerCase();
  const isOpsAdmin = execType === "admin" || execType === "manager" || execType === "director";

  const refreshPickups = () => setRefreshFlag((f) => !f);

  // For ShortcutBar - you can extend with executives, patients etc as needed
  const [selectedExecutiveId, setSelectedExecutiveId] = useState(user?.id || "");

  return (
    <RequireAuth roles={["logistics", "b2b", "admin", "manager", "director"]}>
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
            pickupMode
            date={selectedDate}
          />
        </Box>

        <Heading mb={6}>Collection Centre Dashboard</Heading>

        <Tabs variant="enclosed" colorScheme="teal" isLazy>
          <TabList
            mb={4}
            overflowX={{ base: "auto", md: "visible" }}
            overflowY="hidden"
            flexWrap={{ base: "nowrap", md: "wrap" }}
            whiteSpace="nowrap"
            sx={{ WebkitOverflowScrolling: "touch" }}
          >
            {(execType === "b2b" ||
              execType === "logistics" ||
              isOpsAdmin) && <Tab flexShrink={0}>Pickup History</Tab>}

            {(execType === "b2b" || execType === "logistics" || isOpsAdmin) && <Tab flexShrink={0}>Request Pickup</Tab>}
          </TabList>

          <TabPanels>
            {(execType === "b2b" ||
              execType === "logistics" ||
              isOpsAdmin) && (
              <TabPanel>
                <PickupHistory
                  refreshFlag={refreshFlag}
                  date={selectedDate}
                />
              </TabPanel>
            )}

            {(execType === "b2b" || execType === "logistics" || isOpsAdmin) && (
              <TabPanel>
                <PickupRequestForm
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
          </TabPanels>
        </Tabs>
      </Box>
    </RequireAuth>
  );
}
