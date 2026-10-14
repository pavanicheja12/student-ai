import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  Bell,
  BrainCircuit,
  BookOpenCheck,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  NotebookPen,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { supabase } from "./utils/supabase/client.js";
import { loadStudentRecords } from "./utils/studentPortal.js";
import StudentGrowth from "./StudentGrowth.jsx";
import "./StudentDashboard.css";

const modules = [
  { id: "profile", label: "My profile", icon: UserRound },
  { id: "attendance", label: "Attendance", icon: CalendarDays },
  { id: "marks", label: "Marks", icon: BookOpenCheck },
  { id: "timetable", label: "Timetable", icon: Clock3 },
  { id: "fees", label: "Fees", icon: CircleDollarSign },
  { id: "leave", label: "Leave requests", icon: CalendarDays },
  { id: "announcements", label: "Announcements", icon: Bell },
  { id: "support", label: "Support requests", icon: LifeBuoy },
  { id: "journey", label: "My journey", icon: Route },
  { id: "goals", label: "My goals", icon: Target },
  { id: "planner", label: "Study planner", icon: NotebookPen },
  { id: "skills", label: "Skills & achievements", icon: BadgeCheck },
  { id: "insights", label: "My insights", icon: Sparkles },
  { id: "mentor", label: "AI mentor", icon: BrainCircuit },
  { id: "reports", label: "My reports", icon: GraduationCap },
];

function valueFor(row, names) {
  if (!row) return null;
  const normalize = (value) => value.toLowerCase().replace(/[_\s-]/g, "");
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => normalize(candidate) === normalize(name));
    if (key && row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return null;
}

