"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Button,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  Heading,
  Spinner,
  Flex,
  Spacer,
  Text,
  useToast,
  VStack,
  HStack,
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon } from "@chakra-ui/icons";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/** Utility to format date as YYYY-MM-DD */
const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

/** Status color mapping for badges */
const statusColorScheme = (status) => {
  switch (status) {
    case "booked":
      return "blue";
    case "pending":
      return "orange";
    case "accepted":
      return "teal";
    case "postponed":
      return "yellow";
    case "rejected":
      return "red";
    case "in_progress":
      return "cyan";
    case "sample_picked":
      return "green";
    case "sample_dropped":
      return "purple";
    case "completed":
      return "green";
    default:
      return "gray";
  }
};

/** Reusable Modal Form for Visit Create/Edit */
function VisitModal({
  isOpen,
  onClose,
  onSubmit,
  visitInitialData,
  patients,
  executives,
  labs,
  timeSlots,
  isLoading,
}) {
  // Initialize form state from visitInitialData or empty defaults
  const [formData, setFormData] = useState({
    patient_id: "",
    executive_id: "",
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot_id: "",
    address: "",
    status: "booked",
    ...visitInitialData,
  });

  // Because visitInitialData can change (edit different visits)
  useEffect(() => {
    if (visitInitialData) {
      setFormData({
        patient_id: visitInitialData.patient_id || "",
        executive_id: visitInitialData.executive_id || "",
        lab_id: visitInitialData.lab_id || "",
        visit_date: formatDate(visitInitialData.visit_date) || formatDate(new Date()),
        // Map time_slot (string) to timeSlots id if possible by slot_name
        time_slot_id:
          timeSlots.find((slot) => slot.slot_name === visitInitialData.time_slot)?.id || "",
        address: visitInitialData.address || "",
        status: visitInitialData.status || "booked",
      });
    } else {
      setFormData((f) => ({
        patient_id: "",
        executive_id: "",
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot_id: "",
        address: "",
        status: "booked",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitInitialData, timeSlots]);

  const handleChange = (field) => (e) => {
    setFormData((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>{visitInitialData ? "Edit Visit" : "Create Visit"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel>Patient</FormLabel>
              <Select isRequired value={formData.patient_id} onChange={handleChange("patient_id")}>
                <option value="">Select Patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.phone})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>HV Executive</FormLabel>
              <Select value={formData.executive_id} onChange={handleChange("executive_id")}>
                <option value="">Unassigned</option>
                {executives.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.status})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Lab</FormLabel>
              <Select isRequired value={formData.lab_id} onChange={handleChange("lab_id")}>
                <option value="">Select Lab</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Visit Date</FormLabel>
              <Input
                type="date"
                isRequired
                value={formData.visit_date}
                onChange={handleChange("visit_date")}
                min={formatDate(new Date())}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Time Slot</FormLabel>
              <Select isRequired value={formData.time_slot_id} onChange={handleChange("time_slot_id")}>
                <option value="">Select Time Slot</option>
                {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                  <option key={id} value={id}>
                    {slot_name} ({start_time.slice(0, 5)} - {end_time.slice(0, 5)})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Address</FormLabel>
              <Textarea
                isRequired
                value={formData.address}
                onChange={handleChange("address")}
                placeholder="Address for sample collection"
                rows={3}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Status</FormLabel>
              <Select value={formData.status} onChange={handleChange("status")}>
                {[
                  "booked",
                  "accepted",
                  "pending",
                  "postponed",
                  "rejected",
                  "in_progress",
                  "sample_picked",
                  "sample_dropped",
                  "completed",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ").toUpperCase()}
                  </option>
                ))}
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button isLoading={isLoading} type="submit" colorScheme="brand" mr={3}>
            {visitInitialData ? "Update" : "Create"}
          </Button>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** Modal Form for Creating Patients */
function PatientModal({ isOpen, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({ name: "", phone: "", dob: "", gender: "", email: "" });

  const handleChange = (field) => (e) => {
    setFormData((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) setFormData({ name: "", phone: "", dob: "", gender: "", email: "" });
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Create New Patient</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={formData.name} onChange={handleChange("name")} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Phone</FormLabel>
              <Input value={formData.phone} onChange={handleChange("phone")} />
            </FormControl>
            <FormControl>
              <FormLabel>DOB</FormLabel>
              <Input type="date" value={formData.dob} onChange={handleChange("dob")} />
            </FormControl>
            <FormControl>
              <FormLabel>Gender</FormLabel>
              <Select value={formData.gender} onChange={handleChange("gender")}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Email</FormLabel>
              <Input type="email" value={formData.email} onChange={handleChange("email")} />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button isLoading={isLoading} colorScheme="brand" type="submit" mr={3}>
            Create
          </Button>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** Modal form for Executives creation */
function ExecutiveModal({ isOpen, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({ name: "", phone: "", status: "active" });

  const handleChange = (field) => (e) => {
    setFormData((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  useEffect(() => {
    if (!isOpen) setFormData({ name: "", phone: "", status: "active" });
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Create HV Executive</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={formData.name} onChange={handleChange("name")} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Phone</FormLabel>
              <Input value={formData.phone} onChange={handleChange("phone")} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Status</FormLabel>
              <Select value={formData.status} onChange={handleChange("status")}>
                <option value="active">Active</option>
                <option value="available">Available</option>
                <option value="inactive">Inactive</option>
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button isLoading={isLoading} colorScheme="brand" type="submit" mr={3}>
            Create
          </Button>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default function AdminDashboard() {
  // Tabs
  const [tabIndex, setTabIndex] = useState(0);

  // Entity lists and states
  const [visits, setVisits] = useState([]);
  const [patients, setPatients] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);

  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const toast = useToast();

  // Modals states for create/edit
  const {
    isOpen: isVisitModalOpen,
    onOpen: openVisitModal,
    onClose: closeVisitModal,
  } = useDisclosure();
  const {
    isOpen: isPatientModalOpen,
    onOpen: openPatientModal,
    onClose: closePatientModal,
  } = useDisclosure();
  const {
    isOpen: isExecutiveModalOpen,
    onOpen: openExecutiveModal,
    onClose: closeExecutiveModal,
  } = useDisclosure();

  // Visit to edit
  const [editingVisit, setEditingVisit] = useState(null);

  // Loading states for modals
  const [visitModalLoading, setVisitModalLoading] = useState(false);
  const [patientModalLoading, setPatientModalLoading] = useState(false);
  const [executiveModalLoading, setExecutiveModalLoading] = useState(false);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      // Fetch Visits with joins to patient/executive/lab names
      const { data: visitsData, error: visitsError } = await supabase
        .from("visits")
        .select(
          `
          *,
          patient:patient_id(name, phone),
          executive:executive_id(name),
          lab:lab_id(name)
          `
        )
        .order("visit_date", { ascending: false });
      if (visitsError) throw visitsError;

      const { data: patientsData, error: patientsError } = await supabase
        .from("patients")
        .select("id, name, phone, dob, gender, email")
        .order("name");
      if (patientsError) throw patientsError;

      const { data: executivesData, error: executivesError } = await supabase
        .from("executives")
        .select("id, name, phone, status")
        .order("name");
      if (executivesError) throw executivesError;

      const { data: labsData, error: labsError } = await supabase
        .from("labs")
        .select("id, name")
        .order("name");
      if (labsError) throw labsError;

      const { data: timeSlotsData, error: timeSlotsError } = await supabase
        .from("visit_time_slots")
        .select("id, slot_name, start_time, end_time")
        .order("start_time");
      if (timeSlotsError) throw timeSlotsError;

      setVisits(visitsData || []);
      setPatients(patientsData || []);
      setExecutives(executivesData || []);
      setLabs(labsData || []);
      setTimeSlots(timeSlotsData || []);
    } catch (error) {
      setErrorMsg("Failed to load data. Please reload or try later.");
      console.error(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Visit create or update handler
  const handleVisitSave = async (formData) => {
    setVisitModalLoading(true);
    try {
      const timeSlot = timeSlots.find((slot) => slot.id === formData.time_slot_id);
      if (!timeSlot) throw new Error("Invalid time slot selected");

      const visitPayload = {
        patient_id: formData.patient_id,
        executive_id: formData.executive_id || null,
        lab_id: formData.lab_id,
        visit_date: formData.visit_date,
        time_slot: timeSlot.slot_name,
        address: formData.address,
        status: formData.status,
      };

      if (editingVisit && editingVisit.id) {
        const { error } = await supabase
          .from("visits")
          .update(visitPayload)
          .eq("id", editingVisit.id);
        if (error) throw error;

        toast({
          title: "Visit updated",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        const { error } = await supabase.from("visits").insert([visitPayload]);
        if (error) throw error;

        toast({
          title: "Visit created",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
      closeVisitModal();
      setEditingVisit(null);
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error saving visit",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error(error);
    }
    setVisitModalLoading(false);
  };

  // Patient create handler
  const handlePatientCreate = async (formData) => {
    setPatientModalLoading(true);
    try {
      const { error } = await supabase.from("patients").insert([formData]);
      if (error) throw error;
      toast({
        title: "Patient added",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      closePatientModal();
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error adding patient",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error(error);
    }
    setPatientModalLoading(false);
  };

  // Executive create handler
  const handleExecutiveCreate = async (formData) => {
    setExecutiveModalLoading(true);
    try {
      const { error } = await supabase.from("executives").insert([formData]);
      if (error) throw error;
      toast({
        title: "Executive added",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      closeExecutiveModal();
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error adding executive",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error(error);
    }
    setExecutiveModalLoading(false);
  };

  // Delete visit
  const handleVisitDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this visit?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("visits").delete().eq("id", id);
      if (error) throw error;
      toast({
        title: "Visit deleted",
        status: "info",
        duration: 3000,
        isClosable: true,
      });
      await fetchAll();
    } catch (error) {
      toast({
        title: "Error deleting visit",
        description: error.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error(error);
    }
    setLoading(false);
  };

  // Tab change handler
  const handleTabsChange = (index) => {
    setTabIndex(index);
  };

  return (
    <Box minH="100vh" p={[4, 8]} bg="gray.50">
      {/* Global Header */}
      <Flex align="center" mb={8}>
        <Heading color="brand.600" size="xl" fontWeight="extrabold">
          Labbit Admin Dashboard
        </Heading>
        <Spacer />
        <Button colorScheme="brand" onClick={() => openVisitModal()}>
          <AddIcon mr={1} /> New Visit
        </Button>
      </Flex>

      {/* Error alert */}
      {errorMsg && (
        <Alert status="error" mb={6} borderRadius="md">
          <AlertIcon />
          {errorMsg}
        </Alert>
      )}

      <Tabs index={tabIndex} onChange={handleTabsChange} isLazy variant="enclosed-colored" colorScheme="brand">
        <TabList>
          <Tab>Visits</Tab>
          <Tab>Patients</Tab>
          <Tab>Executives</Tab>
        </TabList>

        <TabPanels>
          {/* Visits Tab */}
          <TabPanel>
            {loading ? (
              <Spinner size="lg" />
            ) : visits.length === 0 ? (
              <Text>No visits found.</Text>
            ) : (
              <Table variant="simple" size="sm" bg="white" rounded="xl" boxShadow="lg" overflowX="auto">
                <Thead bg="gray.100">
                  <Tr>
                    <Th>Visit Code</Th>
                    <Th>Date</Th>
                    <Th>Time Slot</Th>
                    <Th>Patient</Th>
                    <Th>Executive</Th>
                    <Th>Lab</Th>
                    <Th>Status</Th>
                    <Th isNumeric>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {visits.map((visit) => (
                    <Tr key={visit.id}>
                      <Td>{visit.visit_code || "N/A"}</Td>
                      <Td>{formatDate(visit.visit_date)}</Td>
                      <Td>{visit.time_slot}</Td>
                      <Td>{visit.patient?.name || "Unknown"}</Td>
                      <Td>{visit.executive?.name || "Unassigned"}</Td>
                      <Td>{visit.lab?.name || "N/A"}</Td>
                      <Td>
                        <Badge colorScheme={statusColorScheme(visit.status)} rounded="md" px={2}>
                          {visit.status.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </Td>
                      <Td isNumeric>
                        <HStack spacing={1} justifyContent="flex-end">
                          <IconButton
                            aria-label="Edit visit"
                            icon={<EditIcon />}
                            size="sm"
                            colorScheme="brand"
                            onClick={() => {
                              setEditingVisit(visit);
                              openVisitModal();
                            }}
                          />
                          <IconButton
                            aria-label="Delete visit"
                            icon={<DeleteIcon />}
                            size="sm"
                            colorScheme="red"
                            onClick={() => handleVisitDelete(visit.id)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <VisitModal
              isOpen={isVisitModalOpen}
              onClose={() => {
                closeVisitModal();
                setEditingVisit(null);
              }}
              onSubmit={handleVisitSave}
              visitInitialData={editingVisit}
              patients={patients}
              executives={executives}
              labs={labs}
              timeSlots={timeSlots}
              isLoading={visitModalLoading}
            />
          </TabPanel>

          {/* Patients Tab */}
          <TabPanel>
            <Flex mb={4} justifyContent="flex-end">
              <Button leftIcon={<AddIcon />} colorScheme="brand" onClick={openPatientModal}>
                Add Patient
              </Button>
            </Flex>
            {loading ? (
              <Spinner size="lg" />
            ) : patients.length === 0 ? (
              <Text>No patients found.</Text>
            ) : (
              <Table variant="simple" size="sm" rounded="xl" boxShadow="lg" overflowX="auto" bg="white">
                <Thead bg="gray.100">
                  <Tr>
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>DOB</Th>
                    <Th>Gender</Th>
                    <Th>Email</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {patients.map((patient) => (
                    <Tr key={patient.id}>
                      <Td>{patient.name}</Td>
                      <Td>{patient.phone}</Td>
                      <Td>{patient.dob ? formatDate(patient.dob) : "N/A"}</Td>
                      <Td>{patient.gender || "N/A"}</Td>
                      <Td>{patient.email || "N/A"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <PatientModal
              isOpen={isPatientModalOpen}
              onClose={closePatientModal}
              onSubmit={handlePatientCreate}
              isLoading={patientModalLoading}
            />
          </TabPanel>

          {/* Executives Tab */}
          <TabPanel>
            <Flex mb={4} justifyContent="flex-end">
              <Button leftIcon={<AddIcon />} colorScheme="brand" onClick={openExecutiveModal}>
                Add Executive
              </Button>
            </Flex>
            {loading ? (
              <Spinner size="lg" />
            ) : executives.length === 0 ? (
              <Text>No executives found.</Text>
            ) : (
              <Table variant="simple" size="sm" rounded="xl" boxShadow="lg" overflowX="auto" bg="white">
                <Thead bg="gray.100">
                  <Tr>
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {executives.map((exec) => (
                    <Tr key={exec.id}>
                      <Td>{exec.name}</Td>
                      <Td>{exec.phone}</Td>
                      <Td>{exec.status}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <ExecutiveModal
              isOpen={isExecutiveModalOpen}
              onClose={closeExecutiveModal}
              onSubmit={handleExecutiveCreate}
              isLoading={executiveModalLoading}
            />
          </TabPanel>
        </TabPanels>

      </Tabs>

      {/* Optional Footer */}
      <Box mt={12} textAlign="center" color="gray.500" fontSize="sm" userSelect="none">
        Labbit Home Sample Collection Platform © {new Date().getFullYear()}
      </Box>
    </Box>
  );
}
