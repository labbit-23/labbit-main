"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Select,
  Spinner,
  Stack,
  Switch,
  Text,
  useToast
} from "@chakra-ui/react";

function toTitle(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export default function UacTab({ executives = [], labs = [], themeMode = "light" }) {
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState("manager");
  const [policy, setPolicy] = useState({});
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const roleCounts = useMemo(() => {
    return (executives || []).reduce((acc, user) => {
      const role = String(user?.type || "executive").toLowerCase();
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
  }, [executives]);

  useEffect(() => {
    if (selectedLabId) return;
    const firstLabId = String(labs?.[0]?.id || "").trim();
    if (firstLabId) setSelectedLabId(firstLabId);
  }, [labs, selectedLabId]);

  const loadPolicy = async (labIdOverride = null) => {
    const targetLabId = String(labIdOverride || selectedLabId || "").trim();
    if (!targetLabId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/uac/permissions?lab_id=${encodeURIComponent(targetLabId)}`, {
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load UAC policy");
      }

      const nextPolicy = payload?.policy || {};
      setPolicy(cloneObject(nextPolicy));
      setPermissionCatalog(Array.isArray(payload?.permissionCatalog) ? payload.permissionCatalog : []);
      setSelectedLabId(String(payload?.labId || targetLabId));
      const roles = Object.keys(nextPolicy);
      if (roles.length && !roles.includes(selectedRole)) {
        setSelectedRole(roles[0]);
      }
    } catch (error) {
      toast({
        title: "Failed to load UAC policy",
        description: error?.message || "Unknown error",
        status: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedLabId) return;
    loadPolicy(selectedLabId);
  }, [selectedLabId]);

  const allRoles = useMemo(() => {
    const roles = new Set(Object.keys(policy || {}));
    return Array.from(roles);
  }, [policy]);

  const togglePermission = (role, permission) => {
    setPolicy((prev) => {
      const next = cloneObject(prev);
      if (!Array.isArray(next[role])) next[role] = [];

      const wildcardEnabled = next[role].includes("*");
      if (wildcardEnabled) return next;

      const set = new Set(next[role]);
      if (set.has(permission)) set.delete(permission);
      else set.add(permission);
      next[role] = Array.from(set);
      return next;
    });
  };

  const toggleWildcard = (role) => {
    setPolicy((prev) => {
      const next = cloneObject(prev);
      const current = Array.isArray(next[role]) ? next[role] : [];
      next[role] = current.includes("*") ? [] : ["*"];
      return next;
    });
  };

  const savePolicy = async () => {
    if (!selectedLabId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/uac/permissions?lab_id=${encodeURIComponent(selectedLabId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save UAC policy");
      }

      setPolicy(cloneObject(payload?.policy || {}));
      setPermissionCatalog(Array.isArray(payload?.permissionCatalog) ? payload.permissionCatalog : permissionCatalog);
      setSelectedLabId(String(payload?.labId || selectedLabId));
      toast({ title: "UAC policy saved", status: "success" });
    } catch (error) {
      toast({
        title: "Failed to save UAC policy",
        description: error?.message || "Unknown error",
        status: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const panelBg = themeMode === "dark" ? "whiteAlpha.100" : "white";
  const panelBorder = themeMode === "dark" ? "whiteAlpha.300" : "gray.200";

  if (!selectedLabId) {
    return (
      <Box borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
        <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.600"}>
          No lab is available for UAC configuration.
        </Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Flex minH="220px" align="center" justify="center">
        <Spinner />
      </Flex>
    );
  }

  const selectedPermissions = Array.isArray(policy?.[selectedRole]) ? policy[selectedRole] : [];
  const hasWildcard = selectedPermissions.includes("*");

  return (
    <Stack spacing={5}>
      <Box borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
        <Flex align={{ base: "stretch", md: "center" }} justify="space-between" direction={{ base: "column", md: "row" }} gap={3}>
          <Box>
            <Heading size="md" mb={1}>User Access Control</Heading>
            <Text fontSize="sm" color={themeMode === "dark" ? "whiteAlpha.800" : "gray.600"}>
              Permissions are stored in DB and enforced by API checks.
            </Text>
          </Box>
          <HStack>
            <Select
              size="sm"
              maxW="240px"
              value={selectedLabId}
              onChange={(event) => setSelectedLabId(event.target.value)}
            >
              {(labs || []).map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name || lab.id}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => loadPolicy()} isDisabled={saving}>
              Reload
            </Button>
            <Button size="sm" colorScheme="teal" onClick={savePolicy} isLoading={saving}>
              Save
            </Button>
          </HStack>
        </Flex>
      </Box>

      <Grid templateColumns={{ base: "1fr", lg: "1.1fr 1fr" }} gap={4}>
        <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
          <HStack justify="space-between" mb={3}>
            <Heading size="sm">Roles</Heading>
            <Select size="sm" maxW="220px" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
              {allRoles.map((role) => (
                <option key={role} value={role}>{toTitle(role)}</option>
              ))}
            </Select>
          </HStack>

          <Stack spacing={2}>
            {allRoles.map((role) => (
              <HStack key={role} justify="space-between">
                <Text fontSize="sm" fontWeight={role === selectedRole ? "700" : "500"}>{toTitle(role)}</Text>
                <Badge colorScheme={role === selectedRole ? "teal" : "gray"}>
                  {roleCounts[role] || 0} users
                </Badge>
              </HStack>
            ))}
          </Stack>
        </GridItem>

        <GridItem borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
          <Heading size="sm" mb={3}>Role Mode</Heading>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm">Full Access (*)</Text>
            <Switch size="sm" colorScheme="teal" isChecked={hasWildcard} onChange={() => toggleWildcard(selectedRole)} />
          </HStack>
          <Text fontSize="xs" color={themeMode === "dark" ? "whiteAlpha.700" : "gray.500"}>
            When enabled, this role bypasses granular permission toggles.
          </Text>
        </GridItem>
      </Grid>

      <Box borderWidth="1px" borderColor={panelBorder} bg={panelBg} borderRadius="lg" p={4}>
        <Heading size="sm" mb={3}>
          Permission Matrix: {toTitle(selectedRole)}
        </Heading>
        <Stack spacing={3}>
          {permissionCatalog.map((group) => (
            <Box key={group.group} borderWidth="1px" borderColor={panelBorder} borderRadius="md" p={3}>
              <Text fontWeight="600" fontSize="sm" mb={2}>{group.group}</Text>
              <Flex wrap="wrap" gap={4}>
                {(group.permissions || []).map((permission) => {
                  const enabled = selectedPermissions.includes(permission);
                  return (
                    <HStack key={permission} spacing={2}>
                      <Switch
                        size="sm"
                        colorScheme="teal"
                        isChecked={enabled}
                        onChange={() => togglePermission(selectedRole, permission)}
                        isDisabled={hasWildcard}
                      />
                      <Text fontSize="sm">{permission}</Text>
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
