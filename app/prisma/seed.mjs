/**
 * システム設定の初期投入。
 *
 *   node prisma/seed.mjs
 *
 * 既存の値は書き換えない(未設定のキーだけ追加する)ため、何度実行しても安全。
 *
 * 課題・対策マスタは prisma/import-masters.mjs、
 * ユーザー・事業室は prisma/import-roster.mjs で投入すること。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 締切日は「対象週の月曜から何日後か」で保持する
  // (4=当週の金曜、5=当週の土曜、6=当週の日曜、7=翌週の月曜、8=翌週の火曜…)
  const settings = [
    ["deadline_day_offset", "4"], // 当週の金曜
    ["deadline_time", "18:00"],
    ["reminder_day_offset", "4"], // 当週の金曜
    ["reminder_time", "10:00"],
    ["alert_consecutive_low_weeks", "3"],
    ["teams_webhook_url", ""],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // 旧バージョンで使っていたキー(曜日番号)は deadline_day_offset に置き換わったため削除する
  await prisma.appSetting.deleteMany({ where: { key: "deadline_day_of_week" } });

  const rows = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  console.log(`システム設定 ${rows.length}件`);
  for (const r of rows) {
    console.log(`  ${r.key} = ${r.value === "" ? "(未設定)" : r.value}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
