"use client";
import type { ChatMode, ChatReply, Mode } from "./types";
export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(data === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }),
    });
  } catch {
    throw new ClientError(
      "网络暂时没有连上，内容已保留，请重试。",
      0,
      "NETWORK_ERROR",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new ClientError(
      result?.error?.message ?? "暂时没有完成操作，请重试。",
      response.status,
      result?.error?.code ?? "UNKNOWN",
    );
  return result as T;
}
export type Student = { sessionId: string; grade: number; mode: Mode };
export type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  recommendTeacher?: boolean;
};
const STUDENT = "mediator:student";
export function getStudent(): Student | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STUDENT) ?? "null");
    return s &&
      typeof s.sessionId === "string" &&
      Number.isInteger(s.grade) &&
      s.grade >= 1 &&
      s.grade <= 6 &&
      ["listen", "solve", "teacher"].includes(s.mode)
      ? s
      : null;
  } catch {
    return null;
  }
}
export function saveStudent(s: Student) {
  sessionStorage.setItem(STUDENT, JSON.stringify(s));
}
export async function createStudent(grade: number, mode: Mode) {
  const { sessionId } = await api<{ sessionId: string }>(
    "/api/sessions",
    "POST",
    { grade, mode },
  );
  const student = { sessionId, grade, mode };
  saveStudent(student);
  return student;
}
export function messagesKey(id: string) {
  return `mediator:messages:${id}`;
}
export function getMessages(id: string): LocalMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(messagesKey(id)) ?? "[]");
  } catch {
    return [];
  }
}
export function saveMessages(id: string, messages: LocalMessage[]) {
  sessionStorage.setItem(messagesKey(id), JSON.stringify(messages));
}
export function appendReply(reply: ChatReply): LocalMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: reply.reply,
    actions: reply.suggestedActions,
    recommendTeacher: reply.recommendTeacher,
  };
}
export type PendingMessage = {
  clientMessageId: string;
  message: string;
  mode: ChatMode;
};
export function clearStudent(id: string) {
  sessionStorage.removeItem(STUDENT);
  sessionStorage.removeItem(messagesKey(id));
  sessionStorage.removeItem(`mediator:pending:${id}`);
  sessionStorage.removeItem(`mediator:card:${id}`);
  sessionStorage.removeItem(`mediator:input:${id}`);
}
