# 接口文档


- 所有写请求使用 `Content-Type: application/json`（无请求体的 DELETE 除外）。同站 Cookie 自动带上，浏览器不要自行拼接身份令牌。
- 拒绝跨站 Origin/Fetch Metadata；实际请求体最多24000字节。教师密码不接受查询参数。
- 学生会话凭证随机生成，数据库只保存哈希。**知道 `sessionId` 不代表拥有会话**；聊天、提交、已有会话草稿、删除都必须匹配 Cookie。会话有效期24小时。
- 教师凭证为签名的 HttpOnly / SameSite=Strict Cookie，有效期8小时，生产下带 Secure。签名密钥由教师密码派生，换密码使旧登录失效。退出只清除当前浏览器 Cookie，不提供全局会话撤销。
- 响应 `Cache-Control: no-store`。错误统一如下，不回传供应商错误正文或服务端堆栈：

```json
{"error":{"code":"SESSION_REQUIRED","message":"会话已失效，请返回首页重新开始。"}}
```

常见状态：400 参数错误；401 未登录/凭证无效；403 跨站；404 卡片不存在；409 请求冲突/处理中；413 请求过大；415 非 JSON；429 本站频率限制；502 上游模型失败或格式不符；503 模型/教师未配置；504 模型调用超时；500 数据库等内部错误。

### POST `/api/sessions`

```json
{"grade":3,"mode":"listen"}
```

`mode` 为 `listen | solve | teacher`。成功201：`{"sessionId":"..."}`，同时设置匿名 Cookie。年级只允许整数1—6，不收集姓名、班级或联系方式。

### POST `/api/chat`

```json
{"sessionId":"...","message":"我的笔被同学拿走了","mode":"listen","clientMessageId":"唯一请求编号"}
```

`message` 必填，最多1000字符。`mode` 可选，`listen | solve`，默认沿用服务端模式（teacher会话默认listen）。`clientMessageId` 可选，建议用 UUID 并在**重试同一条消息时复用**；不传则服务端生成，不能据此保证重试去重。历史从服务端读取最近40条，不接受客户端伪造 history。

成功200，保留原定三个字段：

```json
{"reply":"听起来你很委屈。你想让我继续听，还是一起想办法？","suggestedActions":["继续说","想办法","找老师"],"recommendTeacher":false}
```

`suggestedActions` 是字符串数组，选项为 `继续说 | 想办法 | 找老师 | 结束对话`。这段示例是接口说明，不是假装真实模型输出。`recommendTeacher` 是辅助建议，不是可靠风险检测结果。

孩子消息先保存，模型失败则保留；客户端显示重试、继续说、找老师。相同编号成功重试返回缓存回复，不新增消息；复用编号却改变内容返回409。同一会话正在处理时返回409。`mode` 切换在下一条请求时写入服务端，不强制孩子发送“切换模式”消息。

模型历史保留助手原始JSON回复，避免多轮格式与本轮输出要求不一致。DeepSeek官方地址会启用JSON输出；当前Flash/V4模型显式关闭思考模式，适用于本项目的简短结构化回复，不向其他供应商强加这些参数。

空回复、JSON解析失败、输出截断或字段/句数不符时，服务端最多重试一次；两次合计受45秒预算限制，单次最多25秒。DeepSeek的JSON模式若返回空白，恢复请求改用普通输出通道，仍要求并校验模型生成的JSON；不会用固定示例替换真实回复。认证、余额、限流或服务不可用不做自动格式重试。

上游401、402、429分别映射为本站502下的 `AI_AUTH_FAILED`、`AI_BALANCE_REQUIRED`、`AI_RATE_LIMITED`；另外有 `AI_EMPTY_RESPONSE`、`AI_INVALID_JSON`、`AI_OUTPUT_TRUNCATED`、`AI_INVALID_RESPONSE` 和504下的 `AI_TIMEOUT`。它们和本站学生/教师鉴权401、本地限速429不同。日志仅记录错误分类、HTTP状态、结束原因和重试次数，不记录密钥、聊天正文、模型思考或供应商响应正文。

### 对话自动安全关注

`POST /api/chat` 对外仍只返回 `reply`、`suggestedActions`、`recommendTeacher`。内部的 `safetySignals` 不返回学生。明确的自伤、受到威胁、反复伤害、伤害他人/报复社会措辞，在模型调用之前真实写入教师收件箱，并以系统安全提示回复；因此模型断线或演示模式不阻止这些消息记录。模型还会结合多轮上下文提出上述四类信号，证据必须是学生原话片段，且至少有一段属于最新消息。

每个会话的同一 `clientMessageId` 最多保存一条收件箱消息，可包含多类信号；重试不会重复，也不会把老师已读/已跟进的消息重置为未读。只有保存成功才显示“安全关注消息已保存到教师收件箱”；保存失败返回503 `ALERT_NOT_SAVED`，保留原话并提示立即寻找身边成人。系统不能保证识别所有风险，不能把消息当成心理诊断。

