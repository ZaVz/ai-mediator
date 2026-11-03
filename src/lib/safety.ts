import {
  SAFETY_CATEGORIES,
  type SafetyCategory,
  type SafetySignal,
} from "./types";

export const ADULT_HINT =
  "如果你或别人正有危险，请现在找身边的老师或可信任成人，不要等网页处理。";
export const SAFETY_DISCLOSURE =
  "如果你说到伤害自己或别人、受到威胁或反复受到伤害，系统可能把必要的原话片段、年级和匿名会话编号发送到教师收件箱，请老师核实。老师不一定已经看到；有危险请马上找身边的成人。";
export const ALERT_RECEIPT =
  "安全关注消息已保存到教师收件箱，需老师核实；还不能确认老师是否看到。";

// Explicit wording only. Neither rules nor model assessment are a diagnosis.
export function explicitSafetySignals(text: string): SafetySignal[] {
  const result = new Map<SafetyCategory, string[]>();
  const fictional =
    /课文.{0,8}(?:里|中|讨论|说)|台词|电影.{0,8}(?:里|中|说)|小说.{0,8}(?:里|中|说)|故事里|新闻里|举个例子|假设有人|预防自杀|防止自杀/.test(
      text,
    );
  const personalOverride = /我现在|我真的|我也要|我已经|我准备|这不是玩笑/.test(
    text,
  );
  if (fictional && !personalOverride) return [];
  const clauses = text.match(/[^。！？!?\n；;]+[。！？!?]?/g) ?? [text];
  const add = (category: SafetyCategory, clause: string, index: number) => {
    const evidence = clause.slice(Math.max(0, index - 80), index + 220).trim();
    const old = result.get(category) ?? [];
    if (!old.includes(evidence))
      result.set(category, [...old, evidence].slice(0, 3));
  };
  const negated = (clause: string, index: number) =>
    /(?:不|没|没有|从不|不会|不愿|不想|不打算|不准备)(?:再|去|要|会|想)?$/.test(
      clause.slice(Math.max(0, index - 10), index),
    );
  for (const clause of clauses) {
    const quotedOther =
      /(?:他|她|同学|有人|坏人|角色|主人公|人).{0,5}(?:说|告诉我|发消息)/.test(
        clause,
      );
    const despair = /我.{0,8}(?:不想活了?|活不下去|想死了?)/.exec(clause);
    if (
      despair &&
      !/我.{0,5}(?:不想死|没有想死|不想再说不想活)/.test(clause) &&
      !quotedOther
    )
      add("self_harm", clause, despair.index);
    const self =
      /我.{0,8}(?:想|要|打算|准备|已经|正在|决定).{0,6}(?:自杀|自残|伤害自己|割腕|割自己|跳楼|结束自己的生命)/.exec(
        clause,
      );
    if (self && !quotedOther) {
      const intent = /想|要|打算|准备|已经|正在|决定/.exec(self[0]);
      if (intent && !negated(clause, self.index + intent.index))
        add("self_harm", clause, self.index);
    }
    const threat =
      /(?:威胁我|恐吓我|逼我|我被.{0,12}(?:威胁|恐吓)|(?:他|她|同学|有人).{0,5}说.{0,8}(?:打死我|杀了我|弄死我|杀了你|打死你))/.exec(
        clause,
      );
    if (
      threat &&
      !negated(clause, threat.index) &&
      !/没有人.{0,4}(?:威胁|恐吓|逼我)/.test(clause)
    )
      add("threatened", clause, threat.index);
    const repeat =
      /(?:每天|天天|经常|反复|一直|总是|每次|多次|连续).{0,14}(?:打我|欺负我|伤害我|踢我|推我|骂我|辱骂我|勒索我|抢我的钱)|我.{0,5}(?:每天|经常|反复|总是).{0,5}被.{0,10}(?:打|欺负|伤害|辱骂|踢|推)/.exec(
        clause,
      );
    if (
      repeat &&
      !negated(clause, repeat.index) &&
      !/(?:没有|不会|不再|没再).{0,5}(?:打我|欺负我|伤害我|踢我|骂我)/.test(
        clause,
      )
    )
      add("repeated_harm", clause, repeat.index);
    const others =
      /我.{0,8}(?:想|要|准备|打算|决定|计划).{0,8}(?:报复(?:这个)?社会|杀人|杀光(?:他们|同学|所有人)|让.{0,8}(?:去死|死掉)|伤害(?:别人|同学|老师|他们|大家|他|她)|打死(?:你|他|她|同学|老师)|杀(?:了|死)(?:你|他|她|同学|老师)|炸(?:掉|毁)?(?:学校|教室)|把.{0,6}(?:学校|教室).{0,4}炸|(?:拿|带)刀.{0,10}(?:砍|捅|伤人))/.exec(
        clause,
      );
    if (others && !quotedOther) {
      const intent = /想|要|准备|打算|决定|计划/.exec(others[0]);
      if (intent && !negated(clause, others.index + intent.index))
        add("harm_others", clause, others.index);
    }
  }
  return [...result].map(([category, evidence]) => ({ category, evidence }));
}

export function groundedSafetySignals(
  value: unknown,
  latest: string,
  studentTexts: string[],
): SafetySignal[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const seen = new Set<string>();
  const result: SafetySignal[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !SAFETY_CATEGORIES.includes(item.category) ||
      seen.has(item.category) ||
      !Array.isArray(item.evidence) ||
      item.evidence.length < 1 ||
      item.evidence.length > 3 ||
      !item.evidence.every(
        (s: unknown) =>
          typeof s === "string" &&
          s.trim().length > 0 &&
          s.length <= 400 &&
          studentTexts.some((text) => text.includes(s)),
      ) ||
      !item.evidence.some((s: string) => latest.includes(s))
    )
      return null;
    seen.add(item.category);
    result.push({
      category: item.category,
      evidence: [...new Set(item.evidence as string[])],
    });
  }
  return result;
}

export function needsAdultHint(text: string) {
  return (
    explicitSafetySignals(text).length > 0 ||
    /受伤|流血|威胁|不敢上学|掐.{0,2}脖/.test(text)
  );
}
