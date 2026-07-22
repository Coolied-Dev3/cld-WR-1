"use client";

import { useActionState } from "react";
import { saveReport, type SaveState } from "./actions";
import { IssuesEditor, type CategoryOption, type IssueRow } from "./issues-editor";
import { ComplianceFields } from "./compliance-fields";

export function ReportForm({
  issueCategories,
  cmCategories,
  initial,
}: {
  issueCategories: CategoryOption[];
  cmCategories: CategoryOption[];
  initial: {
    workSummary: string;
    selfRating: string;
    issues: IssueRow[];
    complianceLevel: string;
    complianceContent: string;
    complianceVisibility: string;
    isSubmitted: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveReport, {});

  return (
    <form action={formAction} className="stack">
      {state.error && (
        <div className="alert err">
          <span className="ic">!</span>
          <span>{state.error}</span>
        </div>
      )}
      <div className="card">
        <div className="fld" style={{ marginBottom: 0 }}>
          <label>
            今週行ったこと<span className="req">必須</span>
          </label>
          <textarea name="workSummary" rows={5} defaultValue={initial.workSummary} required />
        </div>
      </div>

      <div className="card">
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 10 }}>
          課題と対策
        </label>
        <IssuesEditor
          issueCategories={issueCategories}
          cmCategories={cmCategories}
          initialRows={initial.issues}
        />
      </div>

      <div className="card">
        <div className="fld" style={{ marginBottom: 0 }}>
          <label>
            自己評価<span className="req">必須</span>
          </label>
          <div className="radio-row">
            {[
              ["excellent", "◎", "非常に良い", "m-ex"],
              ["good", "○", "良い", "m-gd"],
              ["fair", "△", "課題あり", "m-fa"],
              ["poor", "✕", "問題あり", "m-po"],
            ].map(([v, mark, label, cls]) => (
              <label key={v}>
                <input type="radio" name="selfRating" value={v} defaultChecked={initial.selfRating === v} required />
                <span className={`mark4 ${cls}`}>{mark}</span> {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <ComplianceFields
          initialLevel={initial.complianceLevel}
          initialContent={initial.complianceContent}
          initialVisibility={initial.complianceVisibility}
        />
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn" name="mode" value="draft" disabled={pending}>
          下書き保存
        </button>
        <button className="btn pri" name="mode" value="submit" disabled={pending}>
          {pending ? "送信中…" : initial.isSubmitted ? "更新する" : "提出する"}
        </button>
      </div>
    </form>
  );
}
