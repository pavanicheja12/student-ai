
import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ScatterChart,
  Scatter, ZAxis
} from "recharts";
import {
  LayoutDashboard, Users, Route, ShieldAlert, BrainCircuit,
  ChartNoAxesCombined, Search,
  GraduationCap, CalendarDays, ChevronDown, Sparkles,
  TrendingUp, Activity, CircleCheck, Menu, LogOut,
  LockKeyhole, Mail, LoaderCircle, AlertCircle, Database
} from "lucide-react";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigurationError,
} from "./utils/supabase/client.js";
import { loadDashboardData } from "./utils/studentAnalytics.js";
import { resolveUserAccess } from "./utils/studentPortal.js";
import StudentDashboard from "./StudentDashboard.jsx";
import StudentPortalPreview from "./StudentPortalPreview.jsx";
import AdminManagement from "./AdminManagement.jsx";
import FacultyDashboard from "./FacultyDashboard.jsx";
import "./App.css";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Student Journey", icon: Route },
  { label: "At-Risk Students", icon: ShieldAlert },
  { label: "AI Insights", icon: BrainCircuit },
  { label: "Outcomes", icon: ChartNoAxesCombined },
  { label: "Manage Records", icon: Database },
];

const moneylessTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #ececf5",
    boxShadow: "0 8px 30px #25234a12",
    fontSize: 12,
  },
};

function Card({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function PanelTitle({ title, subtitle, action }) {
  return (
    <div className="panel-title">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {action && <span className="panel-action">{action}</span>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, change, tone = "violet" }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={19} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">{change}</div>
    </div>
  );
}

function formatPercent(value) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function getLoginErrorMessage(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed")
  ) {
    return "This email address has not been confirmed. Ask your Supabase administrator to confirm the account, then try again.";
  }

  if (
    code === "invalid_credentials" ||
    code === "invalid_grant" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return "The email or password is incorrect. Check both fields and try again.";
  }

  if (
    error?.name === "AuthRetryableFetchError" ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("fetch failed")
  ) {
    return "Could not reach Supabase. Check your internet connection and project URL, then try again.";
  }

  if (
    message.includes("invalid api key") ||
    message.includes("apikey") ||
    message.includes("api key")
  ) {
    return "Supabase rejected the configured public key. Verify VITE_SUPABASE_PUBLISHABLE_KEY in .env.local and restart Vite.";
  }

  if (error?.status === 429) {
    return "Too many sign-in attempts. Wait a little while before trying again.";
  }

  return error?.message || "Sign-in failed. Please try again.";
}

function App() {
  const [session, setSession] = useState(null);
  const [studentPreviewMode, setStudentPreviewMode] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [accessState, setAccessState] = useState({ userId: "", role: "loading" });
  const [authStatus, setAuthStatus] = useState(isSupabaseConfigured ? "loading" : "unconfigured");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!supabase) return undefined;

    let isActive = true;
    let receivedAuthEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      receivedAuthEvent = true;
      if (!isActive) return;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "SIGNED_OUT") setPasswordRecovery(false);
      if (nextSession) setStudentPreviewMode(false);
      setAuthError("");
      setAuthStatus("ready");
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isActive || receivedAuthEvent) return;
        if (error) {
          setAuthError(`Unable to restore your session: ${error.message}`);
        } else {
          setSession(data.session);
        }
        setAuthStatus("ready");
      })
      .catch((error) => {
        if (!isActive) return;
        setAuthError(`Unable to restore your session: ${error.message}`);
        setAuthStatus("ready");
      });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return undefined;
    let isActive = true;
    resolveUserAccess(supabase, session.user)
      .then((access) => {
        if (isActive) setAccessState({ userId: session.user.id, ...access });
      })
      .catch((error) => {
        if (isActive) {
          setAccessState({
            userId: session.user.id,
            role: "error",
            error: error.message || "Could not determine your account access.",
          });
        }
      });
    return () => {
      isActive = false;
    };
  }, [session?.user]);

  if (authStatus === "loading") {
    return <StatusScreen title="Restoring your session" message="Checking your secure sign-in…" />;
  }

  if (passwordRecovery) {
    return <PasswordRecoveryPage onComplete={() => setPasswordRecovery(false)} />;
  }

  if (studentPreviewMode) {
    return <StudentPortalPreview onExit={() => setStudentPreviewMode(false)} />;
  }

  if (!session) {
    return (
      <LoginPage
        configured={isSupabaseConfigured}
        configurationError={supabaseConfigurationError}
        initialError={authError}
        onStartStudentPreview={() => setStudentPreviewMode(true)}
      />
    );
  }

  if (accessState.userId !== session.user.id || accessState.role === "loading") {
    return <StatusScreen title="Checking account access" message="Finding your authorized StudentPath workspace…" />;
  }
  if (accessState.role === "student") {
    return <StudentDashboard session={session} student={accessState.student} />;
  }
  if (accessState.role === "faculty") {
    return <FacultyDashboard session={session} />;
  }
  if (accessState.role !== "admin") {
    return (
      <AccessDenied
        title={accessState.role === "error" ? "Could not verify account access" : "Account not assigned"}
        message={accessState.error || "This account is not assigned to a student record or administrator role."}
        onSignOut={async () => {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        }}
      />
    );
  }

  return <Dashboard session={session} />;
}

