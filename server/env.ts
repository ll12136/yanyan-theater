import { readFileSync } from 'node:fs';

/**
 * 极简 .env 加载器：不引 dotenv，少一个依赖少一处部署坑。
 *
 * 为什么需要它：本服务有三组配置只能由环境变量提供——
 *   ZHIHU_OAUTH_APP_ID / ZHIHU_OAUTH_APP_KEY / ZHIHU_OAUTH_REDIRECT_URI（知乎登录）
 *   ZHIHU_ACCESS_SECRET（知乎开放平台内容）、DEEPSEEK_API_KEY（剧情改编）
 * 部署平台上直接注入环境变量就行，但本机开发没地方放，所以支持一个可选的 .env 文件。
 *
 * 加载规则：
 *   - 按下面 FILES 的顺序：先 server/.env，再项目根 .env；先读到的不被后面的覆盖。
 *   - **真实环境变量永远优先**，绝不被文件覆盖——部署平台注入的值必须是最终生效的那个。
 *   - 文件不存在是正常情况（线上只给环境变量），静默跳过。
 *
 * 为什么要往 zhihu.ts 里也 import 一次：ESM 的 import 按书写顺序求值，而 server/zhihu.ts
 * 在模块顶层（第 5、6 行）就把 process.env 读进了常量。所以本模块**必须**在它之前求值。
 * zhihu.ts 与 index.ts 都 import 本模块，是为了不依赖调用方把 import 写在哪一行。
 */

/** 相对 server/ ：先 server/.env，后项目根 .env */
const FILES = ['./.env', '../.env'];

function apply(text: string): number {
  let applied = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    // 真环境变量优先：已经有值就不动它
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    applied++;
  }
  return applied;
}

/** 本次从文件里补进来的变量个数；0 表示纯靠环境变量运行 */
export const envFromFiles = FILES.reduce((count, file) => {
  try {
    return count + apply(readFileSync(new URL(file, import.meta.url), 'utf8'));
  } catch {
    return count;
  }
}, 0);
