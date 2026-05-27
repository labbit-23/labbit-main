"use client";

import React from "react";
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Tooltip,
} from "@chakra-ui/react";
import { Menu as MenuIcon } from "lucide-react";

function ShortcutAction({
  label,
  icon,
  onClick,
  href,
  target,
  rel,
  badgeCount = 0,
  colorScheme = "gray",
  variant = "outline",
  isActive = false,
  isDisabled = false,
}) {
  const safeCount = Number(badgeCount || 0);
  return (
    <Box position="relative">
      <Tooltip label={label} hasArrow>
        <IconButton
          size="sm"
          minW="36px"
          w={{ base: "36px", lg: "40px" }}
          variant={isActive ? "solid" : variant}
          colorScheme={isActive ? "teal" : colorScheme}
          icon={icon}
          aria-label={label}
          onClick={onClick}
          as={href ? "a" : undefined}
          href={href}
          target={target}
          rel={rel}
          isDisabled={isDisabled}
        />
      </Tooltip>
      {safeCount > 0 ? (
        <Badge
          position="absolute"
          top="-6px"
          right="-5px"
          colorScheme="red"
          borderRadius="full"
          fontSize="0.62rem"
          minW="18px"
          textAlign="center"
          px={1}
          py="2px"
          lineHeight="1"
          pointerEvents="none"
        >
          {safeCount > 99 ? "99+" : safeCount}
        </Badge>
      ) : null}
    </Box>
  );
}

export default function ShortcutActionsMenu({
  actions = [],
  isMobile = false,
  primaryKeys = [],
  trailingKeys = [],
  menuLabel = "More actions",
  mobileLabel = "Open shortcuts",
  menuButtonVariant = "outline",
}) {
  const visibleActions = actions.filter((action) => !action.hidden);
  const primarySet = new Set(primaryKeys);
  const trailingSet = new Set(trailingKeys);

  if (isMobile) {
    return (
      <Menu isLazy>
        <MenuButton
          as={IconButton}
          aria-label={mobileLabel}
          icon={<MenuIcon size={16} />}
          size="sm"
          variant={menuButtonVariant}
        />
        <MenuList minW="220px" maxH="70vh" overflowY="auto">
          {visibleActions.map((action) => (
            <MenuItem
              key={action.key}
              icon={action.icon}
              as={action.href ? "a" : "button"}
              href={action.href}
              target={action.target}
              rel={action.rel}
              onClick={action.onClick}
              isDisabled={action.isDisabled}
              fontWeight={action.isActive ? "700" : "500"}
            >
              {action.label}{action.badgeCount > 0 ? ` (${action.badgeCount > 99 ? "99+" : action.badgeCount})` : ""}
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    );
  }

  const primaryActions = visibleActions.filter((action) => primarySet.has(action.key));
  const trailingActions = visibleActions.filter((action) => trailingSet.has(action.key));
  const menuActions = visibleActions.filter(
    (action) => !primarySet.has(action.key) && !trailingSet.has(action.key)
  );

  return (
    <HStack spacing={1} align="center">
      {primaryActions.map((action) => (
        <ShortcutAction
          key={action.key}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
          href={action.href}
          target={action.target}
          rel={action.rel}
          badgeCount={action.badgeCount}
          colorScheme={action.colorScheme}
          variant={action.variant}
          isActive={action.isActive}
          isDisabled={action.isDisabled}
        />
      ))}
      <Menu isLazy>
        <Tooltip label={menuLabel} hasArrow>
          <MenuButton
            as={IconButton}
            aria-label={menuLabel}
            icon={<MenuIcon size={16} />}
            size="sm"
            variant={menuButtonVariant}
          />
        </Tooltip>
        <MenuList minW="240px" maxH="70vh" overflowY="auto">
          {menuActions.map((action) => (
            <MenuItem
              key={action.key}
              icon={action.icon}
              as={action.href ? "a" : "button"}
              href={action.href}
              target={action.target}
              rel={action.rel}
              onClick={action.onClick}
              isDisabled={action.isDisabled}
              fontWeight={action.isActive ? "700" : "500"}
            >
              {action.label}
              {action.badgeCount > 0 ? ` (${action.badgeCount > 99 ? "99+" : action.badgeCount})` : ""}
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
      {trailingActions.map((action) => (
        <ShortcutAction
          key={action.key}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
          href={action.href}
          target={action.target}
          rel={action.rel}
          badgeCount={action.badgeCount}
          colorScheme={action.colorScheme}
          variant={action.variant}
          isActive={action.isActive}
          isDisabled={action.isDisabled}
        />
      ))}
    </HStack>
  );
}
