/**
 * 課題・対策マスタに「その他」を追加する。
 *
 *   node prisma/add-other-categories.mjs
 *
 * 追加するもの(課題・対策 × 一般・役員 のすべてに対して):
 *   1. 既存の各大分類の末尾に、内容として「その他」
 *      → 分類は合っているが、当てはまる項目がない場合に選べる
 *   2. 末尾に大分類「その他」と、その中の内容「その他」
 *      → どの分類にも当てはまらない場合に選べる
 *
 * 既に「その他」がある場合は追加しないため、何度実行しても安全。
 * マスタを入れ替えた(import-masters.mjs を実行した)後に実行すること。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OTHER = "その他";
const DESC_CHILD = "この分類の中で、上記のいずれにも当てはまらない場合に選択する。内容は自由記述に具体的に記載する。";
const DESC_PARENT = "上記のいずれの分類にも当てはまらない場合に選択する。";
const DESC_PARENT_CHILD = "分類が難しい場合に選択する。内容は自由記述に具体的に記載する。";

const SCOPES = ["general", "executive"];
const KINDS = [
  { key: "issue", label: "課題", model: () => prisma.issueCategory },
  { key: "cm", label: "対策", model: () => prisma.countermeasureCategory },
];

async function run(model, label, scope) {
  const scopeLabel = scope === "executive" ? "役員用" : "一般用";
  let addedChildren = 0;
  let addedParents = 0;

  // ---- 1. 既存の各大分類に「その他」を追加 ----
  const parents = await model.findMany({
    where: { scope, parentId: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  for (const p of parents) {
    if (p.name === OTHER) continue; // 大分類「その他」は後段で扱う
    const exists = await model.findFirst({ where: { parentId: p.id, name: OTHER } });
    if (exists) continue;
    const last = await model.findFirst({
      where: { parentId: p.id },
      orderBy: { sortOrder: "desc" },
    });
    await model.create({
      data: {
        name: OTHER,
        description: DESC_CHILD,
        scope,
        parentId: p.id,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    addedChildren++;
  }

  // ---- 2. 大分類「その他」とその中の「その他」 ----
  let otherParent = parents.find((p) => p.name === OTHER);
  if (!otherParent) {
    const lastParent = parents[parents.length - 1];
    otherParent = await model.create({
      data: {
        name: OTHER,
        description: DESC_PARENT,
        scope,
        sortOrder: (lastParent?.sortOrder ?? -1) + 1,
      },
    });
    addedParents++;
  }
  const otherChild = await model.findFirst({
    where: { parentId: otherParent.id, name: OTHER },
  });
  if (!otherChild) {
    await model.create({
      data: { name: OTHER, description: DESC_PARENT_CHILD, scope, parentId: otherParent.id, sortOrder: 0 },
    });
    addedChildren++;
  }

  console.log(
    `${label}マスタ(${scopeLabel}): 大分類 +${addedParents}件 / 内容 +${addedChildren}件`
  );
}

async function main() {
  for (const scope of SCOPES) {
    for (const k of KINDS) {
      await run(k.model(), k.label, scope);
    }
  }

  console.log("\n登録後の件数:");
  for (const scope of SCOPES) {
    const label = scope === "executive" ? "役員用" : "一般用";
    const iP = await prisma.issueCategory.count({ where: { scope, parentId: null } });
    const iC = await prisma.issueCategory.count({ where: { scope, parentId: { not: null } } });
    const cP = await prisma.countermeasureCategory.count({ where: { scope, parentId: null } });
    const cC = await prisma.countermeasureCategory.count({ where: { scope, parentId: { not: null } } });
    console.log(`  ${label}: 課題 ${iP}大分類/${iC}項目 · 対策 ${cP}大分類/${cC}項目`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
