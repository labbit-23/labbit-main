// app/components/CompareModal.js
"use client";
import React, { useRef } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalCloseButton, ModalBody, Table, Thead, Tbody,
  Tr, Th, Td, Box, Flex, Heading, Text, Button, Image
} from "@chakra-ui/react";
import { CheckIcon, DownloadIcon } from "@chakra-ui/icons";
import { testCategoryMap, categoryIconMap, globalNotes } from "@/lib/packages";
import html2canvas from "html2canvas";

const SDRC_LOGO = "/SDRC_logo.png";

function getRelevantNotes(variantOrVariants, globalNotes) {
  // Accepts a single "variant" array (for singleVariant) or array of arrays (for compare)
  const tests = Array.isArray(variantOrVariants)
    ? variantOrVariants.flatMap(v => v.tests)
    : variantOrVariants.tests;

  // Lowercase test names for matching
  const testSet = new Set(tests.map(t => t.toLowerCase()));

  // Return notes where a token (Lipid Profile, etc.) matches a test name
  return globalNotes.filter(note =>
    Array.from(testSet).some(test =>
      note.toLowerCase().includes(test.split(' ')[0]) // match the first word like "lipid" in "lipid profile"
    )
  );
}


export default function CompareModal({ isOpen, onClose, compareMap = {}, singleVariant = null }) {
  const variants = singleVariant ? [singleVariant] : Object.values(compareMap);
  const tableRef = useRef(null);
  const relevantNotes = singleVariant
    ? getRelevantNotes(singleVariant.variant, globalNotes)
    : getRelevantNotes(variants.map(v => v.variant), globalNotes);

  if (variants.length === 0) return null;

  // Export with button hidden
  const downloadImage = async () => {
    if (!tableRef.current) return;
    const btn = tableRef.current.querySelector('.no-print');
    const scrollBox = tableRef.current.querySelector('.scroll-capture'); // Add this CSS class to your scrollable Box

      // Store old styles and remove height restriction and scrolling
    const oldMaxH = scrollBox?.style.maxHeight;
    const oldOverflowY = scrollBox?.style.overflowY;

    if (scrollBox) {
      scrollBox.style.maxHeight = "none";
      scrollBox.style.overflowY = "visible";
    }

    if (btn) btn.style.visibility = 'hidden';
    try {
      const canvas = await html2canvas(tableRef.current, { backgroundColor: "#fff", scale: 2 });
      const link = document.createElement("a");
      
      // Prepare dynamic filename
      let filename = `Labbit-comparison-${new Date().toISOString().slice(0,10)}.jpg`;

      if (singleVariant) {
        // sanitize package name to avoid problematic chars in filename
        const sanitizedName = singleVariant.pkgName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        filename = `Labbit-package-${sanitizedName}-${new Date().toISOString().slice(0,10)}.jpg`;
      }
      
      link.download = filename;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (err) {
      alert("Error generating image: " + err.message);
    } finally {
      if (btn) btn.style.visibility = 'visible';
      if (scrollBox) {
        scrollBox.style.maxHeight = oldMaxH;
        scrollBox.style.overflowY = oldOverflowY;
    }
    }
  };

  // Single variant view
  if (singleVariant) {
    const { pkgName, variantName, variant } = singleVariant;
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxH="80vh" overflowY="auto">  {/* Scroll on full modal content */}
        <ModalBody>
          <Box ref={tableRef} bg="white" p={4}>   {/* No scroll here */}
            <Flex justify="space-between" align="center" w="100%" mb={4}>
              <Image src={SDRC_LOGO} alt="SDRC Logo" height="40px" />
              <Button
                className="no-print"
                leftIcon={<DownloadIcon />}
                size="sm"
                colorScheme="teal"
                onClick={downloadImage}
              >
                Download JPG
              </Button>
            </Flex>
            <Heading size="md" mb={1}>{pkgName} — {variantName}</Heading>
            <Text color="#F46C3B" fontWeight="semibold" mb={2}>₹ {variant.price}</Text>
            <Heading size="sm" mb={2} mt={4}>Included Tests</Heading>
            <Box px={2}>  {/* remove scroll here */}
              <ul style={{ paddingLeft: 20 }}>
                {variant.tests.map((test, i) => (
                  <li key={i}>{test}</li>
                ))}
              </ul>
            </Box>

          <Box mt={4} p={2} bg="gray.50" borderRadius="md">
            <Heading size="xs" mb={1}>Test inclusions:</Heading>
            <Box as="ul" pl={4} sx={{ listStyleType: "disc" }} mb={1}>
              {relevantNotes.length === 0
                ? <Text as="li" fontSize="xs">No special inclusions</Text>
                : relevantNotes.map((note, idx) => (
                    <Text as="li" key={idx} fontSize="xs" mb={0.5}>
                      {note}
                    </Text>
                  ))}
            </Box>
          </Box>
          </Box>
        </ModalBody>
      </ModalContent>

      </Modal>
    );
  }

  // Multiple variant compare
  if (variants.length < 2) return null;

  // Group tests by category for compare table
  const testsByCategory = {};
  variants.forEach(({ variant }) => {
    variant.tests.forEach(test => {
      const cat = testCategoryMap[test] || "Uncategorised";
      if (!testsByCategory[cat]) testsByCategory[cat] = new Set();
      testsByCategory[cat].add(test);
    });
  });
  Object.keys(testsByCategory).forEach(cat => {
    testsByCategory[cat] = Array.from(testsByCategory[cat]).sort();
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent
        maxW={{ base: "none", md: "90vw" }}
        width={{ base: "auto", md: "90vw" }}
        >
        <ModalCloseButton
            style={{
                position: "fixed",
                top: "16px",
                right: "16px",
                zIndex: 2000,
                background: "white",
                borderRadius: "50%",
                boxShadow: "md"
            }}
            />

        <ModalBody>
          <Box
            ref={tableRef}
            bg="white"
            p={2}
            overflowX="auto"
            style={{ touchAction: "auto" }}
            >
            <Flex justify="space-between" align="center" w="100%" mb={4}>
              <Image src={SDRC_LOGO} alt="SDRC Logo" height="40px" />
              <Button
                className="no-print"
                leftIcon={<DownloadIcon />}
                size="sm"
                colorScheme="teal"
                onClick={downloadImage}
              >
                Download JPG
              </Button>
            </Flex>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Test</Th>
                  {variants.map(({ pkgName, variantName, variant }) => (
                    <Th key={`${pkgName}-${variantName}`} textAlign="center">
                      <Box>
                        <Text fontWeight="bold">{pkgName} — {variantName}</Text>
                        <Text color="#F46C3B" fontWeight="semibold" mt={1}>₹ {variant.price}</Text>
                      </Box>
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {Object.entries(testsByCategory).map(([category, tests], i) => {
                  const groupBg = i % 2 === 0 ? "white" : "gray.50";
                  return (
                    <React.Fragment key={category}>
                      <Tr bg={groupBg}>
                        <Td colSpan={variants.length + 1} fontWeight="bold">
                          <Flex align="center" gap={2}>
                            <Box fontSize="xl">
                              {categoryIconMap[category] || categoryIconMap["Uncategorised"]}
                            </Box>
                            <Heading size="sm">{category}</Heading>
                          </Flex>
                        </Td>
                      </Tr>
                      {tests.map(test => (
                        <Tr key={test} bg={groupBg}>
                          <Td>{test}</Td>
                          {variants.map(({ variant }) => (
                            <Td key={`${variant.name}-${test}`} textAlign="center">
                              {variant.tests.includes(test) && <CheckIcon color="teal.500" />}
                            </Td>
                          ))}
                        </Tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </Tbody>
            </Table>
          </Box>

          <Box mt={4} p={2} bg="gray.50" borderRadius="md">
            <Heading size="xs" mb={1}>Test inclusions:</Heading>
            <Box as="ul" pl={4} sx={{ listStyleType: "disc" }} mb={1}>
              {relevantNotes.length === 0
                ? <Text as="li" fontSize="xs">No special inclusions</Text>
                : relevantNotes.map((note, idx) => (
                    <Text as="li" key={idx} fontSize="xs" mb={0.5}>
                      {note}
                    </Text>
                  ))}
            </Box>
          </Box>

        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
