"use client";

import { useState } from "react";

export function ComplianceFields({
  initialLevel,
  initialContent,
  initialVisibility,
}: {
  initialLevel: string;
  initialContent: string;
  initialVisibility: string;
}) {
  const [level, setLevel] = useState(initialLevel);
  return (
    <>
      <div className="fld">
        <label>ビジネスモラル・ハラスメント</label>
        <div className="radio-row">
          {[
            ["none", "なし"],
            ["concern", "気になる点あり"],
            ["issue", "問題あり"],
          ].map(([v, label]) => (
            <label key={v}>
              <input
                type="radio"
                name="complianceLevel"
                value={v}
                checked={level === v}
                onChange={() => setLevel(v)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      {level !== "none" && (
        <>
          <div className="fld">
            <label>内容</label>
            <textarea
              name="complianceContent"
              rows={3}
              defaultValue={initialContent}
              placeholder="気になった出来事を記載してください"
            />
          </div>
          <div className="fld" style={{ marginBottom: 0 }}>
            <label>公開範囲</label>
            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  name="complianceVisibility"
                  value="manager_and_executive"
                  defaultChecked={initialVisibility !== "executive_only"}
                />
                所属長・役員に公開
              </label>
              <label>
                <input
                  type="radio"
                  name="complianceVisibility"
                  value="executive_only"
                  defaultChecked={initialVisibility === "executive_only"}
                />
                役員のみに公開
              </label>
            </div>
            <div className="note" style={{ marginTop: 4 }}>
              「役員のみ」を選ぶと、所属長にはこの欄自体が表示されません。
            </div>
          </div>
        </>
      )}
    </>
  );
}
