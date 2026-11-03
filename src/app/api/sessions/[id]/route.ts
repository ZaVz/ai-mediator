import { endpoint, protectOrigin, json } from "@/lib/http";
import { requireStudent, clearStudentCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const DELETE = endpoint(async (req, context) => {
  protectOrigin(req);
  const { id } = await context.params;
  await requireStudent(req, id);
  await prisma.session.delete({ where: { id } });
  const response = json({
    deleted: true,
    message: "本次聊天记录已删除；已提交的求助卡和安全关注消息由教师另行管理。",
  });
  clearStudentCookie(response);
  return response;
});
