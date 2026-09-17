import "server-only";
import {
  decideCollectorAccessRequest,
  openVerificationToken,
  requireActiveCollector,
  sealCollectorSession,
} from "@/lib/collector-access.mjs";
import { getDb } from "@/lib/db/client";
import {
  activateInvitedCollector,
  findCustomerByEmail,
  registerVerifiedCollector,
} from "@/lib/db/records";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import {
  dispatchCollectorAccessMail,
  dispatchMail,
} from "@/lib/mail";

export async function requestCollectorAccess(input: unknown) {
  return decideCollectorAccessRequest(
    input,
    process.env,
    {
      findCustomerByEmail: async (email: string) => {
        const db = getDb();
        return findCustomerByEmail(db, email);
      },
      sendAccessEmail: dispatchCollectorAccessMail,
    },
  );
}

export async function verifyCollectorAccess(token: string) {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) throw new Error("COLLECTOR_LIVE_BOOK_DISABLED");
  if (!config.ok) throw new Error(config.errors[0]);

  const payload = openVerificationToken(token, config.secret);
  const db = getDb();
  let customer;
  let redirectPath;

  if (payload.action === "login") {
    customer = await findCustomerByEmail(db, payload.email);
    if (!customer || customer.id !== payload.customerId) {
      throw new Error("TOKEN_CUSTOMER_MISMATCH");
    }
    customer = customer.status === "invited"
      ? await activateInvitedCollector(db, customer.id, customer.email)
      : requireActiveCollector(customer);
    redirectPath = "/collection";
  } else {
    customer = await registerVerifiedCollector(db, {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
    });
    requireActiveCollector(customer);
    await dispatchMail({
      kind: "welcome",
      name: customer.name,
      email: customer.email,
    });
    redirectPath = "/collection/setup";
  }

  return {
    sessionToken: sealCollectorSession(
      { customerId: customer.id, email: customer.email },
      config.secret,
    ),
    redirectUrl: new URL(redirectPath, config.origin),
    secureCookie: config.origin.startsWith("https://"),
  };
}
