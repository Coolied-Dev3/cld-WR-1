import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createMasterCategory, updateMasterCategory, toggleMasterCategory } from "../actions";

type Cat = {
  id: bigint;
  parentId: bigint | null;
  name: string;
  description: string | null;
  isActive: boolean;
};

/** 1項目の表示と編集フォーム */
function CategoryRow({
  cat,
  kind,
  isParent,
  used,
}: {
  cat: Cat;
  kind: "issue" | "cm";
  isParent: boolean;
  used: boolean;
}) {
  return (
    <div className={isParent ? "master-parent" : "master-child"}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ opacity: cat.isActive ? 1 : 0.45, fontWeight: isParent ? 700 : 400 }}>
          {cat.name}
        </span>
        {!cat.isActive && <span className="pill mut">無効</span>}
        {used && <span className="note">使用実績あり</span>}
        <span style={{ flex: 1 }} />
        <details>
          <summary className="btn sm" style={{ listStyle: "none", display: "inline-block" }}>編集</summary>
          <form action={updateMasterCategory} className="master-edit">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={cat.id.toString()} />
            <input type="text" name="name" defaultValue={cat.name} required placeholder="名称" />
            <input
              type="text"
              name="description"
              defaultValue={cat.description ?? ""}
              placeholder="説明(選択時に表示されます)"
              maxLength={500}
            />
            <button className="btn sm pri">保存</button>
          </form>
        </details>
        <form action={toggleMasterCategory}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={cat.id.toString()} />
          <button className="btn sm">{cat.isActive ? "無効化" : "有効化"}</button>
        </form>
      </div>
      {cat.description ? (
        <p className="cat-hint" style={{ opacity: cat.isActive ? 1 : 0.45 }}>{cat.description}</p>
      ) : (
        <p className="note" style={{ margin: "4px 0 0" }}>説明が未設定です</p>
      )}
    </div>
  );
}

function MasterPanel({
  title,
  childLabel,
  kind,
  categories,
  usedIds,
}: {
  title: string;
  childLabel: string;
  kind: "issue" | "cm";
  categories: Cat[];
  usedIds: Set<string>;
}) {
  const parents = categories.filter((c) => c.parentId === null);
  return (
    <div className="card">
      <h2>{title}</h2>
      {parents.map((p) => (
        <div key={p.id.toString()} style={{ marginBottom: 18 }}>
          <CategoryRow cat={p} kind={kind} isParent used={usedIds.has(p.id.toString())} />
          <div style={{ marginTop: 8 }}>
            {categories
              .filter((c) => c.parentId === p.id)
              .map((c) => (
                <CategoryRow
                  key={c.id.toString()}
                  cat={c}
                  kind={kind}
                  isParent={false}
                  used={usedIds.has(c.id.toString())}
                />
              ))}
          </div>
        </div>
      ))}

      <form
        action={createMasterCategory}
        className="stack"
        style={{ borderTop: "1px solid var(--line)", paddingTop: 12, gap: 8 }}
      >
        <input type="hidden" name="kind" value={kind} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select name="parentId" style={{ width: "auto" }} defaultValue="">
            <option value="">大分類として追加</option>
            {parents
              .filter((p) => p.isActive)
              .map((p) => (
                <option key={p.id.toString()} value={p.id.toString()}>
                  {p.name} の{childLabel}として追加
                </option>
              ))}
          </select>
          <input type="text" name="name" placeholder="名称" required style={{ width: 160 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            name="description"
            placeholder="説明(選択時に表示されます)"
            maxLength={500}
          />
          <button className="btn pri sm" style={{ whiteSpace: "nowrap" }}>追加</button>
        </div>
      </form>
    </div>
  );
}

export default async function AdminMastersPage() {
  await requireUser(["admin"]);
  const [issues, cms, usedIssues, usedCms] = await Promise.all([
    prisma.issueCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.countermeasureCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.reportIssue.findMany({ select: { issueCategoryId: true }, distinct: ["issueCategoryId"] }),
    prisma.reportIssue.findMany({
      select: { countermeasureCategoryId: true },
      distinct: ["countermeasureCategoryId"],
      where: { countermeasureCategoryId: { not: null } },
    }),
  ]);

  return (
    <>
      <h1 className="pg">
        マスタ管理
        <small>大分類と課題・対策の2階層。説明は週報入力時に選択の目安として表示されます</small>
      </h1>
      <div className="hrow">
        <MasterPanel
          title="課題マスタ"
          childLabel="課題"
          kind="issue"
          categories={issues}
          usedIds={new Set(usedIssues.map((u) => u.issueCategoryId.toString()))}
        />
        <MasterPanel
          title="対策マスタ"
          childLabel="対策"
          kind="cm"
          categories={cms}
          usedIds={new Set(usedCms.map((u) => u.countermeasureCategoryId!.toString()))}
        />
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        削除はできません。「無効化」すると週報入力の選択肢から外れますが、過去データと統計は保持されます。
      </p>
    </>
  );
}
