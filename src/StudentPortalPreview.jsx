import { useState } from "react";
import {
  Activity, AlertCircle, ArrowUpRight, BadgeCheck, BookOpenCheck,
  CalendarDays, GraduationCap, LogOut, NotebookPen, Printer,
  Route, ShieldCheck, Sparkles, Target,
} from "lucide-react";
import "./StudentDashboard.css";
import "./StudentGrowth.css";
import "./StudentPortalPreview.css";

const navigation = [
  ["overview", "Overview", Activity],
  ["journey", "My journey", Route],
  ["academics", "My academics", BookOpenCheck],
  ["insights", "My insights", Sparkles],
  ["planner", "Study planner", NotebookPen],
  ["goals", "My goals", Target],
  ["mentor", "Mentor messages", Sparkles],
  ["achievements", "My achievements", BadgeCheck],
  ["reports", "My reports", GraduationCap],
];

const sampleStudent = {
  name: "Maya Chen",
  studentId: "SAMPLE-2048",
  attendance: 86.4,
  assessmentAverage: 83.7,
  completedTasks: 5,
  totalTasks: 7,
};

const journey = [
  ["Jun 12, 2026", "Completed Data Structures assessment", "Assessment · Institution sample"],
  ["May 28, 2026", "Finished a personal study milestone", "Milestone · Sample record"],
  ["May 14, 2026", "Attendance review period", "Attendance · Institution sample"],
  ["Apr 30, 2026", "Started second-year semester", "Semester · Institution sample"],
];

const subjects = [
  ["Data Structures", "Quiz 2", "84 / 100", "Jun 12, 2026"],
  ["Database Systems", "Midterm", "76 / 100", "May 30, 2026"],
  ["Software Engineering", "Project", "91 / 100", "May 22, 2026"],
];

function Card({ children, title }) {
  return <section className="growth-panel"><h2>{title}</h2>{children}</section>;
}

