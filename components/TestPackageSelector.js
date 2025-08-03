"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Checkbox,
  Collapse,
  IconButton,
  Stack,
  Text,
  VStack,
  HStack,
  Spinner,
  Divider,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { supabase } from "../lib/supabaseClient";


export default function TestPackageSelector({
  initialSelectedTests = new Set(),
  onSelectionChange,
  loading,
}) {
  const [tests, setTests] = useState([]);
  const [packages, setPackages] = useState([]);
  const [expandedPackageIds, setExpandedPackageIds] = useState(new Set());
  const [selectedTests, setSelectedTests] = useState(new Set(initialSelectedTests));
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  // Keep internal state in sync with parent
  useEffect(() => {
    setSelectedTests(new Set(initialSelectedTests));
  }, [initialSelectedTests]);

  // Master data load
  useEffect(() => {
    async function fetchData() {
      setFetching(true);
      setError(null);
      try {
        // Fetch all active lab tests
        const { data: allTests, error: tErr } = await supabase
          .from("lab_tests")
          .select("id, lab_test_name")
          .eq("is_active", true);
        if (tErr) throw tErr;

        // Fetch all active packages with their items (test IDs)
        const { data: pkgData, error: pkgErr } = await supabase
          .from("packages")
          .select(`
            id,
            name,
            package_items!inner (item_id)
          `);
        if (pkgErr) throw pkgErr;

        const pkgProcessed = (pkgData || []).map(pkg => ({
          id: pkg.id,
          name: pkg.name,
          testIds: pkg.package_items.map(pi => pi.item_id),
        }));

        setTests(allTests || []);
        setPackages(pkgProcessed);
      } catch (err) {
        setError("Failed to load tests/packages.");
      } finally {
        setFetching(false);
      }
    }
    fetchData();
  }, []);

  // Toggle logic
  const toggleTest = testId => {
    const next = new Set(selectedTests);
    next.has(testId) ? next.delete(testId) : next.add(testId);
    setSelectedTests(next);
    onSelectionChange(next);
  };

  const togglePackage = (pkgId, pkgTestIds) => {
    const next = new Set(selectedTests);
    const allSelected = pkgTestIds.every(id => next.has(id));
    pkgTestIds.forEach(id => (allSelected ? next.delete(id) : next.add(id)));
    setSelectedTests(next);
    onSelectionChange(next);
  };

  const toggleExpand = pkgId => {
    const next = new Set(expandedPackageIds);
    next.has(pkgId) ? next.delete(pkgId) : next.add(pkgId);
    setExpandedPackageIds(next);
  };

  const pkgSelected = ids => ids.every(i => selectedTests.has(i));
  const pkgIndet = ids => {
    const cnt = ids.filter(i => selectedTests.has(i)).length;
    return cnt > 0 && cnt < ids.length;
  };

  if (fetching || loading) return <Spinner size="sm" />;
  if (error)
    return (
      <Box p={4} color="red.500" fontWeight="bold">
        {error}
      </Box>
    );

  return (
    <VStack align="stretch" spacing={4} maxH="60vh" overflowY="auto" p={1}>
      {/* Packages */}
      {packages.length > 0 && (
        <>
          <Text fontWeight="semibold">Test Packages</Text>
          {packages.map(({ id, name, testIds }) => {
            const expanded = expandedPackageIds.has(id);
            return (
              <Box key={id} borderWidth="1px" rounded="md" p={2}>
                <HStack justify="space-between">
                  <Checkbox
                    isChecked={pkgSelected(testIds)}
                    isIndeterminate={pkgIndet(testIds)}
                    onChange={() => togglePackage(id, testIds)}
                  >
                    {name}
                  </Checkbox>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    aria-label={expanded ? "Collapse" : "Expand"}
                    onClick={() => toggleExpand(id)}
                  />
                </HStack>
                <Collapse in={expanded} unmountOnExit>
                  <VStack align="start" pl={6} mt={2} spacing={1}>
                    {testIds.map(tid => {
                      const t = tests.find(x => x.id === tid);
                      return !t ? null : (
                        <Checkbox
                          key={tid}
                          isChecked={selectedTests.has(tid)}
                          onChange={() => toggleTest(tid)}
                        >
                          {t.lab_test_name}
                        </Checkbox>
                      );
                    })}
                  </VStack>
                </Collapse>
              </Box>
            );
          })}
        </>
      )}
      <Divider />
      {/* Individual lab tests (not in a package) */}
      <Text fontWeight="semibold" mt={3}>
        Individual Tests
      </Text>
      <Stack spacing={1}>
        {tests
          .filter(t => !packages.some(p => p.testIds.includes(t.id)))
          .map(t => (
            <Checkbox
              key={t.id}
              isChecked={selectedTests.has(t.id)}
              onChange={() => toggleTest(t.id)}
            >
              {t.lab_test_name}
            </Checkbox>
          ))}
      </Stack>
    </VStack>
  );
}
