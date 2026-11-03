# 服务器部署

GitHub保存和管理源码，不会自动提供本项目所需的应用进程、教师登录或SQLite数据库。GitHub Pages只托管静态网页，不能直接运行这一版后端。

本项目当前提供标准 **Node.js单实例部署** 路径，不依赖某个人的电脑路径。不预设特定云平台，也不自动发布或公开数据。

## 运行要求

- Node.js 22或24 LTS，npm 10以上；支持Linux、macOS等兼容环境。
- 持久化、可写的SQLite数据库目录，不能用重启即清空的临时目录。
- 对外提供HTTPS，通常由反向代理或部署平台终止TLS。生产Cookie使用Secure标记。
- 反向代理转发正确的 `Host` 和 `X-Forwarded-Proto`；后端端口限制为受信任代理访问。跨源请求不会被允许。

## 环境变量

部署平台/进程管理器注入以下值，不要把真实值写入仓库、构建参数或浏览器代码：

```env
AI_BASE_URL=供应商基础地址
AI_API_KEY=实际密钥
AI_MODEL=供应商模型标识
TEACHER_PASSWORD=自行设置至少12字符
DATABASE_URL=file:/data/ai-mediator/app.db
DEMO_MODE=false
NODE_ENV=production
PORT=3000
```

上面的 `/data/ai-mediator/app.db` 是示例路径，需要按服务器配置挂载持久化磁盘并赋予应用用户读写权限，先创建父目录。环境变量含义见README。未配置模型密钥时明确标注演示模式；不要把占位文字当作真实密钥。

## 安装、迁移、构建与运行

在仓库根目录执行：

```bash
npm ci
npm run setup
npm run build
npm start
```

`setup` 执行 `prisma generate` 和 `prisma migrate deploy`；生产环境不使用 `migrate dev`，不执行数据库重置。迁移文件随源码一起提交。

`npm start` 使用Next.js标准监听方式，读取平台提供的PORT。若用反向代理且希望后端只绑定回环地址，可运行：

```bash
npm start -- --hostname 127.0.0.1
```

使用平台服务管理或进程管理器保持进程运行和重启恢复。不要以开发命令 `npm run dev` 作为正式服务。

## 数据库与伸缩范围

- SQLite数据库、日志与备份不提交GitHub，数据文件需要独立备份与访问控制。
- 当前会话删除会清除聊天；已提交卡片保留，由教师另行管理。凭证24小时过期不等于自动删除数据。
- 多个服务器实例不能各自使用独立的本地SQLite文件并期待数据同步。
- 单进程限速/并发锁不会跨实例共享。若要水平扩容，需先选共享数据库和限速方案，并迁移Prisma provider与迁移文件。
- 不提供未验证的Vercel、Cloudflare或GitHub Pages“一键部署”承诺。选择平台后应针对其运行时、持久化和网络方式验证。

## 部署后检查

1. 无模型密钥时有演示标注；真实模型失败时保留输入，不模拟成功。
2. 没有教师登录Cookie时，访问求助卡列表或修改接口返回401。
3. 使用独立测试卡片验证提交、教师列表、处理状态；成功文案仅表示“已进入教师待处理列表”。
4. 重启应用进程后数据仍存在，数据库备份能按服务器运维流程恢复。
5. 验证HTTPS下登录、同源写请求和反向代理转发正确。

这些是部署验收步骤，尚未在你的服务器实际执行。本次本机验证范围见根目录VERIFICATION.md。

参考：[Next.js自托管](https://nextjs.org/docs/app/guides/self-hosting)、[GitHub Pages说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
