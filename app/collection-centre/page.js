//app/collection-centre/page.js

"use client";

import React, { useState } from "react";
import {
  Box, Tabs, TabList, TabPanels, Tab, TabPanel,
  Heading, useToast
} from "@chakra-ui/react";

import RequireAuth from "../../components/RequireAuth";
import PickupRequestForm from "./components/PickupRequestForm";
import PickupHistory from "./components/PickupHistory";
import CollectionCentreUsers from "./components/CollectionCentreUsers"; // optional user mgmt tab

export default function CollectionCentreTabsPage({ collectionCentreId }) {
  const toast = useToast();
  const [refreshFlag, setRefreshFlag] = useState(false);

  const refreshPickups = () => setRefreshFlag(f => !f);

  return (
    <RequireAuth roles={["requester", "admin", "logistics"]}>
      <Box maxW="900px" mx="auto" py={8} px={4}>
        <Heading mb={6}>Collection Centre Dashboard</Heading>
        <Tabs variant="enclosed" colorScheme="teal" isLazy>
          <TabList mb={4}>
            <Tab>Request Pickup</Tab>
            <Tab>Pickup History</Tab>
            <Tab>Users</Tab>
            <Tab>Settings</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <PickupRequestForm
                collectionCentreId={collectionCentreId}
                onSuccess={() => {
                  toast({ title: "Pickup request created", status: "success" });
                  refreshPickups();
                }}
              />
            </TabPanel>

            <TabPanel>
              <PickupHistory
                collectionCentreId={collectionCentreId}
                refreshFlag={refreshFlag}
              />
            </TabPanel>

            <TabPanel>
              <CollectionCentreUsers collectionCentreId={collectionCentreId} />
            </TabPanel>

            <TabPanel>
              <Box>Settings content coming soon...</Box>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </RequireAuth>
  );
}
