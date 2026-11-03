import {
  endpoint,
  body,
  string,
  json,
  rateLimit,
  protectOrigin,
} from "@/lib/http";
import { loginTeacher, clearTeacherCookie } from "@/lib/auth";
export const runtime = "nodejs";
export const POST = endpoint(async (req) => {
  rateLimit("teacher-login-global", 10);
  const data = await body(req);
  const response = json({ ok: true });
  string(data.password, "密码", 256);
  loginTeacher(data.password as string, response);
  return response;
});
export const DELETE = endpoint(async (req) => {
  protectOrigin(req);
  const response = json({ ok: true });
  clearTeacherCookie(response);
  return response;
});
