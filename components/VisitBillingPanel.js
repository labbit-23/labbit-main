"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Badge, Box, Button, Checkbox, Collapse, Divider, Flex, HStack, Input,
  InputGroup, InputLeftElement, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Slider, SliderFilledTrack, SliderThumb, SliderTrack,
  Spinner, Text, useDisclosure, useToast, IconButton,
} from "@chakra-ui/react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// ── billing math ──────────────────────────────────────────────────────────────
function deriveBilling(selectedIds, allTests, allPackages) {
  const sel = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const selPkgs = allPackages.filter(
    p => p.testIds.length > 0 && p.testIds.every(id => sel.has(id))
  );
  const pkgCovered = new Set(selPkgs.flatMap(p => p.testIds));
  const indiv = allTests.filter(t => sel.has(t.id) && !pkgCovered.has(t.id));
  return {
    selPkgs,
    indiv,
    pkgTotal: selPkgs.reduce((s, p) => s + (p.price || 0), 0),
    testSub:  indiv.reduce((s, t) => s + (t.price || 0), 0),
  };
}

// ── read-only compact bill ────────────────────────────────────────────────────
function ReadOnlyBill({ allTests, allPackages, selectedTestIds, muted }) {
  const { selPkgs, indiv, pkgTotal, testSub } = deriveBilling(selectedTestIds, allTests, allPackages);
  if (selPkgs.length + indiv.length === 0) {
    return (
      <Text fontSize="12px" color={muted || "gray.400"} fontStyle="italic">
        No tests assigned yet.
      </Text>
    );
  }
  const total = pkgTotal + testSub;
  return (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden" fontSize="sm">
      {selPkgs.map(p => (
        <Flex key={p.id} px={3} py="8px" justify="space-between"
          bg="purple.50" borderBottom="1px solid" borderColor="gray.100">
          <Text fontWeight="600" color="purple.800">{p.name}</Text>
          <Text color="purple.700">₹{(p.price || 0).toLocaleString()}</Text>
        </Flex>
      ))}
      {indiv.map(t => (
        <Flex key={t.id} px={3} py="8px" justify="space-between"
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

// ── test row ──────────────────────────────────────────────────────────────────
function TestRow({ test, checked, onChange }) {
  return (
    <Flex justify="space-between" align="center" py="6px"
      borderBottom="1px solid" borderColor="gray.100" _last={{ borderBottom: 0 }}>
      <Checkbox isChecked={checked} onChange={onChange} flex="1" mr={2}>
        <Text fontSize="sm" lineHeight="1.3">{test.lab_test_name}
          {test.internal_code && (
            <Text as="span" fontSize="11px" color="gray.400" ml={1}>({test.internal_code})</Text>
          )}
        </Text>
      </Checkbox>
      <Text fontSize="sm" fontWeight="600" color="gray.700" flexShrink={0}>
        {test.price != null ? `₹${Number(test.price).toLocaleString()}` : "—"}
      </Text>
    </Flex>
  );
}

// ── main panel ────────────────────────────────────────────────────────────────
const VisitBillingPanel = forwardRef(function VisitBillingPanel({
  visitId,
  patientId,
  readOnly = false,
  muted,
  onSaved,
}, ref) {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [allTests, setAllTests]         = useState([]);
  const [allPackages, setAllPackages]   = useState([]);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [search, setSearch]             = useState("");
  const [showAll, setShowAll]           = useState(false);
  const [discount, setDiscount]         = useState(0);
  const [collFee, setCollFee]           = useState(200);
  const [expandedPkgs, setExpandedPkgs] = useState(new Set());
  const originalIds = useRef(new Set());

  // ── load master data + existing selection ─────────────────────────────────
  useEffect(() => {
    if (!visitId) return;
    setLoading(true);

    Promise.all([
      supabase.from("lab_tests")
        .select("id, lab_test_name, price, internal_code, display_order, is_most_common, department")
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("lab_test_name", { ascending: true }),
      supabase.from("packages")
        .select("id, name, price, package_items(item_id)"),
      supabase.from("visit_details")
        .select("test_id")
        .eq("visit_id", visitId),
    ]).then(([testsRes, pkgRes, selRes]) => {
      let tests = testsRes.error ? [] : (testsRes.data || []).filter(t => {
        const dept = String(t.department || "").toLowerCase();
        return !dept.includes("radiol");
      });
      if (testsRes.error) {
        supabase.from("lab_tests")
          .select("id, lab_test_name, price, internal_code")
          .eq("is_active", true)
          .order("lab_test_name", { ascending: true })
          .then(({ data }) => setAllTests(data || []));
      } else {
        setAllTests(tests);
      }

      const pkgs = (pkgRes.data || [])
        .map(p => ({
          id: p.id, name: p.name, price: p.price,
          testIds: (p.package_items || []).map(pi => pi.item_id).filter(Boolean),
        }))
        .filter(p => p.testIds.length > 0);
      setAllPackages(pkgs);

      const loaded = new Set((selRes.data || []).map(d => d.test_id).filter(Boolean));
      setSelectedIds(loaded);
      originalIds.current = new Set(loaded);

      // Restore saved discount for this patient
      if (patientId) {
        const saved = localStorage.getItem(`labit-discount-${patientId}`);
        if (saved !== null) setDiscount(Number(saved) || 0);
      }

      setLoading(false);
    });
  }, [visitId, patientId]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const toggle = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      adding ? next.add(id) : next.delete(id);
      if (adding && search) setSearch("");
      return next;
    });
  };

  const removeTest = id => {
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const removePkg = pkgTestIds => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      pkgTestIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const togglePkg = pkgTestIds => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const all = pkgTestIds.every(id => next.has(id));
      pkgTestIds.forEach(id => all ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const toggleExpand = id => {
    setExpandedPkgs(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    });
  };

  const pkgAllSelected  = ids => ids.length > 0 && ids.every(id => selectedIds.has(id));
  const pkgIndeterminate = ids => { const n = ids.filter(id => selectedIds.has(id)).length; return n > 0 && n < ids.length; };

  // ── exposed: open with auto-detected notes (bill icon only) ───────────────
  const openWithNotes = useCallback((text) => {
    if (!text?.trim()) { toast({ title: "Test list is empty", status: "warning" }); return; }
    const tokens = text.split(/[,;\n\r\/\|]+/).map(t => t.trim().toUpperCase()).filter(t => t.length >= 2);
    const matched = new Set();
    for (const test of allTests) {
      const code = (test.internal_code || "").toUpperCase();
      const name = (test.lab_test_name || "").toUpperCase();
      if (tokens.some(tok => code === tok || name === tok || (tok.length >= 4 && name.includes(tok)))) {
        matched.add(test.id);
      }
    }
    if (!matched.size) { toast({ title: "No matching tests found", status: "warning" }); return; }
    setSelectedIds(prev => new Set([...prev, ...matched]));
    onOpen();
  }, [allTests, toast, onOpen]);

  useImperativeHandle(ref, () => ({ openWithNotes }), [openWithNotes]);

  // ── visible tests ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filteredTests = q
    ? allTests.filter(t =>
        t.lab_test_name.toLowerCase().includes(q) ||
        String(t.internal_code || "").toLowerCase().includes(q)
      )
    : allTests;

  const commonTests  = filteredTests.filter(t => t.is_most_common);
  const visibleTests = q || showAll
    ? filteredTests
    : (commonTests.length > 0 ? commonTests : filteredTests.slice(0, 30));

  const hiddenSelected = [...selectedIds]
    .filter(id => !visibleTests.some(t => t.id === id) && !allPackages.some(p => p.testIds.includes(id)))
    .map(id => allTests.find(t => t.id === id)).filter(Boolean);

  // ── billing ────────────────────────────────────────────────────────────────
  const { selPkgs, indiv, pkgTotal, testSub } = deriveBilling(selectedIds, allTests, allPackages);
  const discountAmt = Math.round(testSub * discount / 100);
  const total = pkgTotal + testSub - discountAmt + collFee;
  const hasItems = selPkgs.length + indiv.length > 0;

  // ── save ───────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true);
    try {
      const orig     = originalIds.current;
      const toRemove = [...orig].filter(id => !selectedIds.has(id));
      const toAdd    = [...selectedIds].filter(id => !orig.has(id));
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
      originalIds.current = new Set(selectedIds);
      // Persist discount for this patient
      if (patientId && discount > 0) {
        localStorage.setItem(`labit-discount-${patientId}`, String(discount));
      }
      toast({ title: "Estimate saved", status: "success", duration: 2000 });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({ title: "Save failed", description: err.message, status: "error" });
    } finally {
      setSaving(false);
    }
  }

  // ── read-only view ─────────────────────────────────────────────────────────
  if (loading) return <Spinner size="sm" />;

  if (readOnly) {
    return (
      <ReadOnlyBill allTests={allTests} allPackages={allPackages}
        selectedTestIds={selectedIds} muted={muted} />
    );
  }

  // ── edit trigger ───────────────────────────────────────────────────────────
  const selCount = selectedIds.size;
  return (
    <>
      <Flex gap={2} align="center" wrap="wrap">
        <Button size="sm" colorScheme="teal" onClick={onOpen}>
          {selCount > 0 ? `Create Estimate (${selCount} test${selCount !== 1 ? "s" : ""})` : "Create Estimate"}
        </Button>
        {hasItems && (
          <Text fontSize="sm" color="gray.600">
            Est. ₹{(pkgTotal + testSub).toLocaleString()} + visit charges
          </Text>
        )}
      </Flex>

      {/* ── estimate modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={isOpen} onClose={onClose} size="5xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxH="90vh">
          <ModalHeader fontSize="md" pb={2}>Visit Estimate</ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={2} pb={0}>
            <Flex gap={5} direction={{ base: "column", md: "row" }} h="full">

              {/* ── left: test picker ──────────────────────────────────────── */}
              <Box flex="1" minW={0}>
                <InputGroup mb={3} size="sm">
                  <InputLeftElement pointerEvents="none">
                    <Search size={14} color="gray" />
                  </InputLeftElement>
                  <Input pl={8} placeholder="Search tests by name or code…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </InputGroup>

                <Box maxH={{ base: "300px", md: "440px" }} overflowY="auto" pr={1}>

                  {/* Packages */}
                  {!q && allPackages.length > 0 && (
                    <Box mb={3}>
                      <Text fontSize="11px" fontWeight="700" color="purple.600"
                        textTransform="uppercase" mb={1} letterSpacing="0.05em">Packages</Text>
                      {allPackages.map(pkg => {
                        const expanded = expandedPkgs.has(pkg.id);
                        return (
                          <Box key={pkg.id} mb={1} borderWidth="1px" borderRadius="md"
                            borderColor="purple.100" overflow="hidden">
                            <Flex align="center" px={3} py="8px" bg="purple.50" gap={2}>
                              <Checkbox flex="1"
                                isChecked={pkgAllSelected(pkg.testIds)}
                                isIndeterminate={pkgIndeterminate(pkg.testIds)}
                                onChange={() => togglePkg(pkg.testIds)}
                                colorScheme="purple">
                                <Text fontSize="sm" fontWeight="600">{pkg.name}</Text>
                              </Checkbox>
                              <Text fontSize="sm" fontWeight="700" color="purple.700" flexShrink={0}>
                                {pkg.price != null ? `₹${Number(pkg.price).toLocaleString()}` : "—"}
                              </Text>
                              <IconButton icon={expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                size="xs" variant="ghost" aria-label="Toggle"
                                onClick={() => toggleExpand(pkg.id)} />
                            </Flex>
                            <Collapse in={expanded} unmountOnExit>
                              <Box px={4} py={2} bg="white">
                                {pkg.testIds.map(tid => {
                                  const t = allTests.find(x => x.id === tid);
                                  return !t ? null : (
                                    <Text key={tid} fontSize="xs" color="gray.600" py="2px">• {t.lab_test_name}</Text>
                                  );
                                })}
                              </Box>
                            </Collapse>
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  {/* Already selected but not in visible list */}
                  {!q && hiddenSelected.length > 0 && (
                    <Box mb={3}>
                      <Text fontSize="11px" fontWeight="700" color="teal.600"
                        textTransform="uppercase" mb={1} letterSpacing="0.05em">Also Selected</Text>
                      {hiddenSelected.map(t => (
                        <TestRow key={t.id} test={t} checked={true} onChange={() => toggle(t.id)} />
                      ))}
                    </Box>
                  )}

                  {/* Tests */}
                  <Box>
                    <Text fontSize="11px" fontWeight="700" color="gray.500"
                      textTransform="uppercase" mb={1} letterSpacing="0.05em">
                      {q ? `Results (${visibleTests.length})` : (showAll ? "All Tests" : "Common Tests")}
                    </Text>
                    {visibleTests.map(t => (
                      <TestRow key={t.id} test={t} checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} />
                    ))}
                    {!q && !showAll && allTests.length > visibleTests.length && (
                      <Button size="xs" variant="link" colorScheme="gray" mt={2}
                        onClick={() => setShowAll(true)}>
                        Show all {allTests.length} tests ↓
                      </Button>
                    )}
                  </Box>
                </Box>
              </Box>

              {/* ── right: bill ────────────────────────────────────────────── */}
              <Box w={{ base: "full", md: "260px" }} flexShrink={0}>
                <Text fontSize="11px" fontWeight="700" color="gray.500"
                  textTransform="uppercase" mb={2} letterSpacing="0.05em">Bill</Text>

                {!hasItems ? (
                  <Text fontSize="sm" color="gray.400" fontStyle="italic" mb={3}>Nothing selected yet.</Text>
                ) : (
                  <Box borderWidth="1px" borderRadius="md" overflow="hidden" fontSize="sm" mb={3}>
                    {selPkgs.map(p => (
                      <Flex key={p.id} px={2} py="7px" align="center" gap={1}
                        bg="purple.50" borderBottom="1px solid" borderColor="gray.100">
                        <Text fontWeight="600" color="purple.800" flex="1" noOfLines={1}>{p.name}</Text>
                        <Text color="purple.700" flexShrink={0} fontSize="xs">₹{(p.price || 0).toLocaleString()}</Text>
                        <IconButton icon={<X size={12} />} size="xs" variant="ghost"
                          colorScheme="red" aria-label="Remove"
                          onClick={() => removePkg(p.testIds)} />
                      </Flex>
                    ))}
                    {indiv.map(t => (
                      <Flex key={t.id} px={2} py="7px" align="center" gap={1}
                        borderBottom="1px solid" borderColor="gray.100">
                        <Text flex="1" noOfLines={1}>{t.lab_test_name}</Text>
                        <Text flexShrink={0} fontSize="xs">₹{(t.price || 0).toLocaleString()}</Text>
                        <IconButton icon={<X size={12} />} size="xs" variant="ghost"
                          colorScheme="red" aria-label="Remove"
                          onClick={() => removeTest(t.id)} />
                      </Flex>
                    ))}
                  </Box>
                )}

                {/* Visit charges */}
                <Box mb={3}>
                  <Flex justify="space-between" mb={1}>
                    <Text fontSize="xs" color="gray.600">Visit Charges</Text>
                    <Text fontSize="xs" fontWeight="700">₹{collFee}</Text>
                  </Flex>
                  <Slider min={200} max={500} step={50} value={collFee} onChange={setCollFee}
                    focusThumbOnChange={false}>
                    <SliderTrack bg="blue.100"><SliderFilledTrack bg="blue.400" /></SliderTrack>
                    <SliderThumb boxSize={4} bg="gray.300" borderColor="gray.400" />
                  </Slider>
                </Box>

                {/* Discount on tests */}
                {indiv.length > 0 && (
                  <Box mb={3}>
                    <Flex justify="space-between" mb={1}>
                      <Text fontSize="xs" color="gray.600">Test Discount</Text>
                      <Text fontSize="xs" fontWeight="700" color="orange.500">{discount}%</Text>
                    </Flex>
                    <Slider min={0} max={30} step={5} value={discount} onChange={setDiscount}
                      focusThumbOnChange={false}>
                      <SliderTrack bg="orange.100"><SliderFilledTrack bg="orange.400" /></SliderTrack>
                      <SliderThumb boxSize={4} bg="gray.300" borderColor="gray.400" />
                    </Slider>
                    {discountAmt > 0 && (
                      <Text fontSize="xs" color="orange.500" mt={1}>−₹{discountAmt.toLocaleString()} off tests</Text>
                    )}
                  </Box>
                )}

                <Divider my={2} />

                {(hasItems || collFee > 0) && (
                  <Box fontSize="sm">
                    {hasItems && (
                      <Flex justify="space-between" mb={1} color="gray.600">
                        <Text>Gross</Text>
                        <Text>₹{(pkgTotal + testSub).toLocaleString()}</Text>
                      </Flex>
                    )}
                    {discountAmt > 0 && (
                      <Flex justify="space-between" mb={1} color="orange.500">
                        <Text>Discount ({discount}%)</Text>
                        <Text>−₹{discountAmt.toLocaleString()}</Text>
                      </Flex>
                    )}
                    {collFee > 0 && (
                      <Flex justify="space-between" mb={1} color="gray.600">
                        <Text>Visit Charges</Text>
                        <Text>₹{collFee.toLocaleString()}</Text>
                      </Flex>
                    )}
                    <Flex justify="space-between" fontWeight="800" fontSize="md">
                      <Text>Total</Text>
                      <Text color="teal.700">₹{total.toLocaleString()}</Text>
                    </Flex>
                  </Box>
                )}
              </Box>
            </Flex>
          </ModalBody>

          <ModalFooter gap={2} pt={3}>
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button colorScheme="teal" size="sm" isLoading={saving}
              loadingText="Saving…" onClick={save}>
              Save Estimate
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
});

export default VisitBillingPanel;
