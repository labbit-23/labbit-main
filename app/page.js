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
import { useState, useEffect } from "react";
import MultiCarousel from "react-multi-carousel";
import "react-multi-carousel/lib/styles.css";

import packages, { testCategoryMap, globalNotes } from "@/lib/packages";
import CompareModal from "./components/CompareModal";

const SDRC_LOGO = "https://sdrc.in/wp-content/uploads/2024/09/SRDC-logo_cropped-624x219.png";
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
  const { isOpen: testModalOpen, onOpen: onTestModalOpen, onClose: onTestModalClose } = useDisclosure();
  const { isOpen: compareModalOpen, onOpen: onCompareOpen, onClose: onCompareClose } = useDisclosure();

  const [form, setForm] = useState({
    patientName: "", phone: "", packageName: "", area: "",
    date: "", timeslot: "", persons: 1, whatsapp: true, agree: true
  });
  const [loading, setLoading] = useState(false);
  const [timeslots, setTimeslots] = useState([]);
  const [showTests, setShowTests] = useState({ tests: [], title: "", variantKey: "" });
  const [scrolled, setScrolled] = useState(false);
  const [compareMap, setCompareMap] = useState({});

  // Header shadow
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Load timeslots
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

  const handleSubmit = async () => {
    if (!form.patientName || !form.phone || !form.date || !form.timeslot || !form.agree) {
      toast({ title: "Please fill all required fields and accept consent.", status: "warning" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/quickbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error("Booking failed");
      toast({ title: "Booking submitted!", status: "success" });
      setForm({ patientName: "", phone: "", packageName: "", area: "", date: "", timeslot: "", persons: 1, whatsapp: true, agree: true });
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    } finally { setLoading(false); }
  };

  // No category restriction
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
          color: rgba(0, 0, 0, 0.6) !important;
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        .react-multiple-carousel__arrow:hover {
          background-color: rgba(0, 0, 0, 0.3) !important;
          color: rgba(0, 0, 0, 0.9) !important;
        }
        .react-multiple-carousel__arrow--left {
          left: -50px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          position: absolute !important;
          z-index: 10 !important;
        }
        .react-multiple-carousel__arrow--right {
          right: -50px !important;
          top: 50% !important;
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
            <Button onClick={onOpen} colorScheme="teal" borderRadius="full">Quick Book</Button>
            <Button as={ChakraLink} href="/login" variant="outline" colorScheme="teal" borderRadius="full">
              Login / Signup
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* HERO */}
      <Box textAlign="center" mb={8}>
        <Heading size="2xl" color="teal.600">Welcome to Labbit</Heading>
        <Text fontSize="lg" mt={2} color="gray.700">
          <b style={{ color: "#00b1b9" }}>Seamless Home Blood Collection</b> and health checkups, trusted by SDRC.
        </Text>
      </Box>

      {/* LOGO */}
      <Box textAlign="center" mb={4}>
        <Image src={SDRC_LOGO} alt="SDRC Logo" w="120px" mx="auto" />
      </Box>

      {/* PACKAGES */}
      <Box maxW="1100px" mx="auto" mb={7} px={2}>
        <MultiCarousel {...{ responsive }} arrows infinite swipeable draggable keyBoardControl removeArrowOnDeviceType={["mobile"]} itemClass="px-2">
          {packages.map(pkg => (
            <Box key={pkg.name} borderWidth="1px" borderRadius="2xl" bg="white" shadow="md"
              px={{ base: 2, md: 3 }} py={{ base: 4, md: 5 }}
              minH={{ base: "auto", md: "420px" }} display="flex" flexDirection="column" justifyContent="space-between">
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
                      <Checkbox size="sm" isChecked={!!compareMap[vKey]} onChange={() => toggleCompareVariant(pkg.name, v.name, v)}>Compare</Checkbox>
                      <Button size="xs" variant="outline" colorScheme="teal" borderRadius="full"
                        onClick={() => { setShowTests({ tests: v.tests, title: `${pkg.name} — ${v.name}`, variantKey: vKey }); onTestModalOpen(); }}>
                        View Included Tests
                      </Button>
                    </Flex>
                  </Box>
                );
              })}
            </Box>
          ))}
        </MultiCarousel>
      </Box>

      {/* STICKY COMPARE BAR */}
      {Object.keys(compareMap).length > 0 && (
        <Flex position="fixed" bottom="0" left="0" right="0" bg="white" borderTop="1px solid" borderColor="gray.200" boxShadow="md"
          py={2} px={4} justify="space-between" align="center" zIndex={2000}>
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

      {/* MODALS */}
      <CompareModal isOpen={compareModalOpen} onClose={onCompareClose} compareMap={compareMap} />

      {/* TESTS MODAL */}
      <Modal isOpen={testModalOpen} onClose={onTestModalClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{showTests.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <List spacing={2} fontSize="sm">{showTests.tests.map((t, i) => <ListItem key={i}>• {t}</ListItem>)}</List>
            <Divider my={2} />
            <Box fontSize="xs" color="gray.600">
              <Heading size="xs">Notes</Heading>
              <List>{globalNotes.map((n, idx) => <ListItem key={idx}>{n}</ListItem>)}</List>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* QUICK BOOK */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Quick Book</ModalHeader>
          <ModalCloseButton />
          <ModalBody px={{ base: 4, md: 6 }} py={4}>
            <VStack spacing={4} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl><FormLabel fontSize="sm">Patient Name</FormLabel>
                  <Input value={form.patientName} onChange={handleChange("patientName")} size="sm" /></FormControl>
                <FormControl><FormLabel fontSize="sm">Phone</FormLabel>
                  <Input value={form.phone} onChange={handleChange("phone")} size="sm" /></FormControl>
              </SimpleGrid>
              <FormControl><FormLabel fontSize="sm">Tests / Package</FormLabel>
                <Textarea value={form.packageName} onChange={handleChange("packageName")} size="sm" /></FormControl>
              <Divider />
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl><FormLabel fontSize="sm">Area / Pincode</FormLabel>
                  <Input value={form.area} onChange={handleChange("area")} size="sm" /></FormControl>
                <FormControl><FormLabel fontSize="sm">Date</FormLabel>
                  <Input type="date" value={form.date} onChange={handleChange("date")} size="sm" /></FormControl>
              </SimpleGrid>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl><FormLabel fontSize="sm">Timeslot</FormLabel>
                  <Select value={form.timeslot} onChange={handleChange("timeslot")} size="sm"
                    placeholder={timeslots.length === 0 ? "Loading..." : "Select slot"}>
                    {timeslots.map(slot => <option key={slot.id} value={slot.id}>{slot.slot_name}</option>)}
                  </Select>
                </FormControl>
                <FormControl maxW={{ base: "100%", md: "120px" }}>
                  <FormLabel fontSize="sm">Persons</FormLabel>
                  <NumberInput value={form.persons} onChange={handlePersonsChange} size="sm" min={1}>
                    <NumberInputField />
                  </NumberInput>
                </FormControl>
              </SimpleGrid>
              <Divider />
              <HStack spacing={6} flexWrap="wrap">
                <Checkbox isChecked={form.whatsapp} onChange={(e) => setForm(p => ({ ...p, whatsapp: e.target.checked }))}>
                  Contact me on WhatsApp</Checkbox>
                <Checkbox isChecked={form.agree} onChange={(e) => setForm(p => ({ ...p, agree: e.target.checked }))}>
                  I agree to be contacted</Checkbox>
              </HStack>
              <Flex justify={{ base: "center", md: "flex-end" }} pt={2}>
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
