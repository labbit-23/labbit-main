"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalOverlay,
  Progress,
  Spinner,
  Stack,
  Text,
  Textarea
} from "@chakra-ui/react";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు" },
  { code: "hi", label: "हिंदी" },
  { code: "ur", label: "اردو" }
];

const STEP_TEXT = {
  en: {
    scan_title: "Scan Barcode",
    dispatch_title: "Dispatch Reports",
    feedback_title: "Thank You for Your Patronage to SDRC",
    feedback_subtitle: "Please share quick feedback",
    continue: "Continue",
    print_ready: "Print Ready Reports",
    print_pending: "Print Pending Reports",
    save_feedback: "Save Feedback",
    next_patient: "Next Patient"
  },
  te: {
    scan_title: "బార్‌కోడ్ స్కాన్ చేయండి",
    dispatch_title: "రిపోర్ట్ డిస్పాచ్",
    feedback_title: "SDRC‌ను ఆదరించినందుకు ధన్యవాదాలు",
    feedback_subtitle: "దయచేసి మీ అభిప్రాయం ఇవ్వండి",
    continue: "కొనసాగించండి",
    print_ready: "రెడీ రిపోర్ట్స్ ప్రింట్",
    print_pending: "పెండింగ్ రిపోర్ట్స్ ప్రింట్",
    save_feedback: "ఫీడ్‌బ్యాక్ సేవ్",
    next_patient: "తర్వాతి పేషెంట్"
  },
  hi: {
    scan_title: "बारकोड स्कैन करें",
    dispatch_title: "रिपोर्ट डिस्पैच",
    feedback_title: "SDRC को आपके सहयोग के लिए धन्यवाद",
    feedback_subtitle: "कृपया फीडबैक दें",
    continue: "आगे बढ़ें",
    print_ready: "रेडी रिपोर्ट प्रिंट",
    print_pending: "पेंडिंग रिपोर्ट प्रिंट",
    save_feedback: "फीडबैक सेव करें",
    next_patient: "अगला मरीज"
  },
  ur: {
    scan_title: "بارکوڈ اسکین کریں",
    dispatch_title: "رپورٹ ڈسپیچ",
    feedback_title: "SDRC کی سرپرستی کا شکریہ",
    feedback_subtitle: "براہ کرم فیڈبیک دیں",
    continue: "جاری رکھیں",
    print_ready: "تیار رپورٹ پرنٹ",
    print_pending: "زیر التوا رپورٹ پرنٹ",
    save_feedback: "فیڈبیک محفوظ کریں",
    next_patient: "اگلا مریض"
  }
};

function parseScanValue(raw) {
  const text = String(raw || "").trim();
  if (!text) return { reqid: "", password: "" };
  const [reqidRaw, passwordRaw] = text.split("|");
  return {
    reqid: String(reqidRaw || "").trim(),
    password: String(passwordRaw || "").trim()
  };
}

