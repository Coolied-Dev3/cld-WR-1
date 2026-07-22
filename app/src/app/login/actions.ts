"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください。" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.password !== password) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  const session = await getSession();
  session.userId = user.id.toString();
  await session.save();
  await logAudit(user.id, "auth.login", "users", user.id);

  if (user.mustChangePassword) redirect("/password");
  if (user.role === "admin") redirect("/admin/users");
  redirect("/");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
