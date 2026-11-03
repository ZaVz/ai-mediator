"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton } from "@/components/BigButton";
import { createStudent } from "@/lib/client";
import { SAFETY_DISCLOSURE } from "@/lib/safety";
import type { Mode } from "@/lib/types";
export default function Home() {
  const router = useRouter();
  const [grade, setGrade] = useState(3);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  async function start(mode: Mode) {
    setError("");
    setBusy(mode);
    try {
      await createStudent(grade, mode);
      router.push(mode === "teacher" ? "/help-card" : "/chat");
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }
  return (
    <div className="home-layout">
      <section className="intro">
        <span className="eyebrow">给每一份心情，留一个位置</span>
        <h1>
          心里有点
          <br />
          不开心？
          <span className="hand-line">
            慢慢说，
            <br />
            我在听。
          </span>
        </h1>
        <p className="intro-copy">
          和同学有了小矛盾，觉得委屈、生气，
          <br className="desktop-break" />
          或是不知道怎么办，都可以来这里。
        </p>
        <div className="little-note">
          <span aria-hidden="true">☁</span>
          <p>
            不急着分对错。
            <br />
            你可以说一点，也可以说很多。
          </p>
        </div>
      </section>
      <section className="welcome-panel" aria-label="选择你需要的帮助">
        <div className="panel-top">
          <span className="eyebrow">从你想做的开始</span>
          <span aria-hidden="true">✳</span>
        </div>
        <div className="grade-field">
          <label htmlFor="grade">我在</label>
          <select
            id="grade"
            value={grade}
            disabled={!!busy}
            onChange={(e) => setGrade(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <option value={g} key={g}>
                {g}年级
              </option>
            ))}
          </select>
          <span className="muted">让我用你容易懂的话说</span>
        </div>
        <details open className="safety-disclosure">
          <summary>开始前，请了解老师什么时候可能收到消息</summary>
          <p>{SAFETY_DISCLOSURE}</p>
        </details>
        <div className="entry-list">
          <BigButton
            icon="☁"
            title="我想说一说"
            description="先听我说，不着急想办法"
            disabled={!!busy}
            onClick={() => start("listen")}
          />
          <BigButton
            className="entry-peach"
            icon="✦"
            title="帮我想办法"
            description="陪我想想，可以怎么做"
            disabled={!!busy}
            onClick={() => start("solve")}
          />
          <BigButton
            className="entry-lilac"
            icon="♡"
            title="我想找老师"
            description="直接写一张求助卡，不用先聊天"
            disabled={!!busy}
            onClick={() => start("teacher")}
          />
        </div>
        {busy && <p role="status">正在准备你的空间……</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="privacy-note">不用填写姓名 · 随时可以结束</p>
      </section>
    </div>
  );
}
