export const dynamic = "force-dynamic";

/** Temporary Railway Development smoke. Other environments stay dark. */
export function GET() {
  if (process.env.APP_ENV !== "development") {
    return new Response(null, { status: 404 });
  }
  throw new Error("Sentry Railway Development smoke 20260922T0418");
}
