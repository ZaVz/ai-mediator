"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  appendReply,
  clearStudent,
  getMessages,
  getStudent,
  saveMessages,
  saveStudent,
  type LocalMessage,
  type PendingMessage,
  type Student,
} from "@/lib/client";
import { conversationCode, type ChatMode, type ChatReply } from "@/lib/types";
import { needsAdultHint, ADULT_HINT, SAFETY_DISCLOSURE } from "@/lib/safety";
export function ChatWindow() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [mode, setMode] = useState<ChatMode>("listen");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<PendingMessage | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const s = getStudent();
    setStudent(s);
    if (s) {
      setMode(s.mode === "solve" ? "solve" : "listen");
      setMessages(getMessages(s.sessionId));
      setInput(sessionStorage.getItem(`mediator:input:${s.sessionId}`) ?? "");
      try {
        const pending = JSON.parse(
          sessionStorage.getItem(`mediator:pending:${s.sessionId}`) ?? "null",
        );
        if (pending) {
          setFailed(pending);
          setError("上一条消息还没有确认回复，可以重试。");
        }
      } catch {
        /* Invalid browser cache is ignored. */
      }
    }
    setReady(true);
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  function updateMessages(next: LocalMessage[]) {
    setMessages(next);
    if (student) saveMessages(student.sessionId, next);
  }
  function updateInput(value: string) {
    setInput(value);
    if (student)
      sessionStorage.setItem(`mediator:input:${student.sessionId}`, value);
  }
  function switchMode(next: ChatMode) {
    setMode(next);
    if (student) {
      const s = { ...student, mode: next };
      setStudent(s);
      saveStudent(s);
    }
  }
  async function send(pending?: PendingMessage) {
    if (!student || inFlight.current || (!pending && (!input.trim() || failed)))
      return;
    const p = pending ?? {
      clientMessageId: crypto.randomUUID(),
      message: input.trim(),
      mode,
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    if (!pending) {
      updateMessages([
        ...messages,
        { id: p.clientMessageId, role: "user", content: p.message },
      ]);
      updateInput("");
    }
    sessionStorage.setItem(
      `mediator:pending:${student.sessionId}`,
      JSON.stringify(p),
    );
    try {
      const reply = await api<ChatReply>("/api/chat", "POST", {
        sessionId: student.sessionId,
        ...p,
      });
      // Read cache to include the user message just written before awaiting.
      updateMessages([...getMessages(student.sessionId), appendReply(reply)]);
      setFailed(null);
      sessionStorage.removeItem(`mediator:pending:${student.sessionId}`);
    } catch (err) {
      setError((err as Error).message);
      setFailed(p);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function act(action: string) {
    if (action === "找老师") router.push("/help-card");
    else if (action === "结束对话") router.push("/");
    else {
      if (action === "想办法") switchMode("solve");
      inputRef.current?.focus();
    }
  }
  async function remove() {
    if (
      !student ||
      busy ||
      !window.confirm(
        "删除本次会话和聊天记录？已经提交的求助卡和安全关注消息会保留在教师端。",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/sessions/${student.sessionId}`, "DELETE");
      clearStudent(student.sessionId);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  if (!ready) return <p role="status">正在打开对话……</p>;
  if (!student)
    return (
      <section className="card narrow">
        <h1>先选一下你的年级</h1>
        <p>这样我就能用你容易懂的话说。</p>
        <Link className="button" href="/">
          回到首页
        </Link>
      </section>
    );
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  return (
    <section className="chat-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">你的心情，值得被听见</span>
          <h1>慢慢说，我在这里。</h1>
        </div>
        <span className="pill">
          {student.grade}年级 · 会话 {conversationCode(student.sessionId)}
        </span>
      </div>
      <div className="safety-disclosure" role="note">
        {SAFETY_DISCLOSURE}
      </div>
      <div className="chat-toolbar">
        <div className="mode-switch" aria-label="对话模式">
          <button
            aria-pressed={mode === "listen"}
            disabled={busy}
            onClick={() => switchMode("listen")}
          >
            我想说一说
          </button>
          <button
            aria-pressed={mode === "solve"}
            disabled={busy}
            onClick={() => switchMode("solve")}
          >
            帮我想办法
          </button>
        </div>
        <div className="always-actions">
          <button
            className="text-button"
            onClick={() => {
              updateInput("你理解错了，");
              inputRef.current?.focus();
            }}
          >
            你理解错了
          </button>
          <Link href="/help-card" className="button small secondary">
            找老师
          </Link>
          <Link href="/" className="text-button">
            结束对话
          </Link>
        </div>
      </div>
      <p className="mode-description">
        {mode === "listen"
          ? "现在先听你说，不着急想办法。"
          : "先听听你的想法，卡住了我们再一起想。"}
      </p>
      {(needsAdultHint(input) ||
        messages.some(
          (m) => m.role === "user" && needsAdultHint(m.content),
        )) && (
        <div className="teacher-hint" role="note">
          <strong>先照顾好自己</strong>
          <p>{ADULT_HINT}</p>
          <Link href="/help-card">需要时可以写求助卡 →</Link>
          <small>这是补充提示，不能判断是否安全。</small>
        </div>
      )}
      <div
        className="conversation"
        role="log"
        aria-label="聊天记录"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!messages.length && (
          <div className="chat-empty">
            <span aria-hidden="true">☁</span>
            <h2>从你想说的地方开始</h2>
            <p>可以只说一点点，也可以随时停下来。</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <span className="message-label">
              {m.role === "user" ? "我" : "AI调解小助手"}
            </span>
            <p>{m.content}</p>
            {m.recommendTeacher && (
              <div className="teacher-hint">
                可以请身边的老师或可信任成人帮忙。这个提示不能代替老师的判断。
                <Link href="/help-card">写求助卡 →</Link>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="muted" role="status">
            正在等回复，你可以随时找老师或结束。
          </p>
        )}
        <div ref={bottom} />
      </div>
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          {failed && (
            <div className="button-row">
              <button
                disabled={busy}
                className="button small"
                onClick={() => send(failed)}
              >
                重试这条消息
              </button>
              <button
                disabled={busy}
                className="text-button"
                onClick={() => {
                  setFailed(null);
                  setError("");
                  sessionStorage.removeItem(
                    `mediator:pending:${student.sessionId}`,
                  );
                }}
              >
                先继续说
              </button>
              <Link href="/help-card">直接找老师</Link>
            </div>
          )}
        </div>
      )}
      {lastReply?.actions && (
        <div className="suggestions" aria-label="你可以选择">
          {lastReply.actions.map((a) => (
            <button
              key={a}
              onClick={() => act(a)}
              disabled={busy && a === "想办法"}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="message">
          你想说的话
        </label>
        <textarea
          id="message"
          ref={inputRef}
          value={input}
          maxLength={1000}
          rows={3}
          onChange={(e) => updateInput(e.target.value)}
          placeholder="把你想说的话写在这里……不用写真实姓名。"
        />
        <div className="composer-bottom">
          <span className="muted">{input.length}/1000 · 不着急，慢慢写</span>
          <button
            className="button"
            disabled={busy || !!failed || !input.trim()}
          >
            {busy ? "正在回复…" : "发送 ↑"}
          </button>
        </div>
      </form>
      <div className="below-chat">
        <p>“结束对话”会返回首页；删除记录请使用右侧按钮。</p>
        <button className="text-button" disabled={busy} onClick={remove}>
          删除本次聊天记录
        </button>
      </div>
    </section>
  );
}
