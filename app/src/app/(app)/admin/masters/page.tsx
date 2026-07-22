import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createMasterCategory, toggleMasterCategory } from "../actions";

type Cat = {
  id: bigint;
  parentId: bigint | null;
  name: string;
  isActive: boolean;
};

function MasterPanel({ title, kind, categories, usedIds }: {
  title: string;
  kind: "issue" | "cm";
  categories: Cat[];
  usedIds: Set<string>;
}) {
  const parents = categories.filter((c) => c.parentId === null);
  return (
    <div className="card">
      <h2>{title}</h2>
      {parents.map((p) => (
        <div key={p.id.toString()} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <span style={{ opacity: p.isActive ? 1 : 0.45 }}>{p.name}</span>
            {!p.isActive && <span className="pill mut">無効</span>}
            <form action={toggleMasterCategory} style={{ marginLeft: "auto" }}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={p.id.toString()} />
              <button className="btn sm">{p.isActive ? "無効化" : "有効化"}</button>
            </form>
          </div>
          <table style={{ marginTop: 4 }}>
            <tbody>
              {categories
                .filter((c) => c.parentId === p.id)
                .map((c) => (
                  <tr key={c.id.toString()}>
                    <td style={{ opacity: c.isActive ? 1 : 0.45 }}>
                      {c.name}
                      {!c.isActive && <span className="pill mut" style={{ marginLeft: 6 }}>無効</span>}
                      {usedIds.has(c.id.toString()) && (
                        <span className="note" style={{ marginLeft: 6 }}>使用実績あり</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", width: 90 }}>
                      <form action={toggleMasterCategory}>
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="id" value={c.id.toString()} />
                        <button className="btn sm">{c.isActive ? "無効化" : "有効化"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      <form action={createMasterCategory} className="filterbar" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <input type="hidden" name="kind" value={kind} />
        <select name="parentId" style={{ width: "auto" }}>
          <option value="">(大分類として追加)</option>
          {parents.filter((p) => p.isActive).map((p) => (
            <option key={p.id.toString()} value={p.id.toString()}>{p.name} の小分類</option>
          ))}
        </select>
        <input type="text" name="name" placeholder="分類名" required style={{ width: 160 }} />
        <button className="btn pri sm">追加</button>
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
      <h1 className="pg">マスタ管理<small>削除はできません。「無効化」で選択肢から外れます(過去データは保持)</small></h1>
      <div className="hrow">
        <MasterPanel
          title="課題マスタ"
          kind="issue"
          categories={issues}
          usedIds={new Set(usedIssues.map((u) => u.issueCategoryId.toString()))}
        />
        <MasterPanel
          title="対策マスタ"
          kind="cm"
          categories={cms}
          usedIds={new Set(usedCms.map((u) => u.countermeasureCategoryId!.toString()))}
        />
      </div>
    </>
  );
}
