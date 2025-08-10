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
  IconButton,
  HStack,
  Textarea,
  Select,
  Link as ChakraLink,
} from "@chakra-ui/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import Slider from "react-slick";
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from "@chakra-ui/icons";
import packages from "@/lib/packages";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

// Logos
const SDRC_LOGO = "https://sdrc.in/wp-content/uploads/2024/09/SRDC-logo_cropped-624x219.png";
const LABBIT_LOGO = "/logo.png"; // Ensure exists in /public

export default function LandingPage() {
  const toast = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: testModalOpen,
    onOpen: onTestModalOpen,
    onClose: onTestModalClose,
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
    agree: false,
  });
  const [loading, setLoading] = useState(false);
  const [timeslots, setTimeslots] = useState([]);
  const [showTests, setShowTests] = useState({ tests: [], title: "" });

  const sliderRef = useRef(null);

  // Load timeslots from API
  useEffect(() => {
    fetch("/api/timeslots")
      .then((res) => res.json())
      .then((data) => setTimeslots(Array.isArray(data) ? data : []))
      .catch(() => setTimeslots([]));
  }, []);

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handlePersonsChange = (value) => {
    const val = Number(value);
    if (!isNaN(val) && val > 0) setForm((prev) => ({ ...prev, persons: val }));
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
        title: "Please fill all required fields and accept contact consent.",
        status: "warning",
        duration: 4000,
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/quickbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Booking submission failed");

      toast({
        title: "Booking submitted!",
        description: "We will contact you shortly.",
        status: "success",
        duration: 4000,
      });

      setForm({
        patientName: "",
        phone: "",
        packageName: "",
        area: "",
        date: "",
        timeslot: "",
        persons: 1,
        whatsapp: false,
        agree: false,
      });
      onClose();
    } catch (err) {
      toast({
        title: "Error",
        description: err.message,
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    adaptiveHeight: true,
  };

  return (
    <Box minH="100vh" bgGradient="linear(to-b, white, gray.100)" py={6} px={[2, 8]}>
      {/* HEADER */}
      <Flex justify="space-between" align="center" mb={6}>
        <HStack spacing={2}>
          <Image src={LABBIT_LOGO} alt="Labbit Logo" maxH="45px" objectFit="contain" />
          <Divider orientation="vertical" h="32px" borderColor="gray.300" />
          <Image src={SDRC_LOGO} alt="SDRC Logo" maxH="30px" objectFit="contain" />
        </HStack>
        <HStack gap={3} align="center">
          <Button
            colorScheme="teal"
            onClick={onOpen}
            size="md"
            fontWeight="bold"
            borderRadius="full"
          >
            Quick Book
          </Button>
          <Button
            as={ChakraLink}
            href="/login"
            colorScheme="teal"
            variant="outline"
            size="md"
            fontWeight="bold"
            borderRadius="full"
            _hover={{ textDecoration: "none" }}
          >
            Login / Signup
          </Button>
        </HStack>
      </Flex>

      {/* HERO */}
      <Box textAlign="center" mb={8}>
        <Heading size="2xl" color="teal.600" fontWeight="extrabold" mb={3}>
          Welcome to Labbit
        </Heading>
        <Text fontSize="lg" color="gray.700" maxW="700px" mx="auto">
          <span style={{ fontWeight: 600, color: "#00b1b9" }}>Seamless Home Blood Collection</span>{" "}
          and health checkups, trusted by SDRC.
        </Text>
      </Box>

      {/* CAROUSEL */}
      <Box maxW="600px" mx="auto" pos="relative" mb={9}>
        <IconButton
          aria-label="Previous"
          icon={<ChevronLeftIcon />}
          pos="absolute"
          top="50%"
          left="-32px"
          transform="translateY(-50%)"
          zIndex={2}
          onClick={() => sliderRef.current?.slickPrev()}
          colorScheme="teal"
          variant="ghost"
          size="lg"
        />
        <IconButton
          aria-label="Next"
          icon={<ChevronRightIcon />}
          pos="absolute"
          top="50%"
          right="-32px"
          transform="translateY(-50%)"
          zIndex={2}
          onClick={() => sliderRef.current?.slickNext()}
          colorScheme="teal"
          variant="ghost"
          size="lg"
        />

        <Slider ref={sliderRef} {...sliderSettings}>
          {packages.map((pkg, idx) => (
            <Box key={idx} p={4}>
              <Box
                borderWidth="1px"
                borderRadius="2xl"
                bg="white"
                shadow="md"
                minH="390px"
                px={3}
                py={5}
                textAlign="center"
              >
                <Image src={SDRC_LOGO} alt="SDRC Logo" w="85px" mx="auto" mt={1} mb={3} />
                <Heading size="md" color="teal.700" mb={1}>
                  {pkg.name}
                </Heading>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  {pkg.description}
                </Text>
                <Text color="green.700" fontWeight="bold" fontSize="sm" mb={3}>
                  ₹{pkg.price} ({pkg.parameters} parameters)
                </Text>
                <Divider mb={3} />
                {pkg.variants.map((v, i) => (
                  <Box
                    key={i}
                    mb={3}
                    p={2}
                    bg="gray.50"
                    borderRadius="md"
                    fontSize="sm"
                  >
                    <Text fontWeight="bold" color="teal.800">
                      {v.name}
                    </Text>
                    <Button
                      mt={1}
                      size="xs"
                      colorScheme="teal"
                      variant="outline"
                      borderRadius="full"
                      onClick={() => {
                        setShowTests({
                          tests: v.tests,
                          title: `${pkg.name} — ${v.name}`,
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
        </Slider>
      </Box>

      {/* BROCHURE LINK */}
      <Flex justify="center" mb={10}>
        <Button
          as="a"
          href="https://simplebooklet.com/sdrcbrochure"
          target="_blank"
          rel="noopener noreferrer"
          colorScheme="teal"
          variant="ghost"
          fontWeight="semibold"
          borderRadius="full"
        >
          📖 View Full Brochure
        </Button>
      </Flex>

      {/* QUICK BOOK MODAL */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent py={2} px={2}>
          <ModalHeader fontSize="xl" fontWeight="bold" color="teal.700">
            Quick Book
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={2} align="stretch">
              <FormControl isRequired>
                <HStack>
                  <FormLabel mb={0} minW="120px">Patient Name</FormLabel>
                  <Input size="sm" placeholder="Full name" value={form.patientName} onChange={handleChange("patientName")}/>
                </HStack>
              </FormControl>
              <FormControl isRequired>
                <HStack>
                  <FormLabel mb={0} minW="120px">Phone</FormLabel>
                  <Input size="sm" maxLength={10} placeholder="10-digit phone" value={form.phone} onChange={handleChange("phone")}/>
                  <CheckIcon color="green.500" boxSize={4}/>
                </HStack>
              </FormControl>
              <FormControl>
                <HStack align="flex-start">
                  <FormLabel mb={0} minW="120px" pt={1}>Tests/Package</FormLabel>
                  <Textarea size="sm" rows={2} placeholder="E.g., Executive Wellness Checkup" value={form.packageName} onChange={handleChange("packageName")} flex={1}/>
                </HStack>
              </FormControl>
              <FormControl isRequired>
                <HStack>
                  <FormLabel mb={0} minW="120px">Area / Pincode</FormLabel>
                  <Input size="sm" placeholder="Area or Pincode" value={form.area} onChange={handleChange("area")}/>
                </HStack>
              </FormControl>
              <FormControl isRequired>
                <HStack>
                  <FormLabel mb={0} minW="120px">Date</FormLabel>
                  <Input size="sm" type="date" value={form.date} onChange={handleChange("date")} min={new Date().toISOString().split("T")[0]}/>
                </HStack>
              </FormControl>
              <FormControl isRequired>
                <HStack>
                  <FormLabel mb={0} minW="120px">Timeslot</FormLabel>
                  <Select size="sm" placeholder={timeslots.length === 0 ? "Loading..." : "Select slot"} value={form.timeslot} onChange={handleChange("timeslot")}>
                    {timeslots.map((slot) => (
                      <option key={slot.id} value={slot.value}>{slot.label}</option>
                    ))}
                  </Select>
                </HStack>
              </FormControl>
              <FormControl isRequired>
                <HStack>
                  <FormLabel mb={0} minW="120px">No. of Persons</FormLabel>
                  <NumberInput min={1} value={form.persons} onChange={handlePersonsChange} maxW="70px" size="sm">
                    <NumberInputField />
                  </NumberInput>
                </HStack>
              </FormControl>
              <HStack>
                <Checkbox isChecked={form.whatsapp} onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.checked }))} colorScheme="teal" size="md">
                  Contact me on WhatsApp
                </Checkbox>
                <Checkbox isChecked={form.agree} onChange={(e) => setForm((prev) => ({ ...prev, agree: e.target.checked }))} colorScheme="teal" size="md">
                  I agree to be contacted
                </Checkbox>
              </HStack>
              <Button colorScheme="teal" onClick={handleSubmit} isLoading={loading} loadingText="Booking..." my={3} borderRadius="full">
                Submit
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* TESTS MODAL */}
      <Modal isOpen={testModalOpen} onClose={onTestModalClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="lg">{showTests.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody maxH="400px" overflowY="auto" py={4}>
            <List spacing={1}>
              {(showTests.tests || []).map((testName, idx) => (
                <ListItem key={idx}>• {testName}</ListItem>
              ))}
            </List>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
