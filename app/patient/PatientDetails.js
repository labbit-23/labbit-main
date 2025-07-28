"use client";

import React from "react";
import { FormControl, FormLabel, Input, Select } from "@chakra-ui/react";

export default function PatientDetails({ patientData, setPatientData, loading }) {
  return (
    <>
      <FormControl isRequired>
        <FormLabel>Name</FormLabel>
        <Input
          type="text"
          placeholder="Patient name"
          value={patientData.name}
          onChange={(e) => setPatientData({ ...patientData, name: e.target.value })}
          isDisabled={loading}
          autoComplete="name"
          aria-label="Patient name"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Date of Birth</FormLabel>
        <Input
          type="date"
          value={patientData.dob || ""}
          onChange={(e) => setPatientData({ ...patientData, dob: e.target.value })}
          isDisabled={loading}
          aria-label="Patient date of birth"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Email</FormLabel>
        <Input
          type="email"
          placeholder="Email"
          value={patientData.email || ""}
          onChange={(e) => setPatientData({ ...patientData, email: e.target.value })}
          isDisabled={loading}
          autoComplete="email"
          aria-label="Patient email"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Gender</FormLabel>
        <Select
          value={patientData.gender || ""}
          onChange={(e) => setPatientData({ ...patientData, gender: e.target.value })}
          placeholder="Select gender"
          isDisabled={loading}
          aria-label="Patient gender"
          autoComplete="sex"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
      </FormControl>
    </>
  );
}
