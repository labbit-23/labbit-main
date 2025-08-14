//File: app/admin/components/QuickBookTab.js

"use client";

import { useState } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Spinner
} from "@chakra-ui/react";
import PatientsTab from "@/app/components/PatientsTab";

/**
 * QuickBookTab
 * @param {Array} quickbookings - Pending quickbooking rows
 * @param {Function} onRefresh - Reload function for after processing/reject
 */
export default function QuickBookTab({ quickbookings = [], onRefresh }) {
  const [processingQuickBook, setProcessingQuickBook] = useState(null);

  if (processingQuickBook) {
    // Switch to PatientsTab to process selected booking
    return (
      <PatientsTab
        quickbookContext={{
          source: "quickbook",
          booking: processingQuickBook
        }}
        fetchPatients={onRefresh}
        onPatientSelected={() => {}}
      />
    );
  }

  if (!quickbookings) {
    return <Spinner />;
  }

  if (quickbookings.length === 0) {
    return <Text>No pending quickbookings 🎉</Text>;
  }

  return (
    <Box>
      {quickbookings.map((qb) => (
        <Flex
          key={qb.id}
          p={3}
          bg="white"
          borderBottom="1px solid"
          borderColor="gray.200"
          align="center"
          justify="space-between"
          wrap="wrap"
        >
          <Box>
            <Text fontWeight="bold">{qb.patient_name || "(No name)"}</Text>
            <Text fontSize="sm" color="gray.600">{qb.phone}</Text>
            <Text fontSize="xs" color="gray.500">
            {qb.date}{" – "}
            {qb.time_slot?.slot_name
                ? `${qb.time_slot.slot_name}`
                : "—"}
            </Text>
            {qb.package_name && (
              <Text fontSize="xs" color="gray.500">
                {qb.package_name}
              </Text>
            )}
          </Box>

          <Flex gap={2}>
            <Button
              size="sm"
              colorScheme="green"
              onClick={() => setProcessingQuickBook(qb)}
            >
              Process
            </Button>
            <Button
              size="sm"
              colorScheme="red"
              variant="outline"
              onClick={async () => {
                if (!window.confirm("Mark this QuickBook as Rejected?")) return;
                try {
                  const res = await fetch(`/api/quickbook/${qb.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "REJECTED" })
                  });
                  if (!res.ok) throw new Error("Failed to reject booking");
                  onRefresh && onRefresh();
                } catch (err) {
                  console.error("Reject error", err);
                  alert(err.message);
                }
              }}
            >
              Reject
            </Button>
          </Flex>
        </Flex>
      ))}
    </Box>
  );
}
