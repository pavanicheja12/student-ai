import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BookOpenCheck, CalendarDays, LoaderCircle, LogOut, Users } from "lucide-react";
import { supabase } from "./utils/supabase/client.js";
import "./FacultyDashboard.css";

const modules = [
  ["overview", "Overview"],
  ["attendance_records", "Attendance"],
  ["assessments", "Assessment records"],
  ["interventions", "Support history"],
];

function studentName(student) {
  return student.full_name || student.student_name || student.name ||
    [student.first_name, student.last_name].filter(Boolean).join(" ") || "Assigned student";
}

function StudentRows({ records, emptyText }) {
  if (!records.length) return <div className="faculty-empty">{emptyText}</div>;
  const excluded = new Set(["id", "student_id", "created_at", "updated_at", "auth_user_id"]);
  return (
    <div className="faculty-record-list">
      {records.map((record, index) => {
        const fields = Object.entries(record).filter(([key, value]) => !excluded.has(key) && value !== null && typeof value !== "object");
        return (
          <article className="faculty-record" key={record.id || `${record.student_id}-${index}`}>
            {fields.length
              ? fields.map(([key, value]) => (
                <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{String(value)}</strong></div>
              ))
              : <span>Record has no displayable fields.</span>}
          </article>
        );
      })}
    </div>
  );
}

export default function FacultyDashboard({ session }) {
  const [state, setState] = useState({ status: "loading", students: [], records: {}, error: "" });
  const [activeStudent, setActiveStudent] = useState("");
  const [activeModule, setActiveModule] = useState("overview");
  const [query, setQuery] = useState("");
  const [signOutError, setSignOutError] = useState("");

  const loadAssignedStudents = useCallback(async (isActive = () => true) => {
    if (isActive()) setState((previous) => ({ ...previous, status: "loading", error: "" }));
    const { data: assignments, error: assignmentError } = await supabase
      .from("faculty_assignments")
      .select("student_id")
      .eq("faculty_user_id", session.user.id)
      .eq("is_active", true);

    if (assignmentError) throw new Error(`Could not load your assigned students: ${assignmentError.message}`);
    const studentIds = [...new Set((assignments || []).map((item) => String(item.student_id)))];
    if (!studentIds.length) {
      if (isActive()) {
        setState({ status: "ready", students: [], records: {}, error: "" });
        setActiveStudent("");
      }
      return;
    }

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("*")
      .in("id", studentIds);
    if (studentError) throw new Error(`Could not load assigned student profiles: ${studentError.message}`);

    const studentRows = students || [];
    const allowedIds = studentRows.map((student) => String(student.id));
    const loaded = await Promise.all(
      modules.slice(1).map(async ([table]) => {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .in("student_id", allowedIds);
        if (error) throw new Error(`Could not load assigned ${table.replaceAll("_", " ")}: ${error.message}`);
        return [table, data || []];
      })
    );

    if (isActive()) {
      setState({ status: "ready", students: studentRows, records: Object.fromEntries(loaded), error: "" });
      setActiveStudent((current) => allowedIds.includes(current) ? current : allowedIds[0] || "");
    }
  }, [session.user.id]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => loadAssignedStudents(() => active)).catch((error) => {
      if (active) setState({ status: "error", students: [], records: {}, error: error.message || "Could not load assigned students." });
    });
    return () => { active = false; };
  }, [loadAssignedStudents]);

  async function signOut() {
    setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
  }

  const students = state.students.filter((student) =>
    studentName(student).toLowerCase().includes(query.toLowerCase()) ||
    String(student.student_code || student.roll_number || student.id).toLowerCase().includes(query.toLowerCase())
  );
  const selected = state.students.find((student) => String(student.id) === activeStudent);
  const selectedRecords = Object.fromEntries(
    Object.entries(state.records).map(([table, rows]) => [table, rows.filter((row) => String(row.student_id) === activeStudent)])
  );
  const activeLabel = modules.find(([id]) => id === activeModule)?.[1] || "Overview";

  return (
    <main className="faculty-app">
      <header className="faculty-header">
        <div className="faculty-brand"><div className="faculty-brand-mark"><Users size={17} /></div><div><strong>StudentPath</strong><span>FACULTY & MENTOR PORTAL</span></div></div>
        <div className="faculty-account"><span>{session.user.email}</span><button className="faculty-signout" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
      </header>
      <div className="faculty-layout">
        <aside className="faculty-sidebar">
          <strong className="faculty-nav-title">MY WORKSPACE</strong>
          {modules.map(([id, label]) => <button key={id} className={activeModule === id ? "active" : ""} onClick={() => setActiveModule(id)}>{label}</button>)}
        </aside>
        <section className="faculty-main">
          <div className="faculty-heading"><span>ASSIGNED STUDENT SUPPORT</span><h1>{activeLabel}</h1><p>Only students assigned to your active faculty account are shown. Supabase RLS is the access boundary.</p></div>
          {signOutError && <div className="faculty-error" role="alert">{signOutError}</div>}
          {state.status === "loading" ? <div className="faculty-state"><LoaderCircle className="spin" /><strong>Loading authorized assignments…</strong></div>
            : state.status === "error" ? <div className="faculty-state faculty-error" role="alert"><AlertCircle /><strong>Faculty workspace unavailable</strong><span>{state.error}</span><button onClick={() => loadAssignedStudents().catch((error) => setState({ status: "error", students: [], records: {}, error: error.message }))}>Retry</button></div>
              : !state.students.length ? <div className="faculty-state"><Users /><strong>No active student assignments</strong><span>Ask an administrator to assign students to this faculty account.</span></div>
                : (
                  <>
                    <div className="faculty-toolbar">
                      <label>Find assigned student<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or student ID" /></label>
                      <label>Student<select value={activeStudent} onChange={(event) => setActiveStudent(event.target.value)}>{students.map((student) => <option key={student.id} value={String(student.id)}>{studentName(student)}</option>)}</select></label>
                    </div>
                    {!selected ? <div className="faculty-state">No assigned student matches this search.</div> : activeModule === "overview" ? (
                      <>
                        <div className="faculty-metrics">
                          <article><CalendarDays /><span>Attendance records</span><strong>{selectedRecords.attendance_records?.length || 0}</strong></article>
                          <article><BookOpenCheck /><span>Assessment records</span><strong>{selectedRecords.assessments?.length || 0}</strong></article>
                          <article><Users /><span>Support interventions</span><strong>{selectedRecords.interventions?.length || 0}</strong></article>
                        </div>
                        <section className="faculty-panel"><h2>{studentName(selected)}</h2><StudentRows records={[selected]} emptyText="No profile information is available." /></section>
                      </>
                    ) : <section className="faculty-panel"><h2>{studentName(selected)} · {activeLabel}</h2><StudentRows records={selectedRecords[activeModule] || []} emptyText={`No ${activeLabel.toLowerCase()} are available for this assigned student.`} /></section>}
                  </>
                )}
        </section>
      </div>
    </main>
  );
}
