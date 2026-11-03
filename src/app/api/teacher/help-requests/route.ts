import { endpoint, json, ApiError } from "@/lib/http";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const GET = endpoint(async (req) => {
  requireTeacher(req);
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  if (!["pending", "handled", "all"].includes(status))
    throw new ApiError(
      400,
      "INVALID_STATUS",
      "状态必须是pending、handled或all。",
    );
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new ApiError(400, "INVALID_PAGE", "页码无效。");
  const where = status === "all" ? {} : { status };
  const [items, total] = await prisma.$transaction([
    prisma.helpCard.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true,
        grade: true,
        studentDescription: true,
        feelingsAndNeeds: true,
        uncertainPoints: true,
        attempts: true,
        requestedHelp: true,
        status: true,
        submittedAt: true,
      },
    }),
    prisma.helpCard.count({ where }),
  ]);
  return json({ items, total, page, pageSize: 20 });
});
