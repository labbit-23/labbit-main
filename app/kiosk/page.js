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
  Textarea,
  useToast
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు" },
  { code: "hi", label: "हिंदी" },
  { code: "ur", label: "اردو" }
];

const FEEDBACK_TIMEOUT_SECONDS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_KIOSK_FEEDBACK_TIMEOUT_SECONDS || 20);
  if (!Number.isFinite(raw)) return 20;
  return Math.max(5, Math.min(300, Math.round(raw)));
})();

const STEP_TEXT = {
  en: {
    scan_title: "Scan Barcode",
    dispatch_title: "Dispatch Reports",
    feedback_title: "Thank You for Your Patronage to SDRC",
    feedback_subtitle: "Please share quick feedback",
    continue: "Continue",
    print_lab: "Print Lab Reports",
    load_scan: "Print Scan Reports",
    print_all: "Print All Reports",
    save_feedback: "Save Feedback",
    next_patient: "Next Patient"
  },
  te: {
    scan_title: "బార్‌కోడ్ స్కాన్ చేయండి",
    dispatch_title: "రిపోర్ట్ డిస్పాచ్",
    feedback_title: "SDRC‌ను ఆదరించినందుకు ధన్యవాదాలు",
    feedback_subtitle: "దయచేసి మీ అభిప్రాయం ఇవ్వండి",
    continue: "కొనసాగించండి",
    print_lab: "ల్యాబ్ రిపోర్ట్స్ ప్రింట్",
    load_scan: "స్కాన్ రిపోర్ట్స్ ప్రింట్",
    print_all: "అన్ని రిపోర్ట్స్ ప్రింట్",
    save_feedback: "ఫీడ్‌బ్యాక్ సేవ్",
    next_patient: "తర్వాతి పేషెంట్"
  },
  hi: {
    scan_title: "बारकोड स्कैन करें",
    dispatch_title: "रिपोर्ट डिस्पैच",
    feedback_title: "SDRC को आपके सहयोग के लिए धन्यवाद",
    feedback_subtitle: "कृपया फीडबैक दें",
    continue: "आगे बढ़ें",
    print_lab: "लैब रिपोर्ट प्रिंट",
    load_scan: "स्कैन रिपोर्ट प्रिंट",
    print_all: "सभी रिपोर्ट प्रिंट",
    save_feedback: "फीडबैक सेव करें",
    next_patient: "अगला मरीज"
  },
  ur: {
    scan_title: "بارکوڈ اسکین کریں",
    dispatch_title: "رپورٹ ڈسپیچ",
    feedback_title: "SDRC کی سرپرستی کا شکریہ",
    feedback_subtitle: "براہ کرم فیڈبیک دیں",
    continue: "جاری رکھیں",
    print_lab: "لیب رپورٹ پرنٹ",
    load_scan: "اسکین رپورٹ پرنٹ",
    print_all: "تمام رپورٹ پرنٹ",
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

function parseKioskLoginScan(raw) {
  const text = String(raw || "").trim();
  if (!text) return { username: "", password: "", valid: false };
  const [prefixRaw, usernameRaw, passwordRaw] = text.split("|");
  const prefix = String(prefixRaw || "").trim().toUpperCase();
  const username = String(usernameRaw || "").trim();
  const password = String(passwordRaw || "").trim();
  const valid = prefix === "KIOSK_LOGIN" && Boolean(username) && Boolean(password);
  return { username, password, valid };
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

function getPatientDecisionMessage(decision) {
  const code = String(decision?.reason_code || "").trim().toUpperCase();
  if (code === "HISTORY_WITHOUT_TEST_BREAKUP") {
    return "Bot has already dispatched reports for this requisition.";
  }
  return String(decision?.reason || "Load report status.");
}

function getStatusLabel(status) {
  const code = String(status || "").trim().toUpperCase();
  if (code === "FULL_REPORT") return "All Reports are Ready! 👍";
  return String(status || "Not Loaded");
}

function shouldEscalateToFirstFloor({ labReady, labTotal, radiologyReady, radiologyTotal }) {
  const pendingLab = Math.max(0, Number(labTotal || 0) - Number(labReady || 0));
  const pendingRadiology = Math.max(0, Number(radiologyTotal || 0) - Number(radiologyReady || 0));
  return pendingLab > 0 || pendingRadiology > 0;
}

const printBounce = keyframes`
  0%, 100% { transform: translateY(0px); opacity: 0.9; }
  50% { transform: translateY(-2px); opacity: 1; }
`;

const paperFeed = keyframes`
  0% { transform: translateY(-2px); opacity: 0; }
  40% { transform: translateY(2px); opacity: 1; }
  100% { transform: translateY(8px); opacity: 0; }
`;

export default function ReportDispatchKioskPage() {
  const toast = useToast();
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
  const [loginScanValue, setLoginScanValue] = useState("");
  const [labMeta, setLabMeta] = useState({
    name: process.env.NEXT_PUBLIC_APP_NAME || "Labit",
    logo_url: process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png"
  });

  const scanInputRef = useRef(null);
  const scanBufferRef = useRef("");
  const loginScanInputRef = useRef(null);
  const loginScanBufferRef = useRef("");

  const reqid = useMemo(() => String(reqidValue || "").trim(), [reqidValue]);
  const reqno = useMemo(() => String(statusBody?.reqno || "").trim(), [statusBody]);
  const patientName = useMemo(() => String(statusBody?.live_status?.patient_name || "").trim(), [statusBody]);
  const patientPhone = useMemo(() => String(statusBody?.live_status?.patient_phone || "").trim(), [statusBody]);
  const testDate = useMemo(() => String(statusBody?.live_status?.test_date || "").trim(), [statusBody]);
  const testTime = useMemo(() => String(statusBody?.live_status?.test_time || "").trim(), [statusBody]);
  const readyLabKeys = useMemo(() => statusBody?.live_status?.ready_lab_test_keys || [], [statusBody]);
  const readyRadiology = useMemo(() => Number(statusBody?.live_status?.radiology_ready || 0), [statusBody]);
  const hasLabReady = useMemo(() => readyLabKeys.length > 0, [readyLabKeys]);
  const hasRadiologyReady = useMemo(() => readyRadiology > 0, [readyRadiology]);
  const labReadyCount = useMemo(() => Number(statusBody?.live_status?.lab_ready || 0), [statusBody]);
  const labTotalCount = useMemo(() => Number(statusBody?.live_status?.lab_total || 0), [statusBody]);
  const radiologyReadyCount = useMemo(() => Number(statusBody?.live_status?.radiology_ready || 0), [statusBody]);
  const radiologyTotalCount = useMemo(() => Number(statusBody?.live_status?.radiology_total || 0), [statusBody]);
  const showFirstFloorWarning = useMemo(
    () =>
      shouldEscalateToFirstFloor({
        labReady: labReadyCount,
        labTotal: labTotalCount,
        radiologyReady: radiologyReadyCount,
        radiologyTotal: radiologyTotalCount
      }),
    [
      statusBody,
      labReadyCount,
      labTotalCount,
      radiologyReadyCount,
      radiologyTotalCount,
      hasLabReady,
      hasRadiologyReady
    ]
  );
  const text = STEP_TEXT[lang] || STEP_TEXT.en;
  const decision = statusBody?.decision || null;
  const decisionTone = getDecisionTone(decision?.mode);
  const readinessPct = useMemo(() => {
    const ready = Number(statusBody?.live_status?.lab_ready || 0);
    const total = Number(statusBody?.live_status?.lab_total || 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((ready / total) * 100)));
  }, [statusBody]);

  const testDateDisplay = useMemo(() => {
    const rawDate = String(testDate || "").trim();
    const rawTime = String(testTime || "").trim();
    if (!rawDate) return "";
    const cleanedDate = rawDate
      .replace(/\s+00:00:00(?:\.0+)?$/i, "")
      .replace(/T00:00:00(?:\.0+)?$/i, "")
      .trim();
    let prettyDate = cleanedDate;
    const dateMatch = cleanedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const [_, y, m, d] = dateMatch;
      const dt = new Date(`${y}-${m}-${d}T00:00:00`);
      if (!Number.isNaN(dt.getTime())) {
        prettyDate = dt.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
      }
    }
    if (rawTime && rawTime !== "00:00:00" && rawTime !== "00:00:00.0") {
      return `${prettyDate} ${rawTime}`;
    }
    return prettyDate;
  }, [testDate, testTime]);

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

  async function authenticateKiosk(nextUsername, nextPassword) {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/kiosk/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername, password: nextPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (data?.status === "OK") {
        setUsername(nextUsername);
        setPassword("");
        setAuthenticated(true);
        setNotice("");
        setLoginScanValue("");
        loginScanBufferRef.current = "";
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

  async function authenticateKioskByBarcode(barcodeText) {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/kiosk/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_barcode: String(barcodeText || "").trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (data?.status === "OK") {
        setPassword("");
        setAuthenticated(true);
        setNotice("");
        setLoginScanValue("");
        loginScanBufferRef.current = "";
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

  async function handleAuth(e) {
    e.preventDefault();
    await authenticateKiosk(username, password);
  }

  async function handleScanSubmit(targetReqid, targetPassword = "") {
    setLoading(true);
    setNotice("");
    setStatusBody(null);
    try {
      const resolvedReqid = String(targetReqid || reqid || "").trim();
      const resolvedPassword = String(targetPassword || scanSecret || "").trim();
      if (!resolvedReqid || !resolvedPassword) throw new Error("Invalid barcode. Please rescan.");

      const params = new URLSearchParams({
        reqid: resolvedReqid,
        password: resolvedPassword
      });
      const res = await fetch(`/api/kiosk/dispatch-status?${params.toString()}`, {
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
      setNotice("");
      toast({
        title: "Report loaded",
        description: "Status fetched successfully.",
        status: "success",
        duration: 2200,
        isClosable: true,
        position: "top"
      });
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

  async function handlePrintScope(scope) {
    setLoading(true);
    setNotice("");
    setIsPrinting(true);
    try {
      const pages = await printPdfFromApiInMemory("/api/admin/reports/kiosk-print-ready", {
        source: "kiosk",
        report_scope: scope,
        reqid,
        reqno: reqno || null,
        phone: patientPhone || null,
        ready_lab_test_keys: readyLabKeys
      });
      setLastPrintInstruction(`Reports are being printed. Please collect ${pages} page(s) from the print tray below the screen.`);
      toast({
        title: "Print started",
        description: `${pages} page(s) sent to printer.`,
        status: "success",
        duration: 2600,
        isClosable: true,
        position: "top"
      });
      startFeedbackPhase();
    } catch (error) {
      setNotice(error?.message || "Ready print failed.");
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
    setFeedbackCountdown(FEEDBACK_TIMEOUT_SECONDS);
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
    setNotice("");
    toast({
      title: "Ready for next scan",
      status: "success",
      duration: 2000,
      isClosable: true,
      position: "top"
    });
    setTimeout(() => scanInputRef.current?.focus(), 250);
  }

  useEffect(() => {
    if (!authenticated) return;
    if (phase === "scan") setTimeout(() => scanInputRef.current?.focus(), 250);
  }, [phase, authenticated]);

  useEffect(() => {
    if (authenticated) return;
    setTimeout(() => loginScanInputRef.current?.focus(), 120);
  }, [authenticated]);

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
          handleScanSubmit(parsed.reqid, parsed.password);
        } else {
          setNotice("Invalid barcode. Please rescan.");
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

  useEffect(() => {
    if (authenticated) return undefined;

    const onLoginScannerKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = String(event.key || "");

      if (key === "Enter") {
        const scanned = String(loginScanBufferRef.current || loginScanValue || "").trim();
        if (!scanned) return;
        event.preventDefault();
        const parsed = parseKioskLoginScan(scanned);
        setLoginScanValue(scanned);
        loginScanBufferRef.current = "";
        if (parsed.valid) {
          setUsername(parsed.username);
          setPassword(parsed.password);
          authenticateKioskByBarcode(scanned);
        } else {
          setNotice("Invalid login barcode.");
        }
        return;
      }

      if (key === "Backspace") {
        loginScanBufferRef.current = loginScanBufferRef.current.slice(0, -1);
        return;
      }

      if (key.length === 1) {
        loginScanBufferRef.current += key;
        setLoginScanValue(loginScanBufferRef.current);
      }
    };

    window.addEventListener("keydown", onLoginScannerKey);
    return () => window.removeEventListener("keydown", onLoginScannerKey);
  }, [authenticated, loginScanValue]);

  const renderStepScan = () => (
    <Box bg="rgba(255,255,255,0.34)" backdropFilter="blur(10px) saturate(145%)" borderRadius="24px" boxShadow="0 18px 48px rgba(2, 8, 23, 0.18)" border="1px solid rgba(255,255,255,0.42)" p={{ base: 5, md: 6 }} maxW="900px" w="100%">
      <Text fontSize="sm" color="gray.700" fontWeight="semibold" mb={1}>Step 1 of 3</Text>
      <Flex justify="center" mb={4}>
        <Box
          bg="linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.76))"
          border="1px solid rgba(255,255,255,0.75)"
          borderRadius="16px"
          px={{ base: 4, md: 5 }}
          py={{ base: 2, md: 3 }}
          boxShadow="0 10px 30px rgba(15, 23, 42, 0.12)"
        >
          <Image
            src={labMeta.logo_url}
            alt={`${labMeta.name || "Lab"} logo`}
            boxSize={{ base: "132px", md: "168px" }}
            objectFit="contain"
          />
        </Box>
      </Flex>
      <Heading size="lg" mb={4}>{text.scan_title}</Heading>
      <Flex gap={2} wrap="wrap" mb={4}>
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
            handleScanSubmit(parsed.reqid, parsed.password);
          } else {
            setNotice("Invalid barcode. Please rescan.");
          }
        }}
      >
        <FormControl>
          <FormLabel fontWeight="bold" fontSize="lg" color="#0f172a">Scan Barcode</FormLabel>
          <Input
            ref={scanInputRef}
            size="lg"
            value={scanValue}
            onChange={(e) => {
              const nextValue = e.target.value;
              setScanValue(nextValue);
              scanBufferRef.current = nextValue;
            }}
            placeholder="Scan Barcode  ||||||||||"
            h="72px"
            fontSize="xl"
            borderWidth="2px"
            bg="rgba(255,255,255,0.72)"
            color="#0b1220"
            borderColor="rgba(15, 23, 42, 0.35)"
            _placeholder={{ color: "rgba(30, 41, 59, 0.72)" }}
            _hover={{ borderColor: "rgba(15, 23, 42, 0.48)" }}
            _focusVisible={{
              borderColor: "#0f172a",
              boxShadow: "0 0 0 1px #0f172a"
            }}
            inputMode="text"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </FormControl>
        <Button mt={4} size="lg" h="72px" w="100%" colorScheme="blue" type="submit" isLoading={loading} fontSize="xl">
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
    <Box bg="rgba(255,255,255,0.34)" backdropFilter="blur(10px) saturate(145%)" borderRadius="24px" boxShadow="0 18px 48px rgba(2, 8, 23, 0.18)" border="1px solid rgba(15, 23, 42, 0.28)" p={{ base: 4, md: 5 }} maxW="980px" w="100%">
      <Text fontSize="sm" color="#334155" fontWeight="semibold" mb={1}>Step 2 of 3</Text>
      <Heading size="lg" mb={3}>{text.dispatch_title}</Heading>

      <Stack spacing={2} mb={3}>
        {patientName ? <Text fontSize="md" color="#0f172a">Patient: <strong>{patientName}</strong></Text> : null}
        {testDateDisplay ? <Text fontSize="md" color="#0f172a">Test Date: <strong>{testDateDisplay}</strong></Text> : null}
        <Text fontSize="md">
          Status: <Badge colorScheme={decisionTone}>{getStatusLabel(statusBody?.live_status?.overall_status)}</Badge>
        </Text>
        <Text fontSize="md" color="#0f172a">Ready Lab Reports: {statusBody?.live_status?.lab_ready || 0}/{statusBody?.live_status?.lab_total || 0}</Text>
        <Text fontSize="md" color="#0f172a">Ready Scan Reports: {statusBody?.live_status?.radiology_ready || 0}/{statusBody?.live_status?.radiology_total || 0}</Text>
        <Progress value={readinessPct} borderRadius="full" colorScheme={decisionTone} h="9px" />
        <Text color="#1e293b" fontSize="md">{getPatientDecisionMessage(decision)}</Text>
      </Stack>

      <Flex gap={3} direction={{ base: "column", md: "row" }}>
        <Box flex={1}>
          <Button
            colorScheme="blue"
            size="lg"
            h="80px"
            w="100%"
            fontSize="lg"
            onClick={() => handlePrintScope("lab")}
            isLoading={loading}
            isDisabled={!hasLabReady}
          >
            <Flex align="center" gap={3}>
              <Box position="relative" w="22px" h="22px" animation={`${printBounce} 1.2s ease-in-out infinite`}>
                <Text position="absolute" inset="0" fontSize="20px" lineHeight="22px">🖨️</Text>
                <Box
                  position="absolute"
                  left="4px"
                  top="-1px"
                  w="14px"
                  h="8px"
                  borderRadius="2px"
                  bg="whiteAlpha.900"
                  animation={`${paperFeed} 1.2s ease-in-out infinite`}
                />
              </Box>
              <Text>{text.print_lab}</Text>
            </Flex>
          </Button>
          <Text mt={1} fontSize="xs" color="#1e293b" textAlign="center">Blood work / lab tests</Text>
        </Box>
        <Box flex={1}>
          <Button
            colorScheme="teal"
            variant="solid"
            size="lg"
            h="80px"
            w="100%"
            fontSize="lg"
            onClick={() => handlePrintScope("radiology")}
            isLoading={loading}
            isDisabled={!hasRadiologyReady}
            bg="#0f766e"
            color="white"
            border="1px solid #115e59"
            _hover={{ bg: "#115e59" }}
          >
            <Flex align="center" gap={3}>
              <Box position="relative" w="22px" h="22px" animation={`${printBounce} 1.2s ease-in-out infinite`}>
                <Text position="absolute" inset="0" fontSize="20px" lineHeight="22px">🖨️</Text>
                <Box
                  position="absolute"
                  left="4px"
                  top="-1px"
                  w="14px"
                  h="8px"
                  borderRadius="2px"
                  bg="whiteAlpha.900"
                  animation={`${paperFeed} 1.2s ease-in-out infinite`}
                />
              </Box>
              <Text>{text.load_scan}</Text>
            </Flex>
          </Button>
          <Text mt={1} fontSize="xs" color="#1e293b" textAlign="center">X-Ray / scan reports</Text>
        </Box>
        <Box flex={1}>
          <Button
            colorScheme="purple"
            size="lg"
            h="80px"
            w="100%"
            fontSize="lg"
            onClick={() => handlePrintScope("all")}
            isLoading={loading}
            isDisabled={!hasLabReady && !hasRadiologyReady}
          >
            <Flex align="center" gap={3}>
              <Box position="relative" w="22px" h="22px" animation={`${printBounce} 1.2s ease-in-out infinite`}>
                <Text position="absolute" inset="0" fontSize="20px" lineHeight="22px">🖨️</Text>
                <Box
                  position="absolute"
                  left="4px"
                  top="-1px"
                  w="14px"
                  h="8px"
                  borderRadius="2px"
                  bg="purple.100"
                  animation={`${paperFeed} 1.2s ease-in-out infinite`}
                />
              </Box>
              <Text>{text.print_all}</Text>
            </Flex>
          </Button>
          <Text mt={1} fontSize="xs" color="#1e293b" textAlign="center">Lab + scan combined</Text>
        </Box>
      </Flex>

      <Box mt={2} p={2} borderRadius="10px" bg="rgba(255,255,255,0.55)" border="1px solid rgba(15,23,42,0.12)">
        <Text fontSize="sm" fontWeight="semibold" color="#0f172a" mb={1}>Before Print</Text>
        <Text fontSize="xs" color="#1e293b">
          Lab: {labReadyCount}/{labTotalCount} ready ({Math.max(0, labTotalCount - labReadyCount)} pending) •
          Scan: {radiologyReadyCount}/{radiologyTotalCount} ready ({Math.max(0, radiologyTotalCount - radiologyReadyCount)} pending)
        </Text>
      </Box>

      {showFirstFloorWarning ? (
        <Alert status="warning" mt={5} borderRadius="lg" fontSize="lg">
          <AlertIcon />
          Please go to the First Floor using the dedicated elevator.
        </Alert>
      ) : null}

    </Box>
  );

  const renderStepFeedback = () => (
    <Box bg="rgba(255,255,255,0.34)" backdropFilter="blur(10px) saturate(145%)" borderRadius="24px" boxShadow="0 18px 48px rgba(2, 8, 23, 0.18)" border="1px solid rgba(255,255,255,0.42)" p={{ base: 4, md: 5 }} maxW="980px" w="100%">
      <Text fontSize="sm" color="gray.500" mb={1}>Step 3 of 3</Text>
      <Heading size="lg" mb={1}>{text.feedback_title}</Heading>
      <Text color="gray.600" mb={3}>{text.feedback_subtitle}</Text>
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
        <FormControl mb={2}>
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
                    h="58px"
                    minW="58px"
                    fontSize="2xl"
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
        <FormControl mb={3}>
          <FormLabel fontWeight="bold">Feedback</FormLabel>
          <Textarea
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
              markFeedbackInteraction();
            }}
            minH="110px"
            fontSize="md"
            placeholder="Tell us your experience"
            inputMode="text"
            onFocus={markFeedbackInteraction}
          />
        </FormControl>
        <Flex gap={3} direction={{ base: "column", md: "row" }}>
          <Button type="submit" size="lg" h="54px" flex={1} colorScheme="purple" isLoading={loading} isDisabled={rating < 1 || rating > 5}>
            {text.save_feedback}
          </Button>
          <Button size="lg" h="54px" flex={1} variant="outline" onClick={resetSession}>
            {text.next_patient}
          </Button>
        </Flex>
      </form>
    </Box>
  );

  return (
    <Box
      h="100dvh"
      overflow="hidden"
      p={{ base: 2, md: 3 }}
      position="relative"
      fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'
      bgImage='linear-gradient(125deg, rgba(6, 9, 18, 0.72), rgba(10, 14, 24, 0.62)), url("/assets/whatsapp/sdrc_banner.png")'
      bgSize="cover"
      bgPosition="center"
      bgRepeat="no-repeat"
    >
      <Box
        position="absolute"
        inset="0"
        pointerEvents="none"
        bg='radial-gradient(circle at 18% 14%, rgba(255,190,90,0.16), transparent 48%), radial-gradient(circle at 82% 78%, rgba(255,140,48,0.12), transparent 44%), radial-gradient(circle at 52% 52%, rgba(0,0,0,0.28), transparent 66%)'
      />
      <Box maxW="1280px" mx="auto" h="100%" display="flex" flexDirection="column" position="relative" zIndex={1}>
        <Flex
          align="center"
          justify="space-between"
          mb={3}
          bg="rgba(255,255,255,0.9)"
          border="1px solid rgba(15,23,42,0.12)"
          borderRadius="16px"
          p={{ base: 2, md: 2.5 }}
          boxShadow="0 10px 28px rgba(2, 8, 23, 0.18)"
        >
          <Flex align="center" gap={3}>
            <Image
              src="/logo.png"
              alt="Labit logo"
              boxSize={{ base: "48px", md: "56px" }}
              borderRadius="md"
              objectFit="contain"
            />
            <Box>
              <Heading size="md" color="#0f172a" letterSpacing="-0.02em">Report Dispatch Kiosk</Heading>
              <Text color="gray.700" fontSize="sm">{labMeta.name || "Lab"}</Text>
            </Box>
          </Flex>
          <Flex align="center" gap={3}>
            {authenticated ? (
              <Button
                type="button"
                variant="solid"
                bg="white"
                color="#0b1e3d"
                _hover={{ bg: "whiteAlpha.900" }}
                fontSize="md"
                h="42px"
                minW="104px"
                onClick={resetSession}
                title="Home"
              >
                ⌂ Home
              </Button>
            ) : null}
            {authenticated && phase === "feedback" ? (
              <Badge bg="orange.300" color="black" px={3} py={2} borderRadius="full" fontSize="sm">
                Returning Home in {feedbackCountdown}s
              </Badge>
            ) : null}
            <Badge bg={authenticated ? "green.300" : "orange.300"} color="black" px={3} py={1} borderRadius="full" fontSize="sm">
              {authenticated ? "🔒" : "🔓"}
            </Badge>
          </Flex>
        </Flex>

        {notice && phase !== "feedback" ? (
          <Alert status="info" borderRadius="lg" mb={5} bg="rgba(255,255,255,0.9)">
            <AlertIcon />
            {notice}
          </Alert>
        ) : null}

        <Flex justify="center" align="flex-start" flex="1" minH={0}>
          {phase === "scan" && authenticated ? renderStepScan() : null}
          {phase === "dispatch" && authenticated ? renderStepDispatch() : null}
          {phase === "feedback" && authenticated ? renderStepFeedback() : null}
        </Flex>
      </Box>

      <Modal isOpen={!authenticated} onClose={() => {}} isCentered closeOnEsc={false} closeOnOverlayClick={false}>
        <ModalOverlay backdropFilter="blur(2px)" />
        <ModalContent borderRadius="2xl" mx={4} bg="rgba(255,255,255,0.92)" backdropFilter="blur(18px) saturate(160%)" border="1px solid rgba(255,255,255,0.75)">
          <ModalBody p={6}>
            <Flex justify="center" mb={3}>
              <Image
                src="/SDRC_logo.png"
                alt="SDRC logo"
                boxSize="84px"
                objectFit="contain"
              />
            </Flex>
            <Heading size="md" mb={4}>Kiosk Login</Heading>
            <form onSubmit={handleAuth}>
              <FormControl mb={3}>
                <FormLabel>Staff Login Barcode</FormLabel>
                <Input
                  ref={loginScanInputRef}
                  value={loginScanValue}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setLoginScanValue(nextValue);
                    loginScanBufferRef.current = nextValue;
                  }}
                  placeholder="Scan Staff Login Barcode"
                  h="54px"
                />
              </FormControl>
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
