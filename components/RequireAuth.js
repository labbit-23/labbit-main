// components/RequireAuth.js

"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "../app/context/UserContext";
import { Spinner, Flex } from "@chakra-ui/react";

export default function RequireAuth({ children, roles = [] }) {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      const roleKey =
        user?.userType === "executive"
          ? (user.executiveType || "").toLowerCase().trim()
          : (user?.userType || "").toLowerCase().trim();

      const allowedRoles = roles.map((r) => r.toLowerCase().trim());
      const isAllowed = !!user && (allowedRoles.length === 0 || allowedRoles.includes(roleKey));

      console.log("RequireAuth check", {
        user,
        isLoading,
        roleKey,
        roles,
        allowedRoles,
        isAllowed,
        pathname,
      });

      if (!isAllowed && pathname !== "/login") {
        router.replace("/login");
      }
    }
  }, [user, isLoading, router, pathname, roles]);

  if (isLoading) {
    return (
      <Flex height="100vh" align="center" justify="center">
        <Spinner size="xl" />
      </Flex>
    );
  }

  // While redirecting, avoid rendering anything
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
