/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Input from "@/components/ui/Input";

type Member = {
  id: number;
  full_name: string;
  email: string;
  phone_number: string;
  status: string;
};
type Meeting = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  status: string;
};
type Quote = { id: number; text: string; source: string; published_at: string };
type Preferences = {
  push_enabled: boolean;
  email_enabled: boolean;
  reminder_minutes: number;
};
type ApiResult<T> = {
  data?: T;
  error?: { message?: string; code?: string; details?: unknown };
  meta?: {
    page: number;
    page_size: number;
    total_entries: number;
    total_pages: number;
  };
};

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`/api/backend/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      body?.error?.message || `Request failed (${response.status})`,
    ) as Error & { code?: string };

    error.code = body?.error?.code;
    throw error;
  }
  return body;
}
function initials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase() || "F"
  );
}
function dateLabel(
  value?: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
  },
) {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat("en-NG", {
    ...opts,
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}
function timeLabel(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}
function ErrorNote({ text }: { text: string }) {
  return (
    <div className="notice error" role="alert">
      {text}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <span className="spinner" />
      Loading your fellowship…
    </div>
  );
}

export default function AppPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = (pathname || "/").split("/").filter(Boolean)[0] || "welcome";
  const [member, setMember] = useState<Member | null>(null);
  const [home, setHome] = useState<any>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [checkSession, setCheckSession] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [profile, setProfile] = useState<Member | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({
    push_enabled: true,
    email_enabled: true,
    reminder_minutes: 60,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pageMeta, setPageMeta] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [, setScannedValue] = useState("");
  const [qrStatus, setQrStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [qrMessage, setQrMessage] = useState("");
  const [qrErrorCode, setQrErrorCode] = useState("");
  const qrRequestInFlight = useRef(false);
  const signupFormRef = useRef<HTMLElement | null>(null);
  const qrScannerLifecycleRef = useRef<Promise<void>>(Promise.resolve());

  const displayName =
    profile?.full_name ||
    member?.full_name ||
    home?.member?.full_name ||
    "";

  const go = useCallback(
    (to: string) => {
      setError("");
      setNotice("");
      router.push(to === "welcome" ? "/" : `/${to}`);
    },
    [router],
  );
  const loadHome = useCallback(async () => {
    const r = await api<any>("home");
    setHome(r.data);
    setMember(r.data?.member || null);
    setMeeting(r.data?.next_meeting || null);
    setQuote(r.data?.latest_quotation || null);
    setPrefs(r.data?.notification_preferences || prefs);
  }, [prefs]);
  const loadAttendance = useCallback(async (p = 1) => {
    const r = await api<any[]>(`attendance?page=${p}&page_size=20`);
    setAttendance(r.data || []);
    setPageMeta(r.meta || null);
  }, []);
  const loadQuotes = useCallback(async (p = 1) => {
    const r = await api<Quote[]>(`quotations?page=${p}&page_size=20`);
    setQuotes(r.data || []);
    setPageMeta(r.meta || null);
  }, []);
  const loadProfile = useCallback(async () => {
    const [pr, nr] = await Promise.all([
      api<Member>("profile"),
      api<Preferences>("notification-preferences"),
    ]);
    setProfile(pr.data || null);
    setMember(pr.data || null);
    setPrefs(nr.data || prefs);
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (["welcome", "login", "register", "forgot-password"].includes(page)) {

        try {
          const r = await api<any>("home");

          if (!cancelled && r.data?.member) {
            setHome(r.data);
            setMember(r.data.member);

            if (["welcome", "login", "register", "forgot-password"].includes(page)) {
              router.replace("/home");
            }
          }
        } catch {
          /* unauthenticated is expected on public pages */
        }
        return;
      }
      setLoading(true);
      setError("");
      await loadHome()

      try {
        if (
          page === "home" ||
          page === "check-in" ||
          page === "check-in-success" ||
          page === "already-checked-in"
        ) {
          const s = await api<any>("check-in/session");
          if (!cancelled) setCheckSession(s.data);
        } else if (page === "attendance") await loadAttendance();
        else if (page === "quotations") await loadQuotes();
        else if (page === "profile" || page === "settings") await loadProfile();
        else if (page === "meetings") {
          const r = await api<Meeting>("meetings/next");
          if (!cancelled) setMeeting(r.data || null);
        }
      } catch (e) {
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : "Could not load this page.";
          if (/unauthorized|expired|token/i.test(message)) {
            go("login");
            return;
          }
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [page]);


  const scanRequested = searchParams.get("scan") === "1";

  useEffect(() => {
    console.log("[QR scanner] URL trigger", {
      page,
      scanRequested,
    });

    if (page !== "home" || !scanRequested) return;

    console.log("[QR scanner] Opening scanner");

    setScannerError("");
    setScannedValue("");
    setQrStatus("idle");
    setQrMessage("");
    setQrErrorCode("");
    qrRequestInFlight.current = false;
    setScannerOpen(true);

    window.history.replaceState(null, "", "/home");
  }, [page, scanRequested]);


  useEffect(() => {
    console.info("[QR scanner] Effect entered", { scannerOpen });

    if (!scannerOpen) {
      console.info("[QR scanner] Effect skipped: scanner is closed");
      return;
    }

    let scanner: any = null;
    let cancelled = false;
    let startPromise: Promise<void> | null = null;
    let stopPromise: Promise<void> | null = null;

    async function stopScannerSafely(): Promise<void> {
      if (!scanner) return;


      if (stopPromise) {
        await stopPromise;
        return;
      }

      const operation = (async () => {

        if (startPromise) {
          try {
            await startPromise;
          } catch {

          }
        }

        if (!scanner) return;


        const state = scanner.getState();

        if (state !== 2 && state !== 3) {
          console.info(
            "[QR scanner] Stop skipped; scanner is not active",
            { state },
          );
          return;
        }

        try {
          await scanner.stop();
          console.info("[QR scanner] Scanner stopped successfully");
        } catch (error) {
          const currentState = scanner.getState();

          if (currentState !== 2 && currentState !== 3) {
            console.info(
              "[QR scanner] Stop ignored; scanner is already inactive",
              { currentState },
            );
            return;
          }


          throw error;
        }

      })();

      stopPromise = operation;

      try {
        await operation;
      } finally {
        if (stopPromise === operation) {
          stopPromise = null;
        }
      }
    }

    async function startScanner(): Promise<void> {
      console.info("[QR scanner] Initialization started");

      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        console.info("[QR scanner] Library loaded", { cancelled });

        if (cancelled) {
          console.info("[QR scanner] Initialization aborted after cleanup");
          return;
        }


        await qrScannerLifecycleRef.current;

        if (cancelled) {
          console.info("[QR scanner] Initialization cancelled before creation");
          return;
        }

        scanner = new Html5Qrcode("fgbmfi-qr-reader");

        console.info("[QR scanner] Instance created");

        startPromise = scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
          },
          async (decodedText: string) => {
            console.info("[QR scanner] QR decoded", {
              cancelled,
              requestInFlight: qrRequestInFlight.current,
            });

            if (cancelled || qrRequestInFlight.current) {
              console.warn("[QR scanner] Decoded value ignored", {
                cancelled,
                requestInFlight: qrRequestInFlight.current,
              });
              return;
            }

            qrRequestInFlight.current = true;
            setScannedValue(decodedText);
            setScannerError("");
            setQrStatus("verifying");
            setQrMessage("Verifying your QR code…");
            setQrErrorCode("");

            try {
              console.info("[QR scanner] Stopping scanner after decode");
              await stopScannerSafely();
              console.info("[QR scanner] Scanner stopped after decode");
            } catch (error) {
              console.error("[QR scanner] Stop after decode failed", error);


              if (!cancelled) {
                setQrStatus("error");
                setQrMessage(
                  "We couldn't stop the camera safely. Please try scanning again.",
                );
              }

              qrRequestInFlight.current = false;
              return;
            }


            if (cancelled) {
              qrRequestInFlight.current = false;
              return;
            }

            try {
              console.info("[QR scanner] Check-in request started");

              const result = await api<any>("attendance/check-in", {
                method: "POST",
                body: JSON.stringify({ qr_code: decodedText }),
              });

              if (cancelled) return;

              const status = result.data?.status;

              console.info("[QR scanner] Check-in request succeeded", {
                status,
              });

              setQrStatus("success");
              setQrErrorCode("");
              setQrMessage(
                status === "already_checked_in"
                  ? "You're already checked in for this meeting."
                  : result.data?.message ||
                  "Your attendance has been recorded.",
              );

              window.setTimeout(() => {
                if (cancelled) return;

                setScannerOpen(false);
                go(
                  status === "already_checked_in"
                    ? "already-checked-in"
                    : "check-in-success",
                );
              }, 900);
            } catch (error) {
              console.error("[QR scanner] Check-in request failed", error);

              if (cancelled) return;

              setQrStatus("error");

              const code =
                error instanceof Error
                  ? (error as Error & { code?: string }).code
                  : undefined;
              setQrErrorCode(code || "");

              const message =
                code === "invalid_qr_code"
                  ? "Invalid QR Code. Please scan the official FGBMFI Connect QR code."
                  : error instanceof Error
                    ? error.message
                    : "We couldn't verify this QR code.";

              setQrMessage(message);
            } finally {
              qrRequestInFlight.current = false;
            }
          },
          () => {

          },
        );

        await startPromise;

        console.info("[QR scanner] Camera started successfully");


        if (cancelled) {
          console.info("[QR scanner] Startup completed after cancellation");
          await stopScannerSafely();
        }
      } catch (error) {
        console.error(
          "[QR scanner] Initialization or camera start failed",
          error,
        );

        if (!cancelled) {
          setScannerError(
            error instanceof Error
              ? error.message
              : "We couldn't access your camera. Check your browser permissions and try again.",
          );
        }
      }
    }

    void startScanner();

    return () => {
      console.info("[QR scanner] Effect cleanup started", {
        hasScanner: Boolean(scanner),
      });

      cancelled = true;

      if (!scanner) {
        console.info("[QR scanner] Cleanup deferred or skipped: no scanner instance");
        return;
      }


      const cleanupPromise = (async () => {

        if (startPromise) {
          try {
            await startPromise;
          } catch {

          }
        }

        try {
          await stopScannerSafely();
          console.info("[QR scanner] Cleanup stop completed");
        } catch (error) {
          console.warn("[QR scanner] Cleanup stop failed", error);
        }


        try {
          scanner.clear();
          console.info("[QR scanner] Cleanup clear completed");
        } catch (error) {
          console.warn("[QR scanner] Cleanup clear failed", error);
        }
      })();

      qrScannerLifecycleRef.current = cleanupPromise;
    };
  }, [scannerOpen]);


  async function submitAuth(
    event: FormEvent<HTMLFormElement>,
    mode: "login" | "register",
  ) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    form.forEach((value, key) => (payload[key] = value));
    try {
      const r = await api<any>(
        mode === "login" ? "auth/login" : "auth/register",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setMember(r.data?.member || null);
      setScannedValue("");
      setScannerError("");
      router.push("/home?scan=1");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn't complete that request.",
      );
      signupFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const r = await api<Member>("profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setProfile(r.data || null);
      setMember(r.data || null);
      setNotice("Your profile has been updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  }
  async function savePrefs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<Preferences>("notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({
          push_enabled: prefs.push_enabled,
          email_enabled: prefs.email_enabled,
          reminder_minutes: Number(prefs.reminder_minutes),
        }),
      });
      setPrefs(r.data || prefs);
      setNotice("Notification preferences saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save preferences.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* always clear the local HttpOnly cookie through proxy */
    }
    await fetch("/api/session", { method: "DELETE" }).catch(() => { });
    setMember(null);
    setHome(null);
    go("login");
    setBusy(false);
  }

  const navItems = useMemo(
    () => [
      ["home", "⌂", "Home"],
      ["attendance", "▦", "Attendance"],
      ["quotations", "▤", "Scripture"],
      ["profile", "○", "Profile"],
    ],
    [],
  );
  const publicPage = [
    "welcome",
    "login",
    "register",
    "forgot-password",
  ].includes(page);

  if (publicPage) {
    return (
      <main className="auth-shell">
        <div className="auth-brand">
          <div className="brand-mark">
            <span>✝</span>
            <i>●</i>
            <i>●</i>
          </div>
          <div>
            <strong>
              FGBMFI <span>Connect</span>
            </strong>
            <small>Connected in fellowship. Growing in faith.</small>
          </div>
        </div>
        {page === "welcome" && (
          <section className="welcome-panel">
            <div className="welcome-art">
              <div className="sun-glow" />
              <div className="cross-art">✝</div>
              <div className="welcome-copy">
                <span className="eyebrow light">
                  FELLOWSHIP · GROWTH · IMPACT
                </span>
                <h1>A place to belong, grow and make a difference.</h1>
                <p>
                  Stay connected, persevere in faith, and walk together in
                  purpose.
                </p>
              </div>
            </div>
            <div className="auth-card welcome-card">
              <h2>Welcome to FGBMFI Connect</h2>
              <p>Your fellowship, closer than ever.</p>
              <button
                className="button primary full"
                onClick={() => go("login")}
              >
                Sign in
              </button>
              <button
                className="button secondary full"
                onClick={() => go("register")}
              >
                Create an account
              </button>
              <p className="fineprint">
                Built to support our fellowship—not replace the moments that
                bring us together.
              </p>
            </div>
          </section>
        )}
        {page === "login" && (
          <section className="auth-card">
            <div className="eyebrow">WELCOME BACK</div>
            <h1>Good to see you.</h1>
            <p className="muted">Sign in to continue to your fellowship.</p>
            {error && <ErrorNote text={error} />}
            <form
              onSubmit={(e) => submitAuth(e, "login")}
              className="form-stack"
            >
              <label>
                Email or phone number
                <input
                  name="login"
                  autoComplete="username"
                  required
                  placeholder="Email address or phone number"
                />
              </label>
              <label>
                Password
                <Input
                  name="password"
                  type="password"
                  showPasswordToggle
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <button
              className="text-button"
              onClick={() => go("forgot-password")}
            >
              Forgot password?
            </button>
            <p className="auth-switch">
              New here?{" "}
              <button onClick={() => go("register")}>Create an account</button>
            </p>
          </section>
        )}
        {page === "register" && (
          <section className="auth-card" ref={signupFormRef}>
            <div className="eyebrow">JOIN THE FELLOWSHIP</div>
            <h1>Create your account.</h1>
            <p className="muted">Let's get you connected.</p>
            {error && <ErrorNote text={error} />}
            <form
              onSubmit={(e) => submitAuth(e, "register")}
              className="form-stack"
            >
              <label>
                Full name
                <input
                  name="full_name"
                  autoComplete="name"
                  required
                  placeholder="Your full name"
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <Input
                  name="password"
                  type="password"
                  showPasswordToggle
                  minLength={8}
                  autoComplete="new-password"
                  required
                  placeholder="Create a password"
                />
              </label>
              <label>
                Phone number
                <input
                  name="phone_number"
                  type="tel"
                  autoComplete="tel"
                  required
                  placeholder="+234…"
                />
              </label>
              <label>
                Gender
                <select name="gender" required defaultValue="">
                  <option value="" disabled>
                    Select gender
                  </option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label>
                Residential address
                <textarea
                  name="residence_address"
                  autoComplete="street-address"
                  required
                  placeholder="Enter your residential address"
                  rows={3}
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
            <p className="fineprint">
              You can register at any time. Attendance check-in is available
              only while a meeting is accepting check-ins.
            </p>
            <p className="auth-switch">
              Already a member?{" "}
              <button onClick={() => go("login")}>Sign in</button>
            </p>
          </section>
        )}
        {page === "forgot-password" && (
          <section className="auth-card">
            <div className="eyebrow">ACCOUNT RECOVERY</div>
            <h1>Forgot your password?</h1>
            <p className="muted">
              Enter your email or phone number. Recovery delivery is not yet
              configured on the API, but this request is safe to submit.
            </p>
            {error && <ErrorNote text={error} />}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const form = new FormData(e.currentTarget);
                  const r = await api<any>("auth/forgot-password", {
                    method: "POST",
                    body: JSON.stringify(Object.fromEntries(form.entries())),
                  });
                  setNotice(r.data?.message || "Request received.");
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Request failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="form-stack"
            >
              <label>
                Email or phone number
                <input name="login" required placeholder="Email or phone" />
              </label>
              <button className="button primary full" disabled={busy}>
                Request recovery
              </button>
            </form>
            {notice && <div className="notice success">{notice}</div>}
            <button className="text-button" onClick={() => go("login")}>
              Back to sign in
            </button>
          </section>
        )}
        <footer className="auth-footer">
          FGBMFI Connect <span>•</span> Fellowship · Growth · Impact
        </footer>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {scannerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-scanner-title"
          className="qr-scanner-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(22, 14, 39, 0.72)",
          }}
        >
          <section
            className="card qr-scanner-card"
            style={{ width: "min(100%, 460px)", maxHeight: "90dvh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
              <div>
                <div className="eyebrow">FELLOWSHIP ATTENDANCE</div>
                <h2 id="qr-scanner-title">{qrStatus === "verifying" ? "Verifying your check-in" : qrStatus === "success" ? "You're all set" : qrStatus === "error" ? "We couldn't verify that code" : "Scan meeting QR code"}</h2>
                <p className="muted">{qrStatus === "verifying" ? "Please wait while we securely verify the code and record your attendance." : qrStatus === "success" ? qrMessage : qrStatus === "error" ? qrMessage : "Scan the official QR code displayed at your fellowship meeting."}</p>
              </div>
              {qrStatus !== "verifying" && (
                <button type="button" className="text-button" aria-label="Close QR scanner" onClick={() => {
                  console.info("[QR scanner] Close icon clicked", { qrStatus, scannerOpen });
                  setScannerOpen(false);
                }}>✕</button>
              )}
            </div>
            {qrStatus === "verifying" ? (
              <div className="qr-progress-state" role="status" aria-live="polite">
                <div className="qr-progress-orbit"><span className="qr-progress-core">▦</span></div>
                <div className="qr-progress-track"><span /></div>
                <strong>{qrMessage}</strong>
                <span className="muted">This usually takes just a moment.</span>
              </div>
            ) : qrStatus === "error" ? (
              <div className="qr-result-state qr-error-state" role="alert">
                <div className="qr-result-icon"><span>!</span></div>
                <strong>{qrErrorCode === "invalid_qr_code" ? "Invalid QR Code" : "Check-in couldn't be completed"}</strong>
                <p>{qrMessage || "Please scan the official FGBMFI Connect QR code and try again."}</p>
              </div>
            ) : qrStatus === "success" ? (
              <div className="qr-result-state qr-success-state" role="status">
                <div className="qr-result-icon"><span>✓</span></div>
                <strong>Attendance confirmed</strong>
                <p>{qrMessage}</p>
              </div>
            ) : (
              <>
                <div id="fgbmfi-qr-reader" style={{ width: "100%", margin: "16px 0" }} />
                {scannerError && <ErrorNote text={`${scannerError} Camera access requires permission and a secure HTTPS connection.`} />}
              </>
            )}
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {qrStatus === "error" && (
                <button className="button primary full" onClick={() => {
                  console.info("[QR scanner] Scan again clicked", {
                    scannerOpen,
                    qrStatus,
                    hasScannerError: Boolean(scannerError),
                    requestInFlight: qrRequestInFlight.current,
                  });
                  setScannerError(""); setScannedValue(""); setQrStatus("idle"); setQrMessage(""); setQrErrorCode(""); qrRequestInFlight.current = false;
                  setScannerOpen(false);
                  console.info("[QR scanner] Retry scheduled", { delayMs: 100 });
                  window.setTimeout(() => {
                    console.info("[QR scanner] Retry timer fired");
                    setScannerOpen(true);
                  }, 100);
                }}>Scan again</button>
              )}
              {scannerError && qrStatus === "idle" && (
                <button className="button secondary full" onClick={() => {
                  console.info("[QR scanner] Try camera again clicked", {
                    scannerOpen,
                    qrStatus,
                    hasScannerError: Boolean(scannerError),
                    requestInFlight: qrRequestInFlight.current,
                  });
                  setScannerError(""); setScannedValue(""); qrRequestInFlight.current = false;
                  setScannerOpen(false);
                  console.info("[QR scanner] Camera retry scheduled", { delayMs: 100 });
                  window.setTimeout(() => {
                    console.info("[QR scanner] Camera retry timer fired");
                    setScannerOpen(true);
                  }, 100);
                }}>Try camera again</button>
              )}
              {qrStatus !== "verifying" && <button className="button secondary full" onClick={() => {
                console.info("[QR scanner] Cancel/close button clicked", {
                  scannerOpen,
                  qrStatus,
                  hasScannerError: Boolean(scannerError),
                });
                setScannerOpen(false);
              }}>{qrStatus === "success" ? "Close" : "Cancel"}</button>}
            </div>
          </section>
        </div>
      )}
      <aside className="sidebar">
        <button className="brand" onClick={() => go("home")}>
          <div className="brand-mark small">
            <span>✝</span>
            <i>●</i>
            <i>●</i>
          </div>
          <span>
            <b>FGBMFI</b>
            <small>Connect</small>
          </span>
        </button>
        <div className="chapter-label">YOUR FELLOWSHIP</div>
        <nav>
          {navItems.map(([href, icon, label]) => (
            <button
              key={href}
              className={`nav-item ${page === href ? "active" : ""}`}
              onClick={() => go(href)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </button>
          ))}
          <button
            className={`nav-item ${page === "meetings" ? "active" : ""}`}
            onClick={() => go("meetings")}
          >
            <span className="nav-icon">◷</span>Meetings
          </button>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <span className="nav-icon">⚙</span>Preferences
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-member">
            <div className="avatar">{initials(displayName)}</div>
            <div>
              <b>{member?.full_name || "Fellowship member"}</b>
              <small>Member</small>
            </div>
          </div>
          <button className="nav-item logout" onClick={logout}>
            ↪ Sign out
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              FULL GOSPEL BUSINESS MEN’S FELLOWSHIP
            </span>
            <h2>
              {(
                {
                  home: "Home",
                  attendance: "My attendance",
                  quotations: "Scripture",
                  profile: "My profile",
                  settings: "Preferences",
                  meetings: "Meetings",
                  "check-in": "Check in",
                  "check-in-success": "Check-in successful",
                  "already-checked-in": "Already checked in",
                } as Record<string, string>
              )[page] || "FGBMFI Connect"}
            </h2>
          </div>
          <button className="avatar top-avatar" onClick={() => go("profile")}>
            {initials(displayName)}
          </button>
        </header>
        {error && <ErrorNote text={error} />}
        {notice && (
          <div className="notice success">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        {loading ? (
          <Loading />
        ) : (
          <>
            {page === "home" && (
              <div className="content-grid">
                <section className="welcome-heading">
                  <div>
                    <div className="eyebrow">
                      YOUR FELLOWSHIP, CLOSER THAN EVER
                    </div>
                    <h1>
                      Good{" "}
                      {new Date().getHours() < 12
                        ? "morning"
                        : new Date().getHours() < 17
                          ? "afternoon"
                          : "evening"}
                      , {member?.full_name?.split(" ")[0] || "friend"}.
                    </h1>
                    <p>
                      We're glad you're here. Keep growing, keep connecting.
                    </p>
                  </div>
                </section>
                <section className="card meeting-card">
                  <div className="card-kicker">
                    UP NEXT{" "}
                    <span className="status-pill">
                      {meeting ? "Scheduled" : "Coming soon"}
                    </span>
                  </div>
                  <div className="meeting-row">
                    <div className="icon-tile">▦</div>
                    <div className="meeting-info">
                      <h3>{meeting?.title || "Monday Fellowship"}</h3>
                      <p>
                        {meeting
                          ? dateLabel(meeting.starts_at, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })
                          : "Meeting details will appear here"}
                      </p>
                      <small>
                        {meeting
                          ? `${timeLabel(meeting.starts_at)} – ${timeLabel(meeting.ends_at)}`
                          : "Mondays · 7:00 PM – 9:00 PM"}
                      </small>
                    </div>
                  </div>
                  <button
                    className="button primary full"
                    onClick={() => {
                      setScannerError("");
                      setScannedValue("");
                      setQrStatus("idle");
                      setQrMessage("");
                      setQrErrorCode("");
                      qrRequestInFlight.current = false;
                      setScannerOpen(true);
                    }}
                  >
                    <span aria-hidden="true">▦</span> Scan QR to Check In
                  </button>
                </section>
                <section className="card scripture-card">
                  <div className="card-kicker">
                    SCRIPTURE FOR THE SOUL <span>✦</span>
                  </div>
                  {quote ? (
                    <>
                      <blockquote>“{quote.text}”</blockquote>
                      <div className="quote-source">{quote.source}</div>
                    </>
                  ) : (
                    <p className="muted">
                      Your next word of encouragement will appear here.
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => go("quotations")}
                  >
                    Explore scripture →
                  </button>
                </section>
                <section className="card quick-card">
                  <div className="card-kicker">QUICK ACCESS</div>
                  <div className="quick-grid">
                    <button onClick={() => go("attendance")}>
                      <span>▦</span>
                      <b>My attendance</b>
                      <small>View your history</small>
                    </button>
                    <button onClick={() => go("quotations")}>
                      <span>▤</span>
                      <b>Scripture</b>
                      <small>Read and reflect</small>
                    </button>
                    <button onClick={() => go("settings")}>
                      <span>♧</span>
                      <b>Reminders</b>
                      <small>Manage preferences</small>
                    </button>
                    <button onClick={() => go("profile")}>
                      <span>○</span>
                      <b>My profile</b>
                      <small>Your information</small>
                    </button>
                  </div>
                </section>
                <section className="verse-banner">
                  <div>
                    <span className="eyebrow light">
                      ONE BODY. ONE FELLOWSHIP.
                    </span>
                    <h3>
                      “And let us consider how we may spur one another on toward
                      love and good deeds.”
                    </h3>
                    <p>Hebrews 10:24</p>
                  </div>
                  <div className="banner-cross">✝</div>
                </section>
              </div>
            )}
            {page === "check-in" && (
              <section className="narrow">
                <div className="card centered-card">
                  <div className="large-icon">◎</div>
                  <div className="eyebrow">FELLOWSHIP ATTENDANCE</div>
                  <h1>
                    {checkSession?.check_in_open
                      ? "You're right on time."
                      : "Check-in is currently closed."}
                  </h1>
                  <p className="muted">
                    {checkSession?.check_in_open
                      ? "Scan the official fellowship QR code to confirm your attendance."
                      : "Check-in opens during the scheduled fellowship meeting."}
                  </p>
                  {checkSession?.meeting && (
                    <div className="meeting-summary">
                      <b>{checkSession.meeting.title}</b>
                      <span>
                        {dateLabel(checkSession.meeting.starts_at)} ·{" "}
                        {timeLabel(checkSession.meeting.starts_at)}–
                        {timeLabel(checkSession.meeting.ends_at)}
                      </span>
                    </div>
                  )}
                  <button
                    className="button primary full"
                    onClick={() => {
                      setScannerError(""); setScannedValue(""); setQrStatus("idle"); setQrMessage(""); setQrErrorCode("");
                      qrRequestInFlight.current = false; setScannerOpen(true);
                    }}
                  >
                    Scan QR to Check In
                  </button>
                  <p className="fineprint">Check-in is completed only after the official fellowship QR code is verified.</p>
                </div>
              </section>
            )}
            {["check-in-success", "already-checked-in"].includes(page) && (
              <section className="narrow">
                <div className="card centered-card">
                  <div
                    className={`success-icon ${page === "already-checked-in" ? "gold" : ""}`}
                  >
                    {page === "already-checked-in" ? "◷" : "✓"}
                  </div>
                  <h1>
                    {page === "already-checked-in"
                      ? "You're already checked in!"
                      : "Check-in successful!"}
                  </h1>
                  <p className="muted">
                    {page === "already-checked-in"
                      ? "Your attendance has already been recorded for this meeting."
                      : "You've been marked present for this fellowship meeting."}
                  </p>
                  <button
                    className="button primary full"
                    onClick={() => go("home")}
                  >
                    Back to home
                  </button>
                </div>
              </section>
            )}
            {page === "attendance" && (
              <section className="card">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">YOUR JOURNEY TOGETHER</div>
                    <h1>My attendance</h1>
                    <p className="muted">
                      Every gathering is another step in fellowship.
                    </p>
                  </div>
                </div>
                {attendance.length ? (
                  <div className="attendance-list">
                    {attendance.map((a: any) => (
                      <article className="attendance-row" key={a.id}>
                        <div className="icon-tile">▦</div>
                        <div className="row-main">
                          <b>{a.meeting?.title || "Fellowship meeting"}</b>
                          <small>
                            {dateLabel(a.meeting?.starts_at)} · Checked in{" "}
                            {timeLabel(a.checked_in_at)}
                          </small>
                        </div>
                        <span className="status-pill present">Present</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span>▦</span>
                    <h3>No attendance records yet</h3>
                    <p>
                      Your check-ins will appear here after you attend a
                      fellowship meeting.
                    </p>
                  </div>
                )}
                {pageMeta?.total_pages > 1 && (
                  <div className="pagination">
                    <button
                      className="button secondary"
                      disabled={pageMeta.page <= 1}
                      onClick={() => loadAttendance(pageMeta.page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {pageMeta.page} of {pageMeta.total_pages}
                    </span>
                    <button
                      className="button secondary"
                      disabled={pageMeta.page >= pageMeta.total_pages}
                      onClick={() => loadAttendance(pageMeta.page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            )}
            {page === "quotations" && (
              <section>
                <div className="section-head">
                  <div>
                    <div className="eyebrow">SCRIPTURE FOR EVERY SEASON</div>
                    <h1>Words to carry with you.</h1>
                    <p className="muted">
                      A moment in God's Word for the journey ahead.
                    </p>
                  </div>
                </div>
                <div className="quotes-grid">
                  {quotes.map((q) => (
                    <article className="quote-card" key={q.id}>
                      <span className="quote-mark">“</span>
                      <blockquote>{q.text}</blockquote>
                      <div className="quote-bottom">
                        <b>{q.source}</b>
                        <small>{dateLabel(q.published_at)}</small>
                      </div>
                    </article>
                  ))}
                </div>
                {!quotes.length && (
                  <div className="card empty-state">
                    <h3>No published scripture yet</h3>
                    <p>Published quotations will appear here.</p>
                  </div>
                )}
                {pageMeta?.total_pages > 1 && (
                  <div className="pagination">
                    <button
                      className="button secondary"
                      disabled={pageMeta.page <= 1}
                      onClick={() => loadQuotes(pageMeta.page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {pageMeta.page} of {pageMeta.total_pages}
                    </span>
                    <button
                      className="button secondary"
                      disabled={pageMeta.page >= pageMeta.total_pages}
                      onClick={() => loadQuotes(pageMeta.page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            )}
            {page === "meetings" && (
              <section className="card">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">COME TOGETHER</div>
                    <h1>Next fellowship meeting</h1>
                    <p className="muted">
                      Plan ahead and make room for fellowship.
                    </p>
                  </div>
                </div>
                {meeting ? (
                  <div className="next-meeting-large">
                    <div className="calendar-tile">
                      <b>
                        {new Date(meeting.starts_at).toLocaleDateString(
                          "en-NG",
                          { day: "2-digit", timeZone: "Africa/Lagos" },
                        )}
                      </b>
                      <span>
                        {new Date(meeting.starts_at).toLocaleDateString(
                          "en-NG",
                          { month: "short", timeZone: "Africa/Lagos" },
                        )}
                      </span>
                    </div>
                    <div>
                      <h2>{meeting.title}</h2>
                      <p>
                        {dateLabel(meeting.starts_at, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p>
                        {timeLabel(meeting.starts_at)} –{" "}
                        {timeLabel(meeting.ends_at)} · Africa/Lagos
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>No upcoming meeting found</h3>
                    <p>Meeting details will appear here when scheduled.</p>
                  </div>
                )}
                <button
                  className="button primary"
                  onClick={() => go("check-in")}
                >
                  Check-in status
                </button>
              </section>
            )}
            {page === "profile" && (
              <section className="card profile-card">
                <div className="profile-hero">
                  <div className="avatar profile-avatar">

                    {initials(displayName)}
                  </div>
                  <div>
                    <h1>{profile?.full_name || "My profile"}</h1>
                    <p className="muted">{profile?.email}</p>
                    <span className="status-pill">
                      {profile?.status || "Member"}
                    </span>
                  </div>
                </div>
                <form onSubmit={saveProfile} className="form-grid">
                  <label>
                    Full name
                    <input
                      name="full_name"
                      defaultValue={profile?.full_name || ""}
                      required
                    />
                  </label>
                  <label>
                    Email address
                    <input
                      name="email"
                      type="email"
                      defaultValue={profile?.email || ""}
                      required
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      name="phone_number"
                      type="tel"
                      defaultValue={profile?.phone_number || ""}
                      required
                    />
                  </label>
                  <div className="form-actions">
                    <button className="button primary" disabled={busy}>
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
                <div className="settings-links">
                  <button onClick={() => go("settings")}>
                    ♧ Notification preferences <span>→</span>
                  </button>
                  <button onClick={logout}>
                    ↪ Sign out <span>→</span>
                  </button>
                </div>
              </section>
            )}
            {page === "settings" && (
              <section className="card">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">MAKE IT YOURS</div>
                    <h1>Notification preferences</h1>
                    <p className="muted">
                      Choose how you'd like to receive reminders.
                    </p>
                  </div>
                </div>
                <form onSubmit={savePrefs} className="form-stack prefs-form">
                  <label className="toggle-row">
                    <span>
                      <b>Push notifications</b>
                      <small>
                        Allow fellowship reminders on this device when
                        supported.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={prefs.push_enabled}
                      onChange={(e) =>
                        setPrefs({ ...prefs, push_enabled: e.target.checked })
                      }
                    />
                  </label>
                  <label className="toggle-row">
                    <span>
                      <b>Email notifications</b>
                      <small>Receive fellowship updates by email.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={prefs.email_enabled}
                      onChange={(e) =>
                        setPrefs({ ...prefs, email_enabled: e.target.checked })
                      }
                    />
                  </label>
                  <label>
                    Reminder timing
                    <select
                      value={prefs.reminder_minutes}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          reminder_minutes: Number(e.target.value),
                        })
                      }
                    >
                      <option value={0}>No advance notice</option>
                      <option value={15}>15 minutes before</option>
                      <option value={30}>30 minutes before</option>
                      <option value={60}>1 hour before</option>
                      <option value={120}>2 hours before</option>
                      <option value={1440}>1 day before</option>
                    </select>
                  </label>
                  <div className="notice">
                    These preferences are saved to your profile. Actual
                    push/email delivery is not yet implemented by the API.
                  </div>
                  <button className="button primary" disabled={busy}>
                    {busy ? "Saving…" : "Save preferences"}
                  </button>
                </form>
              </section>
            )}
          </>
        )}
        <footer className="main-footer">
          FGBMFI Connect <span>•</span> Connected in fellowship. Growing in
          faith.
        </footer>
      </main>
      <nav className="mobile-nav">
        {navItems.map(([href, icon, label]) => (
          <button
            key={href}
            className={page === href ? "active" : ""}
            onClick={() => go(href)}
          >
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
