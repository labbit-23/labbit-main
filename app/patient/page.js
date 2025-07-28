"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Heading,
  Input,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Select,
  Spinner,
  useToast,
  Text,
  HStack,
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";
import TestPackageSelector from "../../components/TestPackageSelector";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";

// Fix leaflet icon paths (required)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Helper to format Date as 'YYYY-MM-DD'
const formatDate = (d) => d.toISOString().split("T")[0];

// Default map center - Hyderabad sample
const DEFAULT_CENTER = [17.385, 78.4867];
const MAP_ZOOM = 13;

export default function PatientVisitRequest() {
  const toast = useToast();

  // Form states
  const [phone, setPhone] = useState("");
  const [patient, setPatient] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [visitDate, setVisitDate] = useState(formatDate(new Date()));
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedTests, setSelectedTests] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Patient details inputs
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");

  // Leaflet map refs and state
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchControlRef = useRef(null);

  // Latitude and Longitude for picked location
  const [latLng, setLatLng] = useState({ lat: null, lng: null });

  // Initialize Leaflet map and geosearch control
  useEffect(() => {
    if (mapRef.current) return; // already initialized

    const map = L.map("map", {
      center: DEFAULT_CENTER,
      zoom: MAP_ZOOM,
    });
    mapRef.current = map;

    // Add OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Add marker
    const marker = L.marker(DEFAULT_CENTER, { draggable: true }).addTo(map);
    markerRef.current = marker;

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      setLatLng(pos);
    });

    // Setup OpenStreetMap provider search control
    const provider = new OpenStreetMapProvider();

    const searchControl = new GeoSearchControl({
      provider,
      style: "bar",
      autoComplete: true,
      autoCompleteDelay: 250,
      retainZoomLevel: false,
      showMarker: false,
      keepResult: true,
      searchLabel: "Enter address",
    });

    searchControlRef.current = searchControl;
    map.addControl(searchControl);

    map.on("geosearch/showlocation", (result) => {
      const { location, marker: sMarker } = result;

      // Move marker to search result location
      marker.setLatLng([location.y, location.x]);

      // Center map there
      map.setView(new L.LatLng(location.y, location.x), 16);

      // Update latLng state
      setLatLng({ lat: location.y, lng: location.x });
    });

    // Cleanup on unmount
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // When selected address changes, update marker location
  useEffect(() => {
    if (!selectedAddressId) {
      setLatLng({ lat: null, lng: null });
      if (markerRef.current) markerRef.current.setLatLng(DEFAULT_CENTER);
      if (mapRef.current) mapRef.current.setView(DEFAULT_CENTER, MAP_ZOOM);
      return;
    }

    const addr = addresses.find((a) => a.id === selectedAddressId);
    if (addr && addr.lat != null && addr.lng != null) {
      setLatLng({ lat: addr.lat, lng: addr.lng });
      if (markerRef.current) markerRef.current.setLatLng([addr.lat, addr.lng]);
      if (mapRef.current) mapRef.current.setView([addr.lat, addr.lng], 16);
    } else {
      setLatLng({ lat: null, lng: null });
      if (markerRef.current) markerRef.current.setLatLng(DEFAULT_CENTER);
      if (mapRef.current) mapRef.current.setView(DEFAULT_CENTER, MAP_ZOOM);
    }
  }, [selectedAddressId, addresses]);

  // Fetch visit timeslots once
  useEffect(() => {
    async function fetchTimeSlots() {
      const { data, error } = await supabase
        .from("visit_time_slots")
        .select("*")
        .order("start_time");
      if (!error) {
        setTimeSlots(data || []);
      }
    }
    fetchTimeSlots();
  }, []);

  // Patient lookup function (Supabase primary + external API fallback)
  const lookupPatient = async () => {
    if (!phone.trim()) {
      toast({ title: "Please enter a phone number", status: "warning" });
      return;
    }

    setLookingUp(true);

    try {
      // Supabase lookup
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPatient(data);
        setName(data.name || "");
        setDob(data.dob ? data.dob.substr(0, 10) : "");
        setEmail(data.email || "");
        setGender(data.gender || "");

        const { data: addrData, error: addrError } = await supabase
          .from("patient_addresses")
          .select("*")
          .eq("patient_id", data.id)
          .order("is_default", { ascending: false });

        if (!addrError) {
          setAddresses(addrData || []);
          setSelectedAddressId(addrData?.length > 0 ? addrData[0].id : "");
        } else {
          setAddresses([]);
          setSelectedAddressId("");
          toast({ title: "Failed to load patient addresses", status: "warning" });
        }

        toast({ title: "Patient found. Details loaded." });
      } else {
        // External API fallback
        const response = await fetch(`/api/patient-lookup?phone=${encodeURIComponent(phone.trim())}`);
        if (!response.ok)
          throw new Error(`External API lookup failed: ${response.statusText}`);

        const json = await response.json();

        if (Array.isArray(json) && json.length > 0) {
          const exPatient = json[0];
          setPatient(null);
          setName(exPatient.FNAME?.trim() ?? "");
          setDob(exPatient.DOB ? exPatient.DOB.split(" ")[0] : "");
          setEmail(exPatient.EMAIL ?? "");
          setGender("");
          setAddresses([]);
          setSelectedAddressId("");
          toast({ title: "Patient data loaded from external source." });
        } else {
          setPatient(null);
          setName("");
          setDob("");
          setEmail("");
          setGender("");
          setAddresses([]);
          setSelectedAddressId("");
          toast({ title: "No patient found. Please enter details." });
        }
      }
    } catch (error) {
      toast({ title: "Error looking up patient", status: "error", description: error.message });
    }

    setLookingUp(false);
  };

  // Submit handler to save patient, addresses' lat/lng, create visit, insert tests
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !phone.trim() ||
      !name.trim() ||
      !visitDate ||
      !selectedSlotId ||
      !selectedAddressId
    ) {
      toast({ title: "Please fill all required fields", status: "warning" });
      return;
    }

    setLoading(true);

    try {
      let patientId = patient?.id;

      if (!patientId) {
        // Insert patient to Supabase
        const { data: newPatient, error: insertError } = await supabase
          .from("patients")
          .insert([{ phone: phone.trim(), name, dob, email, gender }])
          .select()
          .single();

        if (insertError) throw insertError;

        patientId = newPatient.id;
      } else {
        // Update patient info
        const { error: updateError } = await supabase
          .from("patients")
          .update({ name, dob, email, gender })
          .eq("id", patientId);

        if (updateError) throw updateError;
      }

      const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
      if (!selectedAddress) {
        toast({ title: "Selected address not found", status: "error" });
        setLoading(false);
        return;
      }

      // Update patient address lat/lng if changed
      if (
        latLng.lat !== selectedAddress.lat ||
        latLng.lng !== selectedAddress.lng
      ) {
        const { error: addrErr } = await supabase
          .from("patient_addresses")
          .update({ lat: latLng.lat, lng: latLng.lng })
          .eq("id", selectedAddressId);

        if (addrErr) {
          toast({ title: "Failed to update address location", status: "warning" });
        } else {
          setAddresses((prev) =>
            prev.map((addr) =>
              addr.id === selectedAddressId
                ? { ...addr, lat: latLng.lat, lng: latLng.lng }
                : addr
            )
          );
        }
      }

      // Insert new visit
      const { data: visitData, error: visitError } = await supabase
        .from("visits")
        .insert([
          {
            patient_id: patientId,
            visit_date: visitDate,
            time_slot: selectedSlotId,
            address: selectedAddress.label,
            status: "booked",
            executive_id: null,
          },
        ])
        .select()
        .single();

      if (visitError) throw visitError;

      // Insert tests only if selected (tests are optional)
      if (selectedTests.size > 0) {
        const visitDetailInserts = Array.from(selectedTests).map((testId) => ({
          visit_id: visitData.id,
          test_id: testId,
        }));

        const { error: visitDetailError } = await supabase
          .from("visit_details")
          .insert(visitDetailInserts);

        if (visitDetailError) throw visitDetailError;
      }

      toast({ title: "Visit request submitted successfully", status: "success" });

      // Reset form fields
      setPhone("");
      setPatient(null);
      setName("");
      setDob("");
      setEmail("");
      setGender("");
      setAddresses([]);
      setSelectedAddressId("");
      setVisitDate(formatDate(new Date()));
      setSelectedSlotId("");
      setSelectedTests(new Set());
      setLatLng({ lat: null, lng: null });
    } catch (error) {
      toast({ title: "Failed to submit visit request", status: "error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Handle Leaflet map clicks and marker drags to update lat/lng
  const onMapClick = (e) => {
    setLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
  };

  const onMarkerDragEnd = (e) => {
    setLatLng({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng });
  };

  return (
    <Box maxW="md" mx="auto" mt={12} p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} textAlign="center">Patient Visit Request</Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">

          <FormControl isRequired>
            <FormLabel>Phone Number</FormLabel>
            <HStack>
              <Input
                type="tel"
                placeholder="Enter patient phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                isDisabled={loading || lookingUp}
                aria-label="Patient phone number"
              />
              <Button onClick={lookupPatient} isLoading={lookingUp} aria-label="Lookup patient">
                Lookup
              </Button>
            </HStack>
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Patient Name</FormLabel>
            <Input
              type="text"
              placeholder="Enter patient name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              isDisabled={loading}
              aria-label="Patient name"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Date of Birth</FormLabel>
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              isDisabled={loading}
              aria-label="Patient date of birth"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Email</FormLabel>
            <Input
              type="email"
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              isDisabled={loading}
              aria-label="Patient email"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Gender</FormLabel>
            <Select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              placeholder="Select gender"
              isDisabled={loading}
              aria-label="Patient gender"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Select Address</FormLabel>
            <Select
              placeholder="Select saved address"
              onChange={(e) => setSelectedAddressId(e.target.value)}
              value={selectedAddressId}
              isDisabled={loading || addresses.length === 0}
              aria-label="Patient address"
            >
              {addresses.map(({ id, label, pincode }) => (
                <option key={id} value={id}>
                  {label} {pincode ? `(${pincode})` : ""}
                </option>
              ))}
            </Select>
            {addresses.length === 0 && (
              <Text fontSize="sm" color="gray.500" mt={1}>
                No addresses found. Please add addresses in patient profile before booking.
              </Text>
            )}
          </FormControl>

          {/* Leaflet Map Container */}
          <Box height="300px" border="1px solid #CBD5E0" rounded="md" overflow="hidden">
            <LeafletMap
              center={
                latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : DEFAULT_CENTER
              }
              zoom={latLng.lat && latLng.lng ? 16 : 12}
              onMapClick={onMapClick}
              onMarkerDragEnd={onMarkerDragEnd}
              markerPosition={latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : null}
            />
          </Box>

          <FormControl isRequired>
            <FormLabel>Visit Date</FormLabel>
            <Input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              min={formatDate(new Date())}
              isDisabled={loading}
              aria-label="Visit date"
            />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Time Slot</FormLabel>
            {timeSlots.length === 0 ? (
              <Spinner size="sm" />
            ) : (
              <Select
                placeholder="Select time slot"
                onChange={(e) => setSelectedSlotId(e.target.value)}
                value={selectedSlotId}
                isDisabled={loading}
                aria-label="Visit time slot"
              >
                {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                  <option key={id} value={slot_name}>
                    {slot_name} ({start_time} - {end_time})
                  </option>
                ))}
              </Select>
            )}
          </FormControl>

          {/* Tests - optional */}
          <FormControl>
            <FormLabel>Select Tests / Packages (Optional)</FormLabel>
            <Box
              border="1px solid #CBD5E0"
              p={2}
              borderRadius="md"
              maxH="60vh"
              overflowY="auto"
            >
              <TestPackageSelector
                initialSelectedTests={selectedTests}
                onSelectionChange={setSelectedTests}
              />
            </Box>
          </FormControl>

          <Button
            type="submit"
            colorScheme="teal"
            isLoading={loading}
            isDisabled={loading}
          >
            Request Visit
          </Button>
        </VStack>
      </form>
    </Box>
  );
}

// LeafletMap component for internal use
function LeafletMap({ center, zoom, onMapClick, onMarkerDragEnd, markerPosition }) {
  const mapContainerRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);
  const markerRef = React.useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const map = L.map(mapContainerRef.current).setView(center, zoom);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const marker = L.marker(center, { draggable: true }).addTo(map);
    markerRef.current = marker;

    map.on("click", function (e) {
      marker.setLatLng(e.latlng);
      onMapClick && onMapClick(e);
    });

    marker.on("dragend", function (e) {
      onMarkerDragEnd && onMarkerDragEnd(e);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update center and marker position if changed
  useEffect(() => {
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView(center, zoom);
    }
    if (markerRef.current && markerPosition) {
      markerRef.current.setLatLng(markerPosition);
    }
  }, [center, zoom, markerPosition]);

  return <Box ref={mapContainerRef} id="map" style={{ height: "100%", width: "100%" }} />;
}
