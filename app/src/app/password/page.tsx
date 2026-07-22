"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

export default function PasswordPage() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <div className="login-wrap">
      <form className="login-card" action={formAction}>
        <div className="brand">
          <span className="mark">週</span>パスワード変更
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          初回ログイン時はパスワードの変更が必要です。8文字以上で設定してください。
        </p>
        {state.error && (
          <div className="alert err" style={{ marginBottom: 14 }}>
            <span className="ic">!</span>
            <span>{state.error}</span>
          </div>
        )}
        <div className="fld">
          <label htmlFor="current">現在のパスワード</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
        <div className="fld">
          <label htmlFor="next">新しいパスワード</label>
          <input id="next" name="next" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div className="fld">
          <label htmlFor="confirm">新しいパスワード(確認)</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <button className="btn pri" style={{ width: "100%" }} disabled={pending}>
          {pending ? "変更中…" : "変更する"}
        </button>
      </form>
    </div>
  );
}
