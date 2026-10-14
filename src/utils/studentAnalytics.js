const TABLES = [
  "students",
  "attendance_records",
  "assessments",
  "interventions",
  "student_outcomes",
];

const PAGE_SIZE = 1000;

const ATTENDANCE_PERCENT_KEYS = [
  "attendance_percentage",
  "attendance_percent",
  "attendance_rate",
  "attendance_pct",
  "attendance",
];

const SCORE_KEYS = [
  "score",
  "assessment_score",
  "exam_score",
  "percentage",
  "percent",
  "marks",
  "obtained",
  "marks_obtained",
  "obtained_marks",
  "grade_percent",
];

function valueFor(row, keys) {
  if (!row || typeof row !== "object") return undefined;
  const rowKeys = Object.keys(row);
  const normalizeKey = (key) => key.toLowerCase().replace(/[_\s-]/g, "");
  for (const key of keys) {
    const actualKey = rowKeys.find((candidate) => normalizeKey(candidate) === normalizeKey(key));
    if (actualKey && row[actualKey] !== null && row[actualKey] !== undefined) {
      return row[actualKey];
    }
  }
  return undefined;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function getStudentKeys(row) {
  return [
    "id",
    "student_id",
    "student_uuid",
    "student_code",
    "roll_number",
    "roll_no",
    "registration_number",
  ]
    .map((key) => valueFor(row, [key]))
    .filter((value) => value !== null && value !== undefined)
    .map(String);
}

function getForeignStudentKey(row) {
  return valueFor(row, [
    "student_id",
    "student_uuid",
    "student_code",
    "roll_number",
    "roll_no",
    "registration_number",
  ]);
}

function recordsForStudent(rows, studentKeys) {
  if (studentKeys.length === 0) return [];
  const keySet = new Set(studentKeys);
  return rows.filter((row) => {
    const foreignKey = getForeignStudentKey(row);
    return foreignKey !== null && foreignKey !== undefined && keySet.has(String(foreignKey));
  });
}

function attendanceValue(row) {
  const attendance = numberValue(valueFor(row, ATTENDANCE_PERCENT_KEYS));
  if (attendance !== null) return clampPercent(attendance <= 1 ? attendance * 100 : attendance);

  const attended = numberValue(valueFor(row, ["attended_classes", "classes_attended", "present_count"]));
  const total = numberValue(valueFor(row, ["total_classes", "classes_held", "class_count"]));
  if (attended !== null && total > 0) return clampPercent((attended / total) * 100);

  const present = valueFor(row, ["is_present", "present", "attendance_status", "status"]);
  if (typeof present === "boolean") return present ? 100 : 0;
  if (typeof present === "string") {
    const status = present.trim().toLowerCase();
    if (["present", "attended", "late", "true", "yes"].includes(status)) return 100;
    if (["absent", "not_attended", "false", "no"].includes(status)) return 0;
  }
  return null;
}

function assessmentValue(row) {
  const score = numberValue(valueFor(row, SCORE_KEYS));
  if (score === null) return null;
  const maximum = numberValue(valueFor(row, ["max_marks", "maximum_marks", "total_marks", "max_score"]));
  if (maximum > 0) {
    const obtained = numberValue(valueFor(row, ["marks_obtained", "obtained_marks", "score"]));
    if (obtained !== null) return clampPercent((obtained / maximum) * 100);
  }
  return clampPercent(score <= 1 ? score * 100 : score);
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function dateValue(row) {
  const value = valueFor(row, [
    "attendance_date",
    "assessment_date",
    "record_date",
    "outcome_date",
    "date",
    "created_at",
  ]);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthFrom(row) {
  const date = dateValue(row);
  if (!date) return null;
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    month: date.toLocaleString("en", { month: "short", year: "2-digit" }),
  };
}

function outcomeRetentionValue(row) {
  const outcome = valueFor(row, [
    "retention_status",
    "outcome_status",
    "status",
    "outcome",
    "outcome_type",
    "result",
  ]);
  if (typeof outcome !== "string") return null;
  const normalized = outcome.trim().toLowerCase();
  if (["retained", "continuing", "enrolled", "active"].includes(normalized)) return 100;
  if (["withdrawn", "dropped", "discontinued", "not_retained"].includes(normalized)) return 0;
  return null;
}

function normalizeRisk(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("high")) return "High";
  if (normalized.includes("medium") || normalized.includes("moderate")) return "Medium";
  if (normalized.includes("low")) return "Low";
  return null;
}

function buildMonthlyData(attendanceRows, assessmentRows, outcomeRows) {
  const months = new Map();
  const add = (row, field, value) => {
    const date = monthFrom(row);
    if (!date || value === null) return;
    const current = months.get(date.key) || { ...date, attendanceValues: [], scoreValues: [], retentionValues: [] };
    current[field].push(value);
    months.set(date.key, current);
  };

  attendanceRows.forEach((row) => add(row, "attendanceValues", attendanceValue(row)));
  assessmentRows.forEach((row) => add(row, "scoreValues", assessmentValue(row)));
  outcomeRows.forEach((row) => add(row, "retentionValues", outcomeRetentionValue(row)));

  return [...months.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([, month]) => ({
      month: month.month,
      attendance: average(month.attendanceValues),
      score: average(month.scoreValues),
      retention: average(month.retentionValues),
    }));
}

function createDepartmentData(students) {
  const departments = new Map();
  students.forEach((student) => {
    const current = departments.get(student.dept) || { name: student.dept, students: [] };
    current.students.push(student);
    departments.set(student.dept, current);
  });
  return [...departments.values()]
    .map((department) => {
      const scoredStudents = department.students.filter((student) => student.score !== null);
      const passingStudents = scoredStudents.filter((student) => student.score >= 50);
      return {
        name: department.name,
        students: department.students.length,
        pass: scoredStudents.length ? (passingStudents.length / scoredStudents.length) * 100 : null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildDashboardData(rows) {
  const attendanceRows = rows.attendance_records;
  const assessmentRows = rows.assessments;
  const interventionRows = rows.interventions;
  const outcomeRows = rows.student_outcomes;

  const students = rows.students.map((row, index) => {
    const keys = getStudentKeys(row);
    const studentAttendance = recordsForStudent(attendanceRows, keys);
    const studentAssessments = recordsForStudent(assessmentRows, keys);
    const attendance = average(studentAttendance.map(attendanceValue));
    const score = average(studentAssessments.map(assessmentValue));
    const explicitRisk = normalizeRisk(valueFor(row, [
      "risk",
      "risk_level",
      "risk_category",
      "risk_status",
      "support_priority",
    ]));
    const risk = explicitRisk || (
      attendance === null && score === null
        ? "Unknown"
        : attendance !== null && attendance < 65 || score !== null && score < 50
          ? "High"
          : attendance !== null && attendance < 75 || score !== null && score < 65
            ? "Medium"
            : "Low"
    );
    const identifier = valueFor(row, [
      "student_id",
      "student_code",
      "roll_number",
      "roll_no",
      "registration_number",
      "id",
    ]);
    const firstName = valueFor(row, ["first_name", "firstname", "given_name"]);
    const lastName = valueFor(row, ["last_name", "lastname", "family_name"]);
    const name = valueFor(row, ["full_name", "student_name", "name"]) ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      `Student ${index + 1}`;
    const department = valueFor(row, ["department", "department_name", "dept", "program", "course", "major"]);

    return {
      id: identifier === null || identifier === undefined ? `student-${index + 1}` : String(identifier),
      name: String(name),
      dept: department ? String(department) : "Unassigned",
      attendance,
      score,
      risk,
      keys,
      interventionCount: recordsForStudent(interventionRows, keys).length,
    };
  });

  const riskCounts = ["Low", "Medium", "High"].map((risk) => ({
    name: `${risk} risk`,
    count: students.filter((student) => student.risk === risk).length,
    color: risk === "Low" ? "#39c6a5" : risk === "Medium" ? "#f3b64b" : "#f07187",
  }));
  const categorizedCount = riskCounts.reduce((sum, risk) => sum + risk.count, 0);
  const riskData = riskCounts.map(({ name, count, color }) => ({
    name,
    value: categorizedCount ? (count / categorizedCount) * 100 : 0,
    color,
  }));

  const attendanceValues = students.map((student) => student.attendance);
  const retentionValues = students.map((student) => {
    const outcomes = recordsForStudent(outcomeRows, student.keys);
    const latestOutcome = outcomes.reduce((latest, outcome) => {
      const latestDate = dateValue(latest)?.getTime() ?? Number.NEGATIVE_INFINITY;
      const outcomeDate = dateValue(outcome)?.getTime() ?? Number.NEGATIVE_INFINITY;
      return outcomeDate >= latestDate ? outcome : latest;
    }, null);
    return latestOutcome ? outcomeRetentionValue(latestOutcome) : null;
  });
  const interventionCount = interventionRows.filter((row) => {
    const status = valueFor(row, ["status", "intervention_status", "state"]);
    return typeof status !== "string" || !["completed", "closed", "resolved", "cancelled"].includes(status.toLowerCase());
  }).length;

  return {
    students,
    performance: buildMonthlyData(attendanceRows, assessmentRows, outcomeRows),
    departments: createDepartmentData(students),
    riskData,
    metrics: {
      totalStudents: students.length,
      averageAttendance: average(attendanceValues),
      activeInterventions: interventionCount,
      retentionRate: average(retentionValues),
      categorizedStudents: categorizedCount,
    },
    interventionRows,
  };
}

async function fetchAllRows(client, table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function loadDashboardData(client) {
  const results = await Promise.all(
    TABLES.map(async (table) => [table, await fetchAllRows(client, table)])
  );
  return buildDashboardData(Object.fromEntries(results));
}
