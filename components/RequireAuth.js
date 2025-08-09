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
      const roleKey = user?.userType === "executive"
        ? (user.executiveType || "").toLowerCase()
        : user?.userType;

      const isAllowed = user && (roles.length === 0 || roles.includes(roleKey));

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

  if (!user) {
    return null; // nothing while redirecting
  }

  return <>{children}</>;
}
