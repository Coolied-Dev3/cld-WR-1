import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  createMasterCategory,
  updateMasterCategory,
  toggleMasterCategory,
  moveMasterCategory,
} from "../actions";

type Scope = "general" | "executive";

type Cat = {
  id: bigint;
  parentId: bigint | null;
  name: string;
  description: string | null;
  scope: Scope;
  isActive: boolean;
};

/** 1項目の表示と編集フォーム */
function CategoryRow({
  cat,
  kind,
  isParent,
  used,
  isFirst,
  isLast,
}: {
  cat: Cat;
  kind: "issue" | "cm";
  isParent: boolean;
  used: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className={isParent ? "master-parent" : "master-child"}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="order-btns">
          <form action={moveMasterCategory}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={cat.id.toString()} />
            <input type="hidden" name="direction" value="up" />
            <button className="btn sm" disabled={isFirst} title="1つ上へ" aria-label={`${cat.name}を1つ上へ`}>
              ▲
            </button>
          </form>
          <form action={moveMasterCategory}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={cat.id.toString()} />
            <input type="hidden" name="direction" value="down" />
            <button className="btn sm" disabled={isLast} title="1つ下へ" aria-label={`${cat.name}を1つ下へ`}>
              ▼
            </button>
          </form>
        </span>
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
  scope,
  categories,
  usedIds,
}: {
  title: string;
  childLabel: string;
  kind: "issue" | "cm";
  scope: Scope;
  categories: Cat[];
  usedIds: Set<string>;
}) {
  const parents = categories.filter((c) => c.parentId === null);
  return (
    <div className="card">
      <h2>{title}</h2>
      {parents.map((p, pi) => {
        const children = categories.filter((c) => c.parentId === p.id);
        return (
          <div key={p.id.toString()} style={{ marginBottom: 18 }}>
            <CategoryRow
              cat={p}
              kind={kind}
              isParent
              used={usedIds.has(p.id.toString())}
              isFirst={pi === 0}
              isLast={pi === parents.length - 1}
            />
            <div style={{ marginTop: 8 }}>
              {children.map((c, ci) => (
                <CategoryRow
                  key={c.id.toString()}
                  cat={c}
                  kind={kind}
                  isParent={false}
                  used={usedIds.has(c.id.toString())}
                  isFirst={ci === 0}
                  isLast={ci === children.length - 1}
                />
              ))}
            </div>
          </div>
        );
      })}

      <form
        action={createMasterCategory}
        className="stack"
        style={{ borderTop: "1px solid var(--line)", paddingTop: 12, gap: 8 }}
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="scope" value={scope} />
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

const SCOPES: { value: Scope; label: string; note: string }[] = [
  { value: "general", label: "一般(メンバー・所属長)", note: "メンバーと所属長が週報入力時に選択するマスタ" },
  { value: "executive", label: "役員", note: "役員が週報入力時に選択する経営課題のマスタ" },
];

export default async function AdminMastersPage(props: {
  searchParams: Promise<{ scope?: string }>;
}) {
  await requireUser(["admin"]);
  const { scope: scopeParam } = await props.searchParams;
  const scope: Scope = scopeParam === "executive" ? "executive" : "general";
  const current = SCOPES.find((s) => s.value === scope)!;

  const [issues, cms, usedIssues, usedCms] = await Promise.all([
    prisma.issueCategory.findMany({ where: { scope }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.countermeasureCategory.findMany({ where: { scope }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
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
        <small>▲▼で表示順を変更できます。説明は週報入力時に選択の目安として表示されます</small>
      </h1>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="filterbar">
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>適用範囲</span>
          {SCOPES.map((s) => (
            <a
              key={s.value}
              href={`/admin/masters?scope=${s.value}`}
              className={`btn sm${s.value === scope ? " pri" : ""}`}
            >
              {s.label}
            </a>
          ))}
          <span className="note">{current.note}</span>
        </div>
      </div>

      <div className="hrow">
        <MasterPanel
          title="課題マスタ"
          childLabel="課題"
          kind="issue"
          scope={scope}
          categories={issues}
          usedIds={new Set(usedIssues.map((u) => u.issueCategoryId.toString()))}
        />
        <MasterPanel
          title="対策マスタ"
          childLabel="対策"
          kind="cm"
          scope={scope}
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
