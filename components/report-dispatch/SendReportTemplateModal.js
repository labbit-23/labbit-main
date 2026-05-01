"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Flex,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text
} from "@chakra-ui/react";

const REPORT_TEMPLATE_TEXT =
  "Dear {{1}}, please find attached your {{2}} reports for the test/s done at SDRC.\n\nPlease reply with *Hi* for any queries, appointment booking, trend reports or other information. Our Whatsapp Bot will be available to help you.";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function canonicalIndiaPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 12) return `91${digits.slice(-10)}`;
  return digits;
}

export default function SendReportTemplateModal({
  isOpen,
  onClose,
  defaultPhone = "",
  defaultPatientName = "",
  defaultReqno = "",
  defaultMrno = "",
  registeredPhone = "",
  onSent = null
}) {
  const [phone, setPhone] = useState("");
  const [patientName, setPatientName] = useState("");
  const [reportSource, setReportSource] = useState("requisition_report");
  const [registeredPhoneInput, setRegisteredPhoneInput] = useState("");
  const [reqno, setReqno] = useState("");
  const [mrno, setMrno] = useState("");
  const [reportLabel, setReportLabel] = useState("Test");

  const [lookupResolvedKey, setLookupResolvedKey] = useState("");
  const [lookupSummary, setLookupSummary] = useState("");
  const [error, setError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [authConfirmed, setAuthConfirmed] = useState(false);
  const [authType, setAuthType] = useState("");
  const [authEvidence, setAuthEvidence] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const rawPhone = String(defaultPhone || "").trim();
    const rawReqno = String(defaultReqno || "").trim();
    const rawMrno = String(defaultMrno || "").trim();
    const source = rawReqno ? "requisition_report" : rawMrno ? "trend_report" : "latest_report";
    setPhone(rawPhone);
    setPatientName(String(defaultPatientName || "").trim());
    setRegisteredPhoneInput(String(registeredPhone || rawPhone || "").trim());
    setReqno(rawReqno);
    setMrno(rawMrno);
    setReportSource(source);
    setReportLabel(source === "trend_report" ? "Trend" : source === "requisition_report" ? "Test" : "Latest");

    setLookupResolvedKey("");
    setLookupSummary("");
    setError("");
    setAuthConfirmed(false);
    setAuthType("");
    setAuthEvidence("");
  }, [isOpen, defaultPhone, defaultPatientName, defaultReqno, defaultMrno, registeredPhone]);

  const sourceKey = useMemo(() => {
    if (reportSource === "latest_report") return canonicalIndiaPhone(registeredPhoneInput);
    if (reportSource === "requisition_report") return `REQNO:${String(reqno || "").trim()}`;
    return `MRNO:${String(mrno || "").trim()}`;
  }, [reportSource, registeredPhoneInput, reqno, mrno]);

  const sourceLookupOk = Boolean(lookupResolvedKey && sourceKey && lookupResolvedKey === sourceKey);
  const authorizationRequired =
    reportSource === "latest_report" &&
    Boolean(canonicalIndiaPhone(phone)) &&
    Boolean(canonicalIndiaPhone(registeredPhoneInput)) &&
    canonicalIndiaPhone(phone) !== canonicalIndiaPhone(registeredPhoneInput);
  const authReady =
    !authorizationRequired ||
    (authConfirmed && Boolean(String(authType || "").trim()) && Boolean(String(authEvidence || "").trim()));

  const phoneDigits = digitsOnly(phone);
  const destinationValid =
    (phoneDigits.length === 10 || phoneDigits.length === 12) &&
    !(phoneDigits.length === 12 && !phoneDigits.startsWith("91"));

  const canSend = destinationValid && Boolean(String(patientName || "").trim()) && sourceLookupOk && authReady;

  const previewText = REPORT_TEMPLATE_TEXT
    .replace("{{1}}", String(patientName || "[Patient Name]").trim() || "[Patient Name]")
    .replace("{{2}}", String(reportLabel || "Report").trim() || "Report");

  async function handleLookup() {
    setError("");
    const targetDigits = digitsOnly(phone);
    if (!(targetDigits.length === 10 || targetDigits.length === 12)) {
      setError("Enter a valid destination WhatsApp number first.");
      return;
    }
    if (reportSource === "latest_report") {
      const regDigits = digitsOnly(registeredPhoneInput);
      if (!(regDigits.length === 10 || regDigits.length === 12)) {
        setError("Registered phone must be 10 digits or 12 digits.");
        return;
      }
      if (regDigits.length === 12 && !regDigits.startsWith("91")) {
        setError("12-digit registered phone must start with 91.");
        return;
      }
    }
    if (reportSource === "requisition_report" && !String(reqno || "").trim()) {
      setError("Enter requisition number first.");
      return;
    }
    if (reportSource === "trend_report" && !String(mrno || "").trim()) {
      setError("Enter MRNO first.");
      return;
    }

    setIsLookingUp(true);
    try {
      const res = await fetch("/api/admin/whatsapp/report-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_report_template",
          dry_run: true,
          phone,
          report_source: reportSource,
          registered_phone: registeredPhoneInput,
          reqno,
          mrno
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json().catch(() => ({}));
      const resolved = body?.resolved || {};
      const lookedPatientName = String(resolved?.patient_name || "").trim();
      const lookedReqno = String(resolved?.reqno || reqno || "").trim();
      const lookedMrno = String(resolved?.mrno || mrno || "").trim();
      if (lookedPatientName) setPatientName(lookedPatientName);
      if (lookedReqno) setReqno(lookedReqno);
      if (lookedMrno) setMrno(lookedMrno);

      const lookupKey =
        reportSource === "latest_report"
          ? canonicalIndiaPhone(registeredPhoneInput)
          : reportSource === "requisition_report"
            ? `REQNO:${lookedReqno || reqno}`
            : `MRNO:${lookedMrno || mrno}`;
      setLookupResolvedKey(lookupKey);
      setLookupSummary(
        [
          lookedPatientName || String(patientName || "").trim() || "Patient",
          lookedReqno ? `Req ${lookedReqno}` : "",
          lookedMrno ? `MRNO ${lookedMrno}` : "",
          reportSource === "trend_report" ? "Trend validated" : "Report validated"
        ]
          .filter(Boolean)
          .join(" • ")
      );
    } catch (err) {
      setLookupResolvedKey("");
      setLookupSummary("");
      setError(err?.message || "Lookup failed.");
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSend() {
    setError("");
    if (!canSend) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/admin/whatsapp/report-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_report_template",
          phone,
          patient_name: patientName,
          report_label: reportLabel,
          report_source: reportSource,
          registered_phone: registeredPhoneInput,
          reqno,
          mrno,
          authorization_confirmed: authConfirmed,
          authorization_type: authType,
          authorization_evidence: authEvidence
        })
      });
      if (!res.ok) throw new Error(await res.text());
      if (typeof onSent === "function") onSent({ phone, reportSource, reqno, mrno });
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to send report template.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Send Reports Template</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex direction="column" gap={2}>
            <Input
              size="sm"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              placeholder="10 or 12 digits (example: 9876543210 or 919876543210)"
              isDisabled={isSending}
            />

            <Select
              size="sm"
              value={reportSource}
              onChange={(e) => {
                const next = e.target.value;
                setReportSource(next);
                setLookupResolvedKey("");
                setLookupSummary("");
                setError("");
                setReportLabel(next === "trend_report" ? "Trend" : next === "requisition_report" ? "Test" : "Latest");
              }}
              isDisabled={isSending}
            >
              <option value="latest_report">Latest Report (by Registered Phone)</option>
              <option value="requisition_report">Report by Requisition No</option>
              <option value="trend_report">Trend Report by MRNO</option>
            </Select>

            {reportSource === "latest_report" ? (
              <Input
                size="sm"
                value={registeredPhoneInput}
                onChange={(e) => {
                  setRegisteredPhoneInput(e.target.value);
                  setLookupResolvedKey("");
                  setLookupSummary("");
                  setPatientName("");
                  setReqno("");
                  setMrno("");
                  setError("");
                }}
                placeholder="Registered phone"
                isDisabled={isSending || isLookingUp}
              />
            ) : null}

            {reportSource === "requisition_report" ? (
              <Input
                size="sm"
                value={reqno}
                onChange={(e) => {
                  setReqno(e.target.value);
                  setLookupResolvedKey("");
                  setLookupSummary("");
                  setError("");
                }}
                placeholder="Requisition No"
                isDisabled={isSending}
              />
            ) : null}

            {reportSource === "trend_report" ? (
              <Input
                size="sm"
                value={mrno}
                onChange={(e) => {
                  setMrno(e.target.value);
                  setLookupResolvedKey("");
                  setLookupSummary("");
                  setError("");
                }}
                placeholder="MRNO"
                isDisabled={isSending}
              />
            ) : null}

            <Input
              size="sm"
              value={patientName}
              onChange={(e) => {
                setPatientName(e.target.value);
                setError("");
              }}
              placeholder="Patient Name ({{1}})"
              isDisabled={isSending}
            />

            <Text fontSize="xs">Template label ({'{{2}}'}): <strong>{reportLabel || "Report"}</strong></Text>
            <BoxLike text={previewText} />

            {lookupSummary ? <Text fontSize="xs" color="green.600">{lookupSummary}</Text> : null}

            {authorizationRequired ? (
              <Flex direction="column" gap={2} borderWidth="1px" borderColor="orange.200" bg="orange.50" p={2} borderRadius="md">
                <Checkbox
                  isChecked={authConfirmed}
                  onChange={(e) => {
                    setAuthConfirmed(Boolean(e.target.checked));
                    setError("");
                  }}
                  isDisabled={isSending}
                >
                  Recipient is authorized to receive reports on patient behalf
                </Checkbox>
                <Select
                  size="sm"
                  value={authType}
                  onChange={(e) => {
                    setAuthType(e.target.value);
                    setError("");
                  }}
                  isDisabled={isSending}
                >
                  <option value="">Select confirmation type</option>
                  <option value="bill_sent">Bill Sent</option>
                  <option value="req_phone_name_confirmed">Req No + Phone/Name Confirmed</option>
                  <option value="patient_direct_confirmation">Patient Directly Confirmed</option>
                  <option value="other">Other</option>
                </Select>
                <Input
                  size="sm"
                  value={authEvidence}
                  onChange={(e) => {
                    setAuthEvidence(e.target.value);
                    setError("");
                  }}
                  placeholder='Confirmation evidence details'
                  isDisabled={isSending}
                />
              </Flex>
            ) : null}

            {error ? <Text fontSize="xs" color="red.500">{error}</Text> : null}
            <Text fontSize="xs" color="orange.700">
              This sends report PDF + template. Privacy check is mandatory and this send is audit logged.
            </Text>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <HStack spacing={2}>
            <Button size="sm" onClick={onClose} variant="outline" isDisabled={isSending}>Cancel</Button>
            <Button size="sm" onClick={handleLookup} variant="outline" isLoading={isLookingUp} isDisabled={isSending}>Lookup</Button>
            <Button size="sm" colorScheme="purple" onClick={handleSend} isLoading={isSending} isDisabled={!canSend}>
              Send Template
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function BoxLike({ text }) {
  return (
    <Text fontSize="xs" p={2} borderRadius="md" borderWidth="1px" borderColor="gray.200" bg="gray.50" whiteSpace="pre-wrap">
      {text}
    </Text>
  );
}
