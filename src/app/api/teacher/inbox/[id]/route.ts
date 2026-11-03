import { endpoint, body, json, ApiError } from "@/lib/http";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const PATCH = endpoint(async (req, context) => {
  requireTeacher(req);
  const data = await body(req);
  if (!["unread", "read", "handled"].includes(data.status as string))
    throw new ApiError(400, "INVALID_STATUS", "收件箱状态无效。");
  const { id } = await context.params;
  const status = data.status as string;
  const result = await prisma.safetyAlert.updateMany({
    where: { id },
    data: {
      status,
      readAt: status === "unread" ? null : new Date(),
      handledAt: status === "handled" ? new Date() : null,
    },
  });
  if (!result.count) throw new ApiError(404, "NOT_FOUND", "消息不存在。");
  return json({ id, status });
});
