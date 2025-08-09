// /lib/session.js

export const ironOptions = {
  cookieName: 'labbit_session',
  password: process.env.SECRET_COOKIE_PASSWORD,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production' ? true : false, // false for dev, true for prod
  },
};
