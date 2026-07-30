/**
 * 初期マスタデータの投入(課題マスタ・対策マスタ・システム設定)。
 *
 *   node prisma/seed.mjs
 *
 * 何度実行しても既存データは書き換えない(追加のみ)。
 * ユーザー・事業室の登録は prisma/import-roster.mjs を使うこと。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ---- システム設定 ----
  const settings = [
    ["deadline_day_of_week", "5"], // 金曜
    ["deadline_time", "18:00"],
    ["reminder_time", "10:00"],
    ["alert_consecutive_low_weeks", "3"],
    ["teams_webhook_url", ""],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ---- 課題マスタ(大分類→小分類) ----
  const issueTree = {
    "営業": ["新規開拓", "既存深耕", "提案・見積", "受注・失注"],
    "体制・プロセス": ["業務量過多", "業務プロセス", "情報共有", "他部門連携"],
    "スキル・育成": ["専門知識", "業務スキル", "後輩育成"],
    "顧客対応": ["クレーム", "納期調整", "要望対応"],
    "品質": ["成果物品質", "手戻り", "チェック体制"],
    "その他": ["その他"],
  };
  for (const [parent, children] of Object.entries(issueTree)) {
    let p = await prisma.issueCategory.findFirst({ where: { name: parent, parentId: null } });
    if (!p) p = await prisma.issueCategory.create({ data: { name: parent } });
    for (const [i, child] of children.entries()) {
      const c = await prisma.issueCategory.findFirst({ where: { name: child, parentId: p.id } });
      if (!c) await prisma.issueCategory.create({ data: { name: child, parentId: p.id, sortOrder: i } });
    }
  }

  // ---- 対策マスタ ----
  const cmTree = {
    "体制・プロセス改善": ["業務プロセス改善", "役割分担見直し", "会議体・共有方法見直し"],
    "教育・研修": ["OJT", "社内勉強会", "外部研修"],
    "ツール・システム": ["ツール導入", "既存システム改善", "自動化"],
    "個人対応": ["個別フォロー", "目標見直し", "業務量調整"],
    "その他": ["その他", "対策検討中"],
  };
  for (const [parent, children] of Object.entries(cmTree)) {
    let p = await prisma.countermeasureCategory.findFirst({ where: { name: parent, parentId: null } });
    if (!p) p = await prisma.countermeasureCategory.create({ data: { name: parent } });
    for (const [i, child] of children.entries()) {
      const c = await prisma.countermeasureCategory.findFirst({ where: { name: child, parentId: p.id } });
      if (!c) await prisma.countermeasureCategory.create({ data: { name: child, parentId: p.id, sortOrder: i } });
    }
  }

  const issues = await prisma.issueCategory.count();
  const cms = await prisma.countermeasureCategory.count();
  console.log(`マスタ投入完了: 課題マスタ ${issues}件 / 対策マスタ ${cms}件 / 設定 ${settings.length}件`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
