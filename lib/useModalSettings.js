// File: /lib/useModalSettings.js

import { useUser } from "../app/context/UserContext";
import { getModalFieldSettings } from "./modalFieldSettings";

export function useModalSettings(modalName) {
  const user = useUser();
  const role = user?.userType ?? "guest";
  return getModalFieldSettings(modalName, role);
}
