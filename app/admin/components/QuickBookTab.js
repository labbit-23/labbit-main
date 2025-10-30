//File: app/admin/components/QuickBookTab.js

"use client";

import { useEffect, useState } from "react";
import {
  Box, Table, Thead, Tbody, Tr, Th, Td, Button,
  Select, Badge, Spinner, Text, IconButton
} from "@chakra-ui/react";
import PatientsTab from "@/app/components/PatientsTab";
import { LinkIcon } from "@chakra-ui/icons"; // add at top of file
import { EditIcon } from "@chakra-ui/icons"; // add at top of file
import { CheckIcon } from "@chakra-ui/icons"; // add at top of file
import { Icon } from "@chakra-ui/react";
import { FiSave } from "react-icons/fi";

export default function QuickBookTab({ quickbookings = [], onRefresh }) {
  const [processingQuickBook, setProcessingQuickBook] = useState(null);
  const [saving, setSaving] = useState(null);
  const [visitLists, setVisitLists] = useState({});
  const [editedQuickBook, setEditedQuickBook] = useState({});
  const [statusOptions, setStatusOptions] = useState([]);
  const [linkingVisitId, setLinkingVisitId] = useState(null);
  const [editingStatusId, setEditingStatusId] = useState(null);


  // Fetch status options (with color, label, code, order)
  useEffect(() => {
    fetch("/api/visits/status")
      .then(res => res.json())
      .then((data) => {
        if (Array.isArray(data)) setStatusOptions(data);
      })
      .catch(console.error);
  }, []);



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

  const pendingQuickBooks = quickbookings.filter(qb => qb.status?.toLowerCase() === "pending");
  const nonPendingQuickBooks = quickbookings.filter(qb => qb.status?.toLowerCase() !== "pending");
  const disabledVisits = quickbookings.filter(qb => qb.status !== "PENDING" && qb.status !== "REJECTED");
  const fetchVisitsForDate = async (date) => {
    if (visitLists[date]) return; // Already fetched
    try {
      const res = await fetch(`/api/visits?visit_date=${date}`);
      if (!res.ok) throw new Error("Failed to fetch visits");
      const data = await res.json();
      setVisitLists(prev => ({ ...prev, [date]: data }));
    } catch (error) {
      console.error("Error fetching visits for date", date, error);
    }
  };

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
        const rawStatus = edit.status ?? qb.status ?? "";
        const statusValue = (edit.status ?? qb.status ?? "").toLowerCase();
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
            <Td fontSize="sm">{qb.time_slot?.slot_name || "—"}</Td>
            <Td>
              {visitValue && !linkingVisitId ? (
                <Badge mt={1} colorScheme="green">
                  Assigned: {visitValue}
                </Badge>
              ) : linkingVisitId === qb.id ? (
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
                  onBlur={() => setLinkingVisitId(null)} // hide on blur
                  autoFocus
                >
                  <option value="">—</option>
                  {visitsForDate.map(v => (
                    <option key={v.id} value={v.id}>
                      {(v.visit_code || v.id) + " — " + (v.patient?.name || "Unknown")}
                    </option>
                  ))}
                </Select>
              ) : (
                <Button
                  size="sm"
                  leftIcon={<LinkIcon />}
                  onClick={() => {
                    const date = qb.date?.slice(0, 10);
                    if (date) fetchVisitsForDate(date);
                    setLinkingVisitId(qb.id);
                  }}
                  title="Assign Visit to Quick Booking"
                >
                  Link Visit
                </Button>
              )}
            </Td>

            <Td>
              {editingStatusId === qb.id ? (
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
                  onBlur={() => setEditingStatusId(null)} // hide dropdown on blur
                  autoFocus
                >
                  {statusOptions.map(opt => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}{opt.order >= 1 ? " ★" : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<EditIcon />}
                  onClick={() => setEditingStatusId(qb.id)}
                  title="Click to change status"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#f7f7fa",
                    border: "1px solid #D3DCEE",
                    color: "#333",
                    fontWeight: 600,
                    paddingInline: "10px",
                    borderRadius: "0.5em",
                    cursor: "pointer"
                  }}
                  _hover={{
                    background: "#e3f4fd",
                    borderColor: "#90cdf4"
                  }}
                >
                  {statusObj?.label || rawStatus}
                </Button>
              )}
            </Td>

            <Td>
              {!faded && (
                <>
                  <IconButton
                    size="sm"
                    icon={<FiSave />}
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
                    Update
                  </IconButton>
                  <Button
                    size="sm"
                    colorScheme="green"
                    mr={2}
                    isDisabled={statusValue === "REJECTED" || !!visitValue}
                    onClick={() => setProcessingQuickBook(qb)}
                  >
                    Create Visit
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

      {/* Processed/Rejected, faded */}
      {nonPendingQuickBooks.length > 0 && (
        <Box mt={8}>
          <Text fontSize="md" mb={2} color="gray.400" textAlign="left" fontWeight="bold">
            Processed/Rejected QuickBookings
          </Text>
          {renderTable(nonPendingQuickBooks, true)}
        </Box>
      )}

      {/* No data message */}
      {quickbookings.length === 0 && (
        <Text>No quickbookings found 🎉</Text>
      )}
    </Box>
  );
}
