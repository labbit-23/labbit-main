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

const NO_AUTOFILL_TEXT_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false
};

const STEP_TEXT = {
  en: {
    scan_title: "Scan the QR Code on your bill",
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
    scan_title: "మీ బిల్లుపై ఉన్న QR కోడ్‌ను స్కాన్ చేయండి",
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
    scan_title: "अपने बिल पर दिया गया QR कोड स्कैन करें",
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
    scan_title: "اپنے بل پر موجود QR کوڈ اسکین کریں",
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// The QR holds a URL ending in the requisition UUID; a bare UUID is also accepted.
function parseScanValue(raw) {
  const match = String(raw || "").trim().match(UUID_RE);
  return { reqid: match ? match[0].toLowerCase() : "" };
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
  if (mode === "allow_full" || mode === "try_pending_print_once") return "teal";
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
  if (code === "FULL_REPORT") return "All reports are ready";
  if (code === "PARTIAL_REPORT") return "Some reports are ready";
  if (code === "NO_REPORT" || code === "PENDING") return "Reports not ready yet";
  return String(status || "Not loaded").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function shouldEscalateToFirstFloor({ labReady, labTotal, radiologyReady, radiologyTotal }) {
  const pendingLab = Math.max(0, Number(labTotal || 0) - Number(labReady || 0));
  const pendingRadiology = Math.max(0, Number(radiologyTotal || 0) - Number(radiologyReady || 0));
  return pendingLab > 0 || pendingRadiology > 0;
}

const K = {
  plum: "#8A6BA3", plumStrong: "#6B4F82", plumSoft: "#F1EBF5", plumLine: "#D8C9E3", plumInk: "#4A3358",
  text: "#15181C", text2: "#525860", text3: "#878D94", line: "#E6E8EB", bg: "#F6F7F8",
  okSoft: "#ECF5EF", okInk: "#2F6B49", warnSoft: "#F8F1E2", warnInk: "#7A5A23"
};
const CARD = {
  bg: "white",
  border: `1px solid ${K.line}`,
  borderRadius: "24px",
  boxShadow: "0 1px 2px rgba(21,24,28,0.05), 0 12px 32px rgba(21,24,28,0.08)"
};
const PRIMARY_BTN = { bg: K.plum, color: "white", _hover: { bg: K.plumStrong }, _active: { bg: K.plumStrong }, _disabled: { bg: K.line, color: K.text3, cursor: "not-allowed", _hover: { bg: K.line } } };
const OUTLINE_BTN = { bg: "white", color: K.plumStrong, border: `2px solid ${K.plumLine}`, _hover: { bg: K.plumSoft }, _disabled: { opacity: 0.45, cursor: "not-allowed", _hover: { bg: "white" } } };

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

  async function handleScanSubmit(targetReqid) {
    setLoading(true);
    setNotice("");
    setStatusBody(null);
    try {
      const resolvedReqid = String(targetReqid || reqid || "").trim();
      if (!resolvedReqid) throw new Error("Invalid QR code. Please rescan.");

      const params = new URLSearchParams({ reqid: resolvedReqid });
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
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.focus();
      }
    }, 120);
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
        if (parsed.reqid) {
          handleScanSubmit(parsed.reqid);
        } else {
          setNotice("Invalid QR code. Please rescan.");
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
        const scanned = String(loginScanBufferRef.current || "").trim();
        if (!scanned) return;
        event.preventDefault();
        const parsed = parseKioskLoginScan(scanned);
        loginScanBufferRef.current = "";
        if (parsed.valid) {
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
      }
    };

    window.addEventListener("keydown", onLoginScannerKey);
    return () => window.removeEventListener("keydown", onLoginScannerKey);
  }, [authenticated]);

  const readyTone = showFirstFloorWarning ? "warn" : "ok";
  const StatTile = ({ label, ready, total }) => (
    <Box flex={1} bg={K.bg} border={`1px solid ${K.line}`} borderRadius="18px" p={4}>
      <Text fontSize="md" color={K.text2} fontWeight="medium">{label}</Text>
      <Flex align="baseline" gap={2} mt={1}>
        <Text fontSize="4xl" fontWeight="semibold" color={K.plumInk} lineHeight="1">{ready}</Text>
        <Text fontSize="xl" color={K.text3}>of {total} ready</Text>
      </Flex>
      <Progress value={total ? Math.round((ready / total) * 100) : 0} mt={3} h="8px" borderRadius="full" bg={K.line} sx={{ "& > div": { background: K.plum } }} />
    </Box>
  );
  const PrintIcon = () => (
    <Box position="relative" w="22px" h="22px" animation={`${printBounce} 1.2s ease-in-out infinite`}>
      <Text position="absolute" inset="0" fontSize="20px" lineHeight="22px">🖨️</Text>
    </Box>
  );

  const renderStepScan = () => (
    <Box {...CARD} p={{ base: 6, md: 10 }} maxW="720px" w="100%" mt={{ base: 2, md: 8 }}>
      <Flex direction="column" align="center" textAlign="center" mb={6}>
        <Image src={labMeta.logo_url} alt={`${labMeta.name || "Lab"} logo`} h={{ base: "48px", md: "60px" }} maxW="60%" objectFit="contain" opacity={0.95} mb={5} />
        <Heading fontSize={{ base: "2xl", md: "3xl" }} fontWeight="semibold" color={K.text} letterSpacing="-0.01em">{text.scan_title}</Heading>
      </Flex>
      <Flex gap={2} wrap="wrap" justify="center" mb={6}>
        {LANGUAGE_OPTIONS.map((option) => (
          <Button
            key={option.code}
            size="md"
            borderRadius="full"
            px={5}
            fontWeight="medium"
            {...(lang === option.code ? PRIMARY_BTN : { bg: "white", color: K.text2, border: `1px solid ${K.line}`, _hover: { bg: K.plumSoft } })}
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
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseScanValue(scanValue);
          setReqidValue(parsed.reqid);
          if (parsed.reqid) {
            handleScanSubmit(parsed.reqid);
          } else {
            setNotice("Invalid QR code. Please rescan.");
          }
        }}
      >
        <FormControl>
          <Input
            ref={scanInputRef}
            size="lg"
            value={scanValue}
            onChange={(e) => {
              const nextValue = e.target.value;
              setScanValue(nextValue);
              scanBufferRef.current = nextValue;
            }}
            placeholder="Waiting for scan…"
            aria-label="QR code on your bill"
            name="kiosk-barcode-scan"
            h="68px"
            fontSize="xl"
            textAlign="center"
            borderWidth="2px"
            borderRadius="16px"
            bg="white"
            color={K.text}
            borderColor={K.plumLine}
            _placeholder={{ color: K.text3 }}
            _hover={{ borderColor: K.plum }}
            _focusVisible={{ borderColor: K.plum, boxShadow: `0 0 0 3px ${K.plumSoft}` }}
            inputMode="text"
            {...NO_AUTOFILL_TEXT_PROPS}
          />
        </FormControl>
        <Button mt={4} h="68px" w="100%" borderRadius="16px" type="submit" isLoading={loading} fontSize="xl" fontWeight="semibold" {...PRIMARY_BTN}>
          {text.continue}
        </Button>
      </form>
    </Box>
  );

  const renderStepDispatch = () => (
    <Box {...CARD} p={{ base: 5, md: 8 }} maxW="980px" w="100%" mt={{ base: 1, md: 4 }}>
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2} mb={5}>
        <Box>
          <Text fontSize="md" color={K.text3} fontWeight="medium">{text.dispatch_title}</Text>
          <Heading fontSize={{ base: "2xl", md: "3xl" }} fontWeight="semibold" color={K.text} letterSpacing="-0.01em">
            {patientName ? `Hello, ${patientName}` : "Hello"}
          </Heading>
        </Box>
        {testDateDisplay ? (
          <Box bg={K.plumSoft} color={K.plumInk} borderRadius="full" px={4} py={1.5} fontSize="md" fontWeight="medium">{testDateDisplay}</Box>
        ) : null}
      </Flex>

      <Flex
        align="center"
        gap={3}
        bg={readyTone === "ok" ? K.okSoft : K.warnSoft}
        color={readyTone === "ok" ? K.okInk : K.warnInk}
        borderRadius="16px"
        px={5}
        py={4}
        mb={4}
        fontSize="xl"
        fontWeight="medium"
      >
        <Text as="span" fontSize="2xl">{readyTone === "ok" ? "✓" : "!"}</Text>
        <Text>{getStatusLabel(statusBody?.live_status?.overall_status)}</Text>
      </Flex>
      <Text color={K.text2} fontSize="lg" mb={4}>{getPatientDecisionMessage(decision)}</Text>

      <Flex gap={4} mb={6} direction={{ base: "column", md: "row" }}>
        <StatTile label="Lab reports" ready={labReadyCount} total={labTotalCount} />
        {radiologyTotalCount > 0 ? <StatTile label="Scan reports" ready={radiologyReadyCount} total={radiologyTotalCount} /> : null}
      </Flex>

      <Flex gap={3} direction={{ base: "column", md: "row" }}>
        {radiologyTotalCount > 0 ? (
          <Button flex={1} h="76px" borderRadius="18px" fontSize="lg" fontWeight="semibold" onClick={() => handlePrintScope("all")} isLoading={loading} isDisabled={!hasLabReady && !hasRadiologyReady} {...PRIMARY_BTN}>
            <Flex align="center" gap={3}><PrintIcon /><Text>{text.print_all}</Text></Flex>
          </Button>
        ) : null}
        <Button flex={1} h="76px" borderRadius="18px" fontSize="lg" fontWeight="semibold" onClick={() => handlePrintScope("lab")} isLoading={loading} isDisabled={!hasLabReady} {...(radiologyTotalCount > 0 ? OUTLINE_BTN : PRIMARY_BTN)}>
          <Flex align="center" gap={3}><PrintIcon /><Text>{text.print_lab}</Text></Flex>
        </Button>
        {radiologyTotalCount > 0 ? (
          <Button flex={1} h="76px" borderRadius="18px" fontSize="lg" fontWeight="semibold" onClick={() => handlePrintScope("radiology")} isLoading={loading} isDisabled={!hasRadiologyReady} {...OUTLINE_BTN}>
            <Flex align="center" gap={3}><PrintIcon /><Text>{text.load_scan}</Text></Flex>
          </Button>
        ) : null}
      </Flex>

      {showFirstFloorWarning ? (
        <Flex mt={5} align="center" gap={3} bg={K.warnSoft} color={K.warnInk} borderRadius="16px" px={5} py={4} fontSize="lg">
          <Text as="span" fontSize="xl">ⓘ</Text>
          <Text>Please go to the First Floor using the dedicated elevator.</Text>
        </Flex>
      ) : null}
    </Box>
  );

  const renderStepFeedback = () => (
    <Box {...CARD} p={{ base: 5, md: 8 }} maxW="760px" w="100%" mt={{ base: 1, md: 4 }}>
      <Heading fontSize={{ base: "2xl", md: "3xl" }} fontWeight="semibold" color={K.text} letterSpacing="-0.01em" mb={1}>{text.feedback_title}</Heading>
      <Text color={K.text2} fontSize="lg" mb={5}>{text.feedback_subtitle}</Text>

      {lastPrintInstruction ? (
        <Flex align="center" gap={3} bg={K.okSoft} color={K.okInk} borderRadius="16px" px={5} py={3} mb={4} fontSize="lg">
          <Text as="span" fontSize="xl">✓</Text><Text>{lastPrintInstruction}</Text>
        </Flex>
      ) : null}

      <form onSubmit={handleFeedbackSubmit}>
        <Flex gap={2} mb={4} justify="center">
          {[1, 2, 3, 4, 5].map((value) => {
            const active = rating >= value;
            return (
              <Button
                key={value}
                type="button"
                h="68px"
                minW="68px"
                borderRadius="full"
                fontSize="3xl"
                bg={active ? K.plum : "white"}
                color={active ? "white" : K.plumLine}
                border={`2px solid ${active ? K.plum : K.plumLine}`}
                _hover={{ bg: active ? K.plumStrong : K.plumSoft }}
                onClick={() => {
                  setRating(value);
                  markFeedbackInteraction();
                }}
                aria-label={`${value} star`}
              >
                {active ? "★" : "☆"}
              </Button>
            );
          })}
        </Flex>
        <Textarea
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            markFeedbackInteraction();
          }}
          minH="110px"
          fontSize="lg"
          borderRadius="16px"
          borderWidth="2px"
          borderColor={K.plumLine}
          _focusVisible={{ borderColor: K.plum, boxShadow: `0 0 0 3px ${K.plumSoft}` }}
          mb={4}
          placeholder="Tell us your experience"
          inputMode="text"
          name="kiosk-feedback"
          {...NO_AUTOFILL_TEXT_PROPS}
          onFocus={markFeedbackInteraction}
        />
        <Flex gap={3} direction={{ base: "column", md: "row" }}>
          <Button type="submit" h="64px" flex={1} borderRadius="16px" fontSize="lg" fontWeight="semibold" isLoading={loading} isDisabled={rating < 1 || rating > 5} {...PRIMARY_BTN}>
            {text.save_feedback}
          </Button>
          <Button h="64px" flex={1} borderRadius="16px" fontSize="lg" fontWeight="semibold" onClick={resetSession} {...OUTLINE_BTN}>
            {text.next_patient}
          </Button>
        </Flex>
        <Text mt={4} textAlign="center" color={K.text3} fontSize="md">Returning to the start in {feedbackCountdown}s</Text>
      </form>
    </Box>
  );

  return (
    <Box
      h="100dvh"
      overflow="hidden"
      position="relative"
      bg={K.bg}
      bgImage='linear-gradient(rgba(246,247,248,0.72), rgba(246,247,248,0.86)), url("/assets/whatsapp/sdrc_banner.png")'
      bgSize="cover"
      bgPosition="center"
    >
      <Flex direction="column" h="100%" position="relative" zIndex={1}>
        <Flex align="center" justify="space-between" bg="white" borderBottom={`1px solid ${K.line}`} px={{ base: 4, md: 8 }} h={{ base: "64px", md: "76px" }} flexShrink={0}>
          <Flex align="center" gap={3}>
            <Image src="/labit-logo.png" alt="Labit" h={{ base: "36px", md: "44px" }} objectFit="contain" />
            <Box borderLeft={`1px solid ${K.line}`} pl={3}>
              <Text color={K.text} fontSize="lg" fontWeight="semibold" lineHeight="1.2">Report Dispatch Kiosk</Text>
              <Text color={K.text2} fontSize="sm">{labMeta.name || "Lab"}</Text>
            </Box>
          </Flex>
          {authenticated ? (
            <Button type="button" onClick={resetSession} h="46px" px={6} borderRadius="full" fontSize="md" fontWeight="medium" {...OUTLINE_BTN}>
              ⌂ Home
            </Button>
          ) : null}
        </Flex>

        {notice && phase !== "feedback" ? (
          <Flex mx="auto" mt={4} maxW="720px" w="calc(100% - 32px)" align="center" gap={3} bg={K.warnSoft} color={K.warnInk} borderRadius="16px" px={5} py={3} fontSize="lg">
            <Text as="span" fontSize="xl">ⓘ</Text><Text>{notice}</Text>
          </Flex>
        ) : null}

        <Flex justify="center" align="flex-start" flex="1" minH={0} px={{ base: 3, md: 6 }} pt={2} overflowY="auto">
          {phase === "scan" && authenticated ? renderStepScan() : null}
          {phase === "dispatch" && authenticated ? renderStepDispatch() : null}
          {phase === "feedback" && authenticated ? renderStepFeedback() : null}
        </Flex>

      </Flex>

      <Modal isOpen={!authenticated} onClose={() => {}} isCentered closeOnEsc={false} closeOnOverlayClick={false}>
        <ModalOverlay bg="rgba(246,247,248,0.7)" backdropFilter="blur(6px)" />
        <ModalContent {...CARD} mx={4} maxW="460px">
          <ModalBody p={8}>
            <Flex justify="center" mb={5}>
              <Image src="/SDRC_logo.png" alt="SDRC" h="64px" objectFit="contain" />
            </Flex>
            <Heading fontSize="2xl" fontWeight="semibold" color={K.text} textAlign="center" mb={5}>Kiosk sign in</Heading>
            <form onSubmit={handleAuth}>
              <FormControl mb={3}>
                <FormLabel color={K.text2}>Username</FormLabel>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} h="54px" borderRadius="14px" borderWidth="2px" borderColor={K.plumLine} _focusVisible={{ borderColor: K.plum, boxShadow: `0 0 0 3px ${K.plumSoft}` }} />
              </FormControl>
              <FormControl mb={5}>
                <FormLabel color={K.text2}>Password</FormLabel>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} h="54px" borderRadius="14px" borderWidth="2px" borderColor={K.plumLine} _focusVisible={{ borderColor: K.plum, boxShadow: `0 0 0 3px ${K.plumSoft}` }} />
              </FormControl>
              <Button type="submit" w="100%" h="58px" borderRadius="14px" fontSize="lg" fontWeight="semibold" isLoading={loading} {...PRIMARY_BTN}>
                Sign in
              </Button>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>

      {isPrinting ? (
        <Flex position="fixed" inset="0" bg="rgba(246,247,248,0.85)" backdropFilter="blur(6px)" zIndex={1500} align="center" justify="center" p={6}>
          <Box {...CARD} p={10} maxW="520px" w="100%" textAlign="center">
            <Spinner size="xl" color={K.plum} thickness="4px" mb={4} />
            <Heading fontSize="2xl" fontWeight="semibold" color={K.text} mb={2}>Preparing your reports</Heading>
            <Text color={K.text2} fontSize="lg">Please wait while they are sent to the printer.</Text>
          </Box>
        </Flex>
      ) : null}
    </Box>
  );
}
