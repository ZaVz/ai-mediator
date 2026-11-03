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
import { draftCard } from "@/lib/ai";
export const runtime = "nodejs";
export const POST = endpoint(async (req) => {
  const data = await body(req);
  const sessionId =
    data.sessionId === undefined
      ? undefined
      : string(data.sessionId, "会话编号", 100);
  let childGrade = grade(data.grade ?? 1);
  let texts: string[] = [];
  if (sessionId) {
    const session = await requireStudent(req, sessionId);
    childGrade = session.grade;
    rateLimit(`draft:${sessionId}`, 10);
    texts = (
      await prisma.message.findMany({
        where: { sessionId, role: "user" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
      })
    )
      .reverse()
      .map((m) => m.content);
  } else {
    // No chat is required, but an anonymous credential is required to submit.
    childGrade = grade(data.grade);
    rateLimit("draft-direct-global", 20);
  }
  if (data.studentDescription !== undefined)
    texts = [string(data.studentDescription, "求助说明", 2000)];
  if (!sessionId && !texts.length)
    throw new ApiError(400, "DESCRIPTION_REQUIRED", "请先写一句求助说明。");
  return json(await draftCard(childGrade, texts, sessionId));
});
