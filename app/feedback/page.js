"use client";

// Public, unauthenticated WhatsApp feedback page. Replaces the old
// multi-turn conversational feedback flow with a single link: the bot
// sends one message with a URL to this page, which renders the kiosk's
// star-rating + free-text UI and submits straight to the existing
// saveReportFeedback() logic via /api/feedback/submit.
//
// No staff/kiosk session is used or required — see
// app/components/SessionLifecycle.js's isPublicNoLoginPath() exclusion and
// middleware.js's PUBLIC_PATHS, both updated alongside this page.

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Box, Button, Flex, Heading, Image, Text, Textarea } from "@chakra-ui/react";

const NO_AUTOFILL_TEXT_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false
};

// Same visual language as app/kiosk/page.js's renderStepFeedback.
const K = {
  plum: "#8A6BA3", plumStrong: "#6B4F82", plumSoft: "#F1EBF5", plumLine: "#D8C9E3",
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

function FeedbackPageInner() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("t") || "", [searchParams]);

  const [status, setStatus] = useState("loading"); // loading | expired | form | submitting | done | error
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (!token) {
        setStatus("expired");
        return;
      }
      try {
        const res = await fetch(`/api/feedback/submit?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setStatus("expired");
          return;
        }
        setStatus("form");
      } catch {
        if (!cancelled) setStatus("expired");
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (rating < 1 || rating > 5) return;
    setStatus("submitting");
    setErrorText("");
    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, rating, feedback })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save feedback");
      }
      setStatus("done");
    } catch (error) {
      setErrorText(error?.message || "Failed to save feedback. Please try again.");
      setStatus("form");
    }
  }

  return (
    <Box
      minH="100dvh"
      bg={K.bg}
      bgImage='linear-gradient(rgba(246,247,248,0.72), rgba(246,247,248,0.86)), url("/assets/whatsapp/sdrc_banner.png")'
      bgSize="cover"
      bgPosition="center"
    >
      <Flex direction="column" minH="100dvh" align="center" justify="center" px={4} py={8}>
        <Flex align="center" gap={3} mb={6}>
          <Image src="/labit-logo.png" alt="Labit" h="40px" objectFit="contain" />
        </Flex>

        {status === "loading" ? (
          <Box {...CARD} p={8} maxW="520px" w="100%" textAlign="center">
            <Text color={K.text2} fontSize="lg">Loading…</Text>
          </Box>
        ) : null}

        {status === "expired" ? (
          <Box {...CARD} p={8} maxW="520px" w="100%" textAlign="center">
            <Heading fontSize="xl" fontWeight="semibold" color={K.text} mb={2}>
              This link has expired
            </Heading>
            <Text color={K.text2} fontSize="lg">
              Please ask us for a new feedback link, or reply &quot;Feedback&quot; on WhatsApp to get one.
            </Text>
          </Box>
        ) : null}

        {status === "done" ? (
          <Box {...CARD} p={8} maxW="520px" w="100%" textAlign="center">
            <Text fontSize="3xl" mb={2}>✓</Text>
            <Heading fontSize="xl" fontWeight="semibold" color={K.text} mb={2}>
              Thank you for your feedback!
            </Heading>
            <Text color={K.text2} fontSize="lg">We truly appreciate it.</Text>
          </Box>
        ) : null}

        {status === "form" || status === "submitting" ? (
          <Box {...CARD} p={{ base: 5, md: 8 }} maxW="560px" w="100%">
            <Heading fontSize={{ base: "xl", md: "2xl" }} fontWeight="semibold" color={K.text} letterSpacing="-0.01em" mb={1}>
              Thank You for Your Patronage to SDRC
            </Heading>
            <Text color={K.text2} fontSize="lg" mb={5}>Please share quick feedback</Text>

            {errorText ? (
              <Flex align="center" gap={3} bg={K.warnSoft} color={K.warnInk} borderRadius="16px" px={5} py={3} mb={4} fontSize="md">
                <Text as="span" fontSize="lg">ⓘ</Text><Text>{errorText}</Text>
              </Flex>
            ) : null}

            <form onSubmit={handleSubmit}>
              <Flex gap={2} mb={4} justify="center">
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = rating >= value;
                  return (
                    <Button
                      key={value}
                      type="button"
                      h="60px"
                      minW="60px"
                      borderRadius="full"
                      fontSize="2xl"
                      bg={active ? K.plum : "white"}
                      color={active ? "white" : K.plumLine}
                      border={`2px solid ${active ? K.plum : K.plumLine}`}
                      _hover={{ bg: active ? K.plumStrong : K.plumSoft }}
                      onClick={() => setRating(value)}
                      aria-label={`${value} star`}
                    >
                      {active ? "★" : "☆"}
                    </Button>
                  );
                })}
              </Flex>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                minH="110px"
                fontSize="lg"
                borderRadius="16px"
                borderWidth="2px"
                borderColor={K.plumLine}
                _focusVisible={{ borderColor: K.plum, boxShadow: `0 0 0 3px ${K.plumSoft}` }}
                mb={4}
                placeholder="Tell us your experience"
                inputMode="text"
                name="feedback-comment"
                {...NO_AUTOFILL_TEXT_PROPS}
              />
              <Button
                type="submit"
                w="100%"
                h="60px"
                borderRadius="16px"
                fontSize="lg"
                fontWeight="semibold"
                isLoading={status === "submitting"}
                isDisabled={rating < 1 || rating > 5}
                {...PRIMARY_BTN}
              >
                Submit Feedback
              </Button>
            </form>
          </Box>
        ) : null}
      </Flex>
    </Box>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackPageInner />
    </Suspense>
  );
}
