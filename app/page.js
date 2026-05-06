"use client";

import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Image,
  Link,
  SimpleGrid,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowForwardIcon,
  CheckCircleIcon,
  LockIcon,
  RepeatClockIcon,
  StarIcon,
  TimeIcon,
  SettingsIcon,
} from "@chakra-ui/icons";

const LABBIT_LOGO = process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo_inverted.png";

const featureCards = [
  {
    title: "WhatsApp Business Integrations",
    description:
      "Unified inbound and outbound WhatsApp workflows for booking updates, reminders, and support handovers.",
    icon: CheckCircleIcon,
  },
  {
    title: "Report Automations",
    description:
      "Automate report preparation and delivery with controlled checkpoints and full traceability.",
    icon: RepeatClockIcon,
  },
  {
    title: "Bot Flows",
    description:
      "Design bot-first patient journeys for FAQ, booking collection, confirmation, and escalation.",
    icon: TimeIcon,
  },
  {
    title: "Machine Interfacing",
    description:
      "Connect instrument and LIS inputs into operational dashboards for faster turnaround visibility.",
    icon: SettingsIcon,
  },
  {
    title: "Operational Dashboards",
    description:
      "Role-specific dashboards for leadership, support, field teams, and collection centres.",
    icon: LockIcon,
  },
  {
    title: "Automated Report Dispatch",
    description:
      "Scheduled dispatches with custom rules, branded letterheads, and channel-level delivery controls.",
    icon: ArrowForwardIcon,
  },
];

const portalCards = [
  {
    title: "Lab Admin Login",
    text: "Control bookings, reports, users, and operational policy from a single command plane.",
    href: "/login",
  },
  {
    title: "Collection Centre Login",
    text: "Separate portal for centre workflows, pickup coordination, and execution tracking.",
    href: "/collection-centre",
  },
  {
    title: "Logistics Login",
    text: "Field and logistics teams get purpose-built access for route, visit, and status operations.",
    href: "/phlebo",
  },
];

const stackItems = [
  "Patient and visit orchestration",
  "Executive and phlebo productivity tools",
  "Dispatch, report, and follow-up intelligence",
  "CTO observability layer and trend analysis",
];

const executiveMetrics = [
  { label: "Revenue Leakage Saved", value: "Rs 4.8L", trend: "+12.4% MoM" },
  { label: "Sample-to-Report TAT", value: "7h 24m", trend: "-18% QoQ" },
  { label: "On-time Dispatch Rate", value: "98.1%", trend: "+4.2 pts" },
  { label: "Automation Coverage", value: "86%", trend: "+21 workflows" },
  { label: "Escalation Closure SLA", value: "93.7%", trend: "+8.6 pts" },
  { label: "Field Utilization", value: "91.3%", trend: "+11.2% YoY" },
];

const leftNodes = ["Machines / LIS", "Collection Centres", "Field Executives"];
const rightNodes = ["WhatsApp Engine", "Patients + Doctors", "CEO / CTO Console"];

