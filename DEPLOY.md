# 上线部署（拿到「可运行体验链接」）

黑客松必交材料里有一项是**可公开访问、评委能实际上手的线上 Demo**。这一份就是怎么把它跑起来。

## 先说清楚：必须是一个进程、一个域名

前端打包产物（`dist/`）里的所有接口请求都是**相对路径** `/api/...`。
如果只把 `dist/` 传到静态托管（GitHub Pages、OSS、Netlify 只放静态），这些请求会全部 404，
整站会**如实降级**成本地剧情、并停在「暂时连不上知乎内容」那一页——评委就走不下去了。

所以本项目把前端与后端合成**一个 Node 进程**：`server/index.ts` 除了原有的 `/api/*`，
还会把 `dist/` 里的文件发出去（手写的一段静态服务，没有额外依赖）。
部署时**不要**拆成静态托管 + 单独后端两个服务。

## 环境变量

| 变量 | 必填 | 作用 | 不配会怎样 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | 强烈建议 | 把知乎原文改编成三幕剧情；在真实候选里挑最贴心事的三条声音 | 仍然能完整玩：剧情用本地五幕示例剧情，三个声音退到「和睡不着最近的主题」里的真实内容（内容仍然真、署名仍然真，只是主题稍远） |
| `ZHIHU_ACCESS_SECRET` | 可选 | 开放平台搜索 / 直答，用来把「知乎原文」换成官方链接 | 「知乎原文」回落到站内搜索页，并在来源行如实标注 |
| `PORT` | 不必手填 | 监听端口 | 默认 3000；Render / Railway 会自动注入 |

凭证纪律（活动规则明确要求）：Key 只放在部署平台的环境变量里，
**不要**写进仓库、不要出现在前端响应、日志、截图或演示视频中。

## 方式一：Render（仓库里已备好 `render.yaml`）

1. 把仓库推到 GitHub / Gitee（见下方「代码仓库」）。
2. Render 控制台 → **New → Blueprint** → 选这个仓库，它会读根目录的 `render.yaml`：
   - Build：`npm install --include=dev && npm run build && npm install --include=dev --prefix server`
   - Start：`npm --prefix server start`
   - 健康检查：`/api/health`

   > `--include=dev` 别省：平台若设了 `NODE_ENV=production`，`npm install` 会跳过 devDependencies，
   > `tsc` / `vite` 就没了，构建会在第一步失败。
3. 在环境变量里手填 `DEEPSEEK_API_KEY`（`render.yaml` 里已经声明为 `sync: false`，不会进仓库）。
4. 部署完把域名（形如 `https://kanshan-sleep.onrender.com`）填进活动页面的「作品链接」。

> 免费实例闲置会休眠，第一次打开要等十几秒——评委点开时可能正好是冷启动。
> 时间允许的话，提交前自己先打开一次把它唤醒。

## 方式二：Railway / Zeabur（用仓库里的 `Dockerfile`）

- Build：`npm install --include=dev && npm run build && npm install --include=dev --prefix server`
- Start：`npm --prefix server start`
- 或者直接选 **Dockerfile** 部署（构建里已经包含前端打包）。
- 端口用平台注入的 `PORT`；容器内 Expose 3000。

## 方式三：自己的云服务器（Docker 或裸跑）

```bash
# Docker
docker build -t kanshan-sleep .
docker run -d --name kanshan-sleep -p 80:3000 \
  -e DEEPSEEK_API_KEY=sk-xxxx \
  kanshan-sleep

# 裸跑（服务器上装了 Node 20+）
npm install --include=dev && npm run build && npm install --include=dev --prefix server
PORT=3000 DEEPSEEK_API_KEY=sk-xxxx npm start
```

用 Nginx / Caddy 反代到 3000，并且**要开 HTTPS**（评委点开 https 链接是常态；
之后如果要接知乎 OAuth 登录，回调地址也必须是登记的 https 地址）。

## 部署后必做自检

```bash
# 1. 健康检查：两个 configured 字段会如实告诉你凭证有没有生效
curl https://你的域名/api/health

# 2. 端到端冒烟：用真实浏览器把首页→今晚的心事→三个声音→剧情页走一遍
node test/deploy-smoke.cjs https://你的域名
```

再加三件手工确认的事（活动规则的「提交前检查」）：

1. 手机上打开一次，确认排版没崩（画布按 FIT 缩放，窄屏也能玩）。
2. 断网/额度耗尽时页面**有真实提示**而不是静默空着——三个声音那一页会明确说「暂时连不上知乎内容」。
3. 页面显示、接口调用经过实际运行验证，别把「代码已完成」写成「线上已可用」。

## 代码仓库（选交加分项）

```bash
git init
git add .
git commit -m "看山问你，睡了吗？：睡眠主题体感互动叙事（知乎黑客松 2026）"
git branch -M main
git remote add origin https://github.com/你的账号/仓库名.git
git push -u origin main
```

`.gitignore` 已经排除 `node_modules/`、`dist/`、`.env*` 与测试截图。
推送前再扫一遍凭证：

```bash
grep -rIn --exclude-dir=node_modules -E "sk-[A-Za-z0-9]{16,}|ACCESS_SECRET\s*=\s*['\"]" . || echo "没有发现凭证"
```

## 这份说明里哪些验过、哪些没验

- **验过**：上面那串 Build / Start 命令（在本机按同样顺序跑通，包括故意设 `NODE_ENV=production` 的情况）；
  生产包在"一个进程同源发 dist + /api"下可完整上手（`node test/deploy-smoke.cjs`，含不配任何 key 的降级路径）。
- **没验**：`Dockerfile` 的实际 `docker build`（开发机上没有 Docker，里面的命令与上面验过的裸跑命令一一对应）；
  各平台控制台的具体点击路径；公网域名与 HTTPS 的实际访问。第一次部署后用上面「部署后必做自检」两条命令确认。

## 知乎登录（OAuth）——本项目当前没接

活动页面提示「作品链接可供社区用户点击登录体验」，登录数也是「最佳人气奖」的评定项之一。
本项目目前**没有**接知乎 OAuth：它是一个单机可玩完的体感叙事，不需要登录就能走完核心流程。

如果要接，顺序是：

1. 先在活动页面完成「创建项目」，页面上会给出 `App_ID` 与 `App_Key`；
2. 在部署平台配 `ZHIHU_OAUTH_APP_KEY` 与 `ZHIHU_ACCESS_SECRET`（两者不是一回事，别串位）；
3. 回调地址（`https://你的域名/auth/callback`）必须与活动页面登记值**完全一致**（协议、域名、路径、末尾斜杠）；
4. 接完再回活动页面把「知乎登录回调地址」填上。

详细协议见黑客松 skill 的 `references/hackathon-oauth.md` 与 `oauth.md`。

<!-- OAuth deployment verification: 2026-09-14 -->
