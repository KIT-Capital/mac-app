export const LOGIN_EMAIL_NOTICE =
  "Check your email for a six-digit sign-in code. Type it in the Sign-in code box, then choose Sign in. It lasts 15 minutes and works once.";

export const LOGIN_SMS_NOTICE =
  "Check your phone for a six-digit sign-in code. Type it in the Sign-in code box, then choose Sign in. It lasts a few minutes and works once.";

export const ACCESS_CODE_INTRO =
  "Type this code on the sign-in page. Enter your email, put the code in the box labeled Sign-in code, then choose Sign in. You do not need a password. The code lasts 15 minutes and works once.";

export const DESK_ACCESS_CODE_INTRO =
  "Open the staff sign-in page. Enter your email and password, then type this code in the box labeled Sign-in code and choose Sign in. The code lasts 15 minutes and works once.";

export const DESK_SET_PASSWORD_INTRO =
  "Use the secure link below to set your desk password. It lasts 15 minutes and works once. Then open the staff sign-in page, enter your email and that password, and use the one-time code that follows.";

/**
 * @param {string} [role]
 */
export function inviteIntro(role) {
  const who = role === "dealer" ? "a dealer" : "a collector";
  return `The desk added you as ${who}. Open Sign in and enter this email. A second email brings a six-digit code. Type that code in the box labeled Sign-in code, then choose Sign in. You do not need a password.`;
}
