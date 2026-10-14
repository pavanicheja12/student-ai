import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Plus, Printer, Send, Share2, X } from "lucide-react";
import { supabase } from "./utils/supabase/client.js";
import "./StudentGrowth.css";

function dateInput(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function getName(student, studentId, records) {
  const profile = student || records.students?.find((item) => String(item.id) === String(studentId));
  return profile?.full_name || profile?.student_name || profile?.name || "My";
}

function PageHeading({ title, description }) {
  return <header className="growth-heading"><span>PERSONAL LEARNING WORKSPACE</span><h1>{title}</h1><p>{description}</p></header>;
}

function Empty({ children }) {
  return <div className="growth-empty">{children}</div>;
}

function GrowthForm({ title, children, onSubmit, busy, button = "Save" }) {
  return <form className="growth-form" onSubmit={onSubmit}><h2>{title}</h2><div className="growth-form-grid">{children}</div><button className="primary-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Plus size={14} /> {button}</>}</button></form>;
}

function Input({ label, value, onChange, type = "text", required = true, ...props }) {
  return <label className="growth-input"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} {...props} /></label>;
}

export default function StudentGrowth({ module, student, studentId, records, onRefresh }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatDetails, setChatDetails] = useState({ conversations: [], shares: [], assignments: [] });
  const [mentorId, setMentorId] = useState("");

  const conversations = useMemo(() => records.mentor_conversations || [], [records.mentor_conversations]);
  const currentConversation = conversations.find((conversation) => conversation.id === conversationId);
  const goalTasks = records.student_goal_tasks || [];
  const plans = records.study_plans || [];
  const currentPlan = plans[0];
  const planTasks = (records.study_tasks || []).filter((task) => task.study_plan_id === currentPlan?.id);
  const studentName = getName(student, studentId, records);

  useEffect(() => {
    Promise.resolve().then(() => {
      setForm({});
      setError("");
      setNotice("");
    });
  }, [module]);

  useEffect(() => {
    let active = true;
    if (module !== "mentor" || conversations.length === 0) {
      Promise.resolve().then(() => {
        if (active) setChatDetails({ conversations, shares: [], assignments: [] });
      });
      return undefined;
    }
    Promise.resolve().then(async () => {
      const ids = conversations.map((item) => item.id);
      const [shareResult, assignmentResult] = await Promise.all([
        supabase.from("conversation_shares").select("*").in("conversation_id", ids),
        supabase.from("faculty_assignments").select("faculty_user_id").eq("student_id", String(studentId)).eq("is_active", true),
      ]);
      if (shareResult.error) throw new Error(`Could not load sharing status: ${shareResult.error.message}`);
      if (assignmentResult.error) throw new Error(`Could not load assigned mentors: ${assignmentResult.error.message}`);
      if (active) setChatDetails({ conversations, shares: shareResult.data || [], assignments: assignmentResult.data || [] });
    }).catch((loadError) => {
      if (active) setError(loadError.message || "Could not load mentor sharing details.");
    });
    return () => { active = false; };
  }, [module, conversations, studentId]);

  useEffect(() => {
    let active = true;
    if (module !== "mentor" || !conversationId) {
      Promise.resolve().then(() => {
        if (active) setMessages([]);
      });
      return undefined;
    }
    Promise.resolve().then(async () => {
      const { data, error: loadError } = await supabase.from("mentor_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
      if (loadError) throw new Error(`Could not load this conversation: ${loadError.message}`);
      if (active) setMessages(data || []);
    }).catch((loadError) => {
      if (active) setError(loadError.message || "Could not load this conversation.");
    });
    return () => { active = false; };
  }, [module, conversationId]);

  async function saveRecord(table, payload, success) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: saveError } = await supabase.from(table).insert(payload);
      if (saveError) throw new Error(saveError.message);
      setForm({});
      setNotice(success);
      await onRefresh(success);
    } catch (saveError) {
      setError(saveError.message || "Could not save this item.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(table, id, values, success) {
    setError("");
    setNotice("");
    const { error: updateError } = await supabase.from(table).update(values).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice(success);
    try {
      await onRefresh(success);
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }

  async function createPlan(event) {
    event.preventDefault();
    await saveRecord("study_plans", {
      student_id: String(studentId),
      title: form.plan_title,
      week_start: form.week_start,
      notes: form.plan_notes || null,
      status: "active",
    }, "Study plan created.");
  }

  async function addTask(event, table, parentId, titleField) {
    event.preventDefault();
    const payload = { student_id: String(studentId), title: form[titleField], due_date: form.due_date || null };
    if (table === "student_goal_tasks") payload.goal_id = parentId;
    else {
      payload.study_plan_id = parentId;
      payload.subject = form.subject || null;
      payload.due_at = form.due_date ? new Date(`${form.due_date}T12:00:00`).toISOString() : null;
      delete payload.due_date;
    }
    await saveRecord(table, payload, "Task added.");
  }

  async function startConversation() {
    setError("");
    const { data, error: createError } = await supabase.from("mentor_conversations")
      .insert({ student_id: String(studentId), title: `Academic mentor · ${new Date().toLocaleDateString()}` })
      .select("id").single();
    if (createError) {
      setError(`Could not start a private conversation: ${createError.message}`);
      return;
    }
    setConversationId(data.id);
    try {
      await onRefresh("Conversation started.");
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }

  async function askMentor(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || text.length > 2000) {
      setError("Enter a question up to 2,000 characters.");
      return;
    }
    setError("");
    setChatLoading(true);
    try {
      let activeId = conversationId;
      if (!activeId) {
        const { data, error: createError } = await supabase.from("mentor_conversations")
          .insert({ student_id: String(studentId), title: text.slice(0, 80) })
          .select("id").single();
        if (createError) throw new Error(`Could not start a private conversation: ${createError.message}`);
        activeId = data.id;
        setConversationId(activeId);
      }
      const { error: messageError } = await supabase.from("mentor_messages")
        .insert({ conversation_id: activeId, role: "user", content: text });
      if (messageError) throw new Error(`Could not save your question: ${messageError.message}`);
      setMessages((previous) => [...previous, { id: `pending-${Date.now()}`, role: "user", content: text }]);
      setQuestion("");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("Your session expired. Sign in again to continue.");
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ question: text, conversationId: activeId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The AI mentor could not answer.");
      const { data: savedMessages, error: historyError } = await supabase.from("mentor_messages")
        .select("*").eq("conversation_id", activeId).order("created_at", { ascending: true });
      if (historyError) throw new Error(`The answer was generated, but conversation history could not be refreshed: ${historyError.message}`);
      setMessages(savedMessages || []);
    } catch (chatError) {
      setError(chatError.message || "The AI mentor is unavailable. Your question may already be saved.");
    } finally {
      setChatLoading(false);
    }
  }

  async function toggleShare(event) {
    event.preventDefault();
    if (!currentConversation || !mentorId) return;
    const activeShare = chatDetails.shares.find((share) => share.conversation_id === currentConversation.id && share.faculty_user_id === mentorId && share.active);
    if (activeShare) {
      const { error: revokeError } = await supabase.from("conversation_shares")
        .update({ active: false, revoked_at: new Date().toISOString() }).eq("id", activeShare.id);
      if (revokeError) {
        setError(`Could not revoke sharing: ${revokeError.message}`);
        return;
      }
      setNotice("Sharing revoked.");
    } else {
      const { error: shareError } = await supabase.from("conversation_shares")
        .insert({ conversation_id: currentConversation.id, faculty_user_id: mentorId });
      if (shareError) {
        setError(`Could not share this conversation: ${shareError.message}`);
        return;
      }
      setNotice("This conversation is now shared with the selected assigned mentor.");
    }
    const { data, error: refreshError } = await supabase.from("conversation_shares").select("*").in("conversation_id", conversations.map((item) => item.id));
    if (refreshError) setError(`Sharing changed, but the status could not be refreshed: ${refreshError.message}`);
    else setChatDetails((previous) => ({ ...previous, shares: data || [] }));
  }

  const timeline = useMemo(() => [
    ...(records.journey_events || []).map((event) => ({ id: event.id, title: event.title, description: event.description, date: event.occurred_at, type: event.event_type, source: event.source })),
    ...(records.assessments || []).map((item, index) => ({ id: `assessment-${item.id || index}`, title: item.assessment_name || item.subject || "Assessment recorded", description: `Score: ${item.score ?? item.marks_obtained ?? "not provided"}`, date: item.assessment_date || item.created_at, type: "Assessment", source: "institution" })),
    ...(records.attendance_records || []).map((item, index) => ({ id: `attendance-${item.id || index}`, title: item.subject || item.class_name || "Attendance record", description: `Status: ${item.attendance_status || item.status || item.attendance_percentage || "recorded"}`, date: item.attendance_date || item.record_date || item.created_at, type: "Attendance", source: "institution" })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)), [records]);

  function renderContent() {
    if (module === "journey") return (
      <>
        <PageHeading title="My student journey" description="A chronological view of your recorded academic activity and personal milestones. Only available records are shown." />
        <GrowthForm title="Add a personal milestone" busy={busy} onSubmit={(event) => { event.preventDefault(); return saveRecord("journey_events", { student_id: String(studentId), event_type: form.event_type || "milestone", title: form.event_title, description: form.event_description || null, source: "student", occurred_at: form.event_date ? new Date(`${form.event_date}T12:00:00`).toISOString() : new Date().toISOString() }, "Milestone added to your journey."); }}>
          <Input label="Milestone" value={form.event_title || ""} onChange={(value) => setForm({ ...form, event_title: value })} />
          <Input label="Category" required={false} value={form.event_type || ""} onChange={(value) => setForm({ ...form, event_type: value })} placeholder="Project, achievement, goal…" />
          <Input label="Date" type="date" required={false} value={form.event_date || ""} onChange={(value) => setForm({ ...form, event_date: value })} />
          <Input label="Description" required={false} value={form.event_description || ""} onChange={(value) => setForm({ ...form, event_description: value })} />
        </GrowthForm>
        <section className="growth-panel"><h2>Journey timeline</h2>{timeline.length ? <div className="growth-timeline">{timeline.map((event) => <article key={event.id}><i /><div><span>{event.type} · {event.source === "institution" ? "Institution record" : "Personal milestone"}</span><strong>{event.title}</strong><p>{event.description}</p><small>{event.date ? new Date(event.date).toLocaleDateString() : "Date not provided"}</small></div></article>)}</div> : <Empty>No journey events are recorded yet.</Empty>}</section>
      </>
    );
    if (module === "goals") return (
      <>
        <PageHeading title="My goals" description="Set measurable goals and track your own progress with manageable tasks." />
        <GrowthForm title="Create a goal" busy={busy} onSubmit={(event) => { event.preventDefault(); return saveRecord("student_goals", { student_id: String(studentId), title: form.goal_title, description: form.goal_description || null, goal_type: form.goal_type || "academic", target_value: form.target_value ? Number(form.target_value) : null, target_date: form.target_date || null }, "Goal created."); }}>
          <Input label="Goal" value={form.goal_title || ""} onChange={(value) => setForm({ ...form, goal_title: value })} />
          <label className="growth-input"><span>Type</span><select value={form.goal_type || "academic"} onChange={(event) => setForm({ ...form, goal_type: event.target.value })}><option value="academic">Academic</option><option value="skill">Skill development</option><option value="personal">Personal</option></select></label>
          <Input label="Target date" type="date" required={false} value={form.target_date || ""} onChange={(value) => setForm({ ...form, target_date: value })} />
          <Input label="Target value (optional)" type="number" required={false} min="0" value={form.target_value || ""} onChange={(value) => setForm({ ...form, target_value: value })} />
          <Input label="Description" required={false} value={form.goal_description || ""} onChange={(value) => setForm({ ...form, goal_description: value })} />
        </GrowthForm>
        <section className="growth-panel"><h2>Your goals</h2>{records.student_goals?.length ? <div className="growth-list">{records.student_goals.map((goal) => {
          const tasks = goalTasks.filter((task) => task.goal_id === goal.id);
          const complete = tasks.filter((task) => task.completed).length;
          return <article key={goal.id}><div><span>{goal.goal_type} · {goal.status}</span><strong>{goal.title}</strong><p>{goal.description || "No description provided."}</p><small>{complete}/{tasks.length} tasks complete · target {goal.target_date || "not set"}</small></div><button className="growth-subtle-button" onClick={() => updateRow("student_goals", goal.id, { status: goal.status === "completed" ? "active" : "completed" }, "Goal status updated.")}>{goal.status === "completed" ? "Reopen" : "Mark complete"}</button><form className="growth-inline-form" onSubmit={(event) => addTask(event, "student_goal_tasks", goal.id, "goal_task")}><input aria-label="New goal task" required value={form.goal_task || ""} onChange={(event) => setForm({ ...form, goal_task: event.target.value })} placeholder="Add a next step" /><button type="submit" disabled={busy}><Plus size={14} /></button></form>{tasks.map((task) => <label className="growth-check-row" key={task.id}><input type="checkbox" checked={task.completed} onChange={(event) => updateRow("student_goal_tasks", task.id, { completed: event.target.checked, completed_at: event.target.checked ? new Date().toISOString() : null }, "Goal task updated.")} />{task.title}</label>)}</article>;
        })}</div> : <Empty>You have not added a goal yet.</Empty>}</section>
      </>
    );
    if (module === "planner") return (
      <>
        <PageHeading title="Study planner" description="Create and edit your own study week. Tasks are stored against your student account." />
        <GrowthForm title="Create a weekly plan" busy={busy} onSubmit={createPlan}>
          <Input label="Plan title" value={form.plan_title || ""} onChange={(value) => setForm({ ...form, plan_title: value })} />
          <Input label="Week starting" type="date" value={form.week_start || dateInput(new Date())} onChange={(value) => setForm({ ...form, week_start: value })} />
          <Input label="Notes" required={false} value={form.plan_notes || ""} onChange={(value) => setForm({ ...form, plan_notes: value })} />
        </GrowthForm>
        {currentPlan && <section className="growth-panel"><h2>{currentPlan.title} <small>· week of {currentPlan.week_start}</small></h2><form className="growth-inline-form" onSubmit={(event) => addTask(event, "study_tasks", currentPlan.id, "study_task")}><input aria-label="Study task" required value={form.study_task || ""} onChange={(event) => setForm({ ...form, study_task: event.target.value })} placeholder="What will you study?" /><input aria-label="Subject" value={form.subject || ""} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" /><input aria-label="Due date" type="date" value={form.due_date || ""} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /><button type="submit" disabled={busy}><Plus size={14} /> Add</button></form>{planTasks.length ? planTasks.map((task) => <label className="growth-check-row" key={task.id}><input type="checkbox" checked={task.completed} onChange={(event) => updateRow("study_tasks", task.id, { completed: event.target.checked, completed_at: event.target.checked ? new Date().toISOString() : null }, "Study task updated.")} /><span>{task.title}{task.subject ? ` · ${task.subject}` : ""}{task.due_at ? ` · due ${new Date(task.due_at).toLocaleDateString()}` : ""}</span></label>) : <Empty>No tasks in this plan yet.</Empty>}</section>}
        <section className="growth-panel"><h2>Previous plans</h2>{plans.length > 1 ? <div className="growth-list">{plans.slice(1).map((plan) => <article key={plan.id}><strong>{plan.title}</strong><small>Week of {plan.week_start} · {plan.status}</small></article>)}</div> : <Empty>No earlier study plans are available.</Empty>}</section>
      </>
    );
    if (module === "skills") return (
      <>
        <PageHeading title="Skills & achievements" description="Track skills and achievements you submit. Institution verification is clearly distinguished." />
        <GrowthForm title="Add a skill or achievement" busy={busy} onSubmit={(event) => { event.preventDefault(); return saveRecord("student_skills", { student_id: String(studentId), name: form.skill_name, category: form.skill_category || "skill", proficiency: form.proficiency || null, evidence_url: form.evidence_url || null, verified: false }, "Personal achievement added as unverified."); }}>
          <Input label="Skill / achievement" value={form.skill_name || ""} onChange={(value) => setForm({ ...form, skill_name: value })} />
          <label className="growth-input"><span>Category</span><select value={form.skill_category || "skill"} onChange={(event) => setForm({ ...form, skill_category: event.target.value })}><option value="skill">Skill</option><option value="project">Project</option><option value="certification">Certification</option><option value="internship">Internship</option><option value="extracurricular">Extracurricular</option></select></label>
          <Input label="Proficiency / details" required={false} value={form.proficiency || ""} onChange={(value) => setForm({ ...form, proficiency: value })} />
          <Input label="Evidence link (optional)" type="url" required={false} value={form.evidence_url || ""} onChange={(value) => setForm({ ...form, evidence_url: value })} />
        </GrowthForm>
        <section className="growth-panel"><h2>My achievements</h2>{records.student_skills?.length ? <div className="growth-list">{records.student_skills.map((skill) => <article key={skill.id}><div><span>{skill.category} · {skill.verified ? "Institution verified" : "Student submitted · not verified"}</span><strong>{skill.name}</strong><p>{skill.proficiency || "Details not provided."}</p>{skill.evidence_url && <a href={skill.evidence_url} target="_blank" rel="noreferrer">View evidence</a>}</div></article>)}</div> : <Empty>No skills or achievements are recorded yet.</Empty>}</section>
      </>
    );
    if (module === "insights") {
      const attendanceRows = records.attendance_records || [];
      const scoreRows = records.assessments || [];
      const attendance = attendanceRows.map((row) => {
        const explicit = Number(row.attendance_percentage ?? row.attendance_percent ?? row.attendance_rate ?? row.attendance);
        if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit <= 1 ? explicit * 100 : explicit));
        const status = String(row.attendance_status ?? row.status ?? "").toLowerCase();
        if (["present", "attended", "late"].includes(status)) return 100;
        if (["absent", "not_attended"].includes(status)) return 0;
        const attended = Number(row.attended_classes ?? row.classes_attended ?? row.present_count);
        const total = Number(row.total_classes ?? row.classes_held ?? row.class_count);
        return Number.isFinite(attended) && Number.isFinite(total) && total > 0
          ? Math.max(0, Math.min(100, attended / total * 100))
          : null;
      }).filter(Number.isFinite);
      const scores = scoreRows.map((row) => {
        const raw = Number(row.marks_obtained ?? row.obtained_marks ?? row.score ?? row.percentage);
        const max = Number(row.max_marks ?? row.total_marks ?? row.maximum_marks);
        const percentValue = Number.isFinite(raw) ? (Number.isFinite(max) && max > 0 ? raw / max * 100 : raw <= 1 ? raw * 100 : raw) : null;
        return Number.isFinite(percentValue) ? Math.max(0, Math.min(100, percentValue)) : null;
      }).filter(Number.isFinite);
      const attendanceAvg = attendance.length ? attendance.reduce((a, b) => a + b, 0) / attendance.length : null;
      const scoreAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const alerts = [];
      if (attendanceAvg !== null && attendanceAvg < 75) alerts.push({ title: "Attendance needs attention", detail: `Your recorded attendance averages ${attendanceAvg.toFixed(1)}%, below the 75% review threshold. Check the underlying records if this looks incorrect.` });
      if (scoreAvg !== null && scoreAvg < 65) alerts.push({ title: "Assessment trend to review", detail: `Your available assessment average is ${scoreAvg.toFixed(1)}%. Consider discussing study support with a trusted educator.` });
      const overdueTasks = (records.study_tasks || []).filter((task) => !task.completed && task.due_at && new Date(task.due_at).getTime() < Date.now());
      if (overdueTasks.length) alerts.push({ title: "Study tasks past due", detail: `${overdueTasks.length} of your tasks have a due date in the past and are not marked complete. Review or reschedule them in your planner.` });
      const allRecords = [...attendanceRows, ...scoreRows];
      const dates = allRecords.map((row) => row.attendance_date || row.assessment_date || row.record_date || row.created_at).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
      const period = dates.length ? `${new Date(Math.min(...dates)).toLocaleDateString()} – ${new Date(Math.max(...dates)).toLocaleDateString()}` : "period unavailable";
      return <><PageHeading title="My insights" description="Transparent rule-based indicators based on the records currently available. These are not validated machine-learning predictions." /><section className="growth-panel"><h2>Personal indicators</h2>{alerts.length ? alerts.map((alert) => <article className="growth-alert" key={alert.title}><AlertCircle /><div><strong>{alert.title}</strong><p>{alert.detail}</p></div></article>) : <Empty>{attendanceAvg === null && scoreAvg === null ? "Not enough attendance or assessment information is available to calculate indicators." : "No configured review threshold is triggered by the available records."}</Empty>}<div className="growth-disclaimer">Rule v1 · Observation period: {period}. Thresholds are attendance below 75% and assessment average below 65%, plus incomplete tasks past due. These are prompts for supportive review only, not diagnoses or predictions; no personal causes are inferred. Available data: {attendanceRows.length} attendance rows, {scoreRows.length} assessment rows, and {overdueTasks.length} overdue tasks.</div></section><section className="growth-panel"><h2>Published risk reviews</h2>{records.risk_assessments?.length ? records.risk_assessments.map((risk) => <article className="growth-alert" key={risk.id}><AlertCircle /><div><strong>{risk.risk_level} · {risk.category}</strong><p>{risk.recommended_action || "No recommendation recorded."}</p><small>Rule {risk.rule_version} · {risk.review_status} · {new Date(risk.created_at).toLocaleDateString()}</small></div></article>) : <Empty>No staff-reviewed alert records are available.</Empty>}</section></>;
    }
    if (module === "mentor") return (
      <>
        <PageHeading title="My AI mentor" description="Ask about your own academic data or request study techniques. AI answers can be wrong; verify important details with an educator." />
        <section className="growth-panel"><div className="growth-panel-heading"><h2>Private conversations</h2><button className="growth-subtle-button" onClick={startConversation} disabled={chatLoading}><Plus size={14} /> New conversation</button></div>{conversations.length ? <label className="growth-input"><span>Select a conversation</span><select value={conversationId} onChange={(event) => setConversationId(event.target.value)}><option value="">Choose…</option>{conversations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <Empty>Ask your first question below to begin a private conversation.</Empty>}
          <div className="growth-messages">{messages.map((message) => <article key={message.id} className={message.role === "user" ? "from-student" : "from-mentor"}><strong>{message.role === "user" ? "You" : "AI mentor"}</strong><p>{message.content}</p>{message.role === "assistant" && <small>AI-generated · verify important facts with official records</small>}</article>)}</div>
          <form className="growth-chat-form" onSubmit={askMentor}><textarea maxLength={2000} required value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your records or study strategy…" /><button className="primary-button" type="submit" disabled={chatLoading}>{chatLoading ? <><LoaderCircle className="spin" size={14} /> Thinking…</> : <><Send size={14} /> Ask</>}</button></form>
          {currentConversation && <form className="growth-share-form" onSubmit={toggleShare}><Share2 size={15} /><label>Share this conversation with an assigned mentor<select value={mentorId} onChange={(event) => setMentorId(event.target.value)}><option value="">Select mentor</option>{chatDetails.assignments.map((assignment) => <option key={assignment.faculty_user_id} value={assignment.faculty_user_id}>{assignment.faculty_user_id}</option>)}</select></label><button type="submit" disabled={!mentorId}>{chatDetails.shares.some((share) => share.conversation_id === currentConversation.id && share.faculty_user_id === mentorId && share.active) ? <><X size={13} /> Revoke</> : <><Check size={13} /> Share</>}</button></form>}
          {currentConversation && chatDetails.shares.some((share) => share.conversation_id === currentConversation.id && share.active) && <p className="growth-share-note">This conversation is shared. Revocation disables subsequent mentor access through RLS.</p>}
        </section>
      </>
    );
    return <div className="growth-report"><PageHeading title={`${studentName} · progress report`} description="Personal report built from records available to your signed-in account. Missing information is not estimated." /><div className="growth-report-metrics"><article><span>Attendance records</span><strong>{records.attendance_records?.length || 0}</strong></article><article><span>Assessment records</span><strong>{records.assessments?.length || 0}</strong></article><article><span>Goals</span><strong>{records.student_goals?.length || 0}</strong></article><article><span>Skills & achievements</span><strong>{records.student_skills?.length || 0}</strong></article></div><section className="growth-panel"><h2>Journey events</h2>{timeline.map((item) => <p key={item.id}>{item.date ? new Date(item.date).toLocaleDateString() : "Date unavailable"} · {item.title}</p>)}{!timeline.length && <Empty>No dated journey records are available.</Empty>}</section><section className="growth-panel"><h2>Goals</h2>{records.student_goals?.map((goal) => <p key={goal.id}>{goal.title} · {goal.status} · target {goal.target_date || "not set"}</p>)}{!records.student_goals?.length && <Empty>No goals are recorded.</Empty>}</section><button className="primary-button no-print" onClick={() => window.print()}><Printer size={15} /> Print / save as PDF</button><small className="growth-disclaimer">Use the browser print dialog and choose “Save as PDF”. This report contains personal student data; store it securely.</small></div>;
  }

  return <div className="student-growth">{renderContent()}{notice && <div className="growth-notice" role="status">{notice}</div>}{error && <div className="growth-error" role="alert">{error}</div>}</div>;
}
