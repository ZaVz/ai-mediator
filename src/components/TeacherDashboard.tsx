"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ClientError } from "@/lib/client";
import { CARD_FIELDS, FIELD_LABELS, type HelpCardDraft } from "@/lib/types";
import { TeacherNav } from "./TeacherNav";
type Item = HelpCardDraft & {
  id: string;
  status: "pending" | "handled";
  submittedAt: string;
};
type List = { items: Item[]; total: number; page: number; pageSize: number };
export function TeacherDashboard() {
  const router = useRouter();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    const run = ++serial.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<List>(
        `/api/teacher/help-requests?status=${status}&page=${page}`,
      );
      if (run === serial.current) setData(result);
    } catch (err) {
      if (run !== serial.current) return;
      if (err instanceof ClientError && err.status === 401) {
        router.replace("/teacher/login");
        router.refresh();
      } else setError((err as Error).message);
    } finally {
      if (run === serial.current) setLoading(false);
    }
  }, [page, status, router]);
  useEffect(() => {
    void refresh();
    return () => {
      serial.current++;
    };
  }, [refresh]);
  async function change(item: Item) {
    setUpdating(item.id);
    setError("");
    try {
      await api(`/api/teacher/help-requests/${item.id}`, "PATCH", {
        status: item.status === "pending" ? "handled" : "pending",
      });
      await refresh();
    } catch (err) {
      if (err instanceof ClientError && err.status === 401) {
        router.replace("/teacher/login");
        router.refresh();
      } else setError((err as Error).message);
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
          <h1>孩子们的求助卡</h1>
        </div>
        <button className="text-button" onClick={logout}>
          退出登录
        </button>
      </div>
      <TeacherNav />
      <p className="lead">
        这里仅展示孩子主动提交的内容。AI整理可能有遗漏或错误，请与孩子核实。
      </p>
      <div className="teacher-tools">
        <div className="mode-switch" aria-label="状态筛选">
          {[
            ["pending", "待处理"],
            ["handled", "已处理"],
            ["all", "全部"],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={status === v}
              onClick={() => {
                setStatus(v);
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
          onClick={refresh}
        >
          刷新列表
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">正在读取求助卡……</p>
      ) : (
        data && (
          <>
            <p className="muted">
              共 {data.total} 张 · 第 {page} 页
            </p>
            {!data.items.length && (
              <div className="card empty-state">
                <span aria-hidden="true">☁</span>
                <h2>这里还没有求助卡</h2>
                <p>孩子确认提交后，卡片才会出现在列表里。</p>
              </div>
            )}
            <div className="teacher-grid">
              {data.items.map((item) => (
                <article className="card teacher-card" key={item.id}>
                  <div className="card-meta">
                    <strong>{item.grade}年级 · 匿名求助</strong>
                    <span className={`pill ${item.status}`}>
                      {item.status === "pending" ? "待处理" : "已处理"}
                    </span>
                  </div>
                  <time dateTime={item.submittedAt}>
                    {new Date(item.submittedAt).toLocaleString("zh-CN")}
                  </time>
                  <dl>
                    {CARD_FIELDS.map((field) => (
                      <div key={field}>
                        <dt>{FIELD_LABELS[field]}</dt>
                        <dd>{item[field] || "未说明"}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className="button secondary wide"
                    disabled={!!updating}
                    onClick={() => change(item)}
                  >
                    {updating === item.id
                      ? "正在保存…"
                      : item.status === "pending"
                        ? "标记为已处理"
                        : "恢复为待处理"}
                  </button>
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
      <p className="aside-note">
        匿名第一版没有姓名、班级或联系方式，无法仅凭卡片定位具体孩子，自动安全关注消息请查看收件箱。正式使用需确定学校的接收、核实和跟进安排。
      </p>
    </section>
  );
}
