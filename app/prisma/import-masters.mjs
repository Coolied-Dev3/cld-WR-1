/**
 * 課題・対策マスタの一括登録。
 *
 *   node prisma/import-masters.mjs <masters.json> [--reset]
 *
 *   --reset を付けると、そのファイルの適用範囲(scope)のマスタだけを全削除してから登録する。
 *   例) masters-executive.json に --reset を付けても、一般(general)のマスタは消えない。
 *   マスタを参照している週報の課題・対策(report_issues)も併せて削除される点に注意。
 *
 * masters.json の形式:
 *   {
 *     "scope": "general" | "executive",     // 省略時は general
 *     "issues": [
 *       { "name": "大分類名", "description": "...",
 *         "children": [{ "name": "課題名", "description": "..." }] }
 *     ],
 *     "countermeasures": [ 同上 ]
 *   }
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [, , jsonPath, ...flags] = process.argv;
const RESET = flags.includes("--reset");

if (!jsonPath) {
  console.error("使い方: node prisma/import-masters.mjs <masters.json> [--reset]");
  process.exit(1);
}

const data = JSON.parse(readFileSync(jsonPath, "utf8"));
const scope = data.scope ?? "general";
const scopeLabel = scope === "executive" ? "役員用" : "一般(メンバー・所属長)用";

function validate() {
  const errors = [];
  if (!["general", "executive"].includes(scope)) {
    errors.push(`scope が不正です: ${scope}`);
  }
  for (const [key, label] of [["issues", "課題"], ["countermeasures", "対策"]]) {
    const tree = data[key];
    if (!Array.isArray(tree) || tree.length === 0) {
      errors.push(`${label}マスタが空です`);
      continue;
    }
    const names = new Set();
    for (const p of tree) {
      if (!p.name) errors.push(`${label}: 大分類名が空の項目があります`);
      if (!Array.isArray(p.children) || p.children.length === 0) {
        errors.push(`${label}「${p.name}」に項目がありません`);
      }
      for (const c of p.children ?? []) {
        if (!c.name) errors.push(`${label}「${p.name}」に名称が空の項目があります`);
        const key2 = `${p.name}/${c.name}`;
        if (names.has(key2)) errors.push(`${label}: 重複 ${key2}`);
        names.add(key2);
      }
    }
  }
  if (errors.length) {
    console.error("入力データにエラーがあります:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }
}

async function reset() {
  // このscopeのマスタを参照している週報の課題・対策を先に消す
  const refs = await prisma.reportIssue.count({
    where: { issueCategory: { scope } },
  });
  if (refs > 0) {
    console.log(`週報の課題・対策 ${refs}件を削除します(マスタ参照のため)`);
    await prisma.reportIssue.deleteMany({ where: { issueCategory: { scope } } });
  }
  // 子 → 親の順に削除(自己参照FKのため)
  await prisma.issueCategory.deleteMany({ where: { scope, parentId: { not: null } } });
  await prisma.issueCategory.deleteMany({ where: { scope } });
  await prisma.countermeasureCategory.deleteMany({ where: { scope, parentId: { not: null } } });
  await prisma.countermeasureCategory.deleteMany({ where: { scope } });
  console.log(`既存の${scopeLabel}マスタを削除しました`);
}

async function importTree(isIssue, tree, label) {
  let parents = 0;
  let children = 0;
  for (const [pi, p] of tree.entries()) {
    const parentData = { name: p.name, description: p.description ?? null, scope, sortOrder: pi };
    const parent = isIssue
      ? await prisma.issueCategory.create({ data: parentData })
      : await prisma.countermeasureCategory.create({ data: parentData });
    parents++;
    for (const [ci, c] of p.children.entries()) {
      const childData = {
        name: c.name,
        description: c.description ?? null,
        scope,
        parentId: parent.id,
        sortOrder: ci,
      };
      if (isIssue) await prisma.issueCategory.create({ data: childData });
      else await prisma.countermeasureCategory.create({ data: childData });
      children++;
    }
  }
  console.log(`${label}マスタ: 大分類 ${parents}件 / 項目 ${children}件 を登録しました`);
}

async function main() {
  validate();
  console.log(`適用範囲: ${scopeLabel}`);

  if (RESET) {
    const before =
      (await prisma.issueCategory.count({ where: { scope } })) +
      (await prisma.countermeasureCategory.count({ where: { scope } }));
    console.log(`既存の${scopeLabel}マスタ ${before}件`);
    await reset();
  }

  await importTree(true, data.issues, "課題");
  await importTree(false, data.countermeasures, "対策");

  // 確認
  console.log("\n登録結果:");
  for (const s of ["general", "executive"]) {
    const iP = await prisma.issueCategory.count({ where: { scope: s, parentId: null } });
    const iC = await prisma.issueCategory.count({ where: { scope: s, parentId: { not: null } } });
    const cP = await prisma.countermeasureCategory.count({ where: { scope: s, parentId: null } });
    const cC = await prisma.countermeasureCategory.count({ where: { scope: s, parentId: { not: null } } });
    const label = s === "executive" ? "役員用" : "一般用";
    console.log(`  ${label}: 課題 ${iP}大分類/${iC}項目 · 対策 ${cP}大分類/${cC}項目`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
