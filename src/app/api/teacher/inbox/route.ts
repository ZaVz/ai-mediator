import { endpoint, json, ApiError } from "@/lib/http";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conversationCode } from "@/lib/types";
export const runtime = "nodejs";
export const GET = endpoint(async (req) => {
  requireTeacher(req);
  if (req.nextUrl.searchParams.get("summary") === "1")
    return json({
      unreadCount: await prisma.safetyAlert.count({
        where: { status: "unread" },
      }),
    });
  const status = req.nextUrl.searchParams.get("status") ?? "all";
  if (!["unread", "read", "handled", "all"].includes(status))
    throw new ApiError(400, "INVALID_STATUS", "收件箱状态无效。");
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new ApiError(400, "INVALID_PAGE", "页码无效。");
  const where = status === "all" ? {} : { status };
  const [rows, total, unreadCount] = await prisma.$transaction([
    prisma.safetyAlert.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true,
        conversationRef: true,
        grade: true,
        signalsJson: true,
        source: true,
        status: true,
        createdAt: true,
        readAt: true,
        handledAt: true,
      },
    }),
    prisma.safetyAlert.count({ where }),
    prisma.safetyAlert.count({ where: { status: "unread" } }),
  ]);
  return json({
    items: rows.map(({ conversationRef, signalsJson, ...row }) => ({
      ...row,
      conversationCode: conversationCode(conversationRef),
      signals: JSON.parse(signalsJson),
    })),
    total,
    unreadCount,
    page,
    pageSize: 20,
  });
});
