"use client";

import { useState } from "react";

export type CategoryOption = {
  id: number;
  name: string;
  children: { id: number; name: string }[];
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
      {rows.map((row, i) => {
        const issueParent = issueCategories.find((c) => c.id === row.issueParentId);
        const cmParent = cmCategories.find((c) => c.id === row.cmParentId);
        return (
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
                <label className="note">課題分類(必須)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={row.issueParentId}
                    onChange={(e) =>
                      update(i, {
                        issueParentId: e.target.value ? Number(e.target.value) : "",
                        issueCategoryId: "",
                      })
                    }
                    required
                  >
                    <option value="">大分類を選択</option>
                    {issueCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    name={`issue_${i}_categoryId`}
                    value={row.issueCategoryId}
                    onChange={(e) =>
                      update(i, { issueCategoryId: e.target.value ? Number(e.target.value) : "" })
                    }
                    required
                  >
                    <option value="">小分類を選択</option>
                    {(issueParent?.children ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  name={`issue_${i}_comment`}
                  placeholder="課題の詳細"
                  style={{ marginTop: 6 }}
                  value={row.issueComment}
                  onChange={(e) => update(i, { issueComment: e.target.value })}
                />
              </div>
              <div>
                <label className="note">対策分類(未定の場合は空欄可)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={row.cmParentId}
                    onChange={(e) =>
                      update(i, {
                        cmParentId: e.target.value ? Number(e.target.value) : "",
                        cmCategoryId: "",
                      })
                    }
                  >
                    <option value="">大分類を選択</option>
                    {cmCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    name={`issue_${i}_cmCategoryId`}
                    value={row.cmCategoryId}
                    onChange={(e) =>
                      update(i, { cmCategoryId: e.target.value ? Number(e.target.value) : "" })
                    }
                  >
                    <option value="">小分類を選択</option>
                    {(cmParent?.children ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  name={`issue_${i}_cmComment`}
                  placeholder="対策の詳細"
                  style={{ marginTop: 6 }}
                  value={row.cmComment}
                  onChange={(e) => update(i, { cmComment: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, { ...emptyRow }])}>
        + 課題を追加
      </button>
    </div>
  );
}
