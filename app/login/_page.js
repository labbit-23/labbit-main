//app/login/page.js

'use client';

import React, { useState } from 'react';
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
  Image,
} from '@chakra-ui/react';
import { useRouter } from 'next/navigation';

// OTP Input component with autofill and paste handling
function OtpInput({ value, onChange }) {
  const handleChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(val);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('Text').trim();
    if (/^\d{6}$/.test(paste)) {
      onChange(paste);
    }
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

  const [loginMode, setLoginMode] = useState('email');

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Phone + OTP login state
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Error state
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  // Email/password login handler
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      // Use supabase client on frontend or your own API backend
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login.');
      }

      toast({
        title: 'Login successful!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      router.push('/phlebo'); // Your post-login redirect
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message);
    }
  };

  // Send OTP to phone
  const handleSendOtp = async () => {
    setErrorMsg(null);
    if (!phone) {
      setErrorMsg('Please enter your phone number.');
      return;
    }
    setSendingOtp(true);
    try {
      const resp = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to send OTP.');
      }
      setOtpSent(true);
      toast({
        title: 'OTP sent',
        description: 'Check your phone messages for the code.',
        status: 'info',
        duration: 4000,
        isClosable: true,
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify OTP and login
  const handleVerifyOtp = async () => {
    setErrorMsg(null);

    if (otp.length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const resp = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'OTP verification failed.');
      }

      toast({
        title: 'Login successful!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      router.push('/phlebo'); // Your post-login redirect
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
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
        {/* Labbit logo */}
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
          index={loginMode === 'email' ? 0 : 1}
          onChange={(index) => {
            setErrorMsg(null);
            setLoginMode(index === 0 ? 'email' : 'phone');
            setOtpSent(false);
            setOtp('');
          }}
        >
          <TabList mb="1em" justifyContent="center">
            <Tab>Email / Password</Tab>
            <Tab>Phone / OTP</Tab>
          </TabList>
          <TabPanels>
            <TabPanel p={0}>
              <form onSubmit={handleEmailLogin}>
                <VStack spacing={5} align="stretch">
                  <FormControl isRequired>
                    <FormLabel>Email Address</FormLabel>
                    <Input
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      focusBorderColor="teal.400"
                      aria-label="Email Address"
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Password</FormLabel>
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      focusBorderColor="teal.400"
                      aria-label="Password"
                    />
                  </FormControl>
                  {errorMsg && (
                    <Alert status="error" borderRadius="md">
                      <AlertIcon />
                      {errorMsg}
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    colorScheme="teal"
                    size="lg"
                    isLoading={loading}
                    loadingText="Signing in..."
                    aria-label="Sign in"
                    w="100%"
                  >
                    Sign In
                  </Button>
                </VStack>
              </form>
            </TabPanel>

            <TabPanel p={0}>
              <VStack spacing={5} align="stretch">
                <FormControl isRequired>
                  <FormLabel>Phone Number</FormLabel>
                  <Input
                    type="tel"
                    placeholder="+919999999999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    focusBorderColor="teal.400"
                    aria-label="Phone Number"
                  />
                </FormControl>

                {!otpSent ? (
                  <>
                    {errorMsg && (
                      <Alert status="error" borderRadius="md">
                        <AlertIcon />
                        {errorMsg}
                      </Alert>
                    )}

                    <Button
                      onClick={handleSendOtp}
                      isLoading={sendingOtp}
                      colorScheme="teal"
                      size="lg"
                      aria-label="Send OTP"
                      w="100%"
                    >
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
                      <Button
                        onClick={() => {
                          setOtpSent(false);
                          setErrorMsg(null);
                          setOtp('');
                        }}
                        variant="outline"
                        colorScheme="gray"
                        flex={1}
                      >
                        Resend OTP
                      </Button>
                      <Button
                        onClick={handleVerifyOtp}
                        isLoading={verifyingOtp}
                        colorScheme="teal"
                        flex={1}
                        aria-label="Verify OTP and Login"
                      >
                        Verify & Login
                      </Button>
                    </HStack>
                  </>
                )}
              </VStack>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <Text fontSize="sm" mt={6} color="gray.500">
          Forgot password? OTP reset coming soon.
        </Text>

        <Text mt={10} fontSize="xs" color="gray.400">
          © {new Date().getFullYear()} Labbit. All rights reserved.
        </Text>
      </Box>
    </Flex>
  );
}