function AccessDenied({ title, message, onSignOut }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    setError("");
    try {
      await onSignOut();
    } catch (signOutError) {
      setError(signOutError.message || "Could not sign out. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="status-page">
      <section className="status-card access-denied">
        <ShieldAlert size={25} />
        <strong>{title}</strong>
        <span>{message}</span>
        <span>Ask your institution administrator to link this account to your student record or assign the administrator role.</span>
        {error && <span role="alert">{error}</span>}
        <button className="primary-button" onClick={signOut} disabled={loading}>
          {loading ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </main>
  );
}

function LoginPage({ configured, configurationError, initialError, onStartStudentPreview }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    if (!supabase) {
      setError(configurationError);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(getLoginErrorMessage(signInError));
      }
    } catch (signInError) {
      setError(getLoginErrorMessage(signInError));
    } finally {
      setLoading(false);
    }
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      setError("Enter your account email address first.");
      return;
    }
    if (!supabase) {
      setError(configurationError);
      return;
    }

    setLoading(true);
    setError("");
    setResetSent(false);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (resetError) {
        setError(getLoginErrorMessage(resetError));
      } else {
        setResetSent(true);
      }
    } catch (resetError) {
      setError(getLoginErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><GraduationCap size={24} /></div>
          <div><strong>StudentPath</strong><span>JOURNEY INTELLIGENCE</span></div>
        </div>
        <div className="auth-heading">
          <div className="auth-icon"><LockKeyhole size={21} /></div>
          <div className="overline">INSTITUTION WORKSPACE</div>
          <h1>Student journey analytics</h1>
          <p>Use learning signals like attendance and assessment results to spot students who may benefit from timely support.</p>
        </div>
        {!configured && (
          <div className="auth-alert" role="alert">
            <AlertCircle size={17} />
            <span>{configurationError} After updating .env.local, stop and restart the Vite dev server.</span>
          </div>
        )}
        {error && (
          <div className="auth-alert" role="alert">
            <AlertCircle size={17} /><span>{error}</span>
          </div>
        )}
        {resetSent && (
          <div className="auth-success" role="status">
            If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.
          </div>
        )}
        {!forgotMode && <form className="auth-form" onSubmit={signIn}>
          <label htmlFor="login-email">Email address</label>
          <div className="auth-input-wrap">
            <Mail size={17} />
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              placeholder="admin@institution.edu"
              required
              disabled={loading}
            />
          </div>
          <label htmlFor="login-password">Password</label>
          <div className="auth-input-wrap">
            <LockKeyhole size={17} />
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              placeholder="Enter your password"
              required
              disabled={loading}
            />
          </div>
          <button
            className="auth-text-button"
            type="button"
            onClick={() => {
              setForgotMode(true);
              setError("");
              setResetSent(false);
            }}
            disabled={loading}
          >
            Forgot password?
          </button>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? <><LoaderCircle className="spin" size={17} /> Signing in…</> : "Sign in securely"}
          </button>
        </form>}
        {forgotMode && (
          <div className="auth-form">
            <label htmlFor="reset-email">Email address</label>
            <div className="auth-input-wrap">
              <Mail size={17} />
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                  setResetSent(false);
                }}
                placeholder="you@institution.edu"
                required
                disabled={loading}
              />
            </div>
            <button className="auth-submit" type="button" onClick={sendPasswordReset} disabled={loading}>
              {loading ? <><LoaderCircle className="spin" size={17} /> Sending link…</> : "Send password reset link"}
            </button>
            <button className="auth-text-button auth-back-button" type="button" onClick={() => {
              setForgotMode(false);
              setError("");
              setResetSent(false);
            }} disabled={loading}>
              Back to sign in
            </button>
          </div>
        )}
        <div className="auth-footnote"><LockKeyhole size={14} /> Student, assigned faculty, and administrator sign-in only. Public registration is disabled.</div>
        <div className="auth-divider"><span>OR</span></div>
        <button className="preview-button" type="button" onClick={onStartStudentPreview}>Preview student portal with sample data</button>
        <p className="preview-disclaimer">The preview uses fictional sample data only. To see your actual student records, sign in with your institution-assigned student account.</p>
      </section>
    </main>
  );
}

