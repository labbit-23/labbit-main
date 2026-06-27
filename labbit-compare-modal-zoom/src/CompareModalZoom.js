// src/CompareModalZoom.js
"use client";
import React, { useRef } from "react";
import {
	Modal, ModalOverlay, ModalContent, ModalCloseButton, ModalBody,
	Table, Thead, Tbody, Tr, Th, Td, Box, Flex, Heading, Text, Button, Image
} from "@chakra-ui/react";
import { DownloadIcon, CheckIcon } from "@chakra-ui/icons";
import html2canvas from "html2canvas";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

// Consumers pass icon map/category map to avoid tight coupling
export default function CompareModalZoom({
	isOpen,
	onClose,
	variants = [],
	testsByCategory = null,
	logoUrl = "",
	downloadFilePrefix = "comparison"
}) {
	const tableRef = useRef(null);

	if (!variants || variants.length === 0) return null;

	const buildTestsByCategory = () => {
		if (testsByCategory) return testsByCategory;
		const grouped = {};
		variants.forEach(({ variant }) => {
			(variant.tests || []).forEach((test) => {
				const cat = test.category || "Uncategorised";
				if (!grouped[cat]) grouped[cat] = new Set();
				grouped[cat].add(test.name || test);
			});
		});
		Object.keys(grouped).forEach((k) => (grouped[k] = Array.from(grouped[k]).sort()));
		return grouped;
	};

	const grouped = buildTestsByCategory();

	const downloadImage = async () => {
		if (!tableRef.current) return;
		const btn = tableRef.current.querySelector(".no-print");
		if (btn) btn.style.visibility = "hidden";
		try {
			const canvas = await html2canvas(tableRef.current, {
				backgroundColor: "#fff",
				scale: 2,
			});
			const link = document.createElement("a");
			link.download = `${downloadFilePrefix}-${new Date().toISOString().slice(0, 10)}.jpg`;
			link.href = canvas.toDataURL("image/jpeg", 0.95);
			link.click();
		} catch (err) {
			alert("Error generating image: " + err.message);
		} finally {
			if (btn) btn.style.visibility = "visible";
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside" isCentered>
			<ModalOverlay />
			<ModalContent maxW="90vw">
				<ModalCloseButton />
				<ModalBody>
					{/* Pinch-zoom wrapper */}
					<TransformWrapper
						initialScale={1}
						minScale={0.6}
						maxScale={4}
						wheel={{ step: 0.1 }}
						pinch={{ step: 5 }}
						doubleClick={{ disabled: false, step: 0.8 }}
					>
						<TransformComponent wrapperStyle={{ width: "100%" }}>
							<Box ref={tableRef} bg="white" p={2}>
								<Flex justify="space-between" align="center" w="100%" mb={4}>
									{logoUrl ? <Image src={logoUrl} alt="Logo" height="40px" /> : <Box />}
									<Button className="no-print" leftIcon={<DownloadIcon />} size="sm" colorScheme="teal" onClick={downloadImage}>
										Download JPG
									</Button>
								</Flex>

								<Table size="sm">
									<Thead>
										<Tr>
											<Th>Test</Th>
											{variants.map(({ pkgName, variantName, variant }) => (
												<Th key={`${pkgName}-${variantName}`} textAlign="center">
													<Box>
														<Text fontWeight="bold">{pkgName} — {variantName}</Text>
														<Text color="#F46C3B" fontWeight="semibold" mt={1}>₹ {variant.price}</Text>
													</Box>
												</Th>
											))}
										</Tr>
									</Thead>
									<Tbody>
										{Object.entries(grouped).map(([category, tests], i) => {
											const groupBg = i % 2 === 0 ? "white" : "gray.50";
											return (
												<React.Fragment key={category}>
													<Tr bg={groupBg}>
														<Td colSpan={variants.length + 1} fontWeight="bold">
															<Heading size="sm">{category}</Heading>
														</Td>
													</Tr>
													{tests.map((test) => (
														<Tr key={test} bg={groupBg}>
															<Td>{test}</Td>
															{variants.map(({ variant }) => (
																<Td key={`${variant.name || variant.variantName}-${test}`} textAlign="center">
																	{(variant.tests || []).some((t) => (t.name || t) === test) && (
																		<CheckIcon color="teal.500" />
																	)}
																</Td>
															))}
														</Tr>
													))}
												</React.Fragment>
											);
										})}
									</Tbody>
								</Table>
							</Box>
						</TransformComponent>
					</TransformWrapper>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}