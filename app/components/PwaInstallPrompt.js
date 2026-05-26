"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CloseButton,
  HStack,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { useUser } from "../context/UserContext";

const DISMISSED_KEY = "labit-pwa-install-dismissed";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  if (typeof window === "undefined") return false;

  const platform = window.navigator.platform || "";
  const userAgent = window.navigator.userAgent || "";
  const isTouchMac = platform === "MacIntel" && window.navigator.maxTouchPoints > 1;

  return /iPad|iPhone|iPod/.test(userAgent) || isTouchMac;
}

export default function PwaInstallPrompt() {
  const { user, isLoading } = useUser();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const isCompact = useBreakpointValue({ base: true, md: false });

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch((error) => {
        console.warn("[pwa] Service worker registration failed:", error);
      });
    }

    setIsDismissed(window.localStorage.getItem(DISMISSED_KEY) === "true");
    setIsStandalone(isStandaloneDisplay());
    setIsIos(isIosDevice());

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setIsStandalone(isStandaloneDisplay());
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      window.localStorage.setItem(DISMISSED_KEY, "true");
      setIsDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const canPromptInstall = Boolean(deferredPrompt);
  const canShowIosGuide = isIos && !canPromptInstall;
  const shouldShow = useMemo(() => {
    return Boolean(
      user &&
        !isLoading &&
        !isStandalone &&
        !isDismissed &&
        (canPromptInstall || canShowIosGuide)
    );
  }, [canPromptInstall, canShowIosGuide, isDismissed, isLoading, isStandalone, user]);

  const dismissPrompt = () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setIsDismissed(true);
  };

  const installApp = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      setDeferredPrompt(null);

      if (choice?.outcome !== "accepted") {
        dismissPrompt();
      }
    } finally {
      setIsInstalling(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <Box
      position="fixed"
      left={{ base: 3, md: "auto" }}
      right={3}
      bottom={3}
      zIndex="toast"
      maxW={{ base: "calc(100vw - 24px)", md: "390px" }}
      bg="white"
      color="gray.800"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      boxShadow="lg"
      px={4}
      py={3}
    >
      <HStack align="flex-start" spacing={3}>
        <Box
          display="grid"
          placeItems="center"
          boxSize="34px"
          flexShrink={0}
          bg="teal.50"
          color="teal.700"
          borderRadius="md"
        >
          <AddIcon boxSize={3} />
        </Box>

        <VStack align="stretch" spacing={2} flex="1" minW={0}>
          <Box>
            <Text fontWeight="semibold" fontSize="sm">
              Install Labit
            </Text>
            <Text fontSize="sm" color="gray.600">
              {canPromptInstall
                ? "Add Labit to this device for quicker access."
                : "On iPhone or iPad, use Share and then Add to Home Screen."}
            </Text>
          </Box>

          <HStack spacing={2} justify="flex-end" flexWrap="wrap">
            <Button size="sm" variant="ghost" onClick={dismissPrompt}>
              Not now
            </Button>
            {canPromptInstall && (
              <Button
                size="sm"
                colorScheme="teal"
                leftIcon={<AddIcon boxSize={3} />}
                onClick={installApp}
                isLoading={isInstalling}
                loadingText={isCompact ? undefined : "Installing"}
              >
                Install
              </Button>
            )}
          </HStack>
        </VStack>

        <CloseButton size="sm" onClick={dismissPrompt} aria-label="Dismiss install prompt" />
      </HStack>
    </Box>
  );
}
