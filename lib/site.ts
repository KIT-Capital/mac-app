/** Public hostname. Mail and demo logins stay on @mechartcap.com. */
export const SITE_HOST = "mechart.app";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || `https://${SITE_HOST}`;
