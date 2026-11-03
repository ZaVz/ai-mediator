"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
export default function TeacherLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/teacher/login", "POST", { password });
      setPassword("");
      router.replace("/teacher");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="card narrow">
      <span className="eyebrow">教师工作台</span>
      <h1>教师登录</h1>
      <p>登录后查看孩子主动确认提交的求助卡。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login();
        }}
      >
        <div className="field">
          <label htmlFor="password">教师密码</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button wide" disabled={busy || !password}>
          {busy ? "正在登录…" : "登录"}
        </button>
      </form>
      <Link className="back-link" href="/">
        ← 返回学生首页
      </Link>
    </section>
  );
}
