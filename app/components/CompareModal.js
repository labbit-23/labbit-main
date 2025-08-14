// app/components/CompareModal.js
"use client";
import React, { useRef } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalCloseButton, ModalBody, Table, Thead, Tbody,
  Tr, Th, Td, Box, Flex, Heading, Text, Button, Image
} from "@chakra-ui/react";
import { CheckIcon, DownloadIcon } from "@chakra-ui/icons";
import { testCategoryMap, categoryIconMap } from "@/lib/packages";
import html2canvas from "html2canvas";

const SDRC_LOGO = "https://sdrc.in/wp-content/uploads/2024/09/SRDC-logo_cropped-624x219.png";

export default function CompareModal({ isOpen, onClose, compareMap = {}, singleVariant = null }) {
  const variants = singleVariant ? [singleVariant] : Object.values(compareMap);
  const tableRef = useRef(null);

  if (variants.length === 0) return null;

  // Download displayed content as JPG
  const downloadImage = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { backgroundColor: "#fff", scale: 2 });
      const link = document.createElement("a");
      link.download = `Labbit-comparison-${new Date().toISOString().slice(0,10)}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (err) {
      alert("Error generating image: " + err.message);
    }
  };

  // Single variant view
  if (singleVariant) {
    const { pkgName, variantName, variant } = singleVariant;
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Flex justify="space-between" align="center" w="100%">
              <Image src={SDRC_LOGO} alt="SDRC Logo" height="40px" />
              <Box /> {/* empty placeholder for alignment */}
            </Flex>
            <Heading size="md" mt={2}>{pkgName} — {variantName}</Heading>
            <Text color="#F46C3B" fontWeight="semibold" mb={2}>₹ {variant.price}</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Heading size="sm" mb={2}>Included Tests</Heading>
            <Box maxH="400px" overflowY="auto" ref={tableRef} px={2}>
              <ul style={{ paddingLeft: 20 }}>
                {variant.tests.map((test, i) => (
                  <li key={i}>{test}</li>
                ))}
              </ul>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }

  // Multiple variants comparison
  if (variants.length < 2) return null;

  // Group tests by category
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
      <ModalContent maxW="90vw">
        <ModalHeader>
          <Flex justify="space-between" align="center" w="100%">
            <Image src={SDRC_LOGO} alt="SDRC Logo" height="40px" />
            <Button leftIcon={<DownloadIcon />} size="sm" colorScheme="teal" onClick={downloadImage}>
              Download JPG
            </Button>
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box ref={tableRef} overflowX="auto" pb={4} px={2}>
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
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
