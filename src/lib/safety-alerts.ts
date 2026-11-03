import "server-only";
import { prisma } from "./prisma";
import { ApiError } from "./http";
import { ADULT_HINT, ALERT_RECEIPT } from "./safety";
import type { ChatReply, SafetySignal } from "./types";
import { DEMO_NOTICE, isDemoMode } from "./ai";

export async function recordSafetyAlert(
  session: { id: string; grade: number },
  clientMessageId: string,
  signals: SafetySignal[],
  source: "rule" | "model",
) {
  if (!signals.length) return false;
  try {
    await prisma.safetyAlert.upsert({
      where: {
        conversationRef_clientMessageId: {
          conversationRef: session.id,
          clientMessageId,
        },
      },
      update: {},
      create: {
        sessionId: session.id,
        conversationRef: session.id,
        clientMessageId,
        grade: session.grade,
        signalsJson: JSON.stringify(signals),
        source,
      },
    });
    return true;
  } catch {
    throw new ApiError(
      503,
      "ALERT_NOT_SAVED",
      "安全关注消息未保存成功。请现在找身边的老师或可信任成人，不要等待网页处理；你的原话已保留。",
    );
  }
}

export function immediateSafetyReply(): ChatReply {
  return {
    reply: `${isDemoMode() ? `${DEMO_NOTICE}。` : ""}安全提示：你说的情况需要身边成人帮助。${ALERT_RECEIPT}${ADULT_HINT}`,
    suggestedActions: ["找老师", "继续说", "结束对话"],
    recommendTeacher: true,
  };
}
