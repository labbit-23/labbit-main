"use client";

import { useState } from "react";
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
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PhleboLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const toast = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message || "Failed to login.");
      return;
    }

    if (data.session) {
      toast({
        title: "Login successful!",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      // TODO: Redirect to the dashboard or phlebo homepage, e.g.,
      // router.push('/phlebo')
    }
  };

  return (
    <Box maxW="md" mx="auto" mt={20} p={6} borderRadius="lg" boxShadow="lg" bg="white">
      <Heading mb={6} textAlign="center" color="brand.600">
        HV Executive Login
      </Heading>

      <form onSubmit={handleLogin}>
        <VStack spacing={5} align="stretch">
          <FormControl isRequired>
            <FormLabel>Email Address</FormLabel>
            <Input
              type="email"
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              focusBorderColor="brand.400"
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
              focusBorderColor="brand.400"
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
            colorScheme="brand"
            size="lg"
            isLoading={loading}
            loadingText="Signing in..."
            aria-label="Sign in"
          >
            Sign In
          </Button>

          <Text fontSize="sm" textAlign="center" color="gray.500">
            Forgot password? OTP reset coming soon.
          </Text>
        </VStack>
      </form>
    </Box>
  );
}
