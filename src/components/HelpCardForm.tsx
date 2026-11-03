"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, createStudent, type Student } from "@/lib/client";
import { CARD_FIELDS, FIELD_LABELS, type HelpCardDraft } from "@/lib/types";
export function HelpCardForm({
  student,
  initialDescription,
}: {
  student: Student | null;
  initialDescription: string;
}) {
  const [current, setCurrent] = useState(student);
  const [draft, setDraft] = useState<HelpCardDraft>({
    ...(student ? { sessionId: student.sessionId } : {}),
    grade: student?.grade ?? 3,
    studentDescription: initialDescription,
    feelingsAndNeeds: "",
    uncertainPoints: "",
    attempts: "",
    requestedHelp: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const submissionId = useRef("");
  const inFlight = useRef(false);
  const cacheKey = `mediator:card:${student?.sessionId ?? "direct"}`;
  useEffect(() => {
    submissionId.current = crypto.randomUUID();
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null");
      if (saved) {
        setDraft(saved.draft);
        submissionId.current = saved.submissionId;
        setSubmitted(saved.submitted === true);
      }
    } catch {
      /* Invalid cache is ignored. */
    }
    setLoaded(true);
  }, [cacheKey]);
  useEffect(() => {
    if (loaded) {
      const saved = JSON.stringify({
        draft: {
          ...draft,
          ...(current ? { sessionId: current.sessionId } : {}),
        },
        submissionId: submissionId.current,
        submitted,
      });
      sessionStorage.setItem(cacheKey, saved);
      if (current)
        sessionStorage.setItem(`mediator:card:${current.sessionId}`, saved);
    }
  }, [draft, loaded, cacheKey, submitted, current]);
  async function generate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{
        draft: HelpCardDraft;
        demoMode: boolean;
        notice?: string;
      }>(
        "/api/help-card/draft",
        "POST",
        current
          ? {
              sessionId: current.sessionId,
              ...(draft.studentDescription.trim() &&
              draft.studentDescription !== initialDescription
                ? { studentDescription: draft.studentDescription }
                : {}),
            }
          : {
              grade: draft.grade,
              studentDescription: draft.studentDescription,
            },
      );
      setDraft(result.draft);
      setConfirmed(false);
      setNotice(
        result.notice ?? "这是摘录草稿，可能有遗漏。请检查、修改后再确认提交。",
      );
    } catch (err) {
      setError(
        `整理草稿没有完成。${(err as Error).message} 你仍可以自己填写并提交。`,
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const s = current ?? (await createStudent(draft.grade, "teacher"));
      setCurrent(s);
      await api("/api/help-requests", "POST", {
        ...draft,
        sessionId: s.sessionId,
        grade: s.grade,
        confirmed,
        submissionId: submissionId.current,
      });
      setSubmitted(true);
      // Keep success/idempotency state when a direct visitor refreshes after creating a session.
      sessionStorage.setItem(
        `mediator:card:${s.sessionId}`,
        JSON.stringify({
          draft: { ...draft, sessionId: s.sessionId },
          submissionId: submissionId.current,
          submitted: true,
        }),
      );
    } catch (err) {
      setError(
        `未提交成功。${(err as Error).message} 请保留这张卡片并重试；有紧急危险请直接找身边成人。`,
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  if (submitted)
    return (
      <section className="card narrow success" role="status">
        <span className="success-icon" aria-hidden="true">
          ✓
        </span>
        <h1>已进入教师待处理列表</h1>
        <p>
          这表示卡片已经保存。还不能确定老师是否看到，也不代表老师会马上到来。
        </p>
        <p>如果你现在需要帮助，请直接找身边的老师或可信任成人。</p>
        <Link className="button" href="/">
          回到首页
        </Link>
      </section>
    );
  return (
    <section className="form-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">把想说的话，交给老师</span>
          <h1>我的求助卡</h1>
        </div>
        <Link
          href={current && current.mode !== "teacher" ? "/chat" : "/"}
          className="text-button"
        >
          先不提交，返回
        </Link>
      </div>
      <p className="lead">
        只写你愿意告诉老师的内容。先检查、修改，确认后才会提交。
      </p>
      <div className="form-layout">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="card-grade">我的年级</label>
            <select
              id="card-grade"
              value={draft.grade}
              disabled={!!current || busy}
              onChange={(e) => {
                setDraft({ ...draft, grade: Number(e.target.value) });
                setConfirmed(false);
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>
                  {g}年级
                </option>
              ))}
            </select>
          </div>
          {CARD_FIELDS.map((field) => (
            <div className="field" key={field}>
              <label htmlFor={field}>
                {FIELD_LABELS[field]}
                {field !== "studentDescription" && <small>（可以不填）</small>}
              </label>
              <textarea
                id={field}
                value={draft[field]}
                required={field === "studentDescription"}
                maxLength={2000}
                rows={field === "studentDescription" ? 4 : 2}
                disabled={busy}
                onChange={(e) => {
                  setDraft({ ...draft, [field]: e.target.value });
                  setConfirmed(false);
                }}
                placeholder={
                  field === "studentDescription"
                    ? "写一句也可以。不用填写真实姓名。"
                    : "没有说过或不确定的内容可以留空。"
                }
              />
            </div>
          ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>我看过这张卡片，愿意把这些内容提交给老师。</span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button wide"
            disabled={busy || !confirmed || !draft.studentDescription.trim()}
          >
            {busy ? "正在处理…" : "确认提交给老师 →"}
          </button>
          <p className="muted fine-print">
            只有提交成功后，才会进入教师待处理列表。
          </p>
        </form>
        <aside>
          <div className="aside-note">
            <span className="note-icon" aria-hidden="true">
              ♡
            </span>
            <h2>不必等到说清楚一切</h2>
            <p>只写一句求助说明，也能提交。你不需要先和AI聊天。</p>
            <p>
              老师会看到年级、这张卡片和处理状态，不会看到完整聊天记录。出现安全信号时，系统还可能另发必要原话片段到教师收件箱。
            </p>
          </div>
          <div className="aside-note alternate">
            <h2>需要整理一下？</h2>
            <p>
              从你填写的说明或此前聊天中摘录草稿。不会自动提交，重新整理会替换当前填写内容。
            </p>
            <button
              type="button"
              className="button secondary wide"
              disabled={
                busy ||
                (!initialDescription.trim() && !draft.studentDescription.trim())
              }
              onClick={generate}
            >
              整理可编辑草稿
            </button>
            {notice && <p role="status">{notice}</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
