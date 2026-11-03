import { redirect } from "next/navigation";
import { teacherLoggedIn } from "@/lib/auth";
import { TeacherInbox } from "@/components/TeacherInbox";
export default async function TeacherInboxPage() {
  if (!(await teacherLoggedIn())) redirect("/teacher/login");
  return <TeacherInbox />;
}
