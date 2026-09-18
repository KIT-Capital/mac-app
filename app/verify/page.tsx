import type { Metadata } from "next";
import Link from "next/link";
import { MacLockup } from "@/components/mac-logo";

export const metadata: Metadata = {
  title: "Confirm sign-in · Mechanical Art Capital",
  referrer: "no-referrer",
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const invalid = query.state === "invalid" || !token;
  const unavailable = query.state === "unavailable";

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-mac-bg px-6 py-10 text-mac-fg">
      <div className="mx-auto w-full max-w-sm text-center">
        <MacLockup onDark size="hero" />
        {unavailable ? (
          <>
            <h1 className="mt-8 text-xl font-medium">Sign-in is temporarily unavailable.</h1>
            <p className="mt-3 text-sm leading-relaxed text-mac-muted">
              Your link was not consumed. Please try it again shortly.
            </p>
          </>
        ) : invalid ? (
          <>
            <h1 className="mt-8 text-xl font-medium">This sign-in link could not be used.</h1>
            <p className="mt-3 text-sm leading-relaxed text-mac-muted">
              It may have expired or already been used. Request a new link to continue.
            </p>
            <Link
              href="/login"
              className="mac-tap mt-8 flex h-12 items-center justify-center bg-[#0E2A44] text-sm font-bold tracking-[0.12em] text-white uppercase"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-xl font-medium">Confirm sign-in</h1>
            <p className="mt-3 text-sm leading-relaxed text-mac-muted">
              Open this link in the browser you use for Mechanical Art Capital, then confirm below.
            </p>
            <form method="post" action="/api/collector-session/verify" className="mt-8">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="mac-tap flex h-12 w-full items-center justify-center bg-[#0E2A44] text-sm font-bold tracking-[0.12em] text-white uppercase"
              >
                Confirm sign-in
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