export default function HomePage() {
  return (
    <Box
      id="top"
      minH="100vh"
      color="white"
      bg="linear-gradient(165deg, #1B222A 0%, #1c2630 45%, #1f2b36 100%)"
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        top="-140px"
        right="-120px"
        w="420px"
        h="420px"
        borderRadius="full"
        bg="radial-gradient(circle, rgba(56,189,248,0.26) 0%, rgba(56,189,248,0.02) 68%)"
        filter="blur(8px)"
        animation="labitFloat 10s ease-in-out infinite"
        pointerEvents="none"
      />

      <Container maxW="7xl" py={{ base: 6, md: 10 }} position="relative" zIndex={1}>
        <Flex
          justify="space-between"
          align={{ base: "flex-start", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={{ base: 5, md: 0 }}
          mb={{ base: 10, md: 16 }}
        >
          <HStack spacing={4}>
            <Image src={LABBIT_LOGO} alt="Labit" h={{ base: "40px", md: "52px" }} w="auto" />
            <Box>
              <Text fontSize="xs" letterSpacing="0.22em" textTransform="uppercase" color="cyan.200">
                Platform
              </Text>
              <Heading size="md" letterSpacing="0.04em">
                Labit
              </Heading>
            </Box>
          </HStack>
          <HStack spacing={3}>
            <Button
              as={Link}
              href="/login"
              variant="outline"
              color="white"
              borderColor="whiteAlpha.700"
              _hover={{ bg: "whiteAlpha.200", color: "white" }}
              rightIcon={<ArrowForwardIcon />}
            >
              Login
            </Button>
            <Button as={Link} href="#contact" bg="teal.300" color="black" _hover={{ bg: "teal.200" }}>
              Contact Us
            </Button>
          </HStack>
        </Flex>

        <Box
          position="sticky"
          top="10px"
          zIndex={3}
          mb={{ base: 8, md: 10 }}
          border="1px solid"
          borderColor="whiteAlpha.300"
          borderRadius="full"
          bg="rgba(7, 15, 31, 0.86)"
          backdropFilter="blur(10px)"
          px={{ base: 2, md: 4 }}
          py={2}
        >
          <HStack spacing={{ base: 1, md: 3 }} justify="center" flexWrap="wrap">
            <Button as={Link} href="#top" size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>
              Overview
            </Button>
            <Button as={Link} href="#features" size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>
              Features
            </Button>
            <Button as={Link} href="#portals" size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>
              Portals
            </Button>
            <Button as={Link} href="#network" size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>
              Network
            </Button>
            <Button as={Link} href="#contact" size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }}>
              Contact
            </Button>
          </HStack>
        </Box>

        <Grid templateColumns={{ base: "1fr", lg: "1.1fr 0.9fr" }} gap={{ base: 10, lg: 14 }}>
          <GridItem>
            <Text
              display="inline-block"
              mb={4}
              fontSize="xs"
              letterSpacing="0.24em"
              px={3}
              py={1}
              borderRadius="full"
              border="1px solid"
              borderColor="cyan.400"
              color="cyan.200"
            >
              HEALTH OPS INTELLIGENCE
            </Text>
            <Heading fontSize={{ base: "3xl", md: "5xl" }} lineHeight={{ base: "1.2", md: "1.1" }} mb={4}>
              The command center for modern diagnostic operations.
            </Heading>
            <Text fontSize={{ base: "md", md: "lg" }} color="whiteAlpha.800" maxW="2xl" mb={8}>
              Labit unifies booking, field execution, machine-linked reporting, and communication into one
              high-visibility operating system.
            </Text>
            <HStack spacing={4} flexWrap="wrap">
              <Button as={Link} href="https://labit.online" isExternal size="lg" bg="cyan.300" color="black" _hover={{ bg: "cyan.200" }}>
                Open Main Portal
              </Button>
              <Button
                as={Link}
                href="/cto"
                size="lg"
                variant="ghost"
                color="white"
                border="1px solid"
                borderColor="whiteAlpha.400"
                _hover={{ bg: "whiteAlpha.100", color: "white" }}
              >
                View CTO Console
              </Button>
            </HStack>
          </GridItem>

          <GridItem>
            <Box
              border="1px solid"
              borderColor="whiteAlpha.300"
              bg="linear-gradient(150deg, rgba(11,25,47,0.85), rgba(6,15,30,0.92))"
              borderRadius="2xl"
              p={{ base: 5, md: 6 }}
              boxShadow="0 24px 80px rgba(0,0,0,0.35)"
            >
              <Text fontSize="xs" color="whiteAlpha.700" letterSpacing="0.14em" mb={3}>
                LIVE STATUS SNAPSHOT
              </Text>
              <SimpleGrid columns={2} spacing={4}>
                <Stat>
                  <StatLabel color="whiteAlpha.700">Active Visits</StatLabel>
                  <StatNumber color="cyan.200">142</StatNumber>
                  <StatHelpText color="green.300">+19 today</StatHelpText>
                </Stat>
                <Stat>
                  <StatLabel color="whiteAlpha.700">Dispatch SLA</StatLabel>
                  <StatNumber color="teal.200">97.6%</StatNumber>
                  <StatHelpText color="green.300">stable</StatHelpText>
                </Stat>
                <Stat>
                  <StatLabel color="whiteAlpha.700">Automation Hits</StatLabel>
                  <StatNumber color="blue.200">2.8k</StatNumber>
                  <StatHelpText color="green.300">last 24h</StatHelpText>
                </Stat>
                <Stat>
                  <StatLabel color="whiteAlpha.700">Teams Online</StatLabel>
                  <StatNumber color="purple.200">31</StatNumber>
                  <StatHelpText color="yellow.300">multi-role</StatHelpText>
                </Stat>
              </SimpleGrid>
            </Box>
          </GridItem>
        </Grid>

        <Box id="features" mt={{ base: 14, md: 20 }} scrollMarginTop="110px">
          <Heading fontSize={{ base: "2xl", md: "3xl" }} mb={6}>
            Platform capabilities
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
            {featureCards.map((item) => (
              <Box
                key={item.title}
                p={5}
                borderRadius="xl"
                border="1px solid"
                borderColor="whiteAlpha.200"
                bg="whiteAlpha.100"
                backdropFilter="blur(6px)"
                transition="all 0.25s ease"
                _hover={{ transform: "translateY(-3px)", borderColor: "cyan.300", bg: "whiteAlpha.200" }}
              >
                <Icon as={item.icon} boxSize={5} color="cyan.200" mb={3} />
                <Heading size="sm" mb={2}>
                  {item.title}
                </Heading>
                <Text fontSize="sm" color="whiteAlpha.800">
                  {item.description}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </Box>

        <Grid id="portals" templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={6} mt={{ base: 12, md: 16 }} scrollMarginTop="110px">
          <Box p={{ base: 5, md: 6 }} borderRadius="2xl" border="1px solid" borderColor="whiteAlpha.200" bg="rgba(3, 10, 24, 0.7)">
            <Heading size="md" mb={4}>
              Product Stack
            </Heading>
            <VStack align="stretch" spacing={3}>
              {stackItems.map((line) => (
                <HStack key={line} align="flex-start" spacing={3}>
                  <StarIcon mt="5px" color="teal.200" boxSize={3} />
                  <Text color="whiteAlpha.800">{line}</Text>
                </HStack>
              ))}
            </VStack>
          </Box>

          <Box
            p={{ base: 5, md: 6 }}
            borderRadius="2xl"
            border="1px solid"
            borderColor="cyan.700"
            bg="linear-gradient(145deg, rgba(10,28,56,0.78), rgba(7,17,34,0.9))"
          >
            <Heading size="md" mb={3}>
              Role-based access portals
            </Heading>
            <VStack align="stretch" spacing={3}>
              {portalCards.map((item) => (
                <Box key={item.title} border="1px solid" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
                  <Heading size="sm" mb={1}>
                    {item.title}
                  </Heading>
                  <Text color="whiteAlpha.800" fontSize="sm" mb={3}>
                    {item.text}
                  </Text>
                  <Button
                    as={Link}
                    href={item.href}
                    size="sm"
                    variant="outline"
                    color="white"
                    borderColor="whiteAlpha.500"
                    _hover={{ bg: "whiteAlpha.200", color: "white" }}
                  >
                    Open Portal
                  </Button>
                </Box>
              ))}
            </VStack>
          </Box>
        </Grid>

        <Box mt={{ base: 12, md: 16 }}>
          <Heading fontSize={{ base: "2xl", md: "3xl" }} mb={6}>
            CTO / CEO metrics preview
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
            {executiveMetrics.map((metric) => (
              <Box key={metric.label} p={5} borderRadius="xl" border="1px solid" borderColor="whiteAlpha.200" bg="rgba(9, 20, 34, 0.72)">
                <Text fontSize="xs" letterSpacing="0.12em" color="whiteAlpha.700" textTransform="uppercase" mb={2}>
                  {metric.label}
                </Text>
                <Heading size="lg" color="cyan.200" mb={1}>
                  {metric.value}
                </Heading>
                <Text fontSize="sm" color="green.300">
                  {metric.trend}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </Box>

        <Box id="network" mt={{ base: 12, md: 16 }} scrollMarginTop="110px">
          <Heading fontSize={{ base: "2xl", md: "3xl" }} mb={2}>
            Labit information network
          </Heading>
          <Text color="whiteAlpha.800" mb={6}>
            Machines, communication channels, operations teams, and leadership views connected through one core.
          </Text>
          <Box
            borderRadius="2xl"
            border="1px solid"
            borderColor="whiteAlpha.300"
            bg="radial-gradient(circle at center, rgba(34,211,238,0.14), rgba(7,18,30,0.88) 55%)"
            p={{ base: 5, md: 8 }}
          >
            <Grid templateColumns={{ base: "1fr", lg: "1fr auto 1fr" }} gap={6} alignItems="center">
              <VStack spacing={3} align="stretch">
                {leftNodes.map((node) => (
                  <Box key={node} p={3} borderRadius="lg" border="1px solid" borderColor="whiteAlpha.300" bg="whiteAlpha.100">
                    <Text fontSize="sm">{node}</Text>
                  </Box>
                ))}
              </VStack>

              <VStack spacing={4} minW={{ lg: "280px" }}>
                <Image src={LABBIT_LOGO} alt="Labit Network Core" h={{ base: "56px", md: "74px" }} w="auto" />
                <Box p={4} borderRadius="xl" border="1px solid" borderColor="cyan.300" bg="rgba(12,27,46,0.95)">
                  <Text fontWeight="bold" color="cyan.200">
                    Unified Labit Data Core
                  </Text>
                </Box>
                <HStack spacing={2} color="cyan.200" fontSize="xs" letterSpacing="0.08em" textTransform="uppercase">
                  <Text>Ingest</Text>
                  <Text>•</Text>
                  <Text>Process</Text>
                  <Text>•</Text>
                  <Text>Dispatch</Text>
                </HStack>
              </VStack>

              <VStack spacing={3} align="stretch">
                {rightNodes.map((node) => (
                  <Box key={node} p={3} borderRadius="lg" border="1px solid" borderColor="whiteAlpha.300" bg="whiteAlpha.100">
                    <Text fontSize="sm">{node}</Text>
                  </Box>
                ))}
              </VStack>
            </Grid>
          </Box>
        </Box>

        <Box
          id="contact"
          mt={{ base: 8, md: 10 }}
          scrollMarginTop="110px"
          p={{ base: 5, md: 6 }}
          borderRadius="2xl"
          border="1px solid"
          borderColor="whiteAlpha.300"
          bg="rgba(8, 19, 36, 0.75)"
        >
          <Heading size="md" mb={2}>
            Contact and rollout
          </Heading>
          <Text color="whiteAlpha.800" mb={4}>
            For onboarding, pilot deployment, or enterprise rollout discussions, contact the Labit team.
          </Text>
          <HStack spacing={3} flexWrap="wrap">
            <Button as={Link} href="mailto:hello@labit.online" bg="teal.300" color="black" _hover={{ bg: "teal.200" }}>
              hello@labit.online
            </Button>
            <Button
              as={Link}
              href="https://labit.online"
              isExternal
              variant="outline"
              color="white"
              borderColor="whiteAlpha.600"
              _hover={{ bg: "whiteAlpha.200", color: "white" }}
            >
              Visit labit.online
            </Button>
          </HStack>
        </Box>

        <Text mt={{ base: 10, md: 14 }} textAlign="center" color="whiteAlpha.600" fontSize="sm">
          Labit Platform • Diagnostics Operations • Automation • Reliability
        </Text>
      </Container>

      <Box
        as="style"
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes labitFloat {
              0% { transform: translate3d(0, 0, 0) scale(1); }
              50% { transform: translate3d(0, 14px, 0) scale(1.03); }
              100% { transform: translate3d(0, 0, 0) scale(1); }
            }
            html { scroll-behavior: smooth; }
          `,
        }}
      />
    </Box>
  );
}
