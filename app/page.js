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

const SDRC_LOGO =
  "https://sdrc.in/wp-content/uploads/2024/09/SRDC-logo_cropped-624x219.png";
const LABBIT_LOGO = "/logo.png";

export default function LandingPage() {
  const toast = useToast();

  // modals
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: testModalOpen,
    onOpen: onTestModalOpen,
    onClose: onTestModalClose,
  } = useDisclosure();

  // state
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

  // fetch timeslots
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
    if (!isNaN(val) && val > 0)
      setForm((prev) => ({ ...prev, persons: val }));
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
        body: JSON.stringify(form),
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
        agree: false,
      });
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    } finally {
      setLoading(false);
    }
  };

  // slick settings
  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    adaptiveHeight: true,
  };

  // guard to avoid .map errors
  const pkgArray = Array.isArray(packages) ? packages : [];

  return (
    <Box minH="100vh" bgGradient="linear(to-b, white, gray.100)" py={4} px={[2, 8]}>
      {/* HEADER */}
      <Flex justify="space-between" align="center" mb={6}>
        <HStack spacing={2}>
          <Image src={LABBIT_LOGO} alt="Labbit Logo" maxH="45px" />
          <Divider orientation="vertical" h="32px" />
          <Image src={SDRC_LOGO} alt="SDRC Logo" maxH="30px" />
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

      {/* HERO */}
      <Box textAlign="center" mb={8}>
        <Heading size="2xl" color="teal.600">Welcome to Labbit</Heading>
        <Text fontSize="lg" color="gray.700">
          <b style={{ color: "#00b1b9" }}>Seamless Home Blood Collection</b> and health checkups, trusted by SDRC.
        </Text>
      </Box>

      {/* CAROUSEL */}
      <Box maxW="600px" mx="auto" pos="relative" mb={7}>
        <IconButton aria-label="Prev" icon={<ChevronLeftIcon />}
          pos="absolute" top="50%" left="-36px"
          transform="translateY(-50%)" zIndex={2}
          onClick={() => sliderRef.current?.slickPrev()} />
        <IconButton aria-label="Next" icon={<ChevronRightIcon />}
          pos="absolute" top="50%" right="-36px"
          transform="translateY(-50%)" zIndex={2}
          onClick={() => sliderRef.current?.slickNext()} />
        <Slider ref={sliderRef} {...sliderSettings}>
          {pkgArray.map((pkg, idx) => (
            <Box key={pkg.name || idx} p={4}>
              <Box borderWidth="1px" borderRadius="2xl"
                bg="white" shadow="md" px={3} py={5} minH="340px">
                <Image src={SDRC_LOGO} alt="SDRC Logo" w="85px" mx="auto" mb={3} />
                <Heading size="md" color="teal.700">{pkg.name}</Heading>
                <Text fontSize="sm" color="gray.600" mb={2}>{pkg.description}</Text>
                <Text color="green.700" fontWeight="bold" mb={2}>
                  ₹{pkg.price} ({pkg.parameters} parameters)
                </Text>
                <Divider mb={2} />
                {pkg.variants.map((v, vi) => (
                  <Box key={v.name || vi} mb={2} p={1} bg="gray.50" borderRadius="md">
                    <Text fontWeight="bold" color="teal.800">{v.name}</Text>
                    <Button
                      mt={1} size="xs" colorScheme="teal" variant="outline" borderRadius="full"
                      onClick={() => {
                        setShowTests({ tests: v.tests, title: `${pkg.name} — ${v.name}` });
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

      {/* INCLUDED TESTS MODAL */}
      <Modal isOpen={testModalOpen} onClose={onTestModalClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{showTests.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody maxH="400px" overflowY="auto" py={4}>
            <List spacing={1}>
              {(showTests.tests || []).map((t, idx) => (
                <ListItem key={idx}>• {t}</ListItem>
              ))}
            </List>
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
                <Input value={form.patientName} onChange={handleChange("patientName")} size="sm" />
              </FormControl>
              <FormControl>
                <FormLabel>Phone</FormLabel>
                <Input value={form.phone} onChange={handleChange("phone")} size="sm" />
              </FormControl>
              <FormControl>
                <FormLabel>Tests/Package</FormLabel>
                <Textarea value={form.packageName} onChange={handleChange("packageName")} size="sm" />
              </FormControl>
              <FormControl>
                <FormLabel>Area / Pincode</FormLabel>
                <Input value={form.area} onChange={handleChange("area")} size="sm" />
              </FormControl>
              <FormControl>
                <FormLabel>Date</FormLabel>
                <Input type="date" value={form.date} onChange={handleChange("date")} size="sm" />
              </FormControl>
              <FormControl>
                <FormLabel>Timeslot</FormLabel>
                <Select value={form.timeslot} onChange={handleChange("timeslot")} size="sm"
                  placeholder={timeslots.length === 0 ? "Loading..." : "Select slot"}>
                  {timeslots.map(slot => (
                    <option key={slot.id} value={slot.value}>{slot.label}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>No. of Persons</FormLabel>
                <NumberInput value={form.persons} onChange={handlePersonsChange} size="sm" maxW="80px">
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <Checkbox isChecked={form.whatsapp}
                onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.checked }))}>
                Contact me on WhatsApp
              </Checkbox>
              <Checkbox isChecked={form.agree}
                onChange={(e) => setForm((p) => ({ ...p, agree: e.target.checked }))}>
                I agree to be contacted
              </Checkbox>
              <Button onClick={handleSubmit} isLoading={loading} colorScheme="teal">Submit</Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
