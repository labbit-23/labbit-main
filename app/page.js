//app/page.js

"use client";

import {
  Box,
  Heading,
  Text,
  Button,
  Image,
  Flex,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  VStack,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  Checkbox,
  useToast,
  List,
  ListItem,
  Divider,
  HStack,
  Textarea,
  Select,
  Link as ChakraLink,
  useBreakpointValue
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import Carousel from "./components/Carousel";
import packages, { globalNotes } from "@/lib/packages";

const SDRC_LOGO =
  "https://sdrc.in/wp-content/uploads/2024/09/SRDC-logo_cropped-624x219.png";
const LABBIT_LOGO = "/logo.png";

export default function LandingPage() {
  const toast = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: testModalOpen,
    onOpen: onTestModalOpen,
    onClose: onTestModalClose
  } = useDisclosure();

  const [form, setForm] = useState({
    patientName: "",
    phone: "",
    packageName: "",
    area: "",
    date: "",
    timeslot: "",
    persons: 1,
    whatsapp: false,
    agree: false
  });
  const [loading, setLoading] = useState(false);
  const [timeslots, setTimeslots] = useState([]);
  const [showTests, setShowTests] = useState({ tests: [], title: "" });

  // Sticky header scroll state
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/api/visits/time_slots")
      .then((res) => res.json())
      .then((data) => setTimeslots(Array.isArray(data) ? data : []))
      .catch(() => setTimeslots([]));
  }, []);

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handlePersonsChange = (value) => {
    const val = Number(value);
    if (!isNaN(val) && val > 0)
      setForm((prev) => ({ ...prev, persons: val }));
  };

  const handleSubmit = async () => {
    if (
      !form.patientName ||
      !form.phone ||
      !form.date ||
      !form.timeslot ||
      !form.agree
    ) {
      toast({
        title: "Please fill all required fields and accept consent.",
        status: "warning"
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/quickbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error("Booking submission failed");
      toast({ title: "Booking submitted!", status: "success" });
      setForm({
        patientName: "",
        phone: "",
        packageName: "",
        area: "",
        date: "",
        timeslot: "",
        persons: 1,
        whatsapp: false,
        agree: false
      });
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    } finally {
      setLoading(false);
    }
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 3,
    slidesToScroll: 1,
    arrows: false,
    adaptiveHeight: true,
    responsive: [
      { breakpoint: 1024, settings: { slidesToShow: 2 } },
      { breakpoint: 640, settings: { slidesToShow: 1 } }
    ]
  };

  const pkgArray = Array.isArray(packages) ? packages : [];
  const showArrows = useBreakpointValue({ base: false, md: true });

  return (
    <Box minH="100vh" bgGradient="linear(to-b, white, gray.100)">
      {/* Sticky Header */}
      <Box
        position="sticky"
        top="0"
        zIndex="1000"
        bg="white"
        boxShadow={scrolled ? "sm" : "none"}
        transition="all 0.2s ease"
      >
        <Flex
          justify="space-between"
          align="center"
          px={[2, 8]}
          py={scrolled && isMobile ? 1 : 3}
          transition="all 0.2s ease"
        >
          <HStack spacing={2}>
            <Image
              src={LABBIT_LOGO}
              alt="Labbit Logo"
              maxH={scrolled && isMobile ? "40px" : "60px"}
              transition="all 0.2s ease"
            />
          </HStack>
          <HStack gap={3}>
            <Button onClick={onOpen} colorScheme="teal" borderRadius="full">
              Quick Book
            </Button>
            <Button
              as={ChakraLink}
              href="/login"
              colorScheme="teal"
              variant="outline"
              borderRadius="full"
            >
              Login / Signup
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* HERO */}
      <Box textAlign="center" mb={8} px={4}>
        <Heading size="2xl" color="teal.600">
          Welcome to Labbit
        </Heading>
        <Text fontSize="lg" color="gray.700">
          <b style={{ color: "#00b1b9" }}>Seamless Home Blood Collection</b> and
          health checkups, trusted by SDRC.
        </Text>
      </Box>

      {/* SDRC Logo above carousel */}
      <Box textAlign="center" mb={4}>
        <Image src={SDRC_LOGO} alt="SDRC Logo" w="120px" mx="auto" />
      </Box>

      {/* CAROUSEL */}
      <Box maxW="1100px" mx="auto" mb={7} px={2}>
        <Carousel
          settings={sliderSettings}
          minHeight="420px"
          showArrows={showArrows}
        >
          {pkgArray.map((pkg, idx) => (
            <Box
              key={pkg.name || idx}
              p={4}
              display="flex"
              flexDirection="column"
              alignItems="center"
            >
              <Box
                borderWidth="1px"
                borderRadius="2xl"
                bg="white"
                shadow="md"
                px={3}
                py={5}
                h="420px"
                display="flex"
                flexDirection="column"
                justifyContent="space-between"
                textAlign="center"
              >
                <Heading size="md" color="teal.700" mb={2}>
                  {pkg.name}
                </Heading>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  {pkg.description}
                </Text>
                <Divider mb={2} />
                {pkg.variants.map((v, vi) => (
                  <Box key={v.name || vi} mb={3} p={2} bg="gray.50" borderRadius="md">
                    {v.name && (
                      <Text fontWeight="bold" color="teal.800" mb={1}>
                        {v.name}
                      </Text>
                    )}
                    <Text color="green.700" fontWeight="bold" mb={0}>
                      ₹{v.price}
                    </Text>
                    <Text fontSize="xs" color="gray.600" mb={2}>
                      ({v.parameters} parameters)
                    </Text>

                    {/* Preview tests if only one variant */}
                    {pkg.variants.length === 1 && (
                      <Text fontSize="xs" color="gray.500" mb={2}>
                        {v.tests.slice(0, 3).join(", ")}
                        {v.tests.length > 3 ? ", ..." : ""}
                      </Text>
                    )}

                    <Button
                      size="xs"
                      colorScheme="teal"
                      variant="outline"
                      borderRadius="full"
                      onClick={() => {
                        setShowTests({
                          tests: v.tests,
                          title: `${pkg.name} — ${v.name || "Package"}`
                        });
                        onTestModalOpen();
                      }}
                    >
                      View Included Tests
                    </Button>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Carousel>
      </Box>

      {/* INCLUDED TESTS MODAL */}
      <Modal isOpen={testModalOpen} onClose={onTestModalClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{showTests.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody maxH="400px" overflowY="auto" py={4}>
            <List spacing={1} mb={4}>
              {(showTests.tests || []).map((t, idx) => (
                <ListItem key={idx}>• {t}</ListItem>
              ))}
            </List>
            <Divider mb={2} />
            <Box fontSize="xs" color="gray.600">
              <Heading size="xs" mb={1}>Notes</Heading>
              <List spacing={1}>
                {globalNotes.map((note, idx) => (
                  <ListItem key={idx}>{note}</ListItem>
                ))}
              </List>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* QUICK BOOK MODAL */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Quick Book</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={2}>
              <FormControl>
                <FormLabel>Patient Name</FormLabel>
                <Input
                  value={form.patientName}
                  onChange={handleChange("patientName")}
                  size="sm"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Phone</FormLabel>
                <Input
                  value={form.phone}
                  onChange={handleChange("phone")}
                  size="sm"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Tests/Package</FormLabel>
                <Textarea
                  value={form.packageName}
                  onChange={handleChange("packageName")}
                  size="sm"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Area / Pincode</FormLabel>
                <Input
                  value={form.area}
                  onChange={handleChange("area")}
                  size="sm"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Date</FormLabel>
                <Input
                  type="date"
                  value={form.date}
                  onChange={handleChange("date")}
                  size="sm"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Timeslot</FormLabel>
                <Select
                  value={form.timeslot}
                  onChange={handleChange("timeslot")}
                  size="sm"
                  placeholder={
                    timeslots.length === 0 ? "Loading..." : "Select slot"
                  }
                >
                  {timeslots.map((slot) => (
                    <option key={slot.id} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>No. of Persons</FormLabel>
                <NumberInput
                  value={form.persons}
                  onChange={handlePersonsChange}
                  size="sm"
                  maxW="80px"
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <Checkbox
                isChecked={form.whatsapp}
                onChange={(e) =>
                  setForm((p) => ({ ...p, whatsapp: e.target.checked }))
                }
              >
                Contact me on WhatsApp
              </Checkbox>
              <Checkbox
                isChecked={form.agree}
                onChange={(e) =>
                  setForm((p) => ({ ...p, agree: e.target.checked }))
                }
              >
                I agree to be contacted
              </Checkbox>
              <Button onClick={handleSubmit} isLoading={loading} colorScheme="teal">
                Submit
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
