// File: /app/login/page.js

'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Input,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Alert,
  AlertIcon,
  useToast,
  Text,
  Flex,
  Center,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  HStack,
  Select,
  Image,
  Checkbox,
  Spinner,
  Link,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';

import ModularPatientModal from '../components/ModularPatientModal';
import RedirectIfAuth from '../../components/RedirectIfAuth'; // Adjust or create this as per your auth flow
import { useUser } from '../context/UserContext'; // <-- import context


function OtpInput({ value, onChange }) {
  const handleChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(val);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(paste)) onChange(paste);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={handleChange}
      onPaste={handlePaste}
      placeholder="Enter OTP"
    />
  );
}

export default function LoginPage() {
  const toast = useToast();
  const router = useRouter();

  // Declare all hooks at top level (React Hook rules)
  const [checkingSession, setCheckingSession] = useState(true);
  const { refreshUser } = useUser(); // <-- hook from context
  const [authenticating, setAuthenticating] = useState(false); // show Logging in...


  // Login tabs state
  const [loginTabIndex, setLoginTabIndex] = useState(0);

  // Patient login state
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [patientRememberMe, setPatientRememberMe] = useState(false);

  // Patient multi-lab info
  const [labIds, setLabIds] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState('');

  // Employee login state
  const [employeeIdentifier, setEmployeeIdentifier] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [employeeRememberMe, setEmployeeRememberMe] = useState(false);
  const [employeeLabIds, setEmployeeLabIds] = useState([]);

  // Employee forgot password & reset flow
  const [employeeOtpSent, setEmployeeOtpSent] = useState(false);
  const [employeeOtp, setEmployeeOtp] = useState('');
  const [employeeOtpVerifying, setEmployeeOtpVerifying] = useState(false);
  const [employeeNewPassword, setEmployeeNewPassword] = useState('');
  const [employeeResetStep, setEmployeeResetStep] = useState('otp'); // 'otp' | 'reset'

  // Password visibility toggles
  const [showEmployeePassword, setShowEmployeePassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Error and loading states
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  // Modal and patient signup data
  const [patientData, setPatientData] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Helper to normalize phone number by removing non-digits
  const normalizePhone = (rawPhone) => rawPhone.replace(/\D/g, '');

  // --- Flicker prevention: session check w/ spinner & redirect ---
  useEffect(() => {
    async function checkSession() {
      setCheckingSession(true);
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (res.ok) {
          const user = await res.json();
          const execType = (user.executiveType || '').toLowerCase();
          const adminRoles = ['admin', 'manager', 'director'];

          if (user.userType === 'patient' && user.phone) {
            router.replace('/patient');
            return;
          }
          if (user.userType === 'executive') {
            if (adminRoles.includes(execType)) {
              await refreshUser(); // from useUser()
              router.replace('/admin');
              return;
            }
            if (execType === 'phlebo') {
              router.replace('/phlebo');
              return;
            }
            router.replace('/dashboard');
            return;
          }
        }
      } catch {
        // ignore errors, show login UI
      } finally {
        setCheckingSession(false);
      }
    }
    checkSession();
  }, [router]);

  if (checkingSession || authenticating) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <VStack spacing={3}>
          <Spinner size="xl" />
          {authenticating && <Text fontSize="lg">Logging in…</Text>}
        </VStack>
      </Flex>
    );
  }


  // -- Handlers --

  const handleEmployeeLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!employeeIdentifier || !employeePassword) {
      setErrorMsg('Please enter both Email/Phone and password.');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/auth/user-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: employeeIdentifier,
          password: employeePassword,
          rememberMe: employeeRememberMe,
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (data.labIds && Array.isArray(data.labIds)) {
        setEmployeeLabIds(data.labIds);
      }

      if (!res.ok) throw new Error(data.error || 'Failed to login.');

      toast({
        title: 'Login successful!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setAuthenticating(true);
      await refreshUser(); // wait for cookie/session to be recognised
      router.replace(data.redirectUrl || '/');

    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message);
    }
  };

  const fetchPatientLabs = async (phoneNumber) => {
    const res = await fetch(`/api/patient-labs?phone=${encodeURIComponent(phoneNumber)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lab lookup failed.');
    return data.labIds || [];
  };

  const handleSendOtp = async () => {
    setErrorMsg(null);
    if (!phone) {
      setErrorMsg('Please enter your phone number.');
      return;
    }
    setSendingOtp(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      const res = await fetch(`/api/patient-lookup?phone=${encodeURIComponent(normalizedPhone)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lookup failed.');
      }
      const data = await res.json();

      if (data.patients && data.patients.length > 0) {
        const localPatient = data.patients.find((p) => p.id);
        if (localPatient) {
          const labs = await fetchPatientLabs(normalizedPhone);
          if (labs.length === 0) {
            setErrorMsg('Patient lab association not found. Please contact support.');
            setLabIds([]);
            setSelectedLabId('');
            setSendingOtp(false);
            return;
          }

          setLabIds(labs);
          setSelectedLabId(labs[0]);

          const resOtp = await fetch('/api/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: normalizedPhone, labId: labs[0] }),
          });

          const otpData = await resOtp.json();
          if (!resOtp.ok) throw new Error(otpData.error || 'Failed to send OTP.');

          setOtpSent(true);
          toast({
            title: 'OTP sent',
            description: 'Check your phone messages for the code.',
            status: 'info',
            duration: 4000,
            isClosable: true,
          });
        } else {
          setPatientData(data.patients[0]);
          setModalOpen(true);
        }
      } else {
        setPatientData(null);
        setModalOpen(true);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMsg(null);
    if (otp.length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP.');
      return;
    }
    if (!selectedLabId) {
      setErrorMsg('Please select a lab.');
      return;
    }
    setVerifyingOtp(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      const resp = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, otp, labId: selectedLabId }),
      });
      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || 'OTP verification failed.');

      if (data.patientLookupRequired) {
        setPatientData(null);
        setModalOpen(true);
        return;
      }
      if (data.multiplePatients) {
        const verifiedPhone = data.verifiedPhone || normalizedPhone;
        router.push(`/patient?phone=${encodeURIComponent(verifiedPhone)}`);
        return;
      }

      toast({ title: 'Login successful!', status: 'success', duration: 3000 });
      setAuthenticating(true);
      await refreshUser();
      router.replace(data.redirectUrl || '/');

    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleEmployeeVerifyOtp = async () => {
    setErrorMsg(null);
    if (employeeOtp.length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP.');
      return;
    }
    setEmployeeOtpVerifying(true);

    try {
      let phoneToVerify = employeeIdentifier;
      if (/^\d{10}$/.test(employeeIdentifier)) {
        phoneToVerify = normalizePhone(employeeIdentifier);
      }

      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneToVerify, otp: employeeOtp }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'OTP verification failed.');

      toast({
        title: 'OTP verified! Please reset your password.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      setEmployeeResetStep('reset');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setEmployeeOtpVerifying(false);
    }
  };

  const handleEmployeePasswordReset = async () => {
    setErrorMsg(null);
    if (!employeeNewPassword || employeeNewPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      let phoneToSend = employeeIdentifier;
      if (/^\d{10}$/.test(employeeIdentifier)) {
        phoneToSend = normalizePhone(employeeIdentifier);
      }

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: phoneToSend, newPassword: employeeNewPassword }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Password reset failed.');

      toast({
        title: 'Password reset successful! Please login with your new password.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      setEmployeeOtpSent(false);
      setEmployeeOtp('');
      setEmployeeNewPassword('');
      setEmployeeResetStep('otp');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!employeeIdentifier) {
      toast({
        title: 'Please enter your Email or Phone first',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const confirmed = window.confirm(`Send OTP to reset password to ${employeeIdentifier}?`);
    if (!confirmed) return;

    try {
      let phoneToSend = employeeIdentifier;
      if (/^\d{10}$/.test(employeeIdentifier)) {
        phoneToSend = normalizePhone(employeeIdentifier);
      }

      let labIdToSend = (employeeLabIds.length > 0 && employeeLabIds[0]) || selectedLabId || '';

      if (!labIdToSend) {
        const resLookup = await fetch('/api/auth/user-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: employeeIdentifier,
            password: 'dummy_password',
            rememberMe: false,
          }),
        });
        const lookupData = await resLookup.json();

        if (lookupData.labIds && Array.isArray(lookupData.labIds) && lookupData.labIds.length > 0) {
          labIdToSend = lookupData.labIds[0];
          setEmployeeLabIds(lookupData.labIds);
        }
      }

      if (!labIdToSend) {
        throw new Error('No lab ID found associated with this account.');
      }

      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneToSend, labId: labIdToSend }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send OTP.');

      toast({
        title: 'OTP sent',
        description: 'Please check your phone for the OTP to reset password.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      setEmployeeOtpSent(true);
      setEmployeeResetStep('otp');
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  // Password inputs with toggle
  const EmployeePasswordInput = (
    <InputGroup>
      <Input
        type={showEmployeePassword ? 'text' : 'password'}
        placeholder="Enter password"
        value={employeePassword}
        onChange={(e) => setEmployeePassword(e.target.value)}
      />
      <InputRightElement h="full">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEmployeePassword((show) => !show)}
          tabIndex={-1}
          aria-label={showEmployeePassword ? 'Hide password' : 'Show password'}
        >
          {showEmployeePassword ? <ViewOffIcon /> : <ViewIcon />}
        </Button>
      </InputRightElement>
    </InputGroup>
  );

  const EmployeeNewPasswordInput = (
    <InputGroup>
      <Input
        type={showNewPassword ? 'text' : 'password'}
        placeholder="Enter new password"
        value={employeeNewPassword}
        onChange={(e) => setEmployeeNewPassword(e.target.value)}
      />
      <InputRightElement h="full">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNewPassword((show) => !show)}
          tabIndex={-1}
          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
        >
          {showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
        </Button>
      </InputRightElement>
    </InputGroup>
  );

  // -- JSX UI --
  return (
    <RedirectIfAuth>
      <Flex minHeight="100vh" align="center" justify="center" bg="gray.100" p={4} position="relative">
        <Box
          maxW="md"
          w="full"
          bg="white"
          boxShadow="2xl"
          rounded="xl"
          py={10}
          px={8}
          textAlign="center"
          position="relative"
          zIndex={1}
        >
          <Center mb={5}>
            <Image src="/logo.png" alt="Labbit Logo" boxSize="54px" borderRadius="lg" mr={3} />
            <Heading color="teal.700" fontWeight="extrabold" fontSize="2xl" letterSpacing="wider">
              Labbit Login
            </Heading>
          </Center>

          <Tabs
            isFitted
            variant="enclosed"
            mb={6}
            index={loginTabIndex}
            onChange={(index) => {
              setErrorMsg(null);
              setLoginTabIndex(index);
              setOtpSent(false);
              setOtp('');
              setEmployeeOtpSent(false);
              setEmployeeOtp('');
              setEmployeeNewPassword('');
              setEmployeeResetStep('otp');
              setLabIds([]);
              setSelectedLabId('');
            }}
          >
            <TabList mb="1em" justifyContent="center">
              <Tab>Patient Login</Tab>
              <Tab>Employee Login</Tab>
            </TabList>

            <TabPanels>
              {/* Patient Login */}
              <TabPanel p={0}>
                <VStack spacing={5} align="stretch">
                  <FormControl isRequired>
                    <FormLabel>Phone Number</FormLabel>
                    <Input
                      type="tel"
                      placeholder="9999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      focusBorderColor="teal.400"
                      aria-label="Phone Number"
                    />
                  </FormControl>
                  {labIds.length > 1 && (
                    <FormControl isRequired>
                      <FormLabel>Select Your Lab</FormLabel>
                      <Select
                        value={selectedLabId}
                        onChange={(e) => setSelectedLabId(e.target.value)}
                        aria-label="Select Lab"
                      >
                        {labIds.map((labId) => (
                          <option key={labId} value={labId}>
                            {labId}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <FormControl>
                    <Checkbox isChecked={patientRememberMe} onChange={(e) => setPatientRememberMe(e.target.checked)}>
                      Remember me
                    </Checkbox>
                  </FormControl>
                  {!otpSent ? (
                    <>
                      {errorMsg && (
                        <Alert status="error" borderRadius="md">
                          <AlertIcon />
                          {errorMsg}
                        </Alert>
                      )}
                      <Button onClick={handleSendOtp} isLoading={sendingOtp} colorScheme="teal" size="lg" w="100%">
                        Send OTP
                      </Button>
                    </>
                  ) : (
                    <>
                      <FormControl isRequired>
                        <FormLabel>Enter OTP</FormLabel>
                        <OtpInput value={otp} onChange={setOtp} />
                      </FormControl>
                      {errorMsg && (
                        <Alert status="error" borderRadius="md">
                          <AlertIcon />
                          {errorMsg}
                        </Alert>
                      )}
                      <HStack spacing={3}>
                        <Button onClick={() => { setOtpSent(false); setOtp(''); setErrorMsg(null); }} variant="outline" colorScheme="gray" flex={1}>
                          Resend OTP
                        </Button>
                        <Button onClick={handleVerifyOtp} isLoading={verifyingOtp} colorScheme="teal" flex={1}>
                          Verify &amp; Login
                        </Button>
                      </HStack>
                    </>
                  )}
                </VStack>
              </TabPanel>

              {/* Employee Login */}
              <TabPanel p={0}>
                <form onSubmit={handleEmployeeLogin}>
                  <VStack spacing={5} align="stretch">
                    <FormControl isRequired>
                      <FormLabel>Email or Phone Number</FormLabel>
                      <Input
                        type="text"
                        placeholder="Enter email or phone"
                        value={employeeIdentifier}
                        onChange={(e) => setEmployeeIdentifier(e.target.value.trim())}
                      />
                    </FormControl>
                    <FormControl isRequired>{EmployeePasswordInput}</FormControl>
                    <FormControl>
                      <Checkbox isChecked={employeeRememberMe} onChange={(e) => setEmployeeRememberMe(e.target.checked)}>
                        Remember me
                      </Checkbox>
                    </FormControl>
                    {errorMsg && (
                      <Alert status="error" borderRadius="md">
                        <AlertIcon />
                        {errorMsg}
                      </Alert>
                    )}
                    <Button type="submit" colorScheme="blue" size="lg" isLoading={loading} w="100%">
                      Sign In
                    </Button>
                    <Text fontSize="sm" color="gray.600" textAlign="right" mt={2}>
                      <Link color="blue.500" onClick={handleForgotPassword} cursor="pointer">
                        Forgot Password?
                      </Link>
                    </Text>

                    {/* Employee Forgot Password OTP input */}
                    {employeeOtpSent && employeeResetStep === 'otp' && (
                      <VStack spacing={4} mt={4}>
                        <FormControl>
                          <FormLabel>Enter OTP</FormLabel>
                          <OtpInput value={employeeOtp} onChange={setEmployeeOtp} />
                        </FormControl>
                        <Button colorScheme="teal" onClick={handleEmployeeVerifyOtp} isLoading={employeeOtpVerifying} w="100%">
                          Verify OTP
                        </Button>
                      </VStack>
                    )}

                    {/* Employee Password Reset input */}
                    {employeeOtpSent && employeeResetStep === 'reset' && (
                      <VStack spacing={4} mt={4}>
                        <FormControl isRequired>
                          <FormLabel>New Password</FormLabel>
                          {EmployeeNewPasswordInput}
                        </FormControl>
                        {errorMsg && (
                          <Alert status="error" borderRadius="md">
                            <AlertIcon />
                            {errorMsg}
                          </Alert>
                        )}
                        <Button colorScheme="teal" onClick={handleEmployeePasswordReset} isLoading={loading} w="100%">
                          Reset Password
                        </Button>
                      </VStack>
                    )}
                  </VStack>
                </form>
              </TabPanel>
            </TabPanels>
          </Tabs>

          <Text mt={10} fontSize="xs" color="gray.400" userSelect="none">
            © {new Date().getFullYear()} Labbit. All rights reserved.
          </Text>
        </Box>
      </Flex>

      <ModularPatientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialPatient={patientData}
        onSubmit={() => {
          setModalOpen(false);
          toast({ title: 'Signup successful', status: 'success' });
        }}
      />
    </RedirectIfAuth>
  );
}
