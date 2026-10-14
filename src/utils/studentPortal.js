const STUDENT_TABLES = [
  "attendance_records",
  "assessments",
  "interventions",
  "student_outcomes",
  "student_timetables",
  "student_fees",
  "leave_requests",
  "support_requests",
  "student_goals",
  "student_goal_tasks",
  "student_skills",
  "journey_events",
  "study_plans",
  "study_tasks",
  "risk_assessments",
  "mentor_conversations",
  "notifications",
];

export async function resolveUserAccess(client, user) {
  if (user.app_metadata?.role === "admin") {
    return { role: "admin" };
  }

  if (user.app_metadata?.role === "faculty") {
    const { data: assignments, error: assignmentError } = await client
      .from("faculty_assignments")
      .select("id")
      .eq("faculty_user_id", user.id)
      .eq("is_active", true)
      .limit(1);

    if (assignmentError) {
      throw new Error(`Could not verify your faculty assignments: ${assignmentError.message}`);
    }

    if (assignments?.length) return { role: "faculty" };
    return { role: "unassigned" };
  }

  const { data: student, error } = await client
    .from("students")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify your student account: ${error.message}`);
  }

  if (!student) return { role: "unassigned" };
  return { role: "student", student };
}

export async function loadStudentRecords(client, student) {
  const results = await Promise.all(
    STUDENT_TABLES.map(async (table) => {
      let query = client.from(table).select("*").eq("student_id", student.id);

      if (table === "student_timetables") {
        query = query.eq("published", true);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Could not load your ${table.replaceAll("_", " ")}: ${error.message}`);
      return [table, data || []];
    })
  );

  const { data: announcements, error: announcementError } = await client
    .from("announcements")
    .select("*")
    .eq("published", true)
    .lte("publish_at", new Date().toISOString());
  if (announcementError) throw new Error(`Could not load announcements: ${announcementError.message}`);

  results.push(["announcements", announcements || []]);
  return Object.fromEntries(results);
}
