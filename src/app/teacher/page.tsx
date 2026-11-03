import { redirect } from "next/navigation";
import { teacherLoggedIn } from "@/lib/auth";
import { TeacherDashboard } from "@/components/TeacherDashboard";
export default async function TeacherPage() {
  if (!(await teacherLoggedIn())) redirect("/teacher/login");
  return <TeacherDashboard />;
}
