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
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function TestPackageSelector({ initialSelectedTests = new Set(), onSelectionChange }) {
  const [tests, setTests] = useState([]);
  const [packages, setPackages] = useState([]);
  const [expandedPackageIds, setExpandedPackageIds] = useState(new Set());
  const [selectedTests, setSelectedTests] = useState(new Set(initialSelectedTests));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync selectedTests with any changes from props
  useEffect(() => {
    setSelectedTests(new Set(initialSelectedTests));
  }, [initialSelectedTests]);

  // Fetch tests and packages from Supabase
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch all tests
        const { data: testsData, error: testErr } = await supabase.from("tests").select("id, name");
        if (testErr) throw testErr;

        // Fetch packages with their tests (adjust 'package_tests' and schema as needed)
        const { data: packagesData, error: pkgErr } = await supabase
          .from("packages")
          .select(`
            id,
            name,
            package_tests!inner (
              test_id,
              test:tests(id, name)
            )
          `);

        if (pkgErr) throw pkgErr;

        // Process packages with nested tests flattened properly
        const packagesProcessed = (packagesData || []).map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          tests: (pkg.package_tests || []).map((pt) => pt.test),
        }));

        setTests(testsData || []);
        setPackages(packagesProcessed);
      } catch (err) {
        console.error("Failed loading tests/packages:", err);
        setError("Failed to load tests/packages.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Toggle individual test selection
  const toggleTest = (testId) => {
    const newSet = new Set(selectedTests);
    if (newSet.has(testId)) newSet.delete(testId);
    else newSet.add(testId);
    setSelectedTests(newSet);
    onSelectionChange(newSet);
  };

  // Toggle full package test selections
  const togglePackage = (packageId, packageTestIds) => {
    const newSet = new Set(selectedTests);
    const allSelected = packageTestIds.every((id) => newSet.has(id));

    if (allSelected) {
      // Deselect all tests in package
      packageTestIds.forEach((id) => newSet.delete(id));
    } else {
      // Select all tests in package
      packageTestIds.forEach((id) => newSet.add(id));
    }
    setSelectedTests(newSet);
    onSelectionChange(newSet);
  };

  // Toggle expand/collapse of package tests list
  const togglePackageExpand = (packageId) => {
    const newSet = new Set(expandedPackageIds);
    if (newSet.has(packageId)) newSet.delete(packageId);
    else newSet.add(packageId);
    setExpandedPackageIds(newSet);
  };

  // Check if all tests in package are selected
  const isPackageSelected = (packageTestIds) =>
    packageTestIds.length > 0 && packageTestIds.every((id) => selectedTests.has(id));

  // Check if some (but not all) tests in package are selected (indeterminate)
  const isPackageIndeterminate = (packageTestIds) => {
    const checkedCount = packageTestIds.filter((id) => selectedTests.has(id)).length;
    return checkedCount > 0 && checkedCount < packageTestIds.length;
  };

  if (loading) return <Spinner size="sm" />;

  if (error)
    return (
      <Box p={4} color="red.500" fontWeight="bold">
        {error}
      </Box>
    );

  return (
    <VStack align="stretch" spacing={4} maxH="60vh" overflowY="auto" p={1}>
      {/* Packages Section */}
      {packages.length > 0 && (
        <>
          <Text fontWeight="semibold" mb={2}>
            Test Packages
          </Text>
          {packages.map(({ id, name, tests: pkgTests }) => {
            const pkgTestIds = pkgTests.map((t) => t.id);
            const packageSelected = isPackageSelected(pkgTestIds);
            const packageIndeterminate = isPackageIndeterminate(pkgTestIds);
            const expanded = expandedPackageIds.has(id);

            return (
              <Box key={id} borderWidth="1px" rounded="md" p={2}>
                <HStack justify="space-between" align="center">
                  <Checkbox
                    isChecked={packageSelected}
                    isIndeterminate={packageIndeterminate}
                    onChange={() => togglePackage(id, pkgTestIds)}
                    aria-label={`Select package ${name}`}
                    isDisabled={loading}
                  >
                    {name}
                  </Checkbox>
                  <IconButton
                    icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    size="sm"
                    variant="ghost"
                    aria-label={expanded ? "Collapse package" : "Expand package"}
                    onClick={() => togglePackageExpand(id)}
                    isDisabled={loading}
                  />
                </HStack>
                <Collapse in={expanded} unmountOnExit>
                  <Stack pl={6} mt={2} spacing={1}>
                    {pkgTests.map(({ id: testId, name: testName }) => (
                      <Checkbox
                        key={testId}
                        isChecked={selectedTests.has(testId)}
                        onChange={() => toggleTest(testId)}
                        aria-label={`Select test ${testName}`}
                        isDisabled={loading}
                      >
                        {testName}
                      </Checkbox>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </>
      )}

      <Divider />
      {/* Individual Tests Section */}
      <Text fontWeight="semibold" mb={2} mt={3}>
        Individual Tests
      </Text>
      <Stack spacing={1}>
        {tests
          .filter(
            (t) =>
              !packages.some((pkg) => pkg.tests.some((pt) => pt.id === t.id)) // exclude tests included in packages
          )
          .map(({ id, name }) => (
            <Checkbox
              key={id}
              isChecked={selectedTests.has(id)}
              onChange={() => toggleTest(id)}
              aria-label={`Select test ${name}`}
              isDisabled={loading}
            >
              {name}
            </Checkbox>
          ))}
      </Stack>
    </VStack>
  );
}
