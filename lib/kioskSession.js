export const kioskIronOptions = {
  cookieName: "labbit_kiosk_session",
  password: process.env.SECRET_COOKIE_PASSWORD,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production"
  }
};

export function getKioskEnvConfig() {
  return {
    username: String(process.env.REPORT_KIOSK_USERNAME || "report_dispatcher").trim(),
    password: String(process.env.REPORT_KIOSK_PASSWORD || "report@123").trim(),
    labId: String(process.env.REPORT_KIOSK_LAB_ID || process.env.DEFAULT_LAB_ID || "").trim() || null
  };
}
