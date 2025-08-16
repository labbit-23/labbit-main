// components/RedirectIfAuth.js
"use client";

import { useUser } from "../app/context/UserContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Spinner, Flex } from "@chakra-ui/react";

export default function RedirectIfAuth({ children }) {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user) {
      let target = "/";
      const execType = user.userType === "executive"
        ? (user.executiveType || "").toLowerCase()
        : null;

      if (user.userType === "patient") target = "/patient";
      else if (user.userType === "executive") {
        if (["admin", "manager", "director"].includes(execType)) target = "/admin";
        else if (execType === "phlebo") target = "/phlebo";
        else if (["logistics", "b2b", "b2badmin"].includes(execType)) target = "/collection-centre";
        else target = "/";
      }

      if (pathname !== target) {
        router.replace(target);
      }
    }
  }, [user, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <Flex h="100vh" align="center" justify="center">
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  return null;
}
