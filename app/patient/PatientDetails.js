"use client";

import React from "react";
import { FormControl, FormLabel, Input, Select } from "@chakra-ui/react";

export default function PatientDetails({ patient, setPatient, loading }) {
  return (
    <>
      <FormControl isRequired>
        <FormLabel>Name</FormLabel>
        <Input
          type="text"
          placeholder="Patient name"
          value={patient?.name ?? ""}
          onChange={(e) => setPatient({ ...patient, name: e.target.value })}
          isDisabled={loading}
          autoComplete="name"
          aria-label="Patient name"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Date of Birth</FormLabel>
        <Input
          type="date"
          value={patient?.dob ?? ""}
          onChange={(e) => setPatient({ ...patient, dob: e.target.value })}
          isDisabled={loading}
          aria-label="Patient date of birth"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Email</FormLabel>
        <Input
          type="email"
          placeholder="Email"
          value={patient?.email ?? ""}
          onChange={(e) => setPatient({ ...patient, email: e.target.value })}
          isDisabled={loading}
          autoComplete="email"
          aria-label="Patient email"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Gender</FormLabel>
        <Select
          value={patient?.gender ?? ""}
          onChange={(e) => setPatient({ ...patient, gender: e.target.value })}
          placeholder="Select gender"
          isDisabled={loading}
          aria-label="Patient gender"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
      </FormControl>
    </>
  );
}