function estimatePdfPageCountFromBuffer(buffer) {
  try {
    const text = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    const matches = text.match(/\/Type\s*\/Page\b/g);
    const count = Array.isArray(matches) ? matches.length : 0;
    return count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

function getDecisionTone(mode) {
  if (mode === "allow_full" || mode === "try_pending_print_once") return "blue";
  if (mode === "manual_review") return "orange";
  return "gray";
}

export default function ReportDispatchKioskPage() {
  const [lang, setLang] = useState("en");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [scanSecret, setScanSecret] = useState("");
  const [reqidValue, setReqidValue] = useState("");
  const [statusBody, setStatusBody] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [phase, setPhase] = useState("scan");
  const [feedbackCountdown, setFeedbackCountdown] = useState(0);
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastPrintInstruction, setLastPrintInstruction] = useState("");
  const [labMeta, setLabMeta] = useState({
    name: process.env.NEXT_PUBLIC_APP_NAME || "Labbit",
    logo_url: process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png"
  });

  const scanInputRef = useRef(null);
  const scanBufferRef = useRef("");

  const reqid = useMemo(() => String(reqidValue || "").trim(), [reqidValue]);
  const reqno = useMemo(() => String(statusBody?.reqno || "").trim(), [statusBody]);
  const patientName = useMemo(() => String(statusBody?.live_status?.patient_name || "").trim(), [statusBody]);
  const patientPhone = useMemo(() => String(statusBody?.live_status?.patient_phone || "").trim(), [statusBody]);
  const testDate = useMemo(() => String(statusBody?.live_status?.test_date || "").trim(), [statusBody]);
  const readyLabKeys = useMemo(() => statusBody?.live_status?.ready_lab_test_keys || [], [statusBody]);
  const text = STEP_TEXT[lang] || STEP_TEXT.en;
  const decision = statusBody?.decision || null;
  const decisionTone = getDecisionTone(decision?.mode);
  const readinessPct = useMemo(() => {
    const ready = Number(statusBody?.live_status?.lab_ready || 0);
    const total = Number(statusBody?.live_status?.lab_total || 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((ready / total) * 100)));
  }, [statusBody]);

  async function fetchLabMeta() {
    try {
      const res = await fetch("/api/kiosk/lab-meta", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (!body || typeof body !== "object") return;
      setLabMeta((prev) => ({
        name: body?.name || prev.name,
        logo_url: body?.logo_url || prev.logo_url
      }));
    } catch {
      // fallback to env branding
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/kiosk/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (data?.status === "OK") {
        setAuthenticated(true);
        setNotice("Kiosk authenticated. Scan barcode to continue.");
        await fetchLabMeta();
      } else {
        setAuthenticated(false);
        setNotice("Invalid kiosk credentials.");
      }
    } catch (error) {
      setNotice(error?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleScanSubmit(targetReqid) {
    setLoading(true);
    setNotice("");
    setStatusBody(null);
    try {
      const resolvedReqid = String(targetReqid || reqid || "").trim();
      if (!resolvedReqid) throw new Error("Invalid barcode. Expected REQID|PASSWORD.");

      const res = await fetch(`/api/admin/reports/dispatch-status?reqid=${encodeURIComponent(resolvedReqid)}&source=kiosk`, {
        cache: "no-store",
        headers: { "x-report-source": "kiosk" }
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Kiosk login required. Please authenticate and retry.");
        throw new Error(await res.text());
      }

      const data = await res.json();
      setStatusBody(data);
      setPhase("dispatch");
      setNotice("Report status loaded.");
    } catch (error) {
      setNotice(error?.message || "Failed to load report status.");
    } finally {
      setLoading(false);
    }
  }

  async function printPdfFromApiInMemory(url, payload) {
    const printWindow = window.open("", "_blank", "width=920,height=760");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-report-source": "kiosk" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      if (printWindow && !printWindow.closed) {
        try {
          printWindow.close();
        } catch {}
      }
      throw new Error(text || "Print request failed");
    }

    const bytes = await res.arrayBuffer();
    const pageCount = estimatePdfPageCountFromBuffer(bytes);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);

    if (printWindow && !printWindow.closed) {
      printWindow.location.href = blobUrl;
      await new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          try {
            printWindow.close();
          } catch {}
          URL.revokeObjectURL(blobUrl);
          resolve();
        };

        const invokePrint = () => {
          try {
            if (!printWindow.closed) {
              printWindow.focus();
              printWindow.print();
            }
          } catch {}
        };

        printWindow.onload = () => {
          setTimeout(invokePrint, 700);
          setTimeout(invokePrint, 1800);
          setTimeout(invokePrint, 3200);
        };
        printWindow.onafterprint = done;
        setTimeout(done, 7000);
      });
      return pageCount;
    }

    URL.revokeObjectURL(blobUrl);
    return pageCount;
  }

  async function handlePrintReady() {
    setLoading(true);
    setNotice("");
    setIsPrinting(true);
    try {
      const pages = await printPdfFromApiInMemory("/api/admin/reports/kiosk-print-ready", {
        source: "kiosk",
        reqid,
        reqno: reqno || null,
        phone: patientPhone || null,
        ready_lab_test_keys: readyLabKeys
      });
      setLastPrintInstruction(`Reports are being printed. Please collect ${pages} page(s) from the print tray below the screen.`);
      startFeedbackPhase();
    } catch (error) {
      setNotice(error?.message || "Ready print failed.");
    } finally {
      setIsPrinting(false);
      setLoading(false);
    }
  }

  async function handlePrintPendingOnce() {
    setLoading(true);
    setNotice("");
    setIsPrinting(true);
    try {
      const pages = await printPdfFromApiInMemory("/api/admin/reports/pending-print-once", {
        source: "kiosk",
        reqid,
        reqno: reqno || null,
        phone: patientPhone || null,
        ready_lab_test_keys: readyLabKeys
      });
      setLastPrintInstruction(`Reports are being printed. Please collect ${pages} page(s) from the print tray below the screen.`);
      startFeedbackPhase();
    } catch (error) {
      setNotice(error?.message || "Pending print failed.");
    } finally {
      setIsPrinting(false);
      setLoading(false);
    }
  }

  async function handleFeedbackSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/reports/kiosk-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reqid,
          reqno: reqno || null,
          patient_phone: patientPhone || null,
          rating,
          feedback
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Feedback saved.");
      resetSession();
    } catch (error) {
      setNotice(error?.message || "Failed to save feedback.");
    } finally {
      setLoading(false);
    }
  }

  function startFeedbackPhase() {
    setFeedbackCountdown(15);
    setPhase("feedback");
  }

  function markFeedbackInteraction() {
    if (phase !== "feedback") return;
    setFeedbackCountdown((prev) => Math.max(prev, 60));
  }

  function resetSession() {
    scanBufferRef.current = "";
    setScanValue("");
    setScanSecret("");
    setReqidValue("");
    setStatusBody(null);
    setRating(0);
    setFeedback("");
    setIsPrinting(false);
    setLastPrintInstruction("");
    setLang("en");
    setPhase("scan");
    setFeedbackCountdown(0);
    setNotice("Session closed. Ready for next scan.");
    setTimeout(() => scanInputRef.current?.focus(), 250);
  }

  useEffect(() => {
    if (!authenticated) return;
    if (phase === "scan") setTimeout(() => scanInputRef.current?.focus(), 250);
  }, [phase, authenticated]);

  useEffect(() => {
    if (phase !== "feedback" || feedbackCountdown <= 0) return;
    const timer = setTimeout(() => {
      setFeedbackCountdown((prev) => {
        if (prev <= 1) {
          resetSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, feedbackCountdown]);

  useEffect(() => {
    if (!authenticated || phase !== "scan") return undefined;

    const onScannerKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = String(event.key || "");

      if (key === "Enter") {
        const scanned = String(scanBufferRef.current || scanValue || "").trim();
        if (!scanned) return;
        event.preventDefault();
        const parsed = parseScanValue(scanned);
        setScanValue(scanned);
        setReqidValue(parsed.reqid);
        setScanSecret(parsed.password);
        if (parsed.reqid) {
          handleScanSubmit(parsed.reqid);
        } else {
          setNotice("Invalid barcode format. Use REQID|PASSWORD.");
        }
        scanBufferRef.current = "";
        return;
      }

      if (key === "Backspace") {
        scanBufferRef.current = scanBufferRef.current.slice(0, -1);
        return;
      }

      if (key.length === 1) {
        scanBufferRef.current += key;
        setScanValue(scanBufferRef.current);
      }
    };

    window.addEventListener("keydown", onScannerKey);
    return () => window.removeEventListener("keydown", onScannerKey);
  }, [authenticated, phase, scanValue]);

  const renderStepScan = () => (
    <Box bg="white" borderRadius="2xl" boxShadow="xl" p={{ base: 6, md: 8 }} maxW="920px" w="100%">
      <Text fontSize="sm" color="gray.500" mb={1}>Step 1 of 3</Text>
      <Flex justify="center" mb={4}>
        <Image
          src={labMeta.logo_url}
          alt={`${labMeta.name || "Lab"} logo`}
          boxSize={{ base: "132px", md: "168px" }}
          objectFit="contain"
        />
      </Flex>
      <Heading size="xl" mb={5}>{text.scan_title}</Heading>
      <Flex gap={2} wrap="wrap" mb={5}>
        {LANGUAGE_OPTIONS.map((option) => (
          <Button
            key={option.code}
            size="sm"
            variant={lang === option.code ? "solid" : "outline"}
            colorScheme={lang === option.code ? "blue" : "gray"}
            onClick={() => {
              setLang(option.code);
              setTimeout(() => scanInputRef.current?.focus(), 40);
            }}
          >
            {option.label}
          </Button>
        ))}
      </Flex>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseScanValue(scanValue);
          setReqidValue(parsed.reqid);
          setScanSecret(parsed.password);
          if (parsed.reqid) {
            handleScanSubmit(parsed.reqid);
          } else {
            setNotice("Invalid barcode format. Use REQID|PASSWORD.");
          }
        }}
      >
        <FormControl>
          <FormLabel fontWeight="bold" fontSize="lg">Barcode Input</FormLabel>
          <Input
            ref={scanInputRef}
            size="lg"
            value={scanValue}
            onChange={(e) => {
              const nextValue = e.target.value;
              setScanValue(nextValue);
              scanBufferRef.current = nextValue;
            }}
            placeholder="Scan REQID|PASSWORD"
            h="84px"
            fontSize="2xl"
            borderWidth="2px"
            inputMode="text"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </FormControl>
        <Text mt={2} color="gray.600" fontSize="sm">
          Dev input: <strong>REQID|DUMMYPASSWORD</strong>. Only REQID is used.
        </Text>
        <Button mt={5} size="lg" h="84px" w="100%" colorScheme="blue" type="submit" isLoading={loading} fontSize="2xl">
          {text.continue}
        </Button>
      </form>
      {reqid ? (
        <Text mt={4} fontWeight="semibold" fontSize="lg">
          REQID: <Text as="span" color="blue.700">{reqid}</Text>
        </Text>
      ) : null}
      {scanSecret ? <Text mt={1} color="gray.500">Scanned Password Part: {scanSecret}</Text> : null}
    </Box>
  );

  const renderStepDispatch = () => (
    <Box bg="white" borderRadius="2xl" boxShadow="xl" p={{ base: 6, md: 8 }} maxW="980px" w="100%">
      <Text fontSize="sm" color="gray.500" mb={1}>Step 2 of 3</Text>
      <Heading size="xl" mb={5}>{text.dispatch_title}</Heading>

      <Stack spacing={3} mb={5}>
        {patientName ? <Text fontSize="lg">Patient: <strong>{patientName}</strong></Text> : null}
        {testDate ? <Text fontSize="lg">Test Date: <strong>{testDate}</strong></Text> : null}
        <Text fontSize="lg">
          Status: <Badge colorScheme={decisionTone}>{statusBody?.live_status?.overall_status || "Not Loaded"}</Badge>
        </Text>
        <Text fontSize="lg">Ready Lab Reports: {statusBody?.live_status?.lab_ready || 0}/{statusBody?.live_status?.lab_total || 0}</Text>
        <Progress value={readinessPct} borderRadius="full" colorScheme={decisionTone} h="12px" />
        <Text color="gray.700" fontSize="lg">{decision?.reason || "Load report status."}</Text>
      </Stack>

      <Flex gap={4} direction={{ base: "column", md: "row" }}>
        <Button
          colorScheme="blue"
          size="lg"
          h="104px"
          flex={1}
          fontSize="2xl"
          onClick={handlePrintReady}
          isLoading={loading}
          isDisabled={!readyLabKeys.length}
        >
          {text.print_ready}
        </Button>
        <Button
          colorScheme="yellow"
          variant={decision?.mode === "try_pending_print_once" ? "solid" : "outline"}
          size="lg"
          h="104px"
          flex={1}
          fontSize="2xl"
          onClick={handlePrintPendingOnce}
          isLoading={loading}
          isDisabled={decision?.mode !== "try_pending_print_once"}
        >
          {text.print_pending}
        </Button>
      </Flex>

      {decision?.mode === "manual_review" ? (
        <Alert status="warning" mt={5} borderRadius="lg" fontSize="lg">
          <AlertIcon />
          Please go to the First Floor using the dedicated elevator.
        </Alert>
      ) : null}

    </Box>
  );

  const renderStepFeedback = () => (
    <Box bg="white" borderRadius="2xl" boxShadow="xl" p={{ base: 6, md: 8 }} maxW="980px" w="100%">
      <Text fontSize="sm" color="gray.500" mb={1}>Step 3 of 3</Text>
      <Heading size="xl" mb={1}>{text.feedback_title}</Heading>
      <Text color="gray.600" mb={5}>{text.feedback_subtitle}</Text>
      {(patientName || testDate) ? (
        <Text mb={4} color="gray.700">
          {patientName ? `Patient: ${patientName}` : ""}{patientName && testDate ? " • " : ""}{testDate ? `Test Date: ${testDate}` : ""}
        </Text>
      ) : null}

      {lastPrintInstruction ? (
        <Alert status="success" borderRadius="md" mb={4}>
          <AlertIcon />
          {lastPrintInstruction}
        </Alert>
      ) : null}

      <Alert status="info" borderRadius="md" mb={4}>
        <AlertIcon />
        Returning to scan screen in {feedbackCountdown}s
      </Alert>

      <form onSubmit={handleFeedbackSubmit}>
        <FormControl mb={3}>
          <FormLabel fontWeight="bold">Rating</FormLabel>
          <Flex gap={2} wrap="wrap">
            {[1, 2, 3, 4, 5].map((value) => (
              (() => {
                const active = rating >= value;
                const scheme =
                  value <= 2 ? "red" :
                    value === 3 ? "orange" :
                      value === 4 ? "yellow" : "green";
                return (
                  <Button
                    key={value}
                    type="button"
                    h="68px"
                    minW="68px"
                    fontSize="3xl"
                    colorScheme={active ? scheme : "gray"}
                    variant={active ? "solid" : "outline"}
                    onClick={() => {
                      setRating(value);
                      markFeedbackInteraction();
                    }}
                    transform={active ? "translateY(-2px)" : "none"}
                    transition="all 0.15s ease"
                  >
                    {active ? "★" : "☆"}
                  </Button>
                );
              })()
            ))}
          </Flex>
        </FormControl>
        <FormControl mb={4}>
          <FormLabel fontWeight="bold">Feedback</FormLabel>
          <Textarea
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
              markFeedbackInteraction();
            }}
            minH="180px"
            fontSize="lg"
            placeholder="Tell us your experience"
            inputMode="text"
            onFocus={markFeedbackInteraction}
          />
        </FormControl>
        <Flex gap={3} direction={{ base: "column", md: "row" }}>
          <Button type="submit" size="lg" h="62px" flex={1} colorScheme="purple" isLoading={loading} isDisabled={rating < 1 || rating > 5}>
            {text.save_feedback}
          </Button>
          <Button size="lg" h="62px" flex={1} variant="outline" onClick={resetSession}>
            {text.next_patient}
          </Button>
        </Flex>
      </form>
    </Box>
  );

  return (
    <Box minH="100vh" bgGradient="linear(to-b, #eaf5ff 0%, #f8fbff 45%, #ffffff 100%)" p={{ base: 4, md: 8 }}>
      <Box maxW="1280px" mx="auto">
        <Flex align="center" justify="space-between" mb={6}>
          <Flex align="center" gap={3}>
            <Image
              src={labMeta.logo_url}
              alt={`${labMeta.name || "Lab"} logo`}
              boxSize={{ base: "64px", md: "84px" }}
              borderRadius="md"
              objectFit="contain"
              bg="white"
              p={1}
              borderWidth="1px"
              borderColor="blue.100"
            />
            <Box>
              <Heading size="lg" color="blue.700">Report Dispatch Kiosk</Heading>
              <Text color="gray.600" fontSize="sm">{labMeta.name || "Lab"}</Text>
            </Box>
          </Flex>
          <Flex align="center" gap={3}>
            {authenticated ? (
              <Button
                type="button"
                variant="solid"
                colorScheme="blue"
                fontSize="md"
                h="48px"
                minW="120px"
                onClick={resetSession}
                title="Home"
              >
                ⌂ Home
              </Button>
            ) : null}
            {authenticated && phase === "feedback" ? (
              <Badge colorScheme="orange" px={3} py={2} borderRadius="full" fontSize="sm">
                Returning Home in {feedbackCountdown}s
              </Badge>
            ) : null}
            <Badge colorScheme={authenticated ? "green" : "orange"} px={3} py={1} borderRadius="full" fontSize="sm">
              {authenticated ? "Authenticated" : "Login Required"}
            </Badge>
          </Flex>
        </Flex>

        {notice && phase !== "feedback" ? (
          <Alert status="info" borderRadius="lg" mb={5}>
            <AlertIcon />
            {notice}
          </Alert>
        ) : null}

        <Flex justify="center" align="flex-start" minH="72vh">
          {phase === "scan" && authenticated ? renderStepScan() : null}
          {phase === "dispatch" && authenticated ? renderStepDispatch() : null}
          {phase === "feedback" && authenticated ? renderStepFeedback() : null}
        </Flex>
      </Box>

      <Modal isOpen={!authenticated} onClose={() => {}} isCentered closeOnEsc={false} closeOnOverlayClick={false}>
        <ModalOverlay backdropFilter="blur(2px)" />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalBody p={6}>
            <Heading size="md" mb={4}>Kiosk Login</Heading>
            <form onSubmit={handleAuth}>
              <FormControl mb={3}>
                <FormLabel>Username</FormLabel>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} h="54px" />
              </FormControl>
              <FormControl mb={4}>
                <FormLabel>Password</FormLabel>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} h="54px" />
              </FormControl>
              <Button type="submit" colorScheme="blue" w="100%" h="58px" isLoading={loading}>
                Login
              </Button>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>

      {isPrinting ? (
        <Box
          position="fixed"
          inset="0"
          bg="rgba(10, 20, 35, 0.58)"
          zIndex={1500}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={6}
        >
          <Box bg="white" borderRadius="xl" p={8} maxW="520px" w="100%" textAlign="center" boxShadow="2xl">
            <Spinner size="xl" color="blue.500" thickness="4px" mb={4} />
            <Heading size="md" mb={2}>Preparing Print</Heading>
            <Text color="gray.700">Please wait while your report is sent to printer.</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
