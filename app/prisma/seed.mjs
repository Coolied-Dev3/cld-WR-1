import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 対象週の月曜日を返す(日本時間基準の日付をUTC 0時のDATEとして保存)
function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

async function main() {
  const password = "Coolied2026!"; // 平文管理

  // ---- システム設定 ----
  const settings = [
    ["deadline_day_of_week", "5"], // 金曜
    ["deadline_time", "18:00"],
    ["reminder_time", "10:00"],
    ["alert_consecutive_low_weeks", "3"],
    ["teams_webhook_url", ""],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ---- チーム ----
  const teamNames = ["営業1課", "営業2課", "開発課", "管理部"];
  const teams = {};
  for (const name of teamNames) {
    const existing = await prisma.team.findFirst({ where: { name } });
    teams[name] = existing ?? (await prisma.team.create({ data: { name } }));
  }

  // ---- ユーザー ----
  const userDefs = [
    { name: "システム管理者", email: "admin@coolied.local", role: "admin" },
    { name: "田中 一夫", email: "tanaka@coolied.local", role: "executive" },
    { name: "山田 健二", email: "yamada@coolied.local", role: "manager", team: "営業1課", leader: true },
    { name: "中村 正", email: "nakamura@coolied.local", role: "manager", team: "営業2課", leader: true },
    { name: "渡辺 修", email: "watanabe@coolied.local", role: "manager", team: "開発課", leader: true },
    { name: "斎藤 由美", email: "saito@coolied.local", role: "manager", team: "管理部", leader: true },
    { name: "佐藤 太郎", email: "sato@coolied.local", role: "member", team: "営業1課" },
    { name: "鈴木 花子", email: "suzuki@coolied.local", role: "member", team: "営業1課" },
    { name: "高橋 一郎", email: "takahashi@coolied.local", role: "member", team: "営業1課" },
    { name: "伊藤 美咲", email: "ito@coolied.local", role: "member", team: "営業2課" },
    { name: "小林 誠", email: "kobayashi@coolied.local", role: "member", team: "開発課" },
    { name: "加藤 恵", email: "kato@coolied.local", role: "member", team: "管理部" },
  ];
  const users = {};
  for (const u of userDefs) {
    users[u.name] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        mustChangePassword: false,
      },
    });
    if (u.team) {
      const exists = await prisma.teamMembership.findFirst({
        where: { userId: users[u.name].id, endDate: null },
      });
      if (!exists) {
        await prisma.teamMembership.create({
          data: {
            userId: users[u.name].id,
            teamId: teams[u.team].id,
            isLeader: !!u.leader,
            startDate: new Date("2026-04-01T00:00:00Z"),
          },
        });
      }
    }
  }

  // ---- 課題マスタ(大分類→小分類) ----
  const issueTree = {
    "営業": ["新規開拓", "既存深耕", "提案・見積", "受注・失注"],
    "体制・プロセス": ["業務量過多", "業務プロセス", "情報共有", "他部門連携"],
    "スキル・育成": ["専門知識", "業務スキル", "後輩育成"],
    "顧客対応": ["クレーム", "納期調整", "要望対応"],
    "品質": ["成果物品質", "手戻り", "チェック体制"],
    "その他": ["その他"],
  };
  for (const [parent, children] of Object.entries(issueTree)) {
    let p = await prisma.issueCategory.findFirst({ where: { name: parent, parentId: null } });
    if (!p) p = await prisma.issueCategory.create({ data: { name: parent } });
    for (const [i, child] of children.entries()) {
      const c = await prisma.issueCategory.findFirst({ where: { name: child, parentId: p.id } });
      if (!c) await prisma.issueCategory.create({ data: { name: child, parentId: p.id, sortOrder: i } });
    }
  }

  // ---- 対策マスタ ----
  const cmTree = {
    "体制・プロセス改善": ["業務プロセス改善", "役割分担見直し", "会議体・共有方法見直し"],
    "教育・研修": ["OJT", "社内勉強会", "外部研修"],
    "ツール・システム": ["ツール導入", "既存システム改善", "自動化"],
    "個人対応": ["個別フォロー", "目標見直し", "業務量調整"],
    "その他": ["その他", "対策検討中"],
  };
  for (const [parent, children] of Object.entries(cmTree)) {
    let p = await prisma.countermeasureCategory.findFirst({ where: { name: parent, parentId: null } });
    if (!p) p = await prisma.countermeasureCategory.create({ data: { name: parent } });
    for (const [i, child] of children.entries()) {
      const c = await prisma.countermeasureCategory.findFirst({ where: { name: child, parentId: p.id } });
      if (!c) await prisma.countermeasureCategory.create({ data: { name: child, parentId: p.id, sortOrder: i } });
    }
  }

  // ---- デモ週報(営業1課、直近3週) ----
  const salesIssue = await prisma.issueCategory.findFirst({ where: { name: "新規開拓" } });
  const cmProcess = await prisma.countermeasureCategory.findFirst({ where: { name: "業務プロセス改善" } });
  const weeks = ["2026-06-29", "2026-07-06", "2026-07-13"];
  const demoReports = [
    { user: "佐藤 太郎", ratings: ["fair", "excellent", "good"] },
    { user: "鈴木 花子", ratings: ["good", "excellent", "excellent"] },
    { user: "高橋 一郎", ratings: ["fair", "fair", "poor"] },
  ];
  for (const dr of demoReports) {
    for (const [i, w] of weeks.entries()) {
      const weekStart = mondayOf(w);
      const u = users[dr.user];
      const existing = await prisma.weeklyReport.findUnique({
        where: { userId_weekStartDate: { userId: u.id, weekStartDate: weekStart } },
      });
      if (existing) continue;
      await prisma.weeklyReport.create({
        data: {
          userId: u.id,
          teamId: teams["営業1課"].id,
          weekStartDate: weekStart,
          status: "submitted",
          workSummary: `・顧客訪問と提案活動(デモデータ)\n・新規リード架電を実施`,
          selfRating: dr.ratings[i],
          submittedAt: new Date(w + "T08:30:00Z"),
          issues: {
            create: [
              {
                issueCategoryId: salesIssue.id,
                issueComment: "新規リードの母数が不足している",
                countermeasureCategoryId: cmProcess.id,
                countermeasureComment: "架電枠を拡大する",
              },
            ],
          },
          compliance: { create: { level: "none" } },
        },
      });
    }
  }

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

