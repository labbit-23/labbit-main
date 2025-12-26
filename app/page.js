// app/page.js
"use client";

import {
  Box, Heading, Text, Button, Image, Flex, HStack,
  useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, VStack,
  FormControl, FormLabel, Input, NumberInput, NumberInputField,
  Checkbox, useToast, List, ListItem, Divider,
  Textarea, Select, Link as ChakraLink, SimpleGrid
} from "@chakra-ui/react";
import { Global } from "@emotion/react";
import { useState, useEffect, useLayoutEffect } from "react";

import packages, { testCategoryMap, globalNotes } from "@/lib/packages";
import CompareModal from "./components/CompareModal";

const SDRC_LOGO = "https://sdrc.in/assets/sdrc-logo.png";
const LABBIT_LOGO = "/logo.png";

function getVariantKey(pkgName, variantName) {
  return `${pkgName}::${variantName}`;
}
function getPrimaryCategory(variant) {
  for (const test of variant.tests) {
    if (testCategoryMap[test]) return testCategoryMap[test];
  }
  return "Uncategorised";
}

export default function LandingPage() {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure(); // QuickBook
  const { isOpen: compareModalOpen, onOpen: onCompareOpen, onClose: onCompareClose } = useDisclosure();

  const [form, setForm] = useState({
    patientName: "", phone: "", packageName: "", area: "",
    date: "", timeslot: "", persons: 1, whatsapp: true, agree: true
  });
  const [loading, setLoading] = useState(false);
  const [timeslots, setTimeslots] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [compareMap, setCompareMap] = useState({});
  const [singleVariant, setSingleVariant] = useState(null); // unified compare modal

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);


  useEffect(() => {
    fetch("/api/visits/time_slots")
      .then(res => res.json())
      .then(data => setTimeslots(Array.isArray(data) ? data : []))
      .catch(() => setTimeslots([]));
  }, []);

  const handleChange = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const handlePersonsChange = (val) => {
    const num = Number(val);
    if (!isNaN(num) && num > 0) setForm((p) => ({ ...p, persons: num }));
  };

  const handleQuickBookOpen = () => {
    if (Object.keys(compareMap).length > 0) {
      const combinedPackages = Object.values(compareMap)
        .map(({ pkgName, variantName }) => `${pkgName} - ${variantName}`)
        .join("\nand/or\n");
      setForm(form => ({ ...form, packageName: combinedPackages }));
    } else {
      setForm(form => ({ ...form, packageName: "" }));
    }
    onOpen();
  };

  const handleSubmit = async () => {
    if (!form.patientName || !form.phone || !form.date || !form.timeslot || !form.agree) {
      toast({ title: "Please fill all required fields and accept consent.", status: "warning" });
      return;
    }

  // Validate mobile number digits
  const phoneDigits = form.phone.replace(/\D/g, '');
  let normalizedPhone = phoneDigits;

  if (phoneDigits.length > 10 && phoneDigits.startsWith('91')) {
    normalizedPhone = phoneDigits.slice(2);
  }

  if (normalizedPhone.length !== 10) {
    toast({ title: "Please enter a valid 10-digit mobile number.", status: "warning" });
    return;
  }

    setLoading(true);
    try {
      const res = await fetch("/api/quickbook", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, phone: normalizedPhone })
      });
      if (!res.ok) throw new Error("Booking failed");
      toast({ title: "Booking submitted!", status: "success" });
      setForm({ patientName: "", phone: "", packageName: "", area: "", date: "", timeslot: "", persons: 1, whatsapp: true, agree: true });
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    } finally { setLoading(false); }
  };

  useLayoutEffect(() => {
    if (
      window.location.search.includes('quickbook=true') ||
      window.location.hash === '#quickbook'
    ) {
      onOpen();
    }
}, [onOpen]);

  const toggleCompareVariant = (pkgName, variantName, variant) => {
    const key = getVariantKey(pkgName, variantName);
    setCompareMap(prev => {
      const newMap = { ...prev };
      if (newMap[key]) {
        delete newMap[key];
      } else {
        newMap[key] = { pkgName, variantName, variant, category: getPrimaryCategory(variant) };
      }
      return newMap;
    });
  };

  const openSingleVariantModal = (pkgName, variantName, variant) => {
    setSingleVariant({ pkgName, variantName, variant });
    onCompareOpen();
  };

  const responsive = {
    desktop: { breakpoint: { max: 3000, min: 1024 }, items: 3 },
    tablet: { breakpoint: { max: 1024, min: 640 }, items: 2 },
    mobile: { breakpoint: { max: 640, min: 0 }, items: 1 }
  };

  return (
    <Box minH="100vh" bgGradient="linear(to-b, white, gray.100)">
      {/* Local arrow CSS */}
      <Global styles={`
        .react-multiple-carousel__arrow {
          background-color: rgba(0, 0, 0, 0.1) !important;
          color: rgba(86, 117, 114, 0.71) !important;
          width: 30px !important;
          height: 30px !important;
          border-radius: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: color 0.3s ease;
          
        }
        .react-multiple-carousel__arrow:hover {
          background-color: rgba(0, 0, 0, 0.3) !important;
          color: rgba(0, 0, 0, 0.6) !important;
        }
        .react-multiple-carousel__arrow--left {
          left: 10px !important;
          top: 65% !important;
          transform: translateY(-50%) !important;
          position: absolute !important;
          z-index: 10 !important;
        }
        .react-multiple-carousel__arrow--right {
          right: 10px !important;
          top: 65% !important;
          transform: translateY(-50%) !important;
          position: absolute !important;
          z-index: 10 !important;
        }
      `} />

      {/* HEADER */}
      <Box position="sticky" top="0" zIndex="1000" bg="white" boxShadow={scrolled ? "sm" : "none"}>
        <Flex justify="space-between" align="center" px={{ base: 2, md: 8 }} py={scrolled ? 1 : 3}>
          <HStack>
            <Image src={LABBIT_LOGO} alt="Labbit Logo" maxH={scrolled ? "40px" : "60px"} />
          </HStack>
          <HStack gap={3}>
            <Button onClick={handleQuickBookOpen} colorScheme="teal" borderRadius="full">
              Quick Book
            </Button>
            <Button as={ChakraLink} href="/login" variant="outline" colorScheme="teal" borderRadius="full">Login / Signup</Button>
          </HStack>
        </Flex>
      </Box>

      {/* HERO */}
      <Box textAlign="center" mb={8}>
        <Heading size="2xl" color="teal.600">Welcome to SDRC!</Heading>
        <Text fontSize="lg" mt={2} color="gray.700">
          <b style={{ color: "#00b1b9" }}>Seamless Home Blood Collection</b> and health checkups, powered by Labbit.
        </Text>
      </Box>

      <Box textAlign="center" mb={4}>
        <Image src={SDRC_LOGO} alt="SDRC Logo" w="120px" mx="auto" />
      </Box>

      {/* PACKAGES */}
      <Box maxW="1100px" mx="auto" mb={7} px={6} overflow="visible">
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>

          {packages.map(pkg => (
            <Box key={pkg.name} borderWidth="1px" borderRadius="2xl" bg="white" shadow="md"
              px={{ base: 2, md: 3 }} py={{ base: 4, md: 5 }}
              minH={{ base: "auto", md: "420px" }} display="flex" flexDirection="column" justifyContent="space-between"
            >
              <Heading size="md" color="teal.700" mb={2}>{pkg.name}</Heading>
              <Text fontSize="sm" color="gray.600" mb={2}>{pkg.description}</Text>
              <Divider mb={2} />
              {pkg.variants.map(v => {
                const vKey = getVariantKey(pkg.name, v.name);
                return (
                  <Box key={v.name} mb={3} p={2} bg="gray.50" borderRadius="md">
                    <Heading size="sm" color="teal.800" mb={1}>{v.name}</Heading>
                    <Text color="#F46C3B" fontWeight="bold" textAlign="center">₹ {v.price}</Text>
                    <Text fontSize="xs" color="gray.600" mb={2} textAlign="center">({v.parameters} parameters)</Text>
                    <Flex justify="space-between" mt={2}>
                      <Checkbox size="sm" isChecked={!!compareMap[vKey]} onChange={() => toggleCompareVariant(pkg.name, v.name, v)}>
                        Compare
                      </Checkbox>
                      <Button size="xs" variant="outline" colorScheme="teal" borderRadius="full"
                        onClick={() => openSingleVariantModal(pkg.name, v.name, v)}>
                        View Included Tests
                      </Button>
                    </Flex>
                  </Box>
                );
              })}
            </Box>
          ))}
        </SimpleGrid>
      </Box>

      {/* STICKY COMPARE BAR */}
      {Object.keys(compareMap).length > 0 && (
        <Flex position="fixed" bottom="0" left="0" right="0" bg="white" borderTop="1px solid" borderColor="gray.200" boxShadow="md"
          py={2} px={4} justifyContent="space-between" align="center" zIndex={2000}>
          <Text fontSize="md" fontWeight="medium">
            {Object.keys(compareMap).length} variant{Object.keys(compareMap).length > 1 ? "s" : ""} selected
          </Text>
          <HStack>
            {Object.keys(compareMap).length > 1 ?
              <Button size="sm" colorScheme="teal" onClick={onCompareOpen}>Compare Now</Button> :
              <Button size="sm" variant="outline" isDisabled>Select 1 more</Button>}
            <Button size="sm" variant="ghost" colorScheme="red" onClick={() => setCompareMap({})}>Clear</Button>
          </HStack>
        </Flex>
      )}

      <CompareModal
        isOpen={compareModalOpen}
        onClose={() => { onCompareClose(); setSingleVariant(null); }}
        compareMap={singleVariant ? {} : compareMap}
        singleVariant={singleVariant}
      />

      {/* QUICK BOOK MODAL */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Flex align="center" w="100%" position="relative" px={2}>
              <Image src={SDRC_LOGO} alt="SDRC Logo" maxH="30px" />
              <Text fontWeight="bold" fontSize="lg" color="teal.600" position="absolute" left="50%" transform="translateX(-50%)">
                Quick Book
              </Text>
            </Flex>
          </ModalHeader>


          <ModalCloseButton />
          <ModalBody px={{ base: 4, md: 6 }} py={4}>
            <VStack spacing={2} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired><FormLabel fontSize="sm">Patient Name</FormLabel>
                  <Input autoComplete="name" value={form.patientName} onChange={handleChange("patientName")} size="sm" /></FormControl>
                <FormControl isRequired><FormLabel fontSize="sm">Phone</FormLabel>
                  <Input autoComplete="tel" value={form.phone} onChange={handleChange("phone")} size="sm" /></FormControl>
              </SimpleGrid>
              <FormControl><FormLabel fontSize="sm">Tests / Package</FormLabel>
                <Textarea autoComplete="off" value={form.packageName} onChange={handleChange("packageName")} size="sm" /></FormControl>
              <Divider />
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired><FormLabel fontSize="sm">Area / Pincode</FormLabel>
                  <Input autoComplete="postal-code" value={form.area} onChange={handleChange("area")} size="sm" /></FormControl>
                <FormControl isRequired><FormLabel fontSize="sm">Date</FormLabel>
                  <Input type="date" value={form.date} onChange={handleChange("date")} size="sm" /></FormControl>
              </SimpleGrid>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired><FormLabel fontSize="sm">Timeslot</FormLabel>
                  <Select value={form.timeslot} onChange={handleChange("timeslot")} size="sm"
                    placeholder={timeslots.length === 0 ? "Loading..." : "Select slot"}>
                    {timeslots.map(slot => <option key={slot.id} value={slot.id}>{slot.slot_name}</option>)}
                  </Select>
                </FormControl>
                <FormControl maxW={{ base: "100%", md: "120px" }}>
                  <FormLabel fontSize="sm">Persons</FormLabel>
                  <NumberInput value={form.persons} onChange={handlePersonsChange} size="sm" min={1}><NumberInputField /></NumberInput>
                </FormControl>
              </SimpleGrid>
              <Divider />
              <HStack spacing={6} flexWrap="wrap">
                <FormControl isRequired><Checkbox isChecked={form.whatsapp} onChange={(e) => setForm(p => ({ ...p, whatsapp: e.target.checked }))}>
                  I agree to be contacted on SMS and WhatsApp</Checkbox></FormControl>
              </HStack>
              <Flex justify={{ base: "center", md: "flex-end" }} pt={2} gap={4}>
                <Button variant="outline" colorScheme="teal" size="md" borderRadius="full" onClick={onClose}>
                  ← Back to Packages
                </Button>
                <Button onClick={handleSubmit} isLoading={loading} colorScheme="teal" px={8} size="md" borderRadius="full">
                  Submit Booking
                </Button>
              </Flex>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