### GET `/api/teacher/inbox?status=all&page=1`

需要教师登录。`status` 为 `all | unread | read | handled`，默认all；每页20条，按创建时间倒序。响应含 `items`、`total`、`unreadCount`、`page`、`pageSize`。

`items` 含：`id`、`grade`、`conversationCode`（学生页显示相同匿名编号）、`signals`（`[{category,evidence:["原话片段"]}]`）、`source`（rule/model）、`status`、`createdAt`、`readAt`、`handledAt`。类别为 `self_harm | threatened | repeated_harm | harm_others`。不返回会话凭证、内部会话编号或完整聊天。

`GET /api/teacher/inbox?summary=1` 仅返回 `{"unreadCount":数字}`，同样需要教师登录，用于导航未读标记。

### PATCH `/api/teacher/inbox/:id`

需要教师登录。请求 `{"status":"read"}`、`{"status":"handled"}` 或 `{"status":"unread"}`；成功返回 `{"id":"...","status":"..."}`。read只是已读，handled对应教师主动标记“已跟进”，并不代表风险已经消失。未登录401，非法状态400，不存在404。

### POST `/api/help-card/draft`

从本人会话（需要 Cookie）整理：`{"sessionId":"..."}`。读取最近30条**孩子消息**，不使用AI提出的建议当作孩子事实。

直接从说明整理（不需要先聊天）：

```json
{"grade":3,"studentDescription":"我和同学因为游戏规则吵架，我想请老师帮忙。"}
```

`studentDescription` 最多2000字符；与 `sessionId` 同传时，明确使用这段说明作为来源。无会话模式不创建卡片、不读取任何聊天；提交时仍须先创建匿名会话。

成功200：

```json
{
  "draft": {
    "sessionId":"...",
    "grade":3,
    "studentDescription":"孩子原话摘录",
    "feelingsAndNeeds":"",
    "uncertainPoints":"",
    "attempts":"",
    "requestedHelp":""
  },
  "demoMode":false
}
```

无会话时省略 `draft.sessionId`。演示时另有 `notice`，明确固定示例与原话摘录。真实模型每项只接受孩子原文中的连续片段，无法找到出处的输出清空；可能遗漏，需要孩子修改确认。没有聊天的会话也可返回空草稿。草稿生成**不会提交**，失败不清空表单。

### POST `/api/help-requests`

```json
{
  "sessionId":"...",
  "grade":3,
  "studentDescription":"我想请老师帮我和同学说一说。",
  "feelingsAndNeeds":"",
  "uncertainPoints":"",
  "attempts":"",
  "requestedHelp":"",
  "confirmed":true,
  "submissionId":"本次提交的唯一编号"
}
```

需要本人 Cookie，年级须与会话一致。`studentDescription` 必填，另外四项内容可空/省略，各最多2000字符。`confirmed` 必须为true，不允许草稿自动提交。`submissionId` 可选，浏览器会生成 UUID，网络重试时复用，数据库唯一约束防止重复提交。

首次成功201，重试已有卡片200（并发去重也可能返回201，但仅保存一张）：

```json
{"id":"...","status":"pending","message":"已进入教师待处理列表"}
```

同一 `submissionId` 重试不会修改已提交内容。提交失败页面显示“未提交成功”，保留草稿并允许重试。不存在学生端读取卡片或查看处理状态的公开接口。

### POST `/api/teacher/login`

请求 `{"password":"你自己配置的教师密码"}`；成功200 `{"ok":true}` 并设置登录 Cookie。密码错误401，未配置或不足12位503。单进程全局每分钟最多10次登录尝试，防止伪造来源地址绕过限速。

### DELETE `/api/teacher/login`

补充的退出接口。无请求体；清除当前浏览器教师 Cookie，返回200 `{"ok":true}`。

### GET `/api/teacher/help-requests?status=pending&page=1`

必须教师登录。`status` 为 `pending | handled | all`，默认pending；`page` 从1开始，每页20条，按提交时间倒序。

```json
{"items":[{"id":"...","grade":3,"studentDescription":"...","feelingsAndNeeds":"","uncertainPoints":"","attempts":"","requestedHelp":"","status":"pending","submittedAt":"2026-11-03T00:00:00.000Z"}],"total":1,"page":1,"pageSize":20}
```

只返回必要卡片字段；不返回会话凭证、聊天记录、`submissionId` 或内部关联编号。

### PATCH `/api/teacher/help-requests/:id`

必须教师登录。请求 `{"status":"handled"}` 或 `{"status":"pending"}`；成功200 `{"id":"...","status":"handled"}`。卡片不存在404。

### DELETE `/api/sessions/:id`

无请求体，必须本人匿名 Cookie。成功200：

```json
{"deleted":true,"message":"本次聊天记录已删除；已提交的求助卡和安全关注消息由教师另行管理。"}
```

聊天随会话级联删除，已提交卡片和安全关注消息的 `sessionId` 置空，教师端记录保留。删除别人的编号返回401。

