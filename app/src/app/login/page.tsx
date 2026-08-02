"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <div className="login-wrap">
      <form className="login-card" action={formAction}>
        <div className="brand">
          <span className="mark">週</span>クーリード 週報管理システム
        </div>
        {state.error && (
          <div className="alert err" style={{ marginBottom: 14 }}>
            <span className="ic">!</span>
            <span>{state.error}</span>
          </div>
        )}
        <div className="fld">
          <label htmlFor="email">メールアドレス</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="fld">
          <label htmlFor="password">パスワード</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn pri" style={{ width: "100%" }} disabled={pending}>
          {pending ? "ログイン中…" : "ログイン"}
        </button>
        <p className="note" style={{ marginTop: 14, textAlign: "center" }}>
          アカウントは管理者が発行します。不明な場合は管理部門へお問い合わせください。
        </p>
      </form>
    </div>
  );
}
