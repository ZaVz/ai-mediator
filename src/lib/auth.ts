import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { ApiError } from "./http";
const STUDENT_COOKIE = "mediator_student";
const TEACHER_COOKIE = "mediator_teacher";
const options = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function equal(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export function newCredential() {
  return randomBytes(32).toString("hex");
}
export function studentCookie(
  response: NextResponse,
  id: string,
  token: string,
) {
  response.cookies.set(STUDENT_COOKIE, `${id}.${token}`, {
    ...options,
    maxAge: 60 * 60 * 24,
  });
}
export function clearStudentCookie(response: NextResponse) {
  response.cookies.set(STUDENT_COOKIE, "", { ...options, maxAge: 0 });
}
export async function requireStudent(req: NextRequest, id: string) {
  const parts = req.cookies.get(STUDENT_COOKIE)?.value.split(".");
  if (!parts || parts.length !== 2 || parts[0] !== id)
    throw new ApiError(
      401,
      "SESSION_REQUIRED",
      "会话已失效，请返回首页重新开始。",
    );
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session || !equal(session.credentialHash, hash(parts[1])))
    throw new ApiError(
      401,
      "SESSION_REQUIRED",
      "会话已失效，请返回首页重新开始。",
    );
  if (Date.now() - session.createdAt.getTime() > 86400000)
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "会话已过期，请返回首页重新开始。",
    );
  return session;
}
function teacherPassword() {
  const password = process.env.TEACHER_PASSWORD;
  if (!password || password.length < 12)
    throw new ApiError(
      503,
      "TEACHER_NOT_CONFIGURED",
      "教师入口未配置，请设置至少12位的教师密码。",
    );
  return password;
}
function sign(payload: string) {
  return createHmac("sha256", hash(`mediator-teacher:${teacherPassword()}`))
    .update(payload)
    .digest("hex");
}
export function loginTeacher(password: string, response: NextResponse) {
  if (!equal(password, teacherPassword()))
    throw new ApiError(401, "BAD_PASSWORD", "密码不正确，请重试。");
  const payload = `${Date.now() + 8 * 3600000}.${newCredential()}`;
  response.cookies.set(TEACHER_COOKIE, `${payload}.${sign(payload)}`, {
    ...options,
    maxAge: 8 * 3600,
  });
}
export function validTeacher(value?: string): boolean {
  if (!value) return false;
  try {
    const [expiry, nonce, signature, extra] = value.split(".");
    return (
      !extra &&
      !!nonce &&
      !!signature &&
      Number(expiry) > Date.now() &&
      equal(signature, sign(`${expiry}.${nonce}`))
    );
  } catch {
    return false;
  }
}
export function requireTeacher(req: NextRequest) {
  if (!validTeacher(req.cookies.get(TEACHER_COOKIE)?.value))
    throw new ApiError(401, "TEACHER_LOGIN_REQUIRED", "请先登录教师页面。");
}
export async function teacherLoggedIn() {
  return validTeacher((await cookies()).get(TEACHER_COOKIE)?.value);
}
export function clearTeacherCookie(response: NextResponse) {
  response.cookies.set(TEACHER_COOKIE, "", { ...options, maxAge: 0 });
}
