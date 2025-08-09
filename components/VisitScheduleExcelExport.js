//components/VisitScheduleExcelExport.js

"use client";

import React, { useState } from "react";
import { Button, Input, HStack } from "@chakra-ui/react";
import { FiFileExcel } from "react-icons/fi"; // Excel-like icon
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export default function VisitScheduleExcelExport({ visits }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const exportToExcel = async () => {
    // Filter for that date
    const filteredVisits = visits.filter(
      (v) => v.visit_date?.slice(0, 10) === date
    );

    // Create workbook & sheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Visits");

    // Header row
    worksheet.columns = [
      { header: "Executive", key: "executive", width: 20 },
      { header: "Date", key: "date", width: 12 },
      { header: "Time Slot", key: "timeSlot", width: 18 },
      { header: "Patient", key: "patient", width: 20 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Address", key: "address", width: 30 },
      { header: "Area", key: "area", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Visit Code", key: "visitCode", width: 15 },
    ];

    // Style header
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFCCCCCC" },
      };
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Add data rows
    filteredVisits.forEach((v) => {
      worksheet.addRow({
        executive: v.executive?.name || "Unassigned",
        date: v.visit_date?.slice(0, 10) || "-",
        timeSlot: v.time_slot?.slot_name || "-",
        patient: v.patient?.name || "-",
        phone: v.patient?.phone || "-",
        address: v.address || "-",
        area:
          v.area ||
          (v.patient?.addresses && v.patient.addresses.length > 0
            ? v.patient.addresses[0].area || "-"
            : "-"),
        status: (v.status || "-").replace(/_/g, " ").toUpperCase(),
        visitCode: v.visit_code || "-",
      });
    });

    // Generate and trigger download
    const buf = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `Visit_Schedule_${date}.xlsx`
    );
  };

  return (
    <HStack mb={4} spacing={3} wrap="wrap">
      <Input
        maxW="180px"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <Button
        leftIcon={<FiFileExcel />}
        colorScheme="green"
        onClick={exportToExcel}
      >
        Excel
      </Button>
    </HStack>
  );
}
