import type { SelfRating, ReportStatus, ComplianceLevel } from "@prisma/client";

export const ratingMark: Record<SelfRating, string> = {
  excellent: "◎",
  good: "○",
  fair: "△",
  poor: "✕",
};

export const ratingClass: Record<SelfRating, string> = {
  excellent: "m-ex",
  good: "m-gd",
  fair: "m-fa",
  poor: "m-po",
};

export const ratingLabel: Record<SelfRating, string> = {
  excellent: "非常に良い",
  good: "良い",
  fair: "課題あり",
  poor: "問題あり",
};

/** 統計用スコア(◎=4 〜 ✕=1) */
export const ratingScore: Record<SelfRating, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
};

export const statusLabel: Record<ReportStatus, string> = {
  draft: "下書き",
  submitted: "提出済",
  locked: "ロック",
};

export const complianceLevelLabel: Record<ComplianceLevel, string> = {
  none: "なし",
  concern: "気になる点あり",
  issue: "問題あり",
};
