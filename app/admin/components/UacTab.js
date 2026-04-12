"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Select,
  Stack,
  Switch,
  Text
} from "@chakra-ui/react";

const PERMISSIONS = ["read", "create", "update", "delete", "approve", "export"];
const MODULES = [
  "visits",
  "quickbookings",
  "patients",
  "whatsapp_sessions",
  "reports_dispatch",
  "executives",
  "settings"
];

const ROLE_PRESETS = {
  director: {
    visits: ["read", "create", "update", "delete", "approve", "export"],
    quickbookings: ["read", "create", "update", "delete", "approve", "export"],
    patients: ["read", "create", "update", "export"],
    whatsapp_sessions: ["read", "update", "approve", "export"],
    reports_dispatch: ["read", "create", "update", "approve", "export"],
    executives: ["read", "create", "update", "delete"],
    settings: ["read", "update"]
  },
  admin: {
    visits: ["read", "create", "update", "approve", "export"],
    quickbookings: ["read", "create", "update", "approve", "export"],
    patients: ["read", "create", "update", "export"],
    whatsapp_sessions: ["read", "update", "approve", "export"],
    reports_dispatch: ["read", "create", "update", "approve", "export"],
    executives: ["read", "create", "update"],
    settings: ["read"]
  },
  manager: {
    visits: ["read", "create", "update", "approve", "export"],
    quickbookings: ["read", "update", "approve", "export"],
    patients: ["read", "update", "export"],
    whatsapp_sessions: ["read", "update", "approve", "export"],
    reports_dispatch: ["read", "update", "approve", "export"],
    executives: ["read"],
    settings: ["read"]
  },
  executive: {
    visits: ["read", "update"],
    quickbookings: ["read", "update"],
    patients: ["read", "update"],
    whatsapp_sessions: ["read", "update"],
    reports_dispatch: ["read", "update"],
    executives: ["read"],
    settings: []
  },
  viewer: {
    visits: ["read"],
    quickbookings: ["read"],
    patients: ["read"],
    whatsapp_sessions: ["read"],
    reports_dispatch: ["read"],
    executives: ["read"],
    settings: []
  }
};

function toTitle(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function createDraftUsers(executives = []) {
  return (executives || []).slice(0, 12).map((row, idx) => ({
    id: row.id || `draft-${idx}`,
    name: row.name || "Unnamed",
    phone: row.phone || "",
    role: String(row.type || "executive").toLowerCase()
  }));
}

export default function UacTab({ executives = [], themeMode = "light" }) {
  const [selectedRole, setSelectedRole] = useState("manager");
  const [draftUsers, setDraftUsers] = useState(() => createDraftUsers(executives));
  const [newUser, setNewUser] = useState({ name: "", phone: "", role: "executive" });
  const [matrix, setMatrix] = useState(() => JSON.parse(JSON.stringify(ROLE_PRESETS)));

  const roleCounts = useMemo(() => {
    return draftUsers.reduce((acc, user) => {
      const role = String(user.role || "executive").toLowerCase();
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
  }, [draftUsers]);

  const togglePermission = (role, moduleName, perm) => {
    setMatrix((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const set = new Set(next?.[role]?.[moduleName] || []);
      if (set.has(perm)) set.delete(perm);
      else set.add(perm);
      next[role][moduleName] = Array.from(set);
      return next;
    });
  };

  const addDraftUser = () => {
    const name = String(newUser.name || "").trim();
    const phone = String(newUser.phone || "").trim();
    if (!name) return;
    setDraftUsers((prev) => [
      {
        id: `draft-${Date.now()}`,
        name,
        phone,
        role: String(newUser.role || "executive").toLowerCase()
      },
      ...prev
    ]);
    setNewUser({ name: "", phone: "", role: "executive" });
  };

  const panelBg = themeMode === "dark" ? "whiteAlpha.100" : "white";
  const panelBorder = themeMode === "dark" ? "whiteAlpha.300" : "gray.200";

  return (
    <Stack spacing={5}>
      <Box borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
        <Heading size="md" mb={2}>User Access Control (Frontend Draft)</Heading>
        <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.600"}>
          This tab is UI-only for now. Changes are not persisted and no API enforcement is wired yet.
        </Text>
      </Box>

      <Grid templateColumns={{ base: "1fr", lg: "1.1fr 1fr" }} gap={4}>
        <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
          <HStack justify="space-between" mb={3}>
            <Heading size="sm">Roles</Heading>
            <Select size="sm" maxW="220px" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              {Object.keys(matrix).map((role) => (
                <option key={role} value={role}>{toTitle(role)}</option>
              ))}
            </Select>
          </HStack>

          <Stack spacing={2}>
            {Object.keys(matrix).map((role) => (
              <HStack key={role} justify="space-between">
                <Text fontSize="sm" fontWeight={role === selectedRole ? "700" : "500"}>{toTitle(role)}</Text>
                <Badge colorScheme={role === selectedRole ? "teal" : "gray"}>{roleCounts[role] || 0} users</Badge>
              </HStack>
            ))}
          </Stack>
        </GridItem>

        <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
          <Heading size="sm" mb={3}>Add Draft User Type Assignment</Heading>
          <Stack spacing={3}>
            <FormControl>
              <FormLabel fontSize="sm">Name</FormLabel>
              <Input size="sm" value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Phone</FormLabel>
              <Input size="sm" value={newUser.phone} onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Role</FormLabel>
              <Select size="sm" value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}>
                {Object.keys(matrix).map((role) => (
                  <option key={role} value={role}>{toTitle(role)}</option>
                ))}
              </Select>
            </FormControl>
            <Button size="sm" colorScheme="teal" onClick={addDraftUser}>Add Draft User</Button>
          </Stack>
        </GridItem>
      </Grid>

      <Box borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
        <Heading size="sm" mb={3}>
          Permission Matrix: {toTitle(selectedRole)}
        </Heading>
        <Stack spacing={3}>
          {MODULES.map((moduleName) => (
            <Box key={moduleName} borderWidth="1px" borderColor={panelBorder} borderRadius="md" p={3}>
              <Text fontWeight="600" fontSize="sm" mb={2}>{toTitle(moduleName)}</Text>
              <Flex wrap="wrap" gap={4}>
                {PERMISSIONS.map((perm) => {
                  const enabled = (matrix?.[selectedRole]?.[moduleName] || []).includes(perm);
                  return (
                    <HStack key={perm} spacing={2}>
                      <Switch
                        size="sm"
                        colorScheme="teal"
                        isChecked={enabled}
                        onChange={() => togglePermission(selectedRole, moduleName, perm)}
                      />
                      <Text fontSize="sm">{toTitle(perm)}</Text>
                    </HStack>
                  );
                })}
              </Flex>
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
