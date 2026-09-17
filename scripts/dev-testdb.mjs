// 検証用: 本番DBのコピー(weekly_report_test)に接続して開発サーバを 3001 番で起動する。
// app/.env の DATABASE_URL から DB 名だけを差し替えるので、本番データには一切触れない。
//
//   node scripts/dev-testdb.mjs
//
// テストDBの作り直し: mysqldump で weekly_report を取り、weekly_report_test に流し込む(README 運用メモ参照)
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(appDir, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const [k, ...rest] = t.split("=");
  env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
}
if (!env.DATABASE_URL) {
  console.error("[dev-testdb] app/.env に DATABASE_URL がありません");
  process.exit(1);
}
env.DATABASE_URL = env.DATABASE_URL.replace(/\/weekly_report(\?|$)/, "/weekly_report_test$1");
console.log("[dev-testdb] DATABASE_URL=" + env.DATABASE_URL.replace(/:[^:@]*@/, ":***@"));

const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", "3001"], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
