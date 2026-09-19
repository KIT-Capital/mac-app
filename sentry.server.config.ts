import * as Sentry from "@sentry/nextjs";
import {
  filterSentryTransaction,
  scrubSentryEvent,
} from "./lib/observability.mjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  beforeBreadcrumb: (breadcrumb) => scrubSentryEvent(breadcrumb),
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => filterSentryTransaction(event),
});
