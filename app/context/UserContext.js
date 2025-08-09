// File: /app/context/UserContext.js

"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const userData = await res.json();
      setUser(userData);
    } catch {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    setIsLoading(true);
    await fetchUser();
    setIsLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const contextValue = useMemo(
    () => ({ user, setUser, isLoading, refreshUser }),
    [user, isLoading]
  );

  return <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
