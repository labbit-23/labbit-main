"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
  InputGroup,
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon, DownloadIcon } from "@chakra-ui/icons";
import html2canvas from "html2canvas";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Utility for formatting dates to YYYY-MM-DD
const formatDate = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

// Color mapping for status badges
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

/** Visit Modal: Create/Edit Visit */
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

  // Sync with incoming data
  useEffect(() => {
    if (visitInitialData) {
      setFormData({
        patient_id: visitInitialData.patient_id || "",
        executive_id: visitInitialData.executive_id || "",
        lab_id: visitInitialData.lab_id || "",
        visit_date: formatDate(visitInitialData.visit_date) || formatDate(new Date()),
        time_slot_id:
          timeSlots.find((slot) => slot.slot_name === visitInitialData.time_slot)?.id || "",
        address: visitInitialData.address || "",
        status: visitInitialData.status || "booked",
      });
    } else {
      setFormData({
        patient_id: "",
        executive_id: "",
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot_id: "",
        address: "",
        status: "booked",
      });
    }
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

/** Modal: Patient Create */
function PatientModal({ isOpen, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({ name: "", phone: "", dob: "", gender: "", email: "" });

  const handleChange = (field) => (e) => {
    setFormData((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

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

/** Modal: Executive Create */
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
  // Tab index: 0=Visits,1=Patients,2=Executives
  const [tabIndex, setTabIndex] = useState(0);

  // Entities and data states
  const [visits, setVisits] = useState([]);
  const [patients, setPatients] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const toast = useToast();

  // Modal states
  const visitModal = useDisclosure();
  const patientModal = useDisclosure();
  const executiveModal = useDisclosure();

  const [editingVisit, setEditingVisit] = useState(null);
  const [visitModalLoading, setVisitModalLoading] = useState(false);
  const [patientModalLoading, setPatientModalLoading] = useState(false);
  const [executiveModalLoading, setExecutiveModalLoading] = useState(false);

  // Download visit schedule state + ref for PNG export
  const [downloadDate, setDownloadDate] = useState(formatDate(new Date()));
  const exportTableRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
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
      setErrorMsg("Failed to load data. Please try again.");
      console.error(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Handlers for create/update/delete

  const handleVisitSave = async (formData) => {
    setVisitModalLoading(true);
    try {
      const timeSlot = timeSlots.find((slot) => slot.id === formData.time_slot_id);
      if (!timeSlot) throw new Error("Invalid time slot.");

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
      visitModal.onClose();
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
      patientModal.onClose();
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
      executiveModal.onClose();
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

  const handleVisitDelete = async (id) => {
    if (!window.confirm("Delete this visit?")) return;
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

  // Download Visit Schedule PNG
  const [downloadDate, setDownloadDate] = useState(formatDate(new Date()));

  const handleDownloadSchedule = async () => {
    if (!exportTableRef.current) return;
    try {
      const canvas = await html2canvas(exportTableRef.current, { backgroundColor: "#fff", scale: 2 });
      const link = document.createElement("a");
      link.download = `HV_Visit_Schedule_${downloadDate}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      alert("Failed to generate image: " + error.message);
    }
  };

  const exportTableRef = useRef();

  // Render component
  return (
    <Box minH="100vh" p={[4, 8]} bg="gray.50">
      {/* Header */}
      <Flex align="center" mb={8}>
        <Heading color="brand.600" size="xl" fontWeight="extrabold">
          Labbit Admin Dashboard
        </Heading>
        <Spacer />
        <Button colorScheme="brand" onClick={() => { setEditingVisit(null); visitModal.onOpen(); }} leftIcon={<AddIcon />}>
          New Visit
        </Button>
      </Flex>

      {/* Error */}
      {errorMsg && (
        <Alert status="error" mb={6} borderRadius="md">
          <AlertIcon />
          {errorMsg}
        </Alert>
      )}

      <Tabs index={tabIndex} onChange={setTabIndex} isLazy variant="enclosed-colored" colorScheme="brand">
        <TabList>
          <Tab>Visits</Tab>
          <Tab>Patients</Tab>
          <Tab>Executives</Tab>
        </TabList>

        <TabPanels>
          {/* Visits Tab */}
          <TabPanel>
            <Box mb={4} display="flex" alignItems="center" gap={3} flexWrap="wrap">
              <InputGroup maxW="180px">
                <Input
                  type="date"
                  value={downloadDate}
                  onChange={(e) => setDownloadDate(e.target.value)}
                  aria-label="Select date for export"
                />
              </InputGroup>
              <Button
                leftIcon={<DownloadIcon />}
                colorScheme="brand"
                onClick={handleDownloadSchedule}
                aria-label="Download HV visit schedule as PNG"
              >
                Download Visit Schedule
              </Button>
            </Box>

            {loading ? (
              <Spinner size="lg" />
            ) : visits.length === 0 ? (
              <Text>No visits found.</Text>
            ) : (
              <>
                <Table variant="simple" size="sm" borderRadius="xl" boxShadow="lg" overflowX="auto" bg="white">
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
                                visitModal.onOpen();
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

                {/* Export table for PNG */}
                <Box
                  ref={exportTableRef}
                  bg="white"
                  p={4}
                  borderRadius="xl"
                  boxShadow="lg"
                  maxW="900px"
                  overflowX="auto"
                  mt={8}
                  mb={6}
                  style={{ userSelect: "none", display: "none" }}
                >
                  <Heading size="md" mb={4} textAlign="center" color="brand.600">
                    Home Visit Schedule - {downloadDate}
                  </Heading>
                  <Table size="sm" variant="simple" w="100%">
                    <Thead bg="gray.100">
                      <Tr>
                        <Th>Executive</Th>
                        <Th>Time Slot</Th>
                        <Th>Patient</Th>
                        <Th>Address</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {executives
                        .concat([{ id: null, name: "Unassigned" }])
                        .map((exec) => {
                          const execVisits = visits.filter(
                            (v) =>
                              formatDate(v.visit_date) === downloadDate &&
                              (v.executive_id === exec.id || (exec.id === null && !v.executive_id))
                          );
                          if (execVisits.length === 0) return null;
                          return execVisits.map((v, idx) => (
                            <Tr key={v.id}>
                              {idx === 0 && (
                                <Td rowSpan={execVisits.length} fontWeight="bold" bg="brand.50">
                                  {exec.name}
                                </Td>
                              )}
                              <Td>{v.time_slot}</Td>
                              <Td>{v.patient?.name || "Unknown"}</Td>
                              <Td>{v.address}</Td>
                              <Td>{v.status.replace(/_/g, " ").toUpperCase()}</Td>
                            </Tr>
                          ));
                        })}
                    </Tbody>
                  </Table>
                </Box>
              </>
            )}

            <VisitModal
              isOpen={visitModal.isOpen}
              onClose={() => {
                visitModal.onClose();
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
              <Button leftIcon={<AddIcon />} colorScheme="brand" onClick={patientModal.onOpen}>
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
                  {patients.map((p) => (
                    <Tr key={p.id}>
                      <Td>{p.name}</Td>
                      <Td>{p.phone}</Td>
                      <Td>{p.dob ? formatDate(p.dob) : "N/A"}</Td>
                      <Td>{p.gender || "N/A"}</Td>
                      <Td>{p.email || "N/A"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <PatientModal
              isOpen={patientModal.isOpen}
              onClose={patientModal.onClose}
              onSubmit={handlePatientCreate}
              isLoading={patientModalLoading}
            />
          </TabPanel>

          {/* Executives Tab */}
          <TabPanel>
            <Flex mb={4} justifyContent="flex-end">
              <Button leftIcon={<AddIcon />} colorScheme="brand" onClick={executiveModal.onOpen}>
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
                  {executives.map((e) => (
                    <Tr key={e.id}>
                      <Td>{e.name}</Td>
                      <Td>{e.phone}</Td>
                      <Td>{e.status}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <ExecutiveModal
              isOpen={executiveModal.isOpen}
              onClose={executiveModal.onClose}
              onSubmit={handleExecutiveCreate}
              isLoading={executiveModalLoading}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Footer */}
      <Box mt={12} textAlign="center" color="gray.500" fontSize="sm" userSelect="none">
        Labbit Home Sample Collection Platform © {new Date().getFullYear()}
      </Box>
    </Box>
  );
}
