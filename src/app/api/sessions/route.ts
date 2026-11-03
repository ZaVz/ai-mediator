import { endpoint, body, grade, string, json, rateLimit } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hash, newCredential, studentCookie } from "@/lib/auth";
import { MODES, type Mode } from "@/lib/types";
export const runtime = "nodejs";
export const POST = endpoint(async (req) => {
  rateLimit("sessions-global", 60);
  const data = await body(req);
  const mode = string(data.mode, "模式", 20);
  if (!MODES.includes(mode as Mode))
    return json(
      {
        error: {
          code: "INVALID_MODE",
          message: "请选择倾诉、想办法或找老师。",
        },
      },
      400,
    );
  const token = newCredential();
  const session = await prisma.session.create({
    data: { grade: grade(data.grade), mode, credentialHash: hash(token) },
  });
  const response = json({ sessionId: session.id }, 201);
  studentCookie(response, session.id, token);
  return response;
});
