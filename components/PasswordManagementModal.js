"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, ViewIcon, ViewOffIcon, WarningIcon } from "@chakra-ui/icons";
import { getPasswordValidationStatus } from "@/lib/passwordPolicy";

export default function PasswordManagementModal({ isOpen, onClose }) {
  const toast = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const passwordStatus = useMemo(
    () => getPasswordValidationStatus(newPassword),
    [newPassword]
  );
  const newPasswordValid = passwordStatus.every((rule) => rule.passed);
  const passwordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    oldPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPasswordValid &&
    passwordsMatch &&
    !submitting;

  const resetState = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setSubmitting(false);
    setError("");
  };

  const handleClose = () => {
    if (submitting) return;
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    setError("");
    if (!canSubmit) {
      const msg = "Please complete all required password fields correctly.";
      setError(msg);
      toast({
        title: "Password not updated",
        description: msg,
        status: "warning",
        duration: 2600,
        isClosable: true,
      });
      return;
    }
    if (oldPassword === newPassword) {
      const msg = "New password must be different from the old password.";
      setError(msg);
      toast({
        title: "Password not updated",
        description: msg,
        status: "warning",
        duration: 2600,
        isClosable: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to change password.");
      }

      toast({
        title: "Password updated",
        status: "success",
        duration: 2600,
        isClosable: true,
      });
      resetState();
      onClose();
    } catch (err) {
      const msg = String(err?.message || err || "Failed to change password.");
      setError(msg);
      toast({
        title: "Password not updated",
        description: msg,
        status: "warning",
        duration: 3200,
        isClosable: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Change Password</ModalHeader>
        <ModalCloseButton isDisabled={submitting} />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel>Old Password</FormLabel>
              <InputGroup>
                <Input
                  type={showOldPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <InputRightElement h="full">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOldPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showOldPassword ? "Hide password" : "Show password"}
                  >
                    {showOldPassword ? <ViewOffIcon /> : <ViewIcon />}
                  </Button>
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>New Password</FormLabel>
              <InputGroup>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
                <InputRightElement h="full">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
                  </Button>
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Confirm New Password</FormLabel>
              <InputGroup>
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
                <InputRightElement h="full">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                  </Button>
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <Box borderWidth="1px" borderRadius="md" p={3} bg="gray.50">
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Password Rules
              </Text>
              <Stack spacing={1.5}>
                {passwordStatus.map((rule) => (
                  <HStack key={rule.id} spacing={2} color={rule.passed ? "green.600" : "gray.600"}>
                    {rule.passed ? <CheckIcon boxSize={3} /> : <WarningIcon boxSize={3} />}
                    <Text fontSize="sm">{rule.message}</Text>
                  </HStack>
                ))}
                {confirmPassword.length > 0 && !passwordsMatch ? (
                  <HStack spacing={2} color="red.600">
                    <WarningIcon boxSize={3} />
                    <Text fontSize="sm">Confirm password must match new password</Text>
                  </HStack>
                ) : null}
              </Stack>
            </Box>

            {error ? (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                {error}
              </Alert>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose} isDisabled={submitting}>
            Cancel
          </Button>
          <Button colorScheme="teal" onClick={handleSubmit} isLoading={submitting} isDisabled={!canSubmit}>
            Update Password
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
