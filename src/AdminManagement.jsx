import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Download, LoaderCircle, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { supabase } from "./utils/supabase/client.js";
import "./AdminManagement.css";

const TABLES = [
  ["students", "Student directory"],
  ["attendance_records", "Attendance"],
  ["assessments", "Marks & assessments"],
  ["student_timetables", "Timetables"],
  ["student_fees", "Fee records"],
  ["leave_requests", "Leave requests"],
  ["announcements", "Announcements"],
  ["support_requests", "Support requests"],
  ["interventions", "Interventions"],
  ["student_outcomes", "Student outcomes"],
  ["faculty_assignments", "Faculty assignments"],
];

function csvValue(value) {
  let text = value === null || value === undefined
    ? ""
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(rows, fileName) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const content = [columns.map(csvValue).join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AdminManagement({ session }) {
  const [table, setTable] = useState("students");
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [json, setJson] = useState("");
  const [state, setState] = useState({ loading: true, error: "" });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRows = useCallback(async () => {
    setState({ loading: true, error: "" });
    const { data, error } = await supabase.from(table).select("*").limit(500);
    if (error) {
      setState({ loading: false, error: error.message });
      setRows([]);
      return;
    }
    setRows(data || []);
    setState({ loading: false, error: "" });
  }, [table]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) return loadRows();
      return undefined;
    });
    return () => { active = false; };
  }, [loadRows]);

  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const admin = session?.user?.app_metadata?.role === "admin";
  const label = TABLES.find(([name]) => name === table)?.[1] || table;

  function beginCreate() {
    setNotice("");
    setEditor({ mode: "create", id: null });
    setJson("{}");
  }

  function beginEdit(row) {
    if (!row.id) {
      setNotice("This row has no id field, so the editor cannot safely update it.");
      return;
    }
    setNotice("");
    setEditor({ mode: "edit", id: row.id });
    setJson(JSON.stringify(row, null, 2));
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (!admin) return;
    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      setNotice("Record JSON is invalid. Check quotes, commas, and braces.");
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      setNotice("A record must be a JSON object.");
      return;
    }
    if (editor.mode === "edit") delete payload.id;

    setSaving(true);
    setNotice("");
    try {
      const result = editor.mode === "create"
        ? await supabase.from(table).insert(payload)
        : await supabase.from(table).update(payload).eq("id", editor.id);
      if (result.error) throw new Error(result.error.message);
      setEditor(null);
      setNotice(editor.mode === "create" ? "Record created." : "Record updated.");
      await loadRows();
    } catch (error) {
      setNotice(error.message || "The record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(row) {
    if (!admin || !row.id) return;
    if (!window.confirm(`Delete this ${label.toLowerCase()} record? This cannot be undone.`)) return;
    setNotice("");
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    if (error) {
      setNotice(`Could not delete record: ${error.message}`);
      return;
    }
    setNotice("Record deleted.");
    await loadRows();
  }

  if (!admin) {
    return <section className="management-state" role="alert"><AlertCircle /><strong>Administrator access required</strong><span>This workspace is only available to an authenticated admin.</span></section>;
  }

  return (
    <section className="admin-management">
      <div className="management-heading">
        <div><div className="overline">ADMINISTRATION</div><h2>Manage student records</h2><p>Search, review, export and maintain records available to your authorized admin account.</p></div>
        <button className="management-refresh" onClick={loadRows} disabled={state.loading}><RefreshCw size={15} /> Refresh</button>
      </div>
      <div className="management-toolbar">
        <label className="management-table-select">Data module
          <select value={table} onChange={(event) => { setTable(event.target.value); setEditor(null); setNotice(""); }}>
            {TABLES.map(([name, title]) => <option key={name} value={name}>{title}</option>)}
          </select>
        </label>
        <label className="management-search">Search rows
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all fields" />
        </label>
        <div className="management-actions">
          <button className="management-refresh" onClick={() => downloadCsv(filtered, `studentpath-${table}.csv`)} disabled={!filtered.length}><Download size={15} /> Export CSV</button>
          <button className="primary-button" onClick={beginCreate}><Plus size={15} /> Add record</button>
        </div>
      </div>
      {notice && <div className="management-notice" role="status">{notice}</div>}
      {editor && (
        <form className="management-editor" onSubmit={saveRecord}>
          <div className="management-editor-heading"><strong>{editor.mode === "create" ? `New ${label.toLowerCase()} record` : `Edit ${label.toLowerCase()} record`}</strong><button type="button" aria-label="Close editor" onClick={() => setEditor(null)}><X size={16} /></button></div>
          <p>Use valid JSON fields matching this table. Row Level Security still applies to every change.</p>
          <textarea value={json} onChange={(event) => setJson(event.target.value)} spellCheck="false" aria-label="Record JSON" />
          <button className="primary-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={15} /> Saving…</> : <><Save size={15} /> Save record</>}</button>
        </form>
      )}
      {state.loading ? <div className="management-state"><LoaderCircle className="spin" /><span>Loading {label.toLowerCase()}…</span></div>
        : state.error ? <div className="management-state management-error" role="alert"><AlertCircle /><strong>Could not load {label.toLowerCase()}</strong><span>{state.error}</span><span>Apply the required reviewed migration, then retry.</span></div>
          : !filtered.length ? <div className="management-state"><strong>No records found</strong><span>{rows.length ? "Change the search or filter." : "This module has no database rows yet."}</span></div>
            : (
              <div className="management-table-wrap">
                <div className="management-table-caption">Showing {filtered.length} of up to {rows.length} loaded rows. Maximum loaded rows: 500.</div>
                <table className="management-table"><thead><tr><th>Record</th><th>Summary</th><th>Actions</th></tr></thead><tbody>
                  {filtered.map((row, index) => {
                    const title = row.full_name || row.student_name || row.title || row.subject || row.fee_type || row.category || `${label} ${index + 1}`;
                    const identifier = row.id ?? row.student_id ?? index;
                    return <tr key={identifier}><td><strong>{String(title)}</strong><small>{String(row.id ?? "No id")}</small></td><td><code>{JSON.stringify(row)}</code></td><td className="management-row-actions"><button type="button" onClick={() => beginEdit(row)}>Edit</button><button type="button" className="danger" onClick={() => deleteRecord(row)}><Trash2 size={12} />Delete</button></td></tr>;
                  })}
                </tbody></table>
              </div>
            )}
    </section>
  );
}
