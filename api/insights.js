import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import process from "node:process";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MAX_BODY_BYTES = 1_024;
const PAGE_SIZE = 1_000;
const MAX_ROWS_PER_TABLE = 20_000;
const TABLES = ["students", "attendance_records", "assessments", "interventions", "student_outcomes"];

function send(res, status, body) {
  return res.status(status).json(body);
}

function isServiceRoleKey(key) {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function getValue(row, keys) {
  if (!row || typeof row !== "object") return null;
  const normalize = (value) => value.toLowerCase().replace(/[_\s-]/g, "");
  for (const name of keys) {
    const key = Object.keys(row).find((candidate) => normalize(candidate) === normalize(name));
    if (key && row[key] !== null && row[key] !== undefined) return row[key];
  }
  return null;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function percentFromRow(row, kind) {
  if (kind === "attendance") {
    const value = numberValue(getValue(row, ["attendance_percentage", "attendance_percent", "attendance_rate", "attendance", "attendance_pct"]));
    if (value !== null) return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
    const status = getValue(row, ["attendance_status", "status", "present", "is_present"]);
    if (typeof status === "boolean") return status ? 100 : 0;
    if (typeof status === "string") {
      const normalized = status.toLowerCase();
      if (["present", "attended", "late", "true", "yes"].includes(normalized)) return 100;
      if (["absent", "not_attended", "false", "no"].includes(normalized)) return 0;
    }
    return null;
  }
  const score = numberValue(getValue(row, ["score", "assessment_score", "exam_score", "percentage", "percent", "marks", "obtained", "marks_obtained", "obtained_marks", "grade_percent"]));
  if (score === null) return null;
  const maximum = numberValue(getValue(row, ["max_marks", "maximum_marks", "total_marks", "max_score"]));
  const obtained = numberValue(getValue(row, ["marks_obtained", "obtained_marks", "score"]));
  if (maximum > 0 && obtained !== null) return Math.max(0, Math.min(100, obtained / maximum * 100));
  return Math.max(0, Math.min(100, score <= 1 ? score * 100 : score));
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function studentKey(row) {
  const id = getValue(row, ["student_id", "student_uuid", "student_code", "roll_number", "roll_no", "registration_number", "id"]);
  return id === null ? null : String(id);
}

function studentAnalytics(students, attendanceRows, assessmentRows) {
  const measures = students.map((student) => {
    const keys = new Set([getValue(student, ["id"]), getValue(student, ["student_id"]), getValue(student, ["student_code"]), getValue(student, ["roll_number"]), getValue(student, ["roll_no"]), getValue(student, ["registration_number"])]
      .filter((value) => value !== null)
      .map(String));
    const attendance = attendanceRows.filter((row) => keys.has(studentKey(row))).map((row) => percentFromRow(row, "attendance"));
    const scores = assessmentRows.filter((row) => keys.has(studentKey(row))).map((row) => percentFromRow(row, "score"));
    const attendanceAverage = average(attendance);
    const scoreAverage = average(scores);
    const risk = attendanceAverage === null && scoreAverage === null
      ? "Unknown"
      : (attendanceAverage !== null && attendanceAverage < 65) || (scoreAverage !== null && scoreAverage < 50)
        ? "High"
        : (attendanceAverage !== null && attendanceAverage < 75) || (scoreAverage !== null && scoreAverage < 65)
          ? "Medium"
          : "Low";
    return { attendanceAverage, scoreAverage, risk };
  });
  const riskLabels = ["Low", "Medium", "High"];
  const categorized = measures.filter((item) => item.risk !== "Unknown");
  return {
    totalStudents: students.length,
    averageAttendance: average(measures.map((item) => item.attendanceAverage)),
    averageAssessment: average(measures.map((item) => item.scoreAverage)),
    riskDistribution: riskLabels.map((label) => ({
      label: `${label} risk`,
      percent: categorized.length ? (categorized.filter((item) => item.risk === label).length / categorized.length) * 100 : 0,
    })),
    categorizedStudents: categorized.length,
  };
}

async function loadRows(client, table, studentId = null) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
    let query = client.from(table).select("*");
    if (studentId !== null && table !== "students") query = query.eq("student_id", String(studentId));
    if (studentId !== null && table === "students") query = query.eq("id", studentId);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read authorized ${table} data: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
  throw new Error(`The ${table} data exceeds the safe insight processing limit.`);
}

async function loadAuthorizedSummary(client, role, studentId) {
  const loaded = await Promise.all(TABLES.map(async (table) => [
    table,
    await loadRows(client, table, role === "student" ? studentId : null),
  ]));
  const data = Object.fromEntries(loaded);
  if (role === "student") {
    const attendance = data.attendance_records.map((row) => percentFromRow(row, "attendance"));
    const assessments = data.assessments.map((row) => percentFromRow(row, "score"));
    const attendanceAverage = average(attendance);
    const scoreAverage = average(assessments);
    return {
      scope: "student",
      attendanceRecords: data.attendance_records.length,
      assessmentRecords: data.assessments.length,
      averageAttendance: attendanceAverage,
      averageAssessment: scoreAverage,
      interventions: data.interventions.length,
      outcomes: data.student_outcomes.length,
    };
  }
  const summary = studentAnalytics(data.students, data.attendance_records, data.assessments);
  return { scope: "college", ...summary, interventions: data.interventions.length, outcomes: data.student_outcomes.length };
}

function isPlaceholder(value) {
  return !value || /^(replace[-_]|YOUR_|<)/i.test(value.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const tokenMatch = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch || tokenMatch[1].length > 8_192) {
    return send(res, 401, { error: "Sign in before requesting insights." });
  }
  const bodyLength = Buffer.byteLength(JSON.stringify(req.body || {}), "utf8");
  if (Number(req.headers["content-length"] || 0) > MAX_BODY_BYTES || bodyLength > MAX_BODY_BYTES) {
    return send(res, 413, { error: "The request is too large." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseKey) || isPlaceholder(groqApiKey) || isServiceRoleKey(supabaseKey)) {
    return send(res, 503, { error: "Server authentication is not configured with safe public and server-only keys." });
  }
  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
      return send(res, 503, { error: "Server Supabase URL must use HTTPS." });
    }
  } catch {
    return send(res, 503, { error: "Server Supabase URL is invalid." });
  }

  let userClient;
  try {
    userClient = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
    });
  } catch {
    return send(res, 503, { error: "Server Supabase configuration is invalid." });
  }
  let user;
  try {
    const { data, error } = await userClient.auth.getUser(tokenMatch[1]);
    if (error || !data.user) return send(res, 401, { error: "Your session is invalid or expired. Sign in again." });
    user = data.user;
  } catch {
    return send(res, 502, { error: "Could not verify your Supabase session. Try again." });
  }

  let role;
  let studentId = null;
  if (user.app_metadata?.role === "admin") {
    role = "admin";
  } else {
    const { data: student, error } = await userClient
      .from("students")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error) return send(res, 403, { error: "Could not verify the student account mapping." });
    if (!student) return send(res, 403, { error: "This account is not assigned to a student record." });
    role = "student";
    studentId = student.id;
  }

  let summary;
  try {
    summary = await loadAuthorizedSummary(userClient, role, studentId);
  } catch (error) {
    return send(res, 502, { error: error.message || "Could not load authorized analytics." });
  }

  const systemPrompt = role === "student"
    ? "You are an educational learning reflection assistant. Discuss only the anonymous aggregate data provided for the signed-in student. Give a brief supportive reflection and 2 practical next steps. The measures are personal learning data even though names and IDs are excluded. Do not diagnose, infer sensitive characteristics, claim causation, or invent trends. State when data is missing and encourage the student to talk with a trusted educator."
    : "You are an educational analytics assistant. Interpret only the anonymous college-wide aggregate values provided. Give a concise, cautious summary and 2-3 practical educator follow-up ideas. Do not identify or infer individual students, diagnose anyone, claim causation, invent trends, or treat risk groups as validated predictions. State when data is missing and encourage human review.";

  try {
    const groqResponse = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${groqApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 450,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Review these non-identifying aggregate measures only:\n${JSON.stringify(summary)}` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!groqResponse.ok) return send(res, 502, { error: "The AI provider could not generate insights. Try again later." });
    const payload = await groqResponse.json();
    const insight = payload.choices?.[0]?.message?.content;
    if (typeof insight !== "string" || !insight.trim()) return send(res, 502, { error: "The AI provider returned an empty response." });
    return send(res, 200, { insight: insight.trim(), label: "AI-generated", scope: role === "student" ? "student" : "college" });
  } catch {
    return send(res, 502, { error: "The AI provider is unavailable. Try again later." });
  }
}