function PasswordRecoveryPage({ onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);

  async function updatePassword(event) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!supabase) {
      setError(supabaseConfigurationError);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) setError(getLoginErrorMessage(updateError));
      else setUpdated(true);
    } catch (updateError) {
      setError(getLoginErrorMessage(updateError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><GraduationCap size={24} /></div>
          <div><strong>StudentPath</strong><span>JOURNEY INTELLIGENCE</span></div>
        </div>
        <div className="auth-heading">
          <div className="auth-icon"><LockKeyhole size={21} /></div>
          <div className="overline">ACCOUNT SECURITY</div>
          <h1>Choose a new password</h1>
          <p>Enter and confirm a new password for your StudentPath account.</p>
        </div>
        {error && <div className="auth-alert" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
        {updated ? (
          <>
            <div className="auth-success" role="status">Your password has been updated.</div>
            <button className="auth-submit" type="button" onClick={onComplete}>Continue to StudentPath</button>
          </>
        ) : (
          <form className="auth-form" onSubmit={updatePassword}>
            <label htmlFor="new-password">New password</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={17} />
              <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} />
            </div>
            <label htmlFor="confirm-password">Confirm new password</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={17} />
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={loading} />
            </div>
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? <><LoaderCircle className="spin" size={17} /> Updating password…</> : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function StatusScreen({ title, message }) {
  return (
    <main className="status-page">
      <div className="status-card"><LoaderCircle className="spin" size={22} /><strong>{title}</strong><span>{message}</span></div>
    </main>
  );
}

function Dashboard({ session }) {
  const [page, setPage] = useState("Overview");
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [dataState, setDataState] = useState({ key: "", status: "loading", data: null, error: "" });
  const [reloadCount, setReloadCount] = useState(0);
  const [signOutError, setSignOutError] = useState("");
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [aiState, setAiState] = useState({ loading: false, insight: "", error: "" });
  const requestKey = `${session.user.id}:${reloadCount}`;

  useEffect(() => {
    let isActive = true;
    loadDashboardData(supabase)
      .then((nextData) => {
        if (isActive) setDataState({ key: requestKey, status: "ready", data: nextData, error: "" });
      })
      .catch((error) => {
        if (isActive) setDataState({
          key: requestKey,
          status: "error",
          data: null,
          error: error.message || "Unable to load dashboard data.",
        });
      });
    return () => {
      isActive = false;
    };
  }, [requestKey]);

  const dataLoading = dataState.key !== requestKey || dataState.status === "loading";
  const dataError = dataState.key === requestKey ? dataState.error : "";
  const data = dataState.key === requestKey ? dataState.data : null;
  const students = data?.students || [];
  const performance = data?.performance || [];
  const departments = data?.departments || [];
  const riskData = data?.riskData || [];
  const scatterData = students.filter((student) => student.attendance !== null && student.score !== null);

  const filtered = students.filter((s) => {
    const matchesQuery = `${s.name} ${s.id} ${s.dept}`
      .toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (riskFilter === "All" || s.risk === riskFilter);
  });

  const riskClass = (risk) => risk.toLowerCase();

  const pageTitle = {
    Overview: "Student journey overview",
    "Student Journey": "Explore the student journey",
    "At-Risk Students": "Early support & risk monitoring",
    "AI Insights": "Insights that drive action",
    Outcomes: "Student outcomes & success",
    "Manage Records": "Manage student records",
  }[page];

  function navigate(label) {
    setPage(label);
    setSelected(null);
    setMobileNav(false);
    if (label === "At-Risk Students") setRiskFilter("High");
    else setRiskFilter("All");
  }

  async function signOut() {
    setSignOutLoading(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutError(error.message);
    } catch (error) {
      setSignOutError(error.message || "Unable to sign out. Try again.");
    } finally {
      setSignOutLoading(false);
    }
  }

  async function generateInsights() {
    if (!session?.access_token) {
      setAiState({
        loading: false,
        insight: "",
        error: "Sign in to request insights for your authorized student or administrator scope.",
      });
      return;
    }

    setAiState({ loading: true, insight: "", error: "" });
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("The AI API is not available on the plain Vite server. Run `npx vercel dev` to test the Vercel function locally.");
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not generate AI insights.");
      if (typeof result.insight !== "string" || !result.insight.trim()) {
        throw new Error("The AI endpoint returned no insight. Try again.");
      }
      setAiState({ loading: false, insight: result.insight, error: "" });
    } catch (error) {
      setAiState({
        loading: false,
        insight: "",
        error: error.message || "The AI service is unavailable. Try again later.",
      });
    }
  }

  return (
    <div className="dashboard">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={24} /></div>
          <div><strong>StudentPath</strong><span>JOURNEY INTELLIGENCE</span></div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-link ${page === label ? "selected" : ""}`}
              onClick={() => navigate(label)}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
                {label === "At-Risk Students" && <b className="nav-badge">{students.filter((student) => student.risk === "High").length}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <div className="note-icon"><Sparkles size={18} /></div>
          <strong>Every student matters.</strong>
          <p>Turn learning signals into meaningful support.</p>
        </div>
        <div className="user-profile">
          <div className="user-avatar">{(session.user.email || "AD").slice(0, 2).toUpperCase()}</div>
          <div><strong>{session.user.email}</strong><span>Authenticated administrator</span></div>
          <button className="logout-button" onClick={signOut} disabled={signOutLoading} aria-label="Sign out" title="Sign out">
            {signOutLoading ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
          <div className="crumb">Analytics <span>/</span> <strong>{page}</strong></div>
          <div className="topbar-right">
            <div className="year-select"><CalendarDays size={15} /> 2026–27 <ChevronDown size={13} /></div>
            <div className="user-avatar small">{(session.user.email || "AD").slice(0, 2).toUpperCase()}</div>
          </div>
        </header>

        <div className="page-content">
        <div className={`demo-banner ${dataError ? "banner-error" : ""}`}>
          {dataError ? <AlertCircle size={15} /> : <Database size={15} />}
          <span>{dataError ? "DATA ACCESS ERROR · Check authenticated Supabase access and RLS policies" : "LIVE DATA · Loaded from your authenticated Supabase workspace"}</span>
        </div>
        {signOutError && <div className="inline-error" role="alert">Could not sign out: {signOutError}</div>}

          <div className="page-heading">
            <div>
              <div className="overline">INSTITUTION ANALYTICS</div>
              <h1>{selected ? selected.name : pageTitle}</h1>
              <p>
                {selected
                  ? `${selected.id} · ${selected.dept}`
                  : "A clearer picture of student progress, engagement and outcomes."}
              </p>
            </div>
            {selected ? (
              <button className="primary-button" onClick={() => setSelected(null)}>← All students</button>
            ) : (
              <button className="primary-button" onClick={() => navigate("At-Risk Students")}>
                <ShieldAlert size={16} /> Review students
              </button>
            )}
          </div>

          {page === "Manage Records" ? (
            <AdminManagement session={session} />
          ) : dataLoading ? (
            <Card className="data-state"><LoaderCircle className="spin" size={21} /><strong>Loading student analytics…</strong><p>Reading records with your authenticated account.</p></Card>
          ) : dataError ? (
            <Card className="data-state data-state-error" role="alert">
              <AlertCircle size={22} />
              <strong>Student data could not be loaded</strong>
              <p>{dataError}</p>
              <p>Access is controlled by Supabase Row Level Security. Sign in with an authorized account and confirm SELECT policies are limited to the intended administrator.</p>
              <button className="primary-button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button>
            </Card>
          ) : students.length === 0 ? (
            <Card className="data-state">
              <Database size={22} />
              <strong>No student records found</strong>
              <p>Your account can access the tables, but the students table is empty or its policies return no rows.</p>
            </Card>
          ) : selected ? (
            <StudentProfile student={selected} />
          ) : (
            <>
              <div className="metrics-grid">
                <Metric icon={Users} label="Total students" value={data.metrics.totalStudents.toLocaleString()} change="from student records" />
                <Metric icon={Activity} label="Average attendance" value={formatPercent(data.metrics.averageAttendance)} change="from attendance records" tone="mint" />
                <Metric icon={ShieldAlert} label="Active interventions" value={data.metrics.activeInterventions.toLocaleString()} change="open or unstatused records" tone="coral" />
                <Metric icon={GraduationCap} label="Retention outcomes" value={formatPercent(data.metrics.retentionRate)} change="from classified outcomes" tone="amber" />
              </div>

              {(page === "Overview" || page === "Student Journey") && (
                <>
                  <div className="chart-grid chart-grid-main">
                    <Card>
                      <PanelTitle title="Learning performance trends" subtitle="Average score and attendance across the academic year" action="Monthly" />
                      <div className="chart-legend">
                        <span><i className="legend-violet" /> Average score</span>
                        <span><i className="legend-mint" /> Attendance</span>
                      </div>
                      <div className="chart-area">
                        {performance.some((item) => item.score !== null || item.attendance !== null) ? (
                          <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={performance.filter((item) => item.score !== null || item.attendance !== null)} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#7c6cf0" stopOpacity={0.23} />
                                <stop offset="95%" stopColor="#7c6cf0" stopOpacity={0.01} />
                              </linearGradient>
                              <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#35c9a4" stopOpacity={0.16} />
                                <stop offset="95%" stopColor="#35c9a4" stopOpacity={0.01} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#eeedf5" strokeDasharray="4 5" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#9695aa", fontSize: 11 }} />
                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#9695aa", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip {...moneylessTooltip} formatter={(v) => [`${v}%`]} />
                            <Area type="monotone" dataKey="score" name="Average score" stroke="#7969e9" strokeWidth={2.8} fill="url(#scoreGradient)" activeDot={{ r: 5 }} />
                            <Area type="monotone" dataKey="attendance" name="Attendance" stroke="#35c9a4" strokeWidth={2.8} fill="url(#attendanceGradient)" activeDot={{ r: 5 }} />
                          </AreaChart>
                          </ResponsiveContainer>
                        ) : <ChartEmpty message="No dated attendance or assessment records are available." />}
                      </div>
                    </Card>

                    <Card>
                      <PanelTitle title="Student risk distribution" subtitle="Share of students by current risk category" action="All students" />
                      <div className="donut-wrap">
                        {riskData.some((entry) => entry.value > 0) ? (
                          <>
                            <ResponsiveContainer width="100%" height={220}>
                              <PieChart>
                                <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={88} paddingAngle={5} stroke="none" cornerRadius={5}>
                                  {riskData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                                </Pie>
                                <Tooltip {...moneylessTooltip} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Students"]} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="donut-center"><strong>{data.metrics.categorizedStudents.toLocaleString()}</strong><span>classified</span></div>
                          </>
                        ) : <ChartEmpty message="Not enough attendance or assessment data to classify risk." />}
                      </div>
                      <div className="risk-legend">
                        {riskData.map((r) => (
                          <div key={r.name}><span><i style={{ background: r.color }} />{r.name}</span><strong>{r.value.toFixed(1)}%</strong></div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  <div className="chart-grid">
                    <Card>
                      <PanelTitle title="Department comparison" subtitle="Pass rate by academic department" action="Pass rate %" />
                      <div className="chart-area compact">
                        {departments.some((department) => department.pass !== null) ? (
                          <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={departments.filter((department) => department.pass !== null)} layout="vertical" margin={{ top: 4, right: 12, left: 10, bottom: 0 }} barSize={13}>
                            <CartesianGrid stroke="#eeedf5" strokeDasharray="4 5" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: "#9695aa", fontSize: 10 }} />
                            <YAxis type="category" dataKey="name" width={112} axisLine={false} tickLine={false} tick={{ fill: "#77768c", fontSize: 10 }} />
                            <Tooltip {...moneylessTooltip} formatter={(v) => [`${v}%`, "Pass rate"]} />
                            <Bar dataKey="pass" fill="#8272ee" radius={[0, 6, 6, 0]} />
                          </BarChart>
                          </ResponsiveContainer>
                        ) : <ChartEmpty message="No scored assessments are available by department." />}
                      </div>
                    </Card>

                    <Card>
                      <PanelTitle title="Retention trajectory" subtitle="Student retention trend over time" action="2026–27" />
                      <div className="chart-area compact">
                        {performance.some((item) => item.retention !== null) ? (
                          <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={performance.filter((item) => item.retention !== null)} margin={{ top: 12, right: 8, left: -15, bottom: 0 }}>
                            <CartesianGrid stroke="#eeedf5" strokeDasharray="4 5" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#9695aa", fontSize: 10 }} />
                            <YAxis domain={[80, 100]} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: "#9695aa", fontSize: 10 }} />
                            <Tooltip {...moneylessTooltip} formatter={(v) => [`${v}%`, "Retention"]} />
                            <Line type="monotone" dataKey="retention" name="Retention" stroke="#36bd98" strokeWidth={3} dot={{ fill: "#36bd98", r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                          </LineChart>
                          </ResponsiveContainer>
                        ) : <ChartEmpty message="No dated retention outcomes are available." />}
                      </div>
                    </Card>
                  </div>
                </>
              )}

              {page === "At-Risk Students" && (
                <div className="chart-grid">
                  <Card>
                    <PanelTitle title="Attendance vs assessment" subtitle="Explore the relationship between engagement and scores" />
                    <div className="chart-area">
                      {scatterData.length > 0 ? <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 15, right: 18, bottom: 10, left: 0 }}>
                          <CartesianGrid stroke="#eeedf5" strokeDasharray="4 5" />
                          <XAxis type="number" dataKey="attendance" name="Attendance" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                          <YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                          <ZAxis range={[80, 150]} />
                          <Tooltip {...moneylessTooltip} cursor={{ strokeDasharray: "3 3" }} formatter={(v, name) => [`${v}%`, name]} />
                          {["Low", "Medium", "High"].map((risk) => (
                            <Scatter key={risk} name={`${risk} risk`} data={scatterData.filter((s) => s.risk === risk)} fill={risk === "Low" ? "#39c6a5" : risk === "Medium" ? "#f3b64b" : "#f07187"} />
                          ))}
                          <Legend />
                        </ScatterChart>
                      </ResponsiveContainer> : <ChartEmpty message="Student attendance and assessment data are needed for this chart." />}
                    </div>
                  </Card>
                  <Card>
                    <PanelTitle title="Risk breakdown" subtitle="Students grouped by support priority" />
                    <div className="risk-big-list">
                      {riskData.map((r) => (
                        <div className="risk-big-row" key={r.name}>
                          <div className="risk-big-top"><span><i style={{ background: r.color }} />{r.name}</span><strong>{r.value.toFixed(1)}%</strong></div>
                          <div className="risk-track"><div style={{ width: `${r.value}%`, background: r.color }} /></div>
                        </div>
                      ))}
                    </div>
                    <div className="recommend-box"><Sparkles size={18} /><div><strong>Suggested next step</strong><p>Review attendance trends and recent assessments with students flagged for support.</p></div></div>
                  </Card>
                </div>
              )}

              {page === "AI Insights" && (
                <div className="insights-grid">
                  <Card className="insight-explain groq-panel">
                    <PanelTitle title="AI-assisted analytics review" subtitle="Secure Groq-powered summary of aggregate dashboard metrics" />
                    <p>The server verifies your session and retrieves the authorized scope directly from Supabase. Only non-personal aggregates are sent to the AI provider. AI suggestions are not diagnoses or validated predictions.</p>
                    <div className="groq-controls">
                      <button className="primary-button" onClick={generateInsights} disabled={aiState.loading || dataLoading || Boolean(dataError)}>
                        {aiState.loading ? <><LoaderCircle className="spin" size={15} /> Generating…</> : "Generate AI review"}
                      </button>
                    </div>
                    {aiState.error && <div className="inline-error" role="alert">{aiState.error}</div>}
                    {aiState.insight && <div className="groq-result" aria-live="polite"><strong>AI-generated</strong><br />{aiState.insight}</div>}
                  </Card>
                  <Insight icon={TrendingUp} tone="purple" title="Performance pattern" tag="Trend detected" text="Compare assessment scores with attendance over time to identify students whose learning progress may need attention." action="Review performance chart" onClick={() => navigate("Overview")} />
                  <Insight icon={ShieldAlert} tone="coral" title="Early warning signals" tag="Support opportunity" text="Low attendance combined with falling assessment scores can be a reason to offer a mentor check-in." action="Review flagged students" onClick={() => navigate("At-Risk Students")} />
                  <Insight icon={CircleCheck} tone="mint" title="Measure interventions" tag="Outcome tracking" text="Record the support provided and compare subsequent attendance and assessment results to evaluate progress." action="View outcomes" onClick={() => navigate("Outcomes")} />
                  <Card className="insight-explain"><PanelTitle title="How to interpret these insights" subtitle="Transparent and responsible analytics" /><p>These are suggested interpretations, not live AI predictions. Real AI insights require connected data, a configured model or AI service, and validation with educators.</p></Card>
                </div>
              )}

              {page === "Outcomes" && (
                <>
                  <div className="chart-grid">
                    <Card>
                      <PanelTitle title="Academic outcomes" subtitle="Average score and retention trend" />
                      <div className="chart-area">
                        {performance.some((item) => item.score !== null || item.retention !== null) ? (
                          <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={performance.filter((item) => item.score !== null || item.retention !== null)} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid stroke="#eeedf5" strokeDasharray="4 5" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <Tooltip {...moneylessTooltip} formatter={(v) => [`${v}%`]} />
                            <Legend />
                            <Line dataKey="score" name="Average score" stroke="#8272ee" strokeWidth={3} dot={false} />
                            <Line dataKey="retention" name="Retention" stroke="#36bd98" strokeWidth={3} dot={false} />
                          </LineChart>
                          </ResponsiveContainer>
                        ) : <ChartEmpty message="No dated assessment or student outcome records are available." />}
                      </div>
                    </Card>
                    <Card>
                      <PanelTitle title="Department pass rates" subtitle="Share of assessed students scoring 50% or more" />
                      <div className="chart-area">
                        {departments.some((department) => department.pass !== null) ? (
                          <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={departments.filter((department) => department.pass !== null)} margin={{ top: 12, right: 8, left: -15, bottom: 0 }}>
                            <CartesianGrid stroke="#eeedf5" strokeDasharray="4 5" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <Tooltip {...moneylessTooltip} formatter={(v) => [`${v}%`, "Pass rate"]} />
                            <Bar dataKey="pass" fill="#8272ee" radius={[6, 6, 0, 0]} />
                          </BarChart>
                          </ResponsiveContainer>
                        ) : <ChartEmpty message="No scored assessments are available by department." />}
                      </div>
                    </Card>
                  </div>
                  <Card className="outcome-note"><CircleCheck size={20} /><div><strong>Outcome definitions</strong><p>Retention is calculated only from outcome statuses labelled retained, continuing, enrolled, active, withdrawn, dropped or discontinued. Department pass rate uses an assessment threshold of 50%.</p></div></Card>
                </>
              )}

              <Card className="student-table-panel">
                <PanelTitle title={page === "At-Risk Students" ? "Students requiring attention" : "Student snapshot"} subtitle="Search student profiles and explore individual indicators" />
                <div className="table-filters">
                  <div className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID or department..." /></div>
                  <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                    <option value="All">All risk levels</option><option value="High">High risk</option><option value="Medium">Medium risk</option><option value="Low">Low risk</option>
                  </select>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>STUDENT</th><th>DEPARTMENT</th><th>ATTENDANCE</th><th>SCORE</th><th>RISK LEVEL</th><th></th></tr></thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.id}>
                          <td><div className="student-name"><div className="student-initials">{s.name.split(" ").map((n) => n[0]).join("")}</div><div><strong>{s.name}</strong><span>{s.id}</span></div></div></td>
                          <td>{s.dept}</td>
                          <td><div className="attendance-cell"><span>{formatPercent(s.attendance)}</span><div className="progress-track"><div style={{ width: `${s.attendance || 0}%` }} className={s.attendance !== null && s.attendance < 65 ? "danger-progress" : ""} /></div></div></td>
                          <td>{formatPercent(s.score)}</td>
                          <td><span className={`risk-pill ${riskClass(s.risk)}`}>{s.risk}</span></td>
                          <td><button className="view-link" onClick={() => setSelected(s)}>View profile ↗</button></td>
                        </tr>
                      ))}
                      {filtered.length === 0 && <tr><td colSpan="6" className="no-results">{students.length ? "No matching students found." : "No student records are available."}</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">Showing {filtered.length} of {students.length} student records</div>
              </Card>
            </>
          )}

          <footer className="footer">StudentPath <span>•</span> Student journey intelligence <span>•</span> Authenticated institutional data</footer>
        </div>
      </main>
    </div>
  );
}

function ChartEmpty({ message }) {
  return <div className="chart-empty"><Database size={19} /><span>{message}</span></div>;
}

function Insight({ icon: Icon, tone, title, tag, text, action, onClick }) {
  return (
    <Card className="insight-card">
      <div className={`insight-icon ${tone}`}><Icon size={21} /></div>
      <span className={`insight-tag ${tone}`}>{tag}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button onClick={onClick}>{action} ↗</button>
    </Card>
  );
}

function StudentProfile({ student }) {
  const recommendations = student.risk === "High"
    ? ["Offer a supportive mentor check-in", "Review missed classes and recent assessments", "Agree on a personalised learning plan"]
    : student.risk === "Medium"
    ? ["Monitor upcoming assessments", "Check for barriers to class participation", "Review progress at the next check-in"]
    : ["Recognise consistent progress", "Encourage continued participation", "Review goals for the next semester"];

  return (
    <>
      <div className="metrics-grid profile-metrics">
        <Metric icon={Activity} label="Attendance" value={formatPercent(student.attendance)} change="from attendance records" />
        <Metric icon={ChartNoAxesCombined} label="Assessment score" value={formatPercent(student.score)} change="from assessment records" tone="mint" />
        <Metric icon={ShieldAlert} label="Support priority" value={student.risk} change={student.risk === "Unknown" ? "insufficient records" : "rule-based indicator"} tone={student.risk === "High" ? "coral" : "amber"} />
        <Metric icon={GraduationCap} label="Department" value={student.dept} change={`${student.interventionCount} intervention records`} tone="mint" />
      </div>
      <Card className="profile-recommendations">
        <PanelTitle title="Suggested support plan" subtitle="Recommendations for educator review" />
        {recommendations.map((r) => <div className="recommendation-row" key={r}><CircleCheck size={17} /><span>{r}</span></div>)}
        <p className="profile-disclaimer">Risk labels are rule-based indicators only, not diagnoses or validated predictions. Attendance below 65% or score below 50% is marked high; otherwise attendance below 75% or score below 65% is marked medium.</p>
      </Card>
    </>
  );
}

export default App;
