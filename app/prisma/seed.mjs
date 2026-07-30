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

  // ---- 課題マスタ(大分類 → 課題。課題には選択の目安となる説明を付ける) ----
  // [大分類, 説明]: [[課題, 説明], ...]
  const issueTree = [
    ["営業", "受注に至るまでの営業活動に関する課題", [
      ["新規開拓", "新規顧客・新規リードの獲得が計画どおりに進んでいない"],
      ["既存深耕", "既存顧客からの追加受注・関係強化が進んでいない"],
      ["提案・見積", "提案内容や見積の精度・スピードに問題がある"],
      ["受注・失注", "商談が受注に結びつかない、または失注が続いている"],
    ]],
    ["体制・プロセス", "業務の進め方や組織体制に関する課題", [
      ["業務量過多", "担当業務が多すぎて計画どおりに進められない"],
      ["業務プロセス", "手順が非効率・属人化しており改善が必要"],
      ["情報共有", "必要な情報が共有されず認識のズレや手戻りが生じている"],
      ["他部門連携", "他部門との調整・連携がうまくいかず業務が滞っている"],
    ]],
    ["スキル・育成", "知識・技能や人材育成に関する課題", [
      ["専門知識", "業務に必要な専門知識・技術が不足している"],
      ["業務スキル", "資料作成・段取りなど業務遂行スキルが不足している"],
      ["後輩育成", "後輩・メンバーの指導や引き継ぎが十分にできていない"],
    ]],
    ["顧客対応", "顧客とのやり取りに関する課題", [
      ["クレーム", "顧客からの指摘・クレームが発生している"],
      ["納期調整", "納期の見通しや調整に問題が生じている"],
      ["要望対応", "顧客要望への対応が困難、または対応が遅れている"],
    ]],
    ["品質", "成果物の品質に関する課題", [
      ["成果物品質", "納品物・制作物の品質が基準に達していない"],
      ["手戻り", "確認漏れや認識違いによるやり直しが発生している"],
      ["チェック体制", "レビュー・検証の体制や基準が不十分である"],
    ]],
    ["その他", "上記のいずれにも当てはまらない課題", [
      ["その他", "分類が難しい課題。内容は自由記述に具体的に記載する"],
    ]],
  ];
  for (const [parentName, parentDesc, children] of issueTree) {
    let p = await prisma.issueCategory.findFirst({ where: { name: parentName, parentId: null } });
    if (!p) p = await prisma.issueCategory.create({ data: { name: parentName, description: parentDesc } });
    else if (!p.description) {
      await prisma.issueCategory.update({ where: { id: p.id }, data: { description: parentDesc } });
    }
    for (const [i, [childName, childDesc]] of children.entries()) {
      const c = await prisma.issueCategory.findFirst({ where: { name: childName, parentId: p.id } });
      if (!c) {
        await prisma.issueCategory.create({
          data: { name: childName, description: childDesc, parentId: p.id, sortOrder: i },
        });
      } else if (!c.description) {
        await prisma.issueCategory.update({ where: { id: c.id }, data: { description: childDesc } });
      }
    }
  }

  // ---- 対策マスタ(大分類 → 対策) ----
  const cmTree = [
    ["体制・プロセス改善", "業務の進め方や体制を見直して解決する", [
      ["業務プロセス改善", "手順の見直し・標準化により効率と品質を上げる"],
      ["役割分担見直し", "担当や責任範囲を組み替えて負荷と滞留を解消する"],
      ["会議体・共有方法見直し", "打ち合わせや共有の頻度・方法を変えて認識を揃える"],
    ]],
    ["教育・研修", "知識・技能を高めて解決する", [
      ["OJT", "実務を通じて先輩が指導し習熟させる"],
      ["社内勉強会", "社内で知識を共有する場を設けて底上げする"],
      ["外部研修", "外部の研修・セミナーを受講して習得する"],
    ]],
    ["ツール・システム", "仕組みの導入・改善で解決する", [
      ["ツール導入", "新しいツール・サービスを導入して負荷を下げる"],
      ["既存システム改善", "現在使っているシステムを改修して使いやすくする"],
      ["自動化", "手作業を自動化して工数とミスを削減する"],
    ]],
    ["個人対応", "個人への働きかけで解決する", [
      ["個別フォロー", "面談・同行などで個別に支援する"],
      ["目標見直し", "目標値や優先順位を現実的な水準に調整する"],
      ["業務量調整", "担当業務の量や配分を調整して負荷を平準化する"],
    ]],
    ["その他", "上記のいずれにも当てはまらない対策", [
      ["その他", "分類が難しい対策。内容は自由記述に具体的に記載する"],
      ["対策検討中", "対策が未定。次週までに検討して具体化する"],
    ]],
  ];
  for (const [parentName, parentDesc, children] of cmTree) {
    let p = await prisma.countermeasureCategory.findFirst({ where: { name: parentName, parentId: null } });
    if (!p) p = await prisma.countermeasureCategory.create({ data: { name: parentName, description: parentDesc } });
    else if (!p.description) {
      await prisma.countermeasureCategory.update({ where: { id: p.id }, data: { description: parentDesc } });
    }
    for (const [i, [childName, childDesc]] of children.entries()) {
      const c = await prisma.countermeasureCategory.findFirst({ where: { name: childName, parentId: p.id } });
      if (!c) {
        await prisma.countermeasureCategory.create({
          data: { name: childName, description: childDesc, parentId: p.id, sortOrder: i },
        });
      } else if (!c.description) {
        await prisma.countermeasureCategory.update({ where: { id: c.id }, data: { description: childDesc } });
      }
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
