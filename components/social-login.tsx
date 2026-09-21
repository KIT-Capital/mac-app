"use client";

export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M15.14 12.07h-2.14v7.93h-3.28v-7.93H8.25V9.31h1.47V7.52c0-2.06 1.23-3.19 3.1-3.19.9 0 1.67.07 1.9.1v2.2h-1.3c-1 0-1.2.48-1.2 1.18v1.5h2.44l-.32 2.76z"
      />
    </svg>
  );
}

export function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-4 w-4"} fill="currentColor" aria-hidden>
      <path d="M16.37 12.23c-.03-3.04 2.48-4.5 2.59-4.57-1.41-2.06-3.61-2.34-4.39-2.37-1.87-.19-3.65 1.1-4.6 1.1-.95 0-2.42-1.07-3.98-1.04-2.05.03-3.94 1.19-5 3.02-2.13 3.69-.54 9.15 1.53 12.14 1.01 1.46 2.22 3.1 3.8 3.04 1.54-.06 2.12-.99 3.98-.99 1.86 0 2.38.99 4 .96 1.65-.03 2.7-1.49 3.71-2.96 1.17-1.7 1.65-3.35 1.68-3.44-.04-.01-3.22-1.24-3.25-4.89zM13.76 3.99c.85-1.03 1.42-2.46 1.26-3.89-1.22.05-2.7.81-3.57 1.84-.79.91-1.48 2.37-1.3 3.77 1.37.11 2.77-.7 3.61-1.72z" />
    </svg>
  );
}

export function SocialLogin({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-mac-line" />
        <span className="text-[10px] font-medium tracking-[0.16em] text-mac-faint uppercase">
          Or continue with
        </span>
        <div className="h-px flex-1 bg-mac-line" />
      </div>

      <div className="flex items-center justify-center gap-4 pt-1">
        <button
          type="button"
          onClick={onContinue}
          aria-label="Sign in with Google"
          title="Sign in with Google"
          className="mac-tap flex h-11 w-11 items-center justify-center rounded-full border border-mac-line bg-mac-card shadow-sm transition hover:border-mac-gold active:scale-95"
        >
          <GoogleMark />
        </button>
        <button
          type="button"
          onClick={onContinue}
          aria-label="Continue with Facebook"
          title="Continue with Facebook"
          className="mac-tap flex h-11 w-11 items-center justify-center rounded-full border border-mac-line bg-mac-card shadow-sm transition hover:border-mac-gold active:scale-95"
        >
          <FacebookMark />
        </button>
        <button
          type="button"
          onClick={onContinue}
          aria-label="Sign in with Apple"
          title="Sign in with Apple"
          className="mac-tap flex h-11 w-11 items-center justify-center rounded-full border border-mac-line bg-mac-card text-mac-fg shadow-sm transition hover:border-mac-gold active:scale-95"
        >
          <AppleMark />
        </button>
      </div>
    </div>
  );
}
