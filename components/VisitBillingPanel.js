"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box, Button, Divider, Flex, Slider, SliderFilledTrack, SliderThumb,
  SliderTrack, Spinner, Text,
} from "@chakra-ui/react";
import { supabase } from "../lib/supabaseClient";
import TestPackageSelector from "./TestPackageSelector";

// Derive billing lines from selected test IDs + master data.
// Fully-selected packages are shown at package price (no discount).
// Remaining individually-selected tests are shown at test price (discountable).
function deriveBilling(selectedTestIds, allTests, allPackages) {
  const selected = selectedTestIds instanceof Set ? selectedTestIds : new Set(selectedTestIds);

  const selectedPackages = allPackages.filter(
    p => p.testIds.length > 0 && p.testIds.every(id => selected.has(id))
  );
  const packageCovered = new Set(selectedPackages.flatMap(p => p.testIds));
  const individualTests = allTests.filter(t => selected.has(t.id) && !packageCovered.has(t.id));

  const packageTotal  = selectedPackages.reduce((s, p) => s + (p.price || 0), 0);
  const testSubtotal  = individualTests.reduce((s, t) => s + (t.price || 0), 0);

  return { selectedPackages, individualTests, packageTotal, testSubtotal };
}

// ── Read-only view (phlebo) ───────────────────────────────────────────────────

function ReadOnlyBill({ allTests, allPackages, selectedTestIds, muted }) {
  const { selectedPackages, individualTests, packageTotal, testSubtotal } =
    deriveBilling(selectedTestIds, allTests, allPackages);

  const hasItems = selectedPackages.length + individualTests.length > 0;
  if (!hasItems) {
    return (
      <Text fontSize="12px" color={muted || "gray.400"} fontStyle="italic">
        No tests assigned yet.
      </Text>
    );
  }

  const total = packageTotal + testSubtotal;

  return (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden" fontSize="sm">
      {selectedPackages.map(p => (
        <Flex key={p.id} px={3} py="9px" justify="space-between"
          bg="purple.50" borderBottom="1px solid" borderColor="gray.100">
          <Text fontWeight="600" color="purple.800">{p.name}</Text>
          <Text color="purple.700">₹{(p.price || 0).toLocaleString()}</Text>
        </Flex>
      ))}
      {individualTests.map(t => (
        <Flex key={t.id} px={3} py="9px" justify="space-between"
          borderBottom="1px solid" borderColor="gray.100">
          <Text>{t.lab_test_name}</Text>
          <Text>₹{(t.price || 0).toLocaleString()}</Text>
        </Flex>
      ))}
      <Flex px={3} py="10px" justify="space-between" bg="teal.50"
        borderTop="2px solid" borderColor="teal.100">
        <Text fontWeight="700">Total</Text>
        <Text fontWeight="800" color="teal.700">₹{total.toLocaleString()}</Text>
      </Flex>
    </Box>
  );
}

// ── Editable view (admin) ─────────────────────────────────────────────────────

