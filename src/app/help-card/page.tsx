"use client";
import { useEffect, useState } from "react";
import { HelpCardForm } from "@/components/HelpCardForm";
import { getMessages, getStudent, type Student } from "@/lib/client";
export default function HelpCardPage() {
  const [ready, setReady] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [description, setDescription] = useState("");
  useEffect(() => {
    const s = getStudent();
    setStudent(s);
    if (s)
      setDescription(
        getMessages(s.sessionId)
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n")
          .slice(0, 2000),
      );
    setReady(true);
  }, []);
  if (!ready) return <p role="status">正在打开求助卡……</p>;
  return <HelpCardForm student={student} initialDescription={description} />;
}
