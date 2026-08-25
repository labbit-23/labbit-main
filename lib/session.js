// /lib/session.js

export const SESSION_IDLE_TIMEOUT_SECONDS = 60 * 60;
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const ironOptions = {
  cookieName: 'labbit_session',
  password: process.env.SECRET_COOKIE_PASSWORD,
  ttl: REMEMBER_ME_MAX_AGE_SECONDS,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production' ? true : false, // false for dev, true for prod
  },
};

export function sessionOptionsForRemember(rememberMe) {
  return {
    ...ironOptions,
    ttl: rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : SESSION_IDLE_TIMEOUT_SECONDS + 60,
    cookieOptions: {
      ...ironOptions.cookieOptions,
      maxAge: rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : SESSION_IDLE_TIMEOUT_SECONDS,
    },
  };
}

export function stampSessionLogin(session, rememberMe) {
  const now = Math.floor(Date.now() / 1000);
  session.session = {
    rememberMe: Boolean(rememberMe),
    issuedAt: now,
    lastSeenAt: now,
    ...(rememberMe ? {} : { idleExpiresAt: now + SESSION_IDLE_TIMEOUT_SECONDS }),
  };
}

export function isSessionIdleExpired(session, now = Math.floor(Date.now() / 1000)) {
  if (!session?.user) return false;
  if (!session.session) return true;
  if (session.session.rememberMe) return false;
  return typeof session.session.idleExpiresAt !== "number" || session.session.idleExpiresAt <= now;
}

export function refreshSessionActivity(session) {
  if (!session?.user || !session.session || session.session.rememberMe) return false;
  if (isSessionIdleExpired(session)) return false;
  const now = Math.floor(Date.now() / 1000);
  session.session.lastSeenAt = now;
  session.session.idleExpiresAt = now + SESSION_IDLE_TIMEOUT_SECONDS;
  return true;
}

export function prepareSessionForSave(session) {
  const rememberMe = Boolean(session?.session?.rememberMe);
  session.updateConfig(sessionOptionsForRemember(rememberMe));
}
