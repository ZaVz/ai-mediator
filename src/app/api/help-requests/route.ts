import { randomUUID } from "node:crypto";
import {
  endpoint,
  body,
  string,
  grade,
  json,
  ApiError,
  rateLimit,
} from "@/lib/http";
import { requireStudent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CARD_FIELDS } from "@/lib/types";
export const runtime = "nodejs";
export const POST = endpoint(async (req) => {
  const data = await body(req);
  const sessionId = string(data.sessionId, "会话编号", 100);
  const session = await requireStudent(req, sessionId);
  if (grade(data.grade) !== session.grade)
    throw new ApiError(400, "GRADE_MISMATCH", "年级与当前会话不一致。");
  if (data.confirmed !== true)
    throw new ApiError(400, "CONFIRM_REQUIRED", "请先阅读并确认求助卡。");
  const fields = Object.fromEntries(
    CARD_FIELDS.map((field) => [
      field,
      string(data[field], field, 2000, field === "studentDescription"),
    ]),
  );
  const submissionId =
    data.submissionId === undefined
      ? randomUUID()
      : string(data.submissionId, "提交标识", 100);
  rateLimit(`submit:${sessionId}`, 10);
  const existing = await prisma.helpCard.findUnique({
    where: { submissionId },
  });
  if (existing && existing.sessionId !== sessionId)
    throw new ApiError(409, "SUBMISSION_CONFLICT", "请重新生成提交标识。");
  if (
    existing &&
    CARD_FIELDS.some((field) => (existing[field] ?? "") !== fields[field])
  ) {
    throw new ApiError(
      409,
      "SUBMISSION_CHANGED",
      "这次提交已经保存了原来的内容。修改后的内容未提交，请返回首页新建求助卡。",
    );
  }
  // Atomic upsert makes a network retry a single real submission, including concurrent requests.
  const card = await prisma.helpCard.upsert({
    where: { submissionId },
    update: {},
    create: {
      sessionId,
      grade: session.grade,
      submissionId,
      ...fields,
      studentDescription: fields.studentDescription,
      submittedAt: new Date(),
    },
  });
  if (card.sessionId !== sessionId)
    throw new ApiError(409, "SUBMISSION_CONFLICT", "请重新生成提交标识。");
  return json(
    { id: card.id, status: card.status, message: "已进入教师待处理列表" },
    existing ? 200 : 201,
  );
});
