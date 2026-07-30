"use client";

import { useState } from "react";

export type CategoryChild = { id: number; name: string; description: string | null };
export type CategoryOption = {
  id: number;
  name: string;
  description: string | null;
  children: CategoryChild[];
};

export type IssueRow = {
  issueParentId: number | "";
  issueCategoryId: number | "";
  issueComment: string;
  cmParentId: number | "";
  cmCategoryId: number | "";
  cmComment: string;
};

const emptyRow: IssueRow = {
  issueParentId: "",
  issueCategoryId: "",
  issueComment: "",
  cmParentId: "",
  cmCategoryId: "",
  cmComment: "",
};

/** 大分類・小項目の選択と、選択中の項目の説明表示をまとめたブロック */
function CategoryPicker({
  categories,
  parentId,
  childId,
  childName,
  childLabel,
  required,
  onParentChange,
  onChildChange,
}: {
  categories: CategoryOption[];
  parentId: number | "";
  childId: number | "";
  childName: string;
  childLabel: string;
  required: boolean;
  onParentChange: (v: number | "") => void;
  onChildChange: (v: number | "") => void;
}) {
  const parent = categories.find((c) => c.id === parentId);
  const child = parent?.children.find((c) => c.id === childId);
  const hint = child?.description ?? parent?.description ?? null;

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          value={parentId}
          onChange={(e) => {
            onParentChange(e.target.value ? Number(e.target.value) : "");
            onChildChange("");
          }}
          required={required}
          aria-label="大分類"
        >
          <option value="">大分類を選択</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          name={childName}
          value={childId}
          onChange={(e) => onChildChange(e.target.value ? Number(e.target.value) : "")}
          required={required}
          aria-label={childLabel}
        >
          <option value="">{childLabel}を選択</option>
          {(parent?.children ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {hint && <p className="cat-hint">{hint}</p>}
    </>
  );
}

export function IssuesEditor({
  issueCategories,
  cmCategories,
  initialRows,
}: {
  issueCategories: CategoryOption[];
  cmCategories: CategoryOption[];
  initialRows: IssueRow[];
}) {
  const [rows, setRows] = useState<IssueRow[]>(initialRows.length ? initialRows : []);

  const update = (i: number, patch: Partial<IssueRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <input type="hidden" name="issueCount" value={rows.length} />
      {rows.map((row, i) => (
        <div className="issue-card" key={i}>
          <div className="hd">
            <span>課題 {i + 1}</span>
            <button
              type="button"
              className="btn sm"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              削除
            </button>
          </div>
          <div className="grid2">
            <div>
              <label className="note">課題(必須)</label>
              <CategoryPicker
                categories={issueCategories}
                parentId={row.issueParentId}
                childId={row.issueCategoryId}
                childName={`issue_${i}_categoryId`}
                childLabel="課題"
                required
                onParentChange={(v) => update(i, { issueParentId: v })}
                onChildChange={(v) => update(i, { issueCategoryId: v })}
              />
              <input
                type="text"
                name={`issue_${i}_comment`}
                placeholder="課題の詳細(具体的な状況を記載)"
                style={{ marginTop: 6 }}
                value={row.issueComment}
                onChange={(e) => update(i, { issueComment: e.target.value })}
              />
            </div>
            <div>
              <label className="note">対策(未定の場合は空欄可)</label>
              <CategoryPicker
                categories={cmCategories}
                parentId={row.cmParentId}
                childId={row.cmCategoryId}
                childName={`issue_${i}_cmCategoryId`}
                childLabel="対策"
                required={false}
                onParentChange={(v) => update(i, { cmParentId: v })}
                onChildChange={(v) => update(i, { cmCategoryId: v })}
              />
              <input
                type="text"
                name={`issue_${i}_cmComment`}
                placeholder="対策の詳細(具体的な内容を記載)"
                style={{ marginTop: 6 }}
                value={row.cmComment}
                onChange={(e) => update(i, { cmComment: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, { ...emptyRow }])}>
        + 課題を追加
      </button>
    </div>
  );
}
