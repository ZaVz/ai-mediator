import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function freePort() {
  const s = createServer();
  const port = await listen(s);
  await new Promise((resolve) => s.close(resolve));
  return port;
}
async function startApp(t, databaseUrl, ai = {}) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: databaseUrl,
        TEACHER_PASSWORD: "integration-test-only-password",
        AI_API_KEY: "",
        AI_BASE_URL: "",
        AI_MODEL: "",
        DEMO_MODE: "false",
        ...ai,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (b) => {
    logs += b.toString();
  });
  child.stderr.on("data", (b) => {
    logs += b.toString();
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server failed: ${logs}`);
    try {
      if ((await fetch(base)).ok) return { base, child };
    } catch {
      /* Wait for readiness. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not start: ${logs}`);
}
function client(base) {
  const cookies = new Map();
  return async (path, method = "GET", data, extra = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    for (const c of response.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      cookies.set(k, v);
    }
    const value = await response.text();
    let body;
    try {
      body = JSON.parse(value);
    } catch {
      body = value;
    }
    return { status: response.status, headers: response.headers, body };
  };
}

test(
  "anonymous sessions, real submissions, teacher authentication and compatible AI",
  { timeout: 120000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "ai-mediator-api-"));
    const databaseUrl = `file:${join(dir, "test.db")}`;
    const migrated = spawnSync(
      process.execPath,
      ["scripts/prisma.mjs", "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
      },
    );
    assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    t.after(async () => {
      await db.$disconnect();
      await rm(dir, { recursive: true, force: true });
    });

    await t.test(
      "demo flow saves cards, rejects ID swapping, and retains cards after chat deletion",
      async (t) => {
        const { base } = await startApp(t, databaseUrl);
        const student = client(base),
          stranger = client(base),
          teacher = client(base);
        assert.equal((await teacher("/api/teacher/help-requests")).status, 401);
        const page = await teacher("/teacher");
        assert.equal(page.status, 307);
        assert.equal(page.headers.get("location"), "/teacher/login");
        assert.equal(
          (await student("/api/sessions", "POST", { grade: 0, mode: "listen" }))
            .status,
          400,
        );
        assert.equal(
          (
            await student(
              "/api/sessions",
              "POST",
              { grade: 3, mode: "listen" },
              { Origin: "https://another.example" },
            )
          ).status,
          403,
        );
        const created = await student(
          "/api/sessions",
          "POST",
          { grade: 3, mode: "listen" },
          { Origin: base },
        );
        assert.equal(created.status, 201);
        assert.match(created.headers.get("set-cookie"), /HttpOnly/i);
        const sessionId = created.body.sessionId;
        const record = await db.session.findUniqueOrThrow({
          where: { id: sessionId },
        });
        assert.match(record.credentialHash, /^[a-f0-9]{64}$/);
        await stranger("/api/sessions", "POST", { grade: 2, mode: "teacher" });
        for (const [path, method, data] of [
          ["/api/chat", "POST", { sessionId, message: "编号并不是凭证" }],
          ["/api/help-card/draft", "POST", { sessionId }],
          [`/api/sessions/${sessionId}`, "DELETE", undefined],
          [
            "/api/help-requests",
            "POST",
            {
              sessionId,
              grade: 3,
              studentDescription: "借用编号",
              confirmed: true,
            },
          ],
        ])
          assert.equal((await stranger(path, method, data)).status, 401);
        const message = {
          sessionId,
          message: "我想说一说",
          clientMessageId: randomUUID(),
        };
        const reply = await student("/api/chat", "POST", message);
        assert.equal(reply.status, 200);
        assert.match(
          reply.body.reply,
          /演示模式：这是固定示例回复，不是模型真实回复/,
        );
        assert.equal(reply.body.recommendTeacher, false);
        assert.deepEqual(
          (await student("/api/chat", "POST", message)).body,
          reply.body,
        );
        assert.equal(await db.message.count({ where: { sessionId } }), 2);
        assert.equal(
          (
            await student("/api/chat", "POST", {
              ...message,
              message: "改变原消息",
            })
          ).status,
          409,
        );
        const urgent = await student("/api/chat", "POST", {
          sessionId,
          message: "我受伤流血了",
          clientMessageId: randomUUID(),
        });
        assert.equal(urgent.body.recommendTeacher, true);
        assert.match(urgent.body.reply, /现在找身边/);
        const drafted = await student("/api/help-card/draft", "POST", {
          sessionId,
        });
        assert.equal(drafted.status, 200);
        assert.equal(drafted.body.draft.attempts, "");
        assert.equal(await db.helpCard.count(), 0);
        const card = {
          sessionId,
          grade: 3,
          studentDescription: "请老师帮我",
          confirmed: true,
          submissionId: randomUUID(),
        };
        assert.equal(
          (
            await student("/api/help-requests", "POST", {
              ...card,
              confirmed: false,
            })
          ).status,
          400,
        );
        const submitted = await student("/api/help-requests", "POST", card);
        assert.equal(submitted.status, 201);
        assert.equal(submitted.body.message, "已进入教师待处理列表");
        const replay = await Promise.all([
          student("/api/help-requests", "POST", card),
          student("/api/help-requests", "POST", card),
        ]);
        assert(replay.every((r) => r.body.id === submitted.body.id));
        assert.equal(await db.helpCard.count(), 1);
        assert.equal(
          (
            await student(
              `/api/teacher/help-requests/${submitted.body.id}`,
              "PATCH",
              { status: "handled" },
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await teacher("/api/teacher/login", "POST", {
              password: "incorrect",
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await teacher("/api/teacher/login", "POST", {
              password: "integration-test-only-password",
            })
          ).status,
          200,
        );
        const list = await teacher("/api/teacher/help-requests?status=pending");
        assert.equal(list.body.total, 1);
        assert.equal(list.body.items[0].studentDescription, "请老师帮我");
        assert(!("sessionId" in list.body.items[0]));
        assert(!("submissionId" in list.body.items[0]));
        assert.equal(
          (
            await teacher(
              `/api/teacher/help-requests/${submitted.body.id}`,
              "PATCH",
              { status: "handled" },
            )
          ).status,
          200,
        );
        assert.equal(
          (await teacher("/api/teacher/help-requests?status=handled")).body
            .total,
          1,
        );
        assert.equal(
          (await student(`/api/sessions/${sessionId}`, "DELETE")).status,
          200,
        );
        assert.equal(await db.message.count({ where: { sessionId } }), 0);
        const retained = await db.helpCard.findUniqueOrThrow({
          where: { id: submitted.body.id },
        });
        assert.equal(retained.sessionId, null);
        assert.equal(retained.studentDescription, card.studentDescription);
        assert.equal(
          (await student("/api/help-requests", "POST", card)).status,
          401,
        );
        assert.equal(
          (await teacher("/api/teacher/login", "DELETE")).status,
          200,
        );
        assert.equal((await teacher("/api/teacher/help-requests")).status, 401);
        const direct = client(base);
        const directSession = (
          await direct("/api/sessions", "POST", { grade: 1, mode: "teacher" })
        ).body.sessionId;
        const directDraft = await direct("/api/help-card/draft", "POST", {
          sessionId: directSession,
          studentDescription: "我想找老师",
        });
        assert.equal(directDraft.body.draft.studentDescription, "我想找老师");
        const directCard = await direct("/api/help-requests", "POST", {
          sessionId: directSession,
          grade: 1,
          studentDescription: "我想找老师",
          confirmed: true,
        });
        assert.equal(directCard.status, 201);
        assert.equal(
          await db.message.count({ where: { sessionId: directSession } }),
          0,
        );
      },
    );

    await t.test(
      "model failure retains text; retry deduplicates; draft rejects invented facts",
      async (t) => {
        const requests = [];
        const occurrences = new Map();
        let failedOnce = false;
        const provider = createServer(async (req, res) => {
          let text = "";
          for await (const chunk of req) text += chunk;
          const payload = JSON.parse(text);
          requests.push(payload);
          assert.equal(req.url, "/v1/chat/completions");
          const latest = payload.messages.at(-1).content;
          const count = (occurrences.get(latest) ?? 0) + 1;
          occurrences.set(latest, count);
          const statuses = {
            AUTH_FAIL: 401,
            BALANCE_FAIL: 402,
            LIMIT_FAIL: 429,
          };
          if (statuses[latest]) {
            res.writeHead(statuses[latest]);
            res.end("DO_NOT_EXPOSE_UPSTREAM_BODY");
            return;
          }
          if (latest.includes("FAIL_ONCE") && !failedOnce) {
            failedOnce = true;
            res.writeHead(503);
            res.end("provider failure");
            return;
          }
          let result;
          if (
            latest === "ALWAYS_EMPTY" ||
            (latest === "EMPTY_ONCE" && count === 1)
          ) {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                choices: [
                  { finish_reason: "stop", message: { content: "   " } },
                ],
              }),
            );
            return;
          }
          if (latest === "JSON_ONCE" && count === 1) {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                choices: [
                  { finish_reason: "stop", message: { content: "not json" } },
                ],
              }),
            );
            return;
          }
          if (latest === "TRUNCATED_ONCE" && count === 1) {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                choices: [
                  {
                    finish_reason: "length",
                    message: { content: '{"reply":' },
                  },
                ],
              }),
            );
            return;
          }
          if (payload.messages[0].content.includes("摘录式摘要"))
            result = {
              studentDescription: "孩子从未说过的事实",
              feelingsAndNeeds: "",
              uncertainPoints: "",
              attempts: "孩子已经道歉",
              requestedHelp: "请老师帮忙",
            };
          else if (
            latest === "BAD_FORMAT" ||
            (latest === "SCHEMA_ONCE" && count === 1)
          )
            result = {
              reply: "你为什么这样？你做了什么？",
              suggestedActions: ["继续说"],
              recommendTeacher: false,
            };
          else
            result = {
              reply: "我愿意听你说。你可以慢慢说。",
              suggestedActions: ["继续说", "找老师"],
              recommendTeacher: false,
            };
          if (!payload.messages[0].content.includes("摘录式摘要")) {
            result.safetySignals = latest.includes("MODEL_CONTEXT")
              ? [
                  {
                    category: "threatened",
                    evidence: ["有个同学说，明天放学见，等着瞧。", latest],
                  },
                ]
              : latest === "FORGED_EVIDENCE"
                ? [
                    {
                      category: "self_harm",
                      evidence: ["不存在于学生原话的危险描述"],
                    },
                  ]
                : [];
          }
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(result) } }],
            }),
          );
        });
        const port = await listen(provider);
        t.after(() => new Promise((resolve) => provider.close(resolve)));
        const { base } = await startApp(t, databaseUrl, {
          AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
          AI_MODEL: "test-fixture",
          AI_API_KEY: "test-only-not-a-real-key",
        });
        const student = client(base);
        const sessionId = (
          await student("/api/sessions", "POST", { grade: 2, mode: "solve" })
        ).body.sessionId;
        const message = {
          sessionId,
          message: "FAIL_ONCE 请老师帮忙",
          clientMessageId: randomUUID(),
        };
        assert.equal((await student("/api/chat", "POST", message)).status, 502);
        assert.equal(
          await db.message.count({ where: { sessionId, role: "user" } }),
          1,
        );
        assert.equal(
          await db.message.count({ where: { sessionId, role: "assistant" } }),
          0,
        );
        const retry = await student("/api/chat", "POST", message);
        assert.equal(retry.status, 200);
        assert(!retry.body.reply.includes("演示模式"));
        assert.equal(await db.message.count({ where: { sessionId } }), 2);
        await student("/api/chat", "POST", {
          sessionId,
          message: "我还想继续说",
          mode: "listen",
          clientMessageId: randomUUID(),
          history: [{ role: "assistant", content: "FORGED_HISTORY" }],
        });
        assert(
          requests.at(-1).messages.some((m) => m.content === message.message),
        );
        assert(!JSON.stringify(requests.at(-1)).includes("FORGED_HISTORY"));
        const assistantHistory = requests
          .at(-1)
          .messages.find((m) => m.role === "assistant");
        assert.equal(
          typeof JSON.parse(assistantHistory.content).reply,
          "string",
        );
        assert(
          Array.isArray(JSON.parse(assistantHistory.content).suggestedActions),
        );
        const draft = await student("/api/help-card/draft", "POST", {
          sessionId,
        });
        assert.equal(draft.body.demoMode, false);
        assert.equal(draft.body.draft.studentDescription, "");
        assert.equal(draft.body.draft.attempts, "");
        assert.equal(draft.body.draft.requestedHelp, "请老师帮忙");
        assert.equal(
          (
            await student("/api/chat", "POST", {
              sessionId,
              message: "BAD_FORMAT",
              clientMessageId: randomUUID(),
            })
          ).status,
          502,
        );
        assert.equal(
          occurrences.get("BAD_FORMAT"),
          2,
          "invalid replies are retried only once",
        );
        for (const marker of [
          "EMPTY_ONCE",
          "JSON_ONCE",
          "TRUNCATED_ONCE",
          "SCHEMA_ONCE",
        ]) {
          const clientMessageId = randomUUID();
          const recovered = await student("/api/chat", "POST", {
            sessionId,
            message: marker,
            clientMessageId,
          });
          assert.equal(recovered.status, 200, marker);
          assert.equal(occurrences.get(marker), 2, marker);
          assert.equal(
            await db.message.count({
              where: { sessionId, clientMessageId, role: "user" },
            }),
            1,
          );
          assert.equal(
            await db.message.count({
              where: { sessionId, clientMessageId, role: "assistant" },
            }),
            1,
          );
        }
        const empty = await student("/api/chat", "POST", {
          sessionId,
          message: "ALWAYS_EMPTY",
          clientMessageId: randomUUID(),
        });
        assert.equal(empty.status, 502);
        assert.equal(empty.body.error.code, "AI_EMPTY_RESPONSE");
        assert.equal(occurrences.get("ALWAYS_EMPTY"), 2);
        for (const [marker, code] of [
          ["AUTH_FAIL", "AI_AUTH_FAILED"],
          ["BALANCE_FAIL", "AI_BALANCE_REQUIRED"],
          ["LIMIT_FAIL", "AI_RATE_LIMITED"],
        ]) {
          const failure = await student("/api/chat", "POST", {
            sessionId,
            message: marker,
            clientMessageId: randomUUID(),
          });
          assert.equal(failure.status, 502);
          assert.equal(failure.body.error.code, code);
          assert.equal(
            occurrences.get(marker),
            1,
            "do not automatically retry account or rate errors",
          );
          assert(
            !JSON.stringify(failure.body).includes(
              "DO_NOT_EXPOSE_UPSTREAM_BODY",
            ),
          );
        }
        const beforeDirect = requests.length;
        const directId = randomUUID();
        const direct = await student("/api/chat", "POST", {
          sessionId,
          message: "我现在想伤害自己",
          clientMessageId: directId,
        });
        assert.equal(direct.status, 200);
        assert(direct.body.reply.includes("已保存到教师收件箱"));
        assert.equal(
          requests.length,
          beforeDirect,
          "explicit reporting must not wait for the provider",
        );
        const startContext = "有个同学说，明天放学见，等着瞧。";
        assert.equal(
          (
            await student("/api/chat", "POST", {
              sessionId,
              message: startContext,
              clientMessageId: randomUUID(),
            })
          ).status,
          200,
        );
        const contextId = randomUUID();
        const contextual = await student("/api/chat", "POST", {
          sessionId,
          message: "MODEL_CONTEXT 他今天又来了，我很害怕。",
          clientMessageId: contextId,
        });
        assert.equal(contextual.status, 200);
        assert.equal(contextual.body.recommendTeacher, true);
        assert(
          !("safetySignals" in contextual.body),
          "internal assessment must not change public chat format",
        );
        const contextualRecord = await db.safetyAlert.findUniqueOrThrow({
          where: {
            conversationRef_clientMessageId: {
              conversationRef: sessionId,
              clientMessageId: contextId,
            },
          },
        });
        assert.equal(contextualRecord.source, "model");
        assert(
          JSON.parse(contextualRecord.signalsJson)[0].evidence.includes(
            startContext,
          ),
        );
        const beforeForged = await db.safetyAlert.count();
        assert.equal(
          (
            await student("/api/chat", "POST", {
              sessionId,
              message: "FORGED_EVIDENCE",
              clientMessageId: randomUUID(),
            })
          ).status,
          502,
        );
        assert.equal(
          await db.safetyAlert.count(),
          beforeForged,
          "invented evidence cannot create an inbox message",
        );
      },
    );

    await t.test(
      "safety inbox reports explicit signals without consent or model, with auth and deduplication",
      async (t) => {
        const { base } = await startApp(t, databaseUrl);
        const student = client(base),
          teacher = client(base),
          stranger = client(base);
        assert.equal((await teacher("/api/teacher/inbox")).status, 401);
        assert.equal(
          (await stranger("/api/teacher/inbox?summary=1")).status,
          401,
        );
        const created = await student("/api/sessions", "POST", {
          grade: 4,
          mode: "listen",
        });
        const sessionId = created.body.sessionId;
        const before = await db.safetyAlert.count();
        const cases = [
          ["我不想活了", "self_harm"],
          ["有人威胁我，不许我告诉老师", "threatened"],
          ["他们每天都打我", "repeated_harm"],
          ["我要报复社会", "harm_others"],
        ];
        const alertIds = [];
        for (const [message, category] of cases) {
          const clientMessageId = randomUUID();
          const result = await student("/api/chat", "POST", {
            sessionId,
            message,
            clientMessageId,
          });
          assert.equal(result.status, 200, message);
          assert.equal(result.body.recommendTeacher, true);
          assert(result.body.reply.includes("已保存到教师收件箱"));
          assert(result.body.reply.includes("不能确认老师是否看到"));
          const record = await db.safetyAlert.findUniqueOrThrow({
            where: {
              conversationRef_clientMessageId: {
                conversationRef: sessionId,
                clientMessageId,
              },
            },
          });
          alertIds.push(record.id);
          assert.equal(JSON.parse(record.signalsJson)[0].category, category);
          assert(
            JSON.parse(record.signalsJson)[0].evidence.every((e) =>
              message.includes(e),
            ),
          );
          assert.equal(
            (
              await student("/api/teacher/inbox/" + record.id, "PATCH", {
                status: "handled",
              })
            ).status,
            401,
          );
          const replay = await student("/api/chat", "POST", {
            sessionId,
            message,
            clientMessageId,
          });
          assert.deepEqual(replay.body, result.body);
          assert(!("safetySignals" in replay.body));
        }
        assert.equal(await db.safetyAlert.count(), before + 4);
        assert.equal(
          await db.helpCard.count({ where: { sessionId } }),
          0,
          "automatic inbox does not submit a help card",
        );
        for (const message of [
          "我很难过，老师讲的课我听不懂",
          "我不想伤害自己",
          "我没有想伤害别人",
          "我不想报复社会",
          "没有人威胁我",
          "课文里讨论了报复社会",
          "电影里坏人说我要报复社会",
          "同学没有每天打我",
        ]) {
          assert.equal(
            (
              await student("/api/chat", "POST", {
                sessionId,
                message,
                clientMessageId: randomUUID(),
              })
            ).status,
            200,
            message,
          );
        }
        assert.equal(
          await db.safetyAlert.count(),
          before + 4,
          "ordinary emotions, denial and fictional quotes are not reports",
        );
        assert.equal(
          (
            await teacher("/api/teacher/login", "POST", {
              password: "integration-test-only-password",
            })
          ).status,
          200,
        );
        const inbox = await teacher("/api/teacher/inbox?status=unread");
        for (const id of alertIds) {
          assert(inbox.body.items.some((item) => item.id === id));
        }
        const item = inbox.body.items.find((item) => item.id === alertIds[0]);
        assert.equal(item.grade, 4);
        assert.equal(typeof item.conversationCode, "string");
        assert(!("sessionId" in item));
        assert(!("credentialHash" in item));
        assert(!("messages" in item));
        const summary = await teacher("/api/teacher/inbox?summary=1");
        assert(summary.body.unreadCount >= 4);
        assert.equal(
          (
            await teacher("/api/teacher/inbox/" + alertIds[0], "PATCH", {
              status: "read",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await teacher("/api/teacher/inbox/" + alertIds[0], "PATCH", {
              status: "handled",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await teacher("/api/teacher/inbox/" + alertIds[0], "PATCH", {
              status: "unsafe",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await teacher("/api/teacher/inbox/not-found", "PATCH", {
              status: "read",
            })
          ).status,
          404,
        );
        assert.equal(
          (await student("/api/sessions/" + sessionId, "DELETE")).status,
          200,
        );
        const retained = await db.safetyAlert.findUniqueOrThrow({
          where: { id: alertIds[0] },
        });
        assert.equal(retained.sessionId, null);
        assert.equal(retained.status, "handled");
        assert.equal(retained.conversationRef, sessionId);
        assert.equal(await db.message.count({ where: { sessionId } }), 0);
      },
    );

    await t.test(
      "teacher remains closed when password is not configured",
      async (t) => {
        const { base } = await startApp(t, databaseUrl, {
          TEACHER_PASSWORD: "",
        });
        const user = client(base);
        assert.equal(
          (await user("/api/teacher/login", "POST", { password: "anything" }))
            .status,
          503,
        );
        assert.equal((await user("/api/teacher/help-requests")).status, 401);
      },
    );
  },
);
