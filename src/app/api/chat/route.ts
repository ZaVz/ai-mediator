import { randomUUID } from "node:crypto";
import {
  endpoint,
  body,
  string,
  json,
  ApiError,
  exclusive,
  rateLimit,
} from "@/lib/http";
import { requireStudent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatWithSafety } from "@/lib/ai";
import { recordSafetyAlert, immediateSafetyReply } from "@/lib/safety-alerts";
import {
  needsAdultHint,
  explicitSafetySignals,
  ALERT_RECEIPT,
  ADULT_HINT,
} from "@/lib/safety";
import type { ChatMode, ChatReply } from "@/lib/types";
export const runtime = "nodejs";
export const POST = endpoint(async (req) => {
  const data = await body(req);
  const sessionId = string(data.sessionId, "会话编号", 100);
  const session = await requireStudent(req, sessionId);
  const message = string(data.message, "消息", 1000);
  const clientMessageId =
    data.clientMessageId === undefined
      ? randomUUID()
      : string(data.clientMessageId, "消息标识", 100);
  const mode =
    data.mode ?? (session.mode === "teacher" ? "listen" : session.mode);
  if (mode !== "listen" && mode !== "solve")
    throw new ApiError(400, "INVALID_MODE", "聊天模式必须是listen或solve。");
  return exclusive(`chat:${sessionId}`, async () => {
    rateLimit(`chat:${sessionId}`, 20);
    const old = await prisma.message.findUnique({
      where: {
        sessionId_clientMessageId_role: {
          sessionId,
          clientMessageId,
          role: "user",
        },
      },
    });
    if (old && old.content !== message)
      throw new ApiError(
        409,
        "MESSAGE_ID_REUSED",
        "同一个消息标识不能用于不同内容。",
      );
    const cached = await prisma.message.findUnique({
      where: {
        sessionId_clientMessageId_role: {
          sessionId,
          clientMessageId,
          role: "assistant",
        },
      },
    });
    if (cached) {
      const saved = JSON.parse(cached.content) as ChatReply;
      return json({
        reply: saved.reply,
        suggestedActions: saved.suggestedActions,
        recommendTeacher: saved.recommendTeacher,
      });
    }
    // Keep the child's message even if the provider times out. Same id can be retried.
    if (!old)
      await prisma.message.create({
        data: { sessionId, clientMessageId, role: "user", content: message },
      });
    await prisma.session.update({ where: { id: sessionId }, data: { mode } });
    // Persist explicit signals before model availability can affect reporting.
    const directSignals = explicitSafetySignals(message);
    if (directSignals.length) {
      await recordSafetyAlert(session, clientMessageId, directSignals, "rule");
      const reply = immediateSafetyReply();
      await prisma.message.create({
        data: {
          sessionId,
          clientMessageId,
          role: "assistant",
          content: JSON.stringify({ ...reply, safetySignals: directSignals }),
        },
      });
      return json(reply);
    }
    const messages = (
      await prisma.message.findMany({
        where: { sessionId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 40,
      })
    ).reverse();
    const history = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      // Assistant messages were generated as JSON. Preserve that format in
      // model history rather than teaching later turns to emit plain text.
      content:
        m.role === "assistant"
          ? JSON.stringify({
              ...JSON.parse(m.content),
              safetySignals: JSON.parse(m.content).safetySignals ?? [],
            })
          : m.content,
    }));
    const generated = await chatWithSafety(
      session.grade,
      mode as ChatMode,
      history,
    );
    const reply = generated.response;
    if (generated.safetySignals.length) {
      await recordSafetyAlert(
        session,
        clientMessageId,
        generated.safetySignals,
        "model",
      );
      reply.recommendTeacher = true;
      reply.reply += `\n${ALERT_RECEIPT}${ADULT_HINT}`;
      if (!reply.suggestedActions.includes("找老师"))
        reply.suggestedActions.push("找老师");
    }
    if (needsAdultHint(message)) {
      reply.recommendTeacher = true;
      // Even demo mode must clearly direct urgent concerns to a nearby adult.
      if (!/现在找身边/.test(reply.reply))
        reply.reply = `${reply.reply}\n如果正有危险，请现在找身边的老师或可信任成人，不要等网页处理。`;
      if (!reply.suggestedActions.includes("找老师"))
        reply.suggestedActions.push("找老师");
    }
    await prisma.message.create({
      data: {
        sessionId,
        clientMessageId,
        role: "assistant",
        content: JSON.stringify({
          ...reply,
          safetySignals: generated.safetySignals,
        }),
      },
    });
    return json(reply);
  });
});