export default function VisitBillingPanel({
  visitId,
  readOnly = false,
  muted,
  onSaved,
}) {
  const [allTests, setAllTests]       = useState([]);
  const [allPackages, setAllPackages] = useState([]);
  const [initialIds, setInitialIds]   = useState(new Set());   // stable — for TestPackageSelector
  const [selectedTestIds, setSelectedTestIds] = useState(new Set()); // live billing state
  const [discount, setDiscount]       = useState(0);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const originalIds = useRef(new Set());

  useEffect(() => {
    if (!visitId) return;
    setLoading(true);

    Promise.all([
      supabase.from("lab_tests").select("id, lab_test_name, price").eq("is_active", true),
      supabase.from("packages").select("id, name, price, package_items(item_id)"),
      supabase.from("visit_details").select("test_id").eq("visit_id", visitId),
    ]).then(([testsRes, pkgRes, selRes]) => {
      const tests = testsRes.data || [];
      const pkgs  = (pkgRes.data || []).map(p => ({
        id: p.id, name: p.name, price: p.price,
        testIds: (p.package_items || []).map(pi => pi.item_id),
      }));
      const loaded = new Set((selRes.data || []).map(d => d.test_id).filter(Boolean));

      setAllTests(tests);
      setAllPackages(pkgs);
      setInitialIds(loaded);          // passed once to TestPackageSelector
      setSelectedTestIds(loaded);
      originalIds.current = new Set(loaded);
      setLoading(false);
    });
  }, [visitId]);

  const { selectedPackages, individualTests, packageTotal, testSubtotal } =
    deriveBilling(selectedTestIds, allTests, allPackages);

  const discountAmt = Math.round(testSubtotal * discount / 100);
  const total = packageTotal + testSubtotal - discountAmt;
  const hasItems = selectedPackages.length + individualTests.length > 0;

  async function save() {
    setSaving(true);
    try {
      const orig     = originalIds.current;
      const toRemove = [...orig].filter(id => !selectedTestIds.has(id));
      const toAdd    = [...selectedTestIds].filter(id => !orig.has(id));

      if (toRemove.length) {
        const { error } = await supabase.from("visit_details").delete()
          .eq("visit_id", visitId).in("test_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("visit_details").insert(
          toAdd.map(id => ({ visit_id: visitId, test_id: id, package_id: null }))
        );
        if (error) throw error;
      }
      originalIds.current = new Set(selectedTestIds);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner size="sm" />;

  if (readOnly) {
    return (
      <ReadOnlyBill
        allTests={allTests}
        allPackages={allPackages}
        selectedTestIds={selectedTestIds}
        muted={muted}
      />
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <TestPackageSelector
        initialSelectedTests={initialIds}
        onSelectionChange={setSelectedTestIds}
      />

      {hasItems && (
        <Box borderWidth="1px" borderRadius="md" overflow="hidden" fontSize="sm">
          {selectedPackages.map(p => (
            <Flex key={p.id} px={3} py="9px" justify="space-between"
              bg="purple.50" borderBottom="1px solid" borderColor="gray.100">
              <Text fontWeight="600" color="purple.800">{p.name}</Text>
              <Text color="purple.700">₹{(p.price || 0).toLocaleString()}</Text>
            </Flex>
          ))}
          {individualTests.map(t => (
            <Flex key={t.id} px={3} py="9px" justify="space-between"
              borderBottom="1px solid" borderColor="gray.100">
              <Text>{t.lab_test_name}</Text>
              <Text>₹{(t.price || 0).toLocaleString()}</Text>
            </Flex>
          ))}

          <Divider />

          <Flex px={3} py={2} justify="space-between" bg="gray.50">
            <Text color="gray.600">Subtotal</Text>
            <Text fontWeight="600">₹{(packageTotal + testSubtotal).toLocaleString()}</Text>
          </Flex>

          {individualTests.length > 0 && (
            <Box px={3} py={2} bg="gray.50" borderTop="1px solid" borderColor="gray.100">
              <Flex justify="space-between" mb={2}>
                <Text color="gray.600">Discount on tests</Text>
                <Text fontWeight="600" color="orange.500">{discount}%</Text>
              </Flex>
              <Slider min={0} max={30} step={5} value={discount} onChange={setDiscount}
                focusThumbOnChange={false}>
                <SliderTrack bg="orange.100">
                  <SliderFilledTrack bg="orange.400" />
                </SliderTrack>
                <SliderThumb boxSize={4} />
              </Slider>
              {discountAmt > 0 && (
                <Flex justify="space-between" mt={2}>
                  <Text fontSize="xs" color="gray.500">Amount off</Text>
                  <Text fontSize="xs" color="orange.500">−₹{discountAmt.toLocaleString()}</Text>
                </Flex>
              )}
            </Box>
          )}

          <Flex px={3} py={3} justify="space-between"
            bg="teal.50" borderTop="2px solid" borderColor="teal.200">
            <Text fontWeight="700" fontSize="md">Total</Text>
            <Text fontWeight="800" fontSize="md" color="teal.700">
              ₹{total.toLocaleString()}
            </Text>
          </Flex>
        </Box>
      )}

      {selectedTestIds.size > 0 && (
        <Button colorScheme="teal" size="sm" isLoading={saving}
          loadingText="Saving…" onClick={save}>
          Save tests
        </Button>
      )}
    </Box>
  );
}