function numberFor(row, names) {
  const value = valueFor(row, names);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percent(value) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function attendanceValue(row) {
  const explicit = numberFor(row, ["attendance_percentage", "attendance_percent", "attendance_rate", "attendance"]);
  if (explicit !== null) return Math.max(0, Math.min(100, explicit <= 1 ? explicit * 100 : explicit));
  const status = valueFor(row, ["attendance_status", "status", "is_present", "present"]);
  if (typeof status === "boolean") return status ? 100 : 0;
  if (typeof status === "string") {
    const normalized = status.toLowerCase();
    if (["present", "attended", "late", "true", "yes"].includes(normalized)) return 100;
    if (["absent", "not_attended", "false", "no"].includes(normalized)) return 0;
  }
  return null;
}

function scoreValue(row) {
  const score = numberFor(row, ["score", "assessment_score", "marks_obtained", "obtained_marks", "percentage", "grade_percent"]);
  if (score === null) return null;
  const maximum = numberFor(row, ["max_marks", "maximum_marks", "total_marks", "max_score"]);
  const obtained = numberFor(row, ["marks_obtained", "obtained_marks", "score"]);
  if (maximum > 0 && obtained !== null) return Math.max(0, Math.min(100, obtained / maximum * 100));
  return Math.max(0, Math.min(100, score <= 1 ? score * 100 : score));
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function RecordList({ records, fields, emptyText }) {
  if (!records.length) return <div className="student-empty">{emptyText}</div>;
  return (
    <div className="student-record-list">
      {records.map((record, index) => {
        const values = fields.map(([label, keys, format]) => {
          const raw = valueFor(record, keys);
          if (raw === null) return null;
          return [label, format ? format(record, raw) : displayValue(raw)];
        }).filter(Boolean);
        return (
          <article className="student-record" key={record.id || `${record.student_id}-${index}`}>
            {values.length
              ? values.map(([label, value]) => <div className="student-record-field" key={label}><span>{label}</span><strong>{value}</strong></div>)
              : <span className="student-empty">A record is available, but it has no displayable details.</span>}
          </article>
        );
      })}
    </div>
  );
}

function RecordSection({ title, description, records, fields, emptyText }) {
  return (
    <section className="student-record-panel">
      <div className="student-record-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
        <span>{records.length} {records.length === 1 ? "record" : "records"}</span>
      </div>
      <RecordList records={records} fields={fields} emptyText={emptyText || `No ${title.toLowerCase()} are available for your account yet.`} />
    </section>
  );
}

function ModuleHeading({ title, description }) {
  return <div className="student-module-heading"><div className="overline">MY STUDENT JOURNEY</div><h1>{title}</h1><p>{description}</p></div>;
}

function RequestForm({ kind, studentId, onCreated }) {
  const [values, setValues] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const leaveFields = [
    ["starts_on", "Start date", "date"],
    ["ends_on", "End date", "date"],
    ["reason", "Reason", "textarea"],
  ];
  const supportFields = [
    ["category", "Category", "select"],
    ["subject", "Subject", "text"],
    ["message", "How can we help?", "textarea"],
  ];
  const fields = kind === "leave" ? leaveFields : supportFields;

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    const table = kind === "leave" ? "leave_requests" : "support_requests";
    const payload = kind === "leave"
      ? { student_id: String(studentId), ...values }
      : { student_id: String(studentId), ...values };

    try {
      const { error: insertError } = await supabase.from(table).insert(payload);
      if (insertError) throw new Error(insertError.message);
      setValues({});
      await onCreated(kind === "leave" ? "Leave request submitted." : "Support request submitted.");
    } catch (submitError) {
      setError(submitError.message || "Your request could not be submitted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="student-request-form" onSubmit={submit}>
      <h2>{kind === "leave" ? "Submit a leave request" : "Ask for support"}</h2>
      <p>Your request is private to you and authorized administrators.</p>
      <div className="student-form-grid">
        {fields.map(([name, label, type]) => (
          <label className={type === "textarea" ? "wide" : ""} key={name}>
            <span>{label}</span>
            {type === "textarea" ? (
              <textarea required maxLength={kind === "leave" ? 2000 : 4000} value={values[name] || ""} onChange={(event) => setValues({ ...values, [name]: event.target.value })} />
            ) : type === "select" ? (
              <select required value={values[name] || ""} onChange={(event) => setValues({ ...values, [name]: event.target.value })}>
                <option value="">Choose a category</option><option>Academic</option><option>Wellbeing</option><option>Financial</option><option>Technical</option><option>Other</option>
              </select>
            ) : (
              <input type={type} required value={values[name] || ""} onChange={(event) => setValues({ ...values, [name]: event.target.value })} />
            )}
          </label>
        ))}
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? <><LoaderCircle className="spin" size={15} /> Submitting…</> : <><Send size={15} /> Submit request</>}
      </button>
    </form>
  );
}

export default function StudentDashboard({ session, student }) {
  const [state, setState] = useState({ status: "loading", records: null, error: "" });
  const [module, setModule] = useState("profile");
  const [signOutError, setSignOutError] = useState("");
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [aiState, setAiState] = useState({ loading: false, insight: "", error: "" });

  const refreshRecords = useCallback(async () => {
    const records = await loadStudentRecords(supabase, student);
    setState({ status: "ready", records, error: "" });
  }, [student]);

  useEffect(() => {
    let active = true;
    loadStudentRecords(supabase, student)
      .then((records) => {
        if (active) setState({ status: "ready", records, error: "" });
      })
      .catch((error) => {
        if (active) setState({ status: "error", records: null, error: error.message });
      });
    return () => { active = false; };
  }, [student]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutError(error.message);
    } catch (error) {
      setSignOutError(error.message || "Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  async function generateInsight() {
    setAiState({ loading: true, insight: "", error: "" });
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error("The AI API is unavailable on the plain Vite server. Use `npx vercel dev` to test it.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate your insight.");
      setAiState({ loading: false, insight: result.insight, error: "" });
    } catch (error) {
      setAiState({ loading: false, insight: "", error: error.message || "Could not generate your insight." });
    }
  }

  async function retryLoad() {
    setState({ status: "loading", records: null, error: "" });
    try {
      await refreshRecords();
    } catch (error) {
      setState({ status: "error", records: null, error: error.message || "Could not load your records." });
    }
  }

  const records = state.records;
  const fullName = valueFor(student, ["full_name", "student_name", "name"]) ||
    [valueFor(student, ["first_name", "given_name"]), valueFor(student, ["last_name", "family_name"])].filter(Boolean).join(" ") || "Student";
  const studentId = valueFor(student, ["id"]);
  const displayId = valueFor(student, ["student_code", "roll_number", "roll_no", "registration_number", "id"]);
  const department = valueFor(student, ["department", "department_name", "dept", "program", "course", "major"]);
  const attendanceAverage = records ? average(records.attendance_records.map(attendanceValue)) : null;
  const marksAverage = records ? average(records.assessments.map(scoreValue)) : null;
  const activeModule = modules.find((item) => item.id === module);

  async function updateRecords(message) {
    setNotice(message);
    try {
      await refreshRecords();
    } catch (error) {
      setState({ status: "error", records: null, error: error.message || "The request was submitted, but your records could not be refreshed." });
      throw new Error(`Request submitted, but your portal could not refresh: ${error.message}`, { cause: error });
    }
  }

  function renderModule() {
    if (state.status === "loading") {
      return <section className="student-data-state"><LoaderCircle className="spin" size={22} /><strong>Loading your records…</strong><span>Supabase Row Level Security limits data to your account.</span></section>;
    }
    if (state.status === "error") {
      return <section className="student-data-state student-data-error" role="alert"><AlertCircle size={22} /><strong>Your records could not be loaded</strong><span>{state.error}</span><span>Ask your administrator to apply and verify the student access migrations. You will not be shown another student's data.</span><button className="primary-button" onClick={retryLoad}>Retry</button></section>;
    }

    if (module === "profile") {
      return (
        <>
          <ModuleHeading title={`Welcome, ${fullName}`} description="Your personal student information and learning snapshot." />
          <div className="student-summary-grid">
            <SummaryCard icon={Activity} label="Average attendance" value={percent(attendanceAverage)} note="Calculated from your attendance records" />
            <SummaryCard icon={BookOpenCheck} label="Average marks" value={percent(marksAverage)} note="Calculated from your assessment records" />
            <SummaryCard icon={CalendarDays} label="Attendance records" value={records.attendance_records.length} note="Linked to your student account" />
            <SummaryCard icon={LifeBuoy} label="Open support requests" value={records.support_requests.filter((item) => !["resolved", "closed"].includes(String(valueFor(item, ["status"]) || "").toLowerCase())).length} note="Private requests" />
          </div>
          <section className="student-profile-card">
            <h2>My profile</h2>
            <div className="student-profile-grid">
              <ProfileField label="Name" value={fullName} />
              <ProfileField label="Student ID" value={displayId} />
              <ProfileField label="Email" value={session.user.email} />
              <ProfileField label="Department / course" value={department} />
              <ProfileField label="Academic year" value={valueFor(student, ["academic_year", "year", "semester"])} />
              <ProfileField label="Phone" value={valueFor(student, ["phone", "phone_number", "mobile"])} />
            </div>
          </section>
          <RecordSection title="Recent announcements" description="Published notices for students" records={records.announcements.slice(0, 3)} fields={[
            ["Title", ["title"]], ["Category", ["category"]], ["Published", ["publish_at", "created_at"], (_row, value) => dateText(value)],
          ]} emptyText="There are no published announcements right now." />
          <section className="student-ai-card"><div><strong>Personal learning reflection</strong><p>AI-generated insights use only your own records, retrieved server-side under your Supabase session.</p></div><button className="primary-button" onClick={generateInsight} disabled={aiState.loading}>{aiState.loading ? "Generating…" : "Generate AI insight"}</button>{aiState.error && <div className="inline-error" role="alert">{aiState.error}</div>}{aiState.insight && <div className="groq-result"><strong>AI-generated</strong><br />{aiState.insight}</div>}</section>
        </>
      );
    }
    if (module === "attendance") return <><ModuleHeading title="Attendance" description="Your attendance information retrieved for your student account." /><RecordSection title="Attendance history" description="Attendance records linked to you" records={records.attendance_records} fields={[
      ["Date", ["attendance_date", "record_date", "date", "created_at"], (_row, value) => dateText(value)],
      ["Class / subject", ["subject", "course", "class_name", "subject_name"]],
      ["Attendance", ["attendance_percentage", "attendance_percent", "attendance_rate", "attendance"], (row, raw) => { const value = attendanceValue(row); return value === null ? displayValue(raw) : `${value}%`; }],
      ["Status", ["attendance_status", "status"]],
    ]} /></>;
    if (module === "marks") return <><ModuleHeading title="Marks & assessments" description="Your recorded assessment results." /><RecordSection title="Assessment history" description="Marks and grades linked to you" records={records.assessments} fields={[
      ["Assessment", ["assessment_name", "title", "subject", "name"]],
      ["Date", ["assessment_date", "date", "created_at"], (_row, value) => dateText(value)],
      ["Score", ["score", "assessment_score", "marks_obtained", "obtained_marks", "percentage", "grade_percent"], (row) => percent(scoreValue(row))],
      ["Grade", ["grade", "letter_grade"]],
    ]} /></>;
    if (module === "timetable") return <><ModuleHeading title="My timetable" description="Published class schedule associated with your account." /><RecordSection title="Classes" description="Weekly schedule" records={records.student_timetables.slice().sort((a, b) => Number(valueFor(a, ["weekday"]) || 0) - Number(valueFor(b, ["weekday"]) || 0))} fields={[
      ["Day", ["weekday"], (_row, value) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(value)] || displayValue(value)],
      ["Time", ["starts_at"], (row, value) => `${displayValue(value)} – ${displayValue(valueFor(row, ["ends_at"]))}`],
      ["Subject", ["subject"]], ["Instructor", ["instructor"]], ["Room", ["room"]], ["Year", ["academic_year"]],
    ]} emptyText="No published timetable is available yet." /></>;
    if (module === "fees") return <><ModuleHeading title="Fees" description="Your fee schedule and payment status." /><RecordSection title="Fee records" description="Private financial records linked to your student account" records={records.student_fees} fields={[
      ["Fee", ["fee_type"]], ["Amount", ["amount"], (_row, value) => displayValue(value)],
      ["Paid", ["paid_amount"], (_row, value) => displayValue(value)], ["Due date", ["due_date"], (_row, value) => dateText(value)],
      ["Status", ["status"]], ["Paid on", ["paid_at"], (_row, value) => dateText(value)],
    ]} emptyText="No fee records are available for your account." /></>;
    if (module === "leave") return <><ModuleHeading title="Leave requests" description="Submit a request and track its status." /><RequestForm key={`leave-${studentId}`} kind="leave" studentId={studentId} onCreated={updateRecords} /><RecordSection title="My requests" description="Only you and authorized administrators can view these requests" records={records.leave_requests} fields={[
      ["From", ["starts_on"], (_row, value) => dateText(value)], ["To", ["ends_on"], (_row, value) => dateText(value)],
      ["Reason", ["reason"]], ["Status", ["status"]], ["Submitted", ["created_at"], (_row, value) => dateText(value)], ["Admin note", ["admin_note"]],
    ]} emptyText="You have not submitted any leave requests." /></>;
    if (module === "announcements") return <><ModuleHeading title="Announcements" description="Notices published for students by your institution." /><RecordSection title="Published notices" description="Visible notices" records={records.announcements} fields={[
      ["Title", ["title"]], ["Category", ["category"]], ["Published", ["publish_at", "created_at"], (_row, value) => dateText(value)], ["Message", ["body"]],
    ]} emptyText="There are no published announcements right now." /></>;
    if (["journey", "goals", "planner", "skills", "insights", "mentor", "reports"].includes(module)) {
      return <StudentGrowth module={module} student={student} studentId={studentId} records={records} onRefresh={updateRecords} />;
    }
    return <><ModuleHeading title="Support requests" description="Contact your institution support team privately." /><RequestForm key={`support-${studentId}`} kind="support" studentId={studentId} onCreated={updateRecords} /><RecordSection title="My support requests" description="Only you and authorized administrators can view these requests" records={records.support_requests} fields={[
      ["Category", ["category"]], ["Subject", ["subject"]], ["Message", ["message"]], ["Status", ["status"]],
      ["Submitted", ["created_at"], (_row, value) => dateText(value)], ["Admin note", ["admin_note"]],
    ]} emptyText="You have not submitted a support request." /></>;
  }

  return (
    <main className="student-portal">
      <header className="student-portal-header">
        <div className="student-portal-brand"><div className="brand-mark"><GraduationCap size={23} /></div><div><strong>StudentPath</strong><span>PERSONAL STUDENT PORTAL</span></div></div>
        <div className="student-account"><span>{session.user.email}</span><button className="student-signout" onClick={signOut} disabled={signingOut}>{signingOut ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />}Sign out</button></div>
      </header>
      <div className="student-portal-layout">
        <nav className="student-portal-nav" aria-label="Student portal">
          <div className="student-nav-title">MY WORKSPACE</div>
          {modules.map(({ id, label, icon: Icon }) => <button key={id} className={module === id ? "active" : ""} onClick={() => { setModule(id); setNotice(""); }}><Icon size={16} /><span>{label}</span></button>)}
          <div className="student-nav-foot"><ShieldCheck size={15} /> Private student account</div>
        </nav>
        <section className="student-portal-main">
          {signOutError && <div className="inline-error" role="alert">{signOutError}</div>}
          {notice && <div className="student-notice" role="status">{notice}</div>}
          {activeModule && renderModule()}
          <footer className="student-portal-footer">StudentPath · Your progress, your records</footer>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value, note }) {
  return <div className="student-summary-card"><div><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ProfileField({ label, value }) {
  return <div className="student-profile-field"><span>{label}</span><strong>{displayValue(value)}</strong></div>;
}