export default function StudentPortalPreview({ onExit }) {
  const [page, setPage] = useState("overview");

  function renderContent() {
    if (page === "overview") return (
      <>
        <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>Welcome, {sampleStudent.name}</h1><p>This preview uses sample records for demonstration only. To view actual student records, sign in with an institution-assigned student account.</p></header>
        <div className="student-summary-grid">
          <article className="student-summary-card"><div><CalendarDays size={19} /></div><span>Average attendance</span><strong>{sampleStudent.attendance}%</strong><small>Fictional sample calculation</small></article>
          <article className="student-summary-card"><div><BookOpenCheck size={19} /></div><span>Assessment average</span><strong>{sampleStudent.assessmentAverage}%</strong><small>Fictional sample calculation</small></article>
          <article className="student-summary-card"><div><Target size={19} /></div><span>Active goals</span><strong>2</strong><small>Fictional sample goals</small></article>
          <article className="student-summary-card"><div><NotebookPen size={19} /></div><span>Study tasks</span><strong>{sampleStudent.completedTasks}/{sampleStudent.totalTasks}</strong><small>Fictional sample progress</small></article>
        </div>
        <div className="student-record-grid">
          <Card title="Next steps"><div className="growth-list"><article><strong>Review Database Systems notes</strong><small>Study planner · fictional task</small></article><article><strong>Practice two graph problems</strong><small>Goal task · fictional task</small></article></div></Card>
          <Card title="Recent journey"><div className="growth-list">{journey.slice(0, 2).map(([date, title, kind]) => <article key={title}><div><span>{kind}</span><strong>{title}</strong><small>{date}</small></div></article>)}</div></Card>
        </div>
      </>
    );
    if (page === "journey") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>My student journey</h1><p>Illustrative timeline made from fictional records only.</p></header>
      <Card title="Journey timeline"><div className="growth-timeline">{journey.map(([date, title, kind]) => <article key={title}><i /><div><span>{kind}</span><strong>{title}</strong><small>{date}</small></div></article>)}</div></Card>
    </>;
    if (page === "academics") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>My academics</h1><p>Example marks and progress for a fictional student.</p></header>
      <Card title="Assessment history"><div className="growth-list">{subjects.map(([subject, assessment, score, date]) => <article key={assessment}><div><span>{subject} · {date}</span><strong>{assessment}</strong><p>Sample score: {score}</p></div></article>)}</div></Card>
      <Card title="Attendance summary"><div className="growth-report-metrics"><article><span>Present</span><strong>86.4%</strong></article><article><span>Records</span><strong>44</strong></article><article><span>Observation period</span><strong>12 wk</strong></article><article><span>Source</span><strong>Demo</strong></article></div></Card>
    </>;
    if (page === "insights") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>My insights</h1><p>Illustrative rules only—not a validated prediction or a real student's risk assessment.</p></header>
      <Card title="Rule-based indicators"><article className="growth-alert"><AlertCircle /><div><strong>Attendance trend to monitor</strong><p>In this fictional sample, attendance is 86.4% over 12 weeks. This does not trigger the sample 75% review threshold.</p></div></article><div className="growth-disclaimer">Sample rule v1 · The example uses attendance below 75% and assessment average below 65% as supportive review prompts. No personal cause is inferred.</div></Card>
    </>;
    if (page === "planner") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>Study planner</h1><p>A sample weekly plan. Actions are preview-only and do not save changes.</p></header>
      <div className="student-record-grid"><Card title="Week of June 15"><div className="growth-list"><article><div><span>Monday · Data Structures</span><strong>Review graph traversal</strong><small>9:00 AM · Room B204 · fictional schedule</small></div></article><article><div><span>Wednesday · Database Systems</span><strong>Practice SQL joins</strong><small>11:00 AM · Lab C12 · fictional schedule</small></div></article><article><div><span>Friday · Software Engineering</span><strong>Update project notes</strong><small>2:00 PM · Room A118 · fictional schedule</small></div></article></div></Card><Card title="Student account snapshot"><div className="growth-list"><article><div><span>Fictional sample only</span><strong>Tuition status: Paid</strong><small>Next review date: September 1, 2026</small></div></article><article><div><span>Fictional sample only</span><strong>Library balance: $0.00</strong><small>No real financial records are shown</small></div></article></div></Card></div>
    </>;
    if (page === "goals") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>My goals</h1><p>Example goals and tasks; nothing is saved to your account.</p></header>
      <Card title="Active goals"><div className="growth-list"><article><div><span>Academic · target July 10</span><strong>Improve graph problem-solving</strong><p>Complete 8 practice problems · 5 of 8 done (fictional)</p></div></article><article><div><span>Skill · target August 1</span><strong>Build a portfolio project</strong><p>Publish one small project · 2 of 4 steps done (fictional)</p></div></article></div></Card>
    </>;
    if (page === "mentor") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>Mentor messages</h1><p>This is a static sample conversation. It is not a real mentor, AI response, or private message.</p></header>
      <Card title="Sample conversation · illustrative only"><div className="growth-messages"><article className="from-student"><strong>{sampleStudent.name} · sample</strong><p>How can I make time to practice graph problems this week?</p><small>Example message · not sent</small></article><article><strong>Example mentor response · fictional</strong><p>You could try two focused 25-minute sessions and add them to your planner. Choose a small set of problems and review any mistakes afterward. This is general sample text, not personalized advice.</p><small>Illustrative preview · not AI generated</small></article></div><div className="growth-disclaimer">Messaging is disabled in this preview. No message is sent or saved.</div></Card>
    </>;
    if (page === "achievements") return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>My achievements</h1><p>Student-submitted and institution-verified examples are labeled separately.</p></header>
      <Card title="Skills & achievements"><div className="growth-list"><article><div><span>Project · student-submitted · not verified</span><strong>Campus events planner</strong><p>React · accessibility · fictional example</p></div></article><article><div><span>Certification · institution verified · demo only</span><strong>Intro to Cloud Fundamentals</strong><p>Fictional certification entry</p></div></article></div></Card>
    </>;
    return <>
      <header className="growth-heading"><span>STUDENT PORTAL PREVIEW · FICTIONAL SAMPLE</span><h1>My progress report</h1><p>Example report for {sampleStudent.name}, a fictional student. No personal information is real.</p></header>
      <div className="growth-report-metrics"><article><span>Attendance</span><strong>86.4%</strong></article><article><span>Assessment average</span><strong>83.7%</strong></article><article><span>Active goals</span><strong>2</strong></article><article><span>Study tasks</span><strong>5/7</strong></article></div>
      <Card title="Report actions"><p>This demo report can be printed or saved as a PDF from your browser.</p><button className="primary-button" onClick={() => window.print()}><Printer size={15} /> Print / save as PDF</button></Card>
    </>;
  }

  return (
    <main className="student-portal student-portal-preview">
      <header className="student-portal-header">
        <div className="student-portal-brand"><div className="faculty-brand-mark"><GraduationCap size={18} /></div><div><strong>StudentPath</strong><span>STUDENT JOURNEY WORKSPACE</span></div></div>
        <div className="student-account"><span>{sampleStudent.name} · {sampleStudent.studentId}</span><button className="student-signout" onClick={onExit}><LogOut size={14} /> Exit preview</button></div>
      </header>
      <div className="sample-data-banner"><ShieldCheck size={15} /><strong>SAMPLE DATA ONLY</strong><span>Fictional records · No student data fetched or changed · Changes are not saved</span></div>
      <div className="student-portal-layout">
        <nav className="student-portal-nav" aria-label="Student portal preview navigation">
          <div className="student-nav-title">STUDENT WORKSPACE</div>
          {navigation.map(([id, title, Icon]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={15} />{title}</button>)}
          <div className="student-nav-foot"><ShieldCheck size={14} /> Sample workspace · no live data</div>
        </nav>
        <section className="student-portal-main"><div className="student-growth">{renderContent()}</div><footer className="student-portal-footer">StudentPath · Fictional sample data only <ArrowUpRight size={10} /></footer></section>
      </div>
    </main>
  );
}
