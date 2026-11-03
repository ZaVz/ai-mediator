"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ClientError } from "@/lib/client";
export function TeacherNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.hidden) return;
      try {
        const result = await api<{ unreadCount: number }>(
          "/api/teacher/inbox?summary=1",
        );
        if (active) setCount(result.unreadCount);
      } catch (error) {
        if (active && error instanceof ClientError && error.status === 401) {
          router.replace("/teacher/login");
          router.refresh();
        } else if (active) setCount(null);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    window.addEventListener("teacher-inbox-changed", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("teacher-inbox-changed", refresh);
    };
  }, [router]);
  return (
    <nav className="teacher-nav" aria-label="教师功能">
      <Link
        href="/teacher"
        aria-current={pathname === "/teacher" ? "page" : undefined}
      >
        求助卡
      </Link>
      <Link
        href="/teacher/inbox"
        aria-current={pathname === "/teacher/inbox" ? "page" : undefined}
      >
        收件箱{" "}
        <span
          className="inbox-badge"
          aria-label={
            count === null ? "未读数量暂未更新" : `${count}条未读消息`
          }
        >
          {count ?? "…"}
        </span>
      </Link>
      <Link href="/">学生首页 ↗</Link>
    </nav>
  );
}
