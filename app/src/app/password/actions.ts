"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, logAudit } from "@/lib/auth";

export type PasswordState = { error?: string };

export async function changePassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (user.password !== current) {
    return { error: "現在のパスワードが正しくありません。" };
  }
  if (next.length < 8) {
    return { error: "新しいパスワードは8文字以上にしてください。" };
  }
  if (next !== confirm) {
    return { error: "新しいパスワード(確認)が一致しません。" };
  }
  if (next === current) {
    return { error: "現在と同じパスワードは設定できません。" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: next, mustChangePassword: false },
  });
  await logAudit(user.id, "auth.change_password", "users", user.id);

  if (user.role === "admin") redirect("/admin/users");
  redirect("/");
}
