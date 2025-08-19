// File: components/VisitScheduleExport.js

"use client";

import React, { useState, useRef } from "react";
import {
  Box,
  Button,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  HStack
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import { FiFileExcel } from "react-icons/fi";
import html2canvas from "html2canvas";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const statusStyles = {
  booked:   { fill: "FF3498DB", font: "FFFFFFFF" }, // blue
  pending:  { fill: "FFFFA500", font: "FF000000" }, // orange
  accepted: { fill: "FF20B2AA", font: "FFFFFFFF" }, // teal
  postponed:{ fill: "FFFFFF00", font: "FF000000" }, // yellow
  rejected: { fill: "FFFF4848", font: "FFFFFFFF" }, // red
  completed:{ fill: "FF66BB6A", font: "FFFFFFFF" }, // green
  in_progress: { fill: "FF00BCD4", font: "FFFFFFFF" }, // cyan
  sample_picked: { fill: "FF26A69A", font: "FFFFFFFF" }, // green
  sample_dropped: { fill: "FFBA68C8", font: "FFFFFFFF" }, // purple
  disabled: { fill: "FFB0B0B0", font: "FF000000" }, // gray
  unassigned: { fill: "FFBDBDBD", font: "FF000000" }, // gray
  default:  { fill: "FFFFFFFF", font: "FF000000" }
};

function getStatusStyle(key) {
  return statusStyles[key] || statusStyles.default;
}

const statusColorScheme = (status) => {
  switch (status) {
    case "booked": return "blue";
    case "pending": return "orange";
    case "accepted": return "teal";
    case "postponed": return "yellow";
    case "rejected": return "red";
    case "completed": return "green";
    case "in_progress": return "cyan";
    case "sample_picked": return "green";
    case "sample_dropped": return "purple";
    case "disabled": return "gray";
    case "unassigned": return "gray";
    default: return "gray";
  }
};

export default function VisitScheduleExport({ visits }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const tableRef = useRef();

  // IMAGE EXPORT
  const downloadImage = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: "#fff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `HV_Visit_Schedule_${date}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (err) {
      alert("Error generating image: " + err.message);
    }
  };

  // EXCEL EXPORT (with colored status)
  const exportToExcel = async () => {
    const filteredVisits = visits.filter(
      (v) => v.visit_date?.slice(0, 10) === date
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Visits");

    worksheet.columns = [
      { header: "Executive", key: "executive", width: 18 },
      { header: "Date", key: "date", width: 12 },
      { header: "Time Slot", key: "timeSlot", width: 16 },
      { header: "Patient", key: "patient", width: 18 },
      { header: "Phone", key: "phone", width: 14 },
      { header: "Address", key: "address", width: 30 },
      { header: "Area", key: "area", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Visit Code", key: "visitCode", width: 14 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FF000000" } };

    filteredVisits.forEach((v) => {
      const statusKey = (v.status || "default").toLowerCase();
      const style = getStatusStyle(statusKey);

      const row = worksheet.addRow({
        executive: v.executive?.name || "Unassigned",
        date: v.visit_date?.slice(0, 10) || "-",
        timeSlot: v.time_slot?.slot_name || "-",
        patient: v.patient?.name || "-",
        phone: v.patient?.phone || "-",
        address: v.address || "-",
        area:
          v.area ||
          (v.patient?.addresses?.length
            ? v.patient.addresses[0].area || "-"
            : "-"),
        status: (v.status || "-").replace(/_/g, " ").toUpperCase(),
        visitCode: v.visit_code || "-"
      });

      // Style the Status cell
      let cell = row.getCell("status");
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: style.fill }
      };
      cell.font = {
        color: { argb: style.font },
        bold: true
      };
      cell.alignment = { horizontal: "center" };
    });

    worksheet.columns.forEach(col => {
      col.alignment = { vertical: "middle", wrapText: true };
    });

    const buf = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `Visit_Schedule_${date}.xlsx`
    );
  };

  return (
    <>
      {/* Controls */}
      <HStack mb={4} spacing={3} wrap="wrap">
        <Input
          maxW="180px"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button
          leftIcon={<DownloadIcon />}
          colorScheme="blue"
          onClick={downloadImage}
        >
          JPG
        </Button>
        <Button
          leftIcon={<DownloadIcon />}
          colorScheme="green"
          onClick={exportToExcel}
        >
          Excel
        </Button>
      </HStack>

      {/* Desktop Table View */}
      <Box
        ref={tableRef}
        p={4}
        bg="white"
        borderRadius="md"
        boxShadow="md"
        overflowX="auto"
      >
        <Table size="sm" variant="simple" whiteSpace="nowrap">
          <Thead>
            <Tr>
              <Th>Executive</Th>
              <Th>Date</Th>
              <Th>Time Slot</Th>
              <Th>Patient</Th>
              <Th>Phone</Th>
              <Th>Address</Th>
              <Th>Area</Th>
              <Th>Status</Th>
              <Th>Visit Code</Th>
            </Tr>
          </Thead>
          <Tbody>
            {visits
              .filter((v) => v.visit_date?.slice(0, 10) === date)
              .map((v) => (
                <Tr key={v.id}>
                  <Td>{v.executive?.name || "Unassigned"}</Td>
                  <Td>{v.visit_date?.slice(0, 10) || "-"}</Td>
                  <Td>{v.time_slot?.slot_name || "-"}</Td>
                  <Td>{v.patient?.name || "-"}</Td>
                  <Td>{v.patient?.phone || "-"}</Td>
                  <Td>{v.address || "-"}</Td>
                  <Td>
                    {v.area ||
                      (v.patient?.addresses?.length
                        ? v.patient.addresses[0].area || "-"
                        : "-")}
                  </Td>
                  <Td>
                    <Badge colorScheme={statusColorScheme(v.status)}>
                      {(v.status || "-").replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </Td>
                  <Td>{v.visit_code ?? "-"}</Td>
                </Tr>
              ))}
          </Tbody>
        </Table>
      </Box>
    </>
  );
}
