//File: app/admin/components/QuickBookTab.js

"use client";

import { useEffect, useState } from "react";
import {
  Box, Table, Thead, Tbody, Tr, Th, Td, Button,
  Select, Badge, Spinner, Text,
} from "@chakra-ui/react";
import PatientsTab from "@/app/components/PatientsTab";

export default function QuickBookTab({ quickbookings = [], onRefresh }) {
  const [processingQuickBook, setProcessingQuickBook] = useState(null);
  const [saving, setSaving] = useState(null);
  const [visitLists, setVisitLists] = useState({});
  const [editedQuickBook, setEditedQuickBook] = useState({});
  const [statusOptions, setStatusOptions] = useState([]);

  // Fetch status options (with color, label, code, order)
  useEffect(() => {
    fetch("/api/visits/status")
      .then(res => res.json())
      .then((data) => {
        if (Array.isArray(data)) setStatusOptions(data);
      })
      .catch(console.error);
  }, []);

  // Fetch visits for each quickbooking date (fire as needed)
  useEffect(() => {
    const uniqueDates = Array.from(new Set(quickbookings.map(qb => qb.date?.slice(0, 10)).filter(Boolean)));
    const missingDates = uniqueDates.filter(date => !(date in visitLists));
    if (missingDates.length === 0) return;

    missingDates.forEach(async date => {
      const res = await fetch(`/api/visits?visit_date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setVisitLists(prev => ({ ...prev, [date]: data }));
      }
    });
  }, [quickbookings, visitLists]);

  if (processingQuickBook) {
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

  if (!quickbookings) return <Spinner />;
  if (statusOptions.length === 0) return <Spinner />;

  // Split quickbooks into pending and others
  const pendingQuickBooks = quickbookings.filter(qb => qb.status === "PENDING");
  const nonPendingQuickBooks = quickbookings.filter(qb => qb.status !== "PENDING");

  // Find status codes marking "normal flow" (order >= 1)
  const normalStatusCodes = statusOptions.filter(opt => opt.order >= 1).map(opt => opt.code);

  const renderTable = (list, faded = false) => (
    <Table size="sm" bg={faded ? "gray.50" : "white"} opacity={faded ? 0.6 : 1} mb={faded ? 0 : 8}>
      <Thead>
        <Tr>
          <Th>Patient</Th>
          <Th>Phone</Th>
          <Th>Package</Th>
          <Th>Date</Th>
          <Th>Slot</Th>
          <Th>Assign Visit</Th>
          <Th>Status</Th>
          <Th>Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {list.map((qb) => {
          const qbDate = qb.date?.slice(0, 10) || "";
          const edit = editedQuickBook[qb.id] || {};
          const statusValue = edit.status ?? qb.status ?? "";
          const visitValue = edit.visit_id ?? qb.visit_id ?? "";
          const statusObj = statusOptions.find(opt => opt.code === statusValue);
          const visitsForDate = visitLists[qbDate] || [];
          const bookedStatus = statusOptions.find(opt => opt.code === "booked");
          const statusToSave =
            statusValue ||
            (bookedStatus ? bookedStatus.code : statusOptions[0]?.code);

          return (
            <Tr key={qb.id}>
              <Td fontWeight="bold">{qb.patient_name || "(No name)"}</Td>
              <Td fontSize="sm">{qb.phone}</Td>
              <Td fontSize="sm">{qb.package_name || "—"}</Td>
              <Td fontSize="sm">{qbDate}</Td>
              <Td fontSize="sm">
                {qb.time_slot?.slot_name || "—"}
              </Td>
              <Td>
                <Select
                  size="sm"
                  value={visitValue}
                  placeholder="Assign Visit"
                  onChange={e => {
                    const visit_id = e.target.value || "";
                    setEditedQuickBook(prev => ({
                      ...prev,
                      [qb.id]: { ...(prev[qb.id] || {}), visit_id }
                    }));
                  }}
                  isDisabled={statusValue === "REJECTED"}
                  w="190px"
                >
                  <option value="">—</option>
                  {visitsForDate.map(v => (
                    <option key={v.id} value={v.id}>
                      {(v.visit_code || v.id) + " — " + (v.patient?.name || "Unknown")}
                    </option>
                  ))}
                </Select>
                {qb.visit_id && (
                  <Badge mt={1} colorScheme="green">
                    Assigned: {qb.visit_id}
                  </Badge>
                )}
              </Td>
              <Td>
                <Select
                  size="sm"
                  value={statusValue}
                  onChange={e => {
                    const status = e.target.value;
                    setEditedQuickBook(prev => ({
                      ...prev,
                      [qb.id]: { ...(prev[qb.id] || {}), status }
                    }));
                  }}
                  w="120px"
                >
                  {statusOptions.map(opt => (
                    <option
                      key={opt.code}
                      value={opt.code}
                      style={{
                        fontWeight: opt.order >= 1 ? "bold" : "normal",
                        color: opt.order >= 1 ? "#228B22" : undefined // green for normal flow
                      }}
                    >
                      {opt.label}{opt.order >= 1 ? " ★" : ""}
                    </option>
                  ))}
                </Select>
                {statusObj && (
                  <Badge ml={1} colorScheme={statusObj.color}>
                    {statusObj.label}
                  </Badge>
                )}
              </Td>
              <Td>
                {!faded && (
                  <>
                    <Button
                      size="sm"
                      colorScheme="green"
                      mr={2}
                      isDisabled={statusValue === "REJECTED" || !!visitValue}
                      onClick={() => setProcessingQuickBook(qb)}
                    >
                      Process
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      isLoading={saving === qb.id}
                      onClick={async () => {
                        setSaving(qb.id);
                        try {
                          const payload = {
                            status: statusToSave,
                            visit_id: visitValue || null,
                          };
                          const res = await fetch(`/api/quickbook/${qb.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                          });
                          if (!res.ok) throw new Error("Failed to update QuickBook");
                          setEditedQuickBook(prev => {
                            const copy = { ...prev };
                            delete copy[qb.id];
                            return copy;
                          });
                          onRefresh && onRefresh();
                        } catch (err) {
                          alert(err.message);
                        } finally {
                          setSaving(null);
                        }
                      }}
                    >
                      Save
                    </Button>
                  </>
                )}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );

  return (
    <Box w="100%" overflowX="auto" py={4}>
      {/* Pending section */}
      {pendingQuickBooks.length > 0 && renderTable(pendingQuickBooks)}

      {/* Non-pending section, muted */}
      {nonPendingQuickBooks.length > 0 && (
        <Box mt={8}>
          <Text fontSize="md" mb={2} color="gray.400" textAlign="left" fontWeight="bold">
            Processed/Rejected QuickBookings
          </Text>
          {renderTable(nonPendingQuickBooks, true)}
        </Box>
      )}

      {pendingQuickBooks.length === 0 && nonPendingQuickBooks.length === 0 && (
        <Text>No quickbookings found 🎉</Text>
      )}
    </Box>
  );
}
