import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode, DEMO_NOTICE } from "@/lib/ai";
import { ADULT_HINT } from "@/lib/safety";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI调解小助手",
  description: "先听你说，再陪你想。小学同伴纠纷倾诉与求助。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <header className="site-header">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              ✦
            </span>
            <span>
              AI调解小助手<small>先听你说，再陪你想</small>
            </span>
          </Link>
          <Link className="teacher-link" href="/teacher">
            教师入口 ↗
          </Link>
        </header>
        {isDemoMode() && (
          <div className="demo-notice" role="note">
            <span className="status-dot" />
            {DEMO_NOTICE}。求助卡提交会真实写入本地数据库。
          </div>
        )}
        <main id="main">{children}</main>
        <footer>
          <p>
            AI可能理解错误，不能代替老师的关心和判断。你可以随时纠正、结束或找老师。
          </p>
          <p>{ADULT_HINT}</p>
          <p className="muted">
            匿名使用，不需要真实姓名。安全关注消息可能自动发送到教师收件箱，供老师核实。
          </p>
        </footer>
      </body>
    </html>
  );
}
