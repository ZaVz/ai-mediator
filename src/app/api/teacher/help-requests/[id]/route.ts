import { endpoint, body, json, ApiError } from "@/lib/http";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const PATCH = endpoint(async (req, context) => {
  requireTeacher(req);
  const data = await body(req);
  if (data.status !== "pending" && data.status !== "handled")
    throw new ApiError(400, "INVALID_STATUS", "状态必须是pending或handled。");
  const { id } = await context.params;
  const result = await prisma.helpCard.updateMany({
    where: { id },
    data: { status: data.status },
  });
  if (!result.count) throw new ApiError(404, "NOT_FOUND", "找不到这张求助卡。");
  return json({ id, status: data.status });
});
