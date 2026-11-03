"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ClientError } from "@/lib/client";
import { SAFETY_LABELS, type InboxItem } from "@/lib/types";
import { TeacherNav } from "./TeacherNav";
type InboxList = {
  items: InboxItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
};
export function TeacherInbox() {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InboxList | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const serial = useRef(0);
  const refresh = useCallback(
    async (silent = false) => {
      const run = ++serial.current;
      if (!silent) setLoading(true);
      try {
        const result = await api<InboxList>(
          `/api/teacher/inbox?status=${status}&page=${page}`,
        );
        if (run === serial.current) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (run !== serial.current) return;
        if (err instanceof ClientError && err.status === 401) {
          router.replace("/teacher/login");
          router.refresh();
        } else setError((err as Error).message);
      } finally {
        if (run === serial.current) setLoading(false);
      }
    },
    [status, page, router],
  );
  useEffect(() => {
    void refresh();
    const poll = () => {
      if (!document.hidden) void refresh(true);
    };
    const timer = window.setInterval(poll, 10000);
    window.addEventListener("focus", poll);
    return () => {
      serial.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [refresh]);
  async function change(item: InboxItem, next: InboxItem["status"]) {
    setUpdating(item.id);
    setError("");
    try {
      await api(`/api/teacher/inbox/${item.id}`, "PATCH", { status: next });
      await refresh(true);
      window.dispatchEvent(new Event("teacher-inbox-changed"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdating("");
    }
  }
  async function logout() {
    try {
      await api("/api/teacher/login", "DELETE");
      router.replace("/teacher/login");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">教师工作台</span>
          <h1>收件箱</h1>
        </div>
        <button className="text-button" onClick={logout}>
          退出登录
        </button>
      </div>
      <TeacherNav />
      <div className="safety-disclosure">
        <strong>安全关注消息 · 需人工核实</strong>
        <p>
          学生对话出现相关信号时会自动记录，不要求学生先提交求助卡。这些是规则或模型提示，可能误报、漏报，不是心理诊断，也不能作为处罚或贴标签的依据。
        </p>
        <p>
          请结合实际情况及时联系学生核实。匿名编号不能直接确定真实身份；老师需在课堂或学校的跟进流程中确认。网页打开时约每10秒检查新消息，没有微信、短信或邮件通知。
        </p>
      </div>
      <div className="teacher-tools">
        <div className="mode-switch" aria-label="收件箱筛选">
          {[
            ["all", "全部"],
            ["unread", "未读"],
            ["read", "已读"],
            ["handled", "已跟进"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="button secondary small"
          disabled={loading}
          onClick={() => refresh()}
        >
          刷新收件箱
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">正在读取消息……</p>
      ) : (
        data && (
          <>
            <p className="muted" role="status">
              {data.unreadCount} 条未读 · 当前筛选共 {data.total} 条
            </p>
            {!data.items.length && (
              <div className="card empty-state">
                <h2>这里暂时没有消息</h2>
                <p>
                  相关信号被记录后，新消息会出现在这里。没有消息不代表没有风险。
                </p>
              </div>
            )}
            <div className="inbox-list">
              {data.items.map((item) => (
                <article
                  className={`card inbox-item ${item.status === "unread" ? "is-unread" : ""}`}
                  key={item.id}
                >
                  <div className="card-meta">
                    <strong>
                      {item.grade}年级 · 会话 {item.conversationCode}
                    </strong>
                    <span
                      className={`pill ${item.status === "unread" ? "pending" : ""}`}
                    >
                      {item.status === "unread"
                        ? "未读"
                        : item.status === "read"
                          ? "已读"
                          : "已跟进"}
                    </span>
                  </div>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </time>
                  <p className="muted">
                    自动安全关注 ·{" "}
                    {item.source === "rule" ? "明确措辞提示" : "模型上下文提示"}{" "}
                    · 需老师核实
                  </p>
                  {item.signals.map((signal) => (
                    <div className="signal-evidence" key={signal.category}>
                      <h2>{SAFETY_LABELS[signal.category]}</h2>
                      {signal.evidence.map((quote, index) => (
                        <blockquote key={index}>{quote}</blockquote>
                      ))}
                    </div>
                  ))}
                  <p className="muted fine-print">
                    以上为必要原话摘录，未开放完整聊天。消息保存不代表老师已经核实。
                  </p>
                  <div className="button-row">
                    {item.status === "unread" && (
                      <button
                        className="button secondary small"
                        disabled={!!updating}
                        onClick={() => change(item, "read")}
                      >
                        标为已读
                      </button>
                    )}
                    {item.status !== "handled" && (
                      <button
                        className="button small"
                        disabled={!!updating}
                        onClick={() => change(item, "handled")}
                      >
                        标记已跟进
                      </button>
                    )}
                    {item.status !== "unread" && (
                      <button
                        className="text-button"
                        disabled={!!updating}
                        onClick={() => change(item, "unread")}
                      >
                        恢复未读
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="pagination">
              <button
                className="button secondary small"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                className="button secondary small"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
