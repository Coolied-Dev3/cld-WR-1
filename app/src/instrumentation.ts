export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 起動時の主要設定を記録しておく(設定ミスの切り分け用)
    console.log(
      `[config] NODE_ENV=${process.env.NODE_ENV} / COOKIE_SECURE=${process.env.COOKIE_SECURE ?? "(未設定)"}`
    );
    const { startCron } = await import("./lib/cron");
    startCron();
  }
}
