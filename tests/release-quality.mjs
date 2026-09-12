import { createRequire } from "node:module";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
});
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const appUrl = new URL(`file:///${path.resolve(import.meta.dirname, "..", "index.html").replaceAll("\\", "/")}`).href;
const pageErrors = [];
const results = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function resetApp(setup = () => {}) {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(setup);
  await page.reload();
}

async function test(name, run) {
  try {
    await run();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await test("日付計算（月末・年末年始・うるう年）", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  const dates = await page.evaluate(() => ({
    leap: addDaysToDateString("2024-02-28", 1),
    leapMonth: addDaysToDateString("2024-02-29", 1),
    month: addDaysToDateString("2026-01-31", 1),
    year: addDaysToDateString("2026-12-31", 1),
    previous: getPreviousDateString("2027-01-01")
  }));
  assert(dates.leap === "2024-02-29", "うるう日の加算が不正");
  assert(dates.leapMonth === "2024-03-01", "うるう日から月初への加算が不正");
  assert(dates.month === "2026-02-01", "月末から月初への加算が不正");
  assert(dates.year === "2027-01-01" && dates.previous === "2026-12-31", "年末年始の計算が不正");
});

await test("アプリ日付のAM3:00切り替え", async () => {
  const dates = await page.evaluate(() => ({
    before: getLocalDateString(new Date(2026, 8, 1, 2, 59, 59)),
    after: getLocalDateString(new Date(2026, 8, 1, 3, 0, 0))
  }));
  assert(dates.before === "2026-08-31" && dates.after === "2026-09-01", "AM3:00の日付切り替えが不正");
});

await test("Habit登録・達成・取消・再読み込み・二重加算防止", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.locator("#habitInput").fill("読書");
  await page.locator("#habitForm button[type='submit']").click();
  assert(await page.locator("#habitForm").isHidden(), "Habit登録後も登録フォームが表示されている");
  await page.locator("#habitCheckbox").click();
  let values = await page.evaluate(() => ({ points: state.totalPoints, days: state.habit.totalCompletedDays, streak: state.habit.streak }));
  assert(values.points === 5 && values.days === 1 && values.streak === 1, "Habit初日達成値が不正");
  await page.reload();
  values = await page.evaluate(() => ({ points: state.totalPoints, days: state.habit.totalCompletedDays, streak: state.habit.streak }));
  assert(values.points === 5 && values.days === 1 && values.streak === 1, "再読み込みでHabitが二重加算された");
  await page.locator("#habitCollapseButton").click();
  await page.locator("#habitCheckbox").click();
  values = await page.evaluate(() => ({ points: state.totalPoints, days: state.habit.totalCompletedDays, streak: state.habit.streak }));
  assert(values.points === 0 && values.days === 0 && values.streak === 0, "Habit取消時の復元が不正");
});

await test("Habit初回未達成日の確認・補完・XP非付与", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    const today = getLocalDateString();
    const yesterday = addDaysToDateString(today, -1);
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = today;
    prepared.lastUsedDate = yesterday;
    prepared.daily.date = yesterday;
    prepared.habit.name = "ストレッチ";
    prepared.habit.startedDate = yesterday;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  assert(await page.locator("#habitGapDialog").isVisible(), "登録初日が未達成のとき未記録確認が表示されない");
  let values = await page.evaluate(() => ({ streak: state.habit.streak, days: state.habit.totalCompletedDays, points: state.totalPoints }));
  assert(values.streak === 0 && values.days === 0 && values.points === 0, "確認前にHabit記録が進んだ");
  await page.locator("#habitContinuedButton").click();
  values = await page.evaluate(() => ({
    streak: state.habit.streak,
    days: state.habit.totalCompletedDays,
    points: state.totalPoints,
    last: state.habit.lastCompletedDate,
    yesterday: getPreviousDateString(getLocalDateString())
  }));
  assert(values.streak === 1 && values.days === 1 && values.points === 0 && values.last === values.yesterday, "初回記録忘れの補完値が不正");
  assert(await page.locator("#habitStreak").textContent() === "継続 2日目 🔥", "補完後の今日のStreak表示が不正");
  await page.reload();
  values = await page.evaluate(() => ({ streak: state.habit.streak, days: state.habit.totalCompletedDays, points: state.totalPoints }));
  assert(values.streak === 1 && values.days === 1 && values.points === 0, "初回補完が再読み込みで二重加算された");
});

await test("Habit未記録複数日・再スタート・累計保持", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    const today = getLocalDateString();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = today;
    prepared.habit = {
      ...prepared.habit,
      name: "運動",
      startedDate: addDaysToDateString(today, -10),
      lastCompletedDate: addDaysToDateString(today, -4),
      streak: 7,
      totalCompletedDays: 12,
      pointAwardDates: [addDaysToDateString(today, -4)]
    };
    prepared.totalPoints = 50;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  assert(await page.locator("#habitGapDialog").isVisible(), "複数日の未記録確認が表示されない");
  await page.locator("#habitRestartButton").click();
  const values = await page.evaluate(() => ({ name: state.habit.name, streak: state.habit.streak, days: state.habit.totalCompletedDays, points: state.totalPoints }));
  assert(values.name === "運動" && values.streak === 0 && values.days === 12 && values.points === 50, "再スタートで累計データが失われた");
  assert(await page.locator("#habitStreak").textContent() === "今日からスタート 🌱", "再スタート表示が不正");
});

await test("Mission件数・全件完了・XP・3件ボーナス・再加算防止", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    prepared.missions = ["A", "B", "C"].map(createMissionEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  assert(await page.locator("#missionEntryActions").isHidden(), "Mission3件時に追加操作が残っている");
  const ids = await page.evaluate(() => state.missions.map((mission) => mission.id));
  await page.evaluate((id) => toggleMission(id), ids[2]);
  assert(await page.evaluate(() => state.totalPoints === 2 && state.missions[2].xpAwarded === 2), "Mission③単体が+2XPではない");
  await page.evaluate((id) => toggleMission(id), ids[0]);
  assert(await page.evaluate(() => state.totalPoints === 4 && !isMissionComplete()), "Mission2件のXPまたは完了判定が不正");
  await page.evaluate((id) => toggleMission(id), ids[1]);
  assert(await page.evaluate(() => state.totalPoints === 8 && isMissionComplete() && state.daily.missionThreeBonusAwarded), "Mission3件の6+2XPが不正");
  assert(await page.locator("#missionCardBody").isVisible(), "Mission完了時に自動で閉じた");
  await page.reload();
  assert(await page.evaluate(() => state.totalPoints === 8), "Mission XPが再読み込みで二重加算された");
  assert(await page.locator("#missionCardBody").isHidden(), "完了済みMissionが再起動時に閉じていない");
  await page.evaluate((id) => toggleMission(id), ids[2]);
  assert(await page.evaluate(() => state.totalPoints === 4 && !state.daily.missionThreeBonusAwarded), "Mission取消時のXP減算が不正");
  await page.evaluate((id) => toggleMission(id), ids[2]);
  assert(await page.evaluate(() => state.totalPoints === 8 && state.daily.missionThreeBonusAwarded), "Mission再達成時のXP復元が不正");
});

await test("Mission 1〜2件の完了判定・完了後追加", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    prepared.missions = [createMissionEntry("A")];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.evaluate(() => toggleMission(state.missions[0].id));
  assert(await page.evaluate(() => isMissionComplete()), "Mission1件完了が全件完了にならない");
  await page.evaluate(() => {
    state.missions.push(createMissionEntry("B"));
    missionCardExpanded = true;
    checkAndAwardAchievementBonus();
    saveState();
    renderAll();
  });
  assert(await page.evaluate(() => state.missions.length === 2 && !isMissionComplete()), "完了後のMission追加で未完了へ戻らない");
  await page.evaluate(() => toggleMission(state.missions[1].id));
  assert(await page.evaluate(() => isMissionComplete() && state.totalPoints === 4), "Mission2件完了の判定またはXPが不正");
});

await test("Habit・Mission・Todoの編集と削除", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    const today = getLocalDateString();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = today;
    prepared.habit.name = "旧Habit";
    prepared.habit.startedDate = today;
    prepared.habit.completedToday = true;
    prepared.habit.streak = 1;
    prepared.habit.lastCompletedDate = today;
    prepared.habit.totalCompletedDays = 7;
    prepared.habit.pointAwardDates = [today];
    prepared.missions = [{ ...createMissionEntry("旧Mission"), completed: true, pointAwarded: true, xpAwarded: 2 }];
    prepared.tasks = [{ ...createTaskEntry("旧Todo"), completed: true, pointAwarded: true, xpAwarded: 1, completedDate: today }];
    prepared.daily.missionXpCount = 1;
    prepared.daily.todoXpCount = 1;
    prepared.totalPoints = 8;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.evaluate(() => openEditDialog("habit"));
  await page.locator("#editInput").fill("新Habit");
  await page.locator("#editForm button[type='submit']").click();
  let values = await page.evaluate(() => ({ name: state.habit.name, streak: state.habit.streak, days: state.habit.totalCompletedDays, points: state.totalPoints }));
  assert(values.name === "新Habit" && values.streak === 0 && values.days === 7 && values.points === 8, "Habit編集時の記録保持またはXP維持が不正");

  const missionId = await page.evaluate(() => state.missions[0].id);
  await page.evaluate((id) => openEditDialog("mission", id), missionId);
  await page.locator("#editInput").fill("新Mission");
  await page.locator("#editForm button[type='submit']").click();
  assert(await page.evaluate(() => state.missions[0].text === "新Mission" && state.totalPoints === 8), "Mission編集で内容またはXPが変化した");
  await page.evaluate((id) => deleteMission(id), missionId);
  assert(await page.evaluate(() => state.missions.length === 0 && state.totalPoints === 6), "Mission削除時のXP処理が不正");

  const taskId = await page.evaluate(() => state.tasks[0].id);
  await page.evaluate((id) => openEditDialog("task", id), taskId);
  await page.locator("#editInput").fill("新Todo");
  await page.locator("#editForm button[type='submit']").click();
  assert(await page.evaluate(() => state.tasks[0].text === "新Todo" && state.totalPoints === 6), "Todo編集で内容またはXPが変化した");
  await page.evaluate((id) => deleteTask(id), taskId);
  assert(await page.evaluate(() => state.tasks.length === 0 && state.totalPoints === 5), "Todo削除時のXP処理が不正");
  await page.evaluate(() => deleteHabit());
  values = await page.evaluate(() => ({ name: state.habit.name, days: state.habit.totalCompletedDays, points: state.totalPoints }));
  assert(values.name === "" && values.days === 6 && values.points === 0, "Habit削除時の累計または当日XP処理が不正");
});

await test("Mission履歴20件・重複排除・最近順・モーダル初期状態", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.evaluate(() => {
    for (let index = 1; index <= 21; index += 1) rememberMissionTexts([`履歴${index}`]);
    rememberMissionTexts(["履歴10"]);
    saveState();
    renderAll();
  });
  const history = await page.evaluate(() => [...state.missionHistory]);
  assert(history.length === 20 && history[0] === "履歴10" && !history.includes("履歴1"), "Mission履歴の上限・最近順・重複排除が不正");
  await page.locator("#missionHistoryOpenButton").click();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const initial = await page.evaluate(() => ({
    dialogFocused: document.activeElement === document.getElementById("missionHistoryDialog"),
    rows: [...document.querySelectorAll("#missionHistoryList button")].map((row) => ({
      state: row.matches(":focus, :focus-visible, :active"),
      background: getComputedStyle(row).backgroundColor
    }))
  }));
  assert(initial.dialogFocused && initial.rows.every((row) => !row.state && row.background === "rgba(0, 0, 0, 0)"), "履歴モーダル初期状態に選択表現が残る");
  await page.locator("#missionHistoryCancelButton").click();
});

await test("Mission履歴から追加・当日重複防止", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    prepared.missionHistory = ["再利用Mission", "別Mission"];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.locator("#missionHistoryOpenButton").click();
  await page.locator("#missionHistoryList button").filter({ hasText: /^再利用Mission$/ }).click();
  assert(await page.evaluate(() => state.missions.length === 1 && state.missions[0].text === "再利用Mission" && state.missionHistory[0] === "再利用Mission"), "履歴からMissionを追加できない");
  await page.locator("#missionHistoryOpenButton").click();
  await page.locator("#missionHistoryList button").filter({ hasText: /^再利用Mission$/ }).click();
  assert(await page.evaluate(() => state.missions.length === 1), "履歴から当日Missionが重複追加された");
  assert((await page.locator("#missionHistoryError").textContent()).includes("すでに今日のMission"), "重複時の案内が表示されない");
  await page.locator("#missionHistoryCancelButton").click();
});

await test("Todo完了・最大5XP・Future除外・追加後の未完了復帰", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    prepared.tasks = ["T1", "T2", "T3", "T4", "T5", "T6"].map(createTaskEntry);
    prepared.tasks.push({ ...createTaskEntry("Future"), visibleFrom: addDaysToDateString(getLocalDateString(), 7) });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.evaluate(() => getTodayTasks().forEach((task) => toggleTask(task.id)));
  let values = await page.evaluate(() => ({ points: state.totalPoints, count: state.daily.todoXpCount, complete: isTodoComplete(), future: state.tasks.filter((task) => isFutureTask(task)).length }));
  assert(values.points === 5 && values.count === 5 && values.complete && values.future === 1, "Todo最大XPまたはFuture除外判定が不正");
  assert(await page.locator("#todoCardBody").isVisible(), "Todo完了時に自動で閉じた");
  await page.reload();
  assert(await page.locator("#todoCardBody").isHidden(), "完了済みTodoが再起動時に閉じていない");
  await page.evaluate(() => {
    state.tasks.push(createTaskEntry("追加Todo"));
    todoCardExpanded = true;
    saveState();
    renderAll();
  });
  values = await page.evaluate(() => ({ complete: isTodoComplete(), points: state.totalPoints }));
  assert(!values.complete && values.points === 5 && await page.locator("#todoCardBody").isVisible(), "Todo追加後に未完了へ戻らない");
});

await test("あとで表示の日付到達・日付変更リセット", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    const today = getLocalDateString();
    const yesterday = addDaysToDateString(today, -1);
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = today;
    prepared.lastUsedDate = yesterday;
    prepared.daily.date = yesterday;
    prepared.missions = [{ ...createMissionEntry("昨日のMission"), completed: true, pointAwarded: true, xpAwarded: 2 }];
    prepared.tasks = [
      createTaskEntry("未完了Todo"),
      { ...createTaskEntry("完了Todo"), completed: true, pointAwarded: true, xpAwarded: 1, completedDate: yesterday },
      { ...createTaskEntry("今日から表示"), visibleFrom: today },
      { ...createTaskEntry("明日から表示"), visibleFrom: addDaysToDateString(today, 1) }
    ];
    prepared.daily.missionXpCount = 1;
    prepared.daily.todoXpCount = 1;
    prepared.totalPoints = 3;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  const values = await page.evaluate(() => ({
    missions: state.missions.length,
    tasks: state.tasks.map((task) => ({ text: task.text, visibleFrom: task.visibleFrom, completed: task.completed })),
    daily: state.daily,
    points: state.totalPoints
  }));
  assert(values.missions === 0, "日付変更でMissionがリセットされない");
  assert(values.tasks.some((task) => task.text === "未完了Todo" && !task.visibleFrom), "未完了Todoが翌日に残らない");
  assert(!values.tasks.some((task) => task.text === "完了Todo"), "完了Todoが翌日に残っている");
  assert(values.tasks.some((task) => task.text === "今日から表示" && !task.visibleFrom), "表示日到達Todoが通常一覧へ戻らない");
  assert(values.tasks.some((task) => task.text === "明日から表示" && task.visibleFrom), "未来Todoが早く通常一覧へ戻った");
  assert(values.daily.missionXpCount === 0 && values.daily.todoXpCount === 0 && values.points === 3, "日付変更で日次カウンタまたは累計XPが不正");
});

await test("完了ボーナス・Level・保存互換性", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    const today = getLocalDateString();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = today;
    prepared.totalPoints = 39;
    prepared.habit.name = "読書";
    prepared.habit.startedDate = today;
    prepared.habit.totalCompletedDays = 23;
    prepared.missions = [createMissionEntry("A")];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.locator("#habitCheckbox").click();
  await page.evaluate(() => toggleMission(state.missions[0].id));
  let values = await page.evaluate(() => ({ points: state.totalPoints, bonus: state.daily.achievementBonusAwarded, days: state.habit.totalCompletedDays }));
  assert(values.points === 48 && values.bonus && values.days === 24, "Habit+Mission完了ボーナスが不正");
  assert(await page.locator("#levelText").textContent() === "Lv.2", "Level表示が累計XPと不整合");
  await page.reload();
  values = await page.evaluate(() => ({ points: state.totalPoints, bonus: state.daily.achievementBonusAwarded, days: state.habit.totalCompletedDays, version: state.version }));
  assert(values.points === 48 && values.bonus && values.days === 24 && values.version === 17, "保存データの再読込で値が変化した");
});

await test("旧保存形式のMission XP移行", async () => {
  await resetApp(() => {
    const legacy = createInitialState();
    legacy.version = 14;
    legacy.tutorialCompleted = true;
    legacy.missionPromptHandledDate = getLocalDateString();
    legacy.totalPoints = 8;
    legacy.daily.missionXpCount = 3;
    legacy.missions = ["A", "B", "C"].map((text, index) => ({
      ...createMissionEntry(text), completed: true, pointAwarded: true, xpAwarded: index === 2 ? 4 : 2
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  });
  const values = await page.evaluate(() => ({
    version: state.version,
    points: state.totalPoints,
    missionXp: state.missions.map((mission) => mission.xpAwarded),
    bonus: state.daily.missionThreeBonusAwarded
  }));
  assert(values.version === 17 && values.points === 8 && values.missionXp.every((xp) => xp === 2) && values.bonus, "旧Mission XPデータの合計維持移行が不正");
});

await test("Growth Garden非表示・保存データ維持", async () => {
  await resetApp(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    prepared.growthGarden.selectedTheme = "challenge";
    prepared.growthGarden.countedDates = ["2026-08-01", "2026-08-02"];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  assert(await page.locator("#gardenEntryButton").isHidden(), "非公開中のGrowth Garden入口が表示されている");
  const garden = await page.evaluate(() => ({ theme: state.growthGarden.selectedTheme, dates: state.growthGarden.countedDates.length }));
  assert(garden.theme === "challenge" && garden.dates === 2, "Growth Garden非表示中に保存データが失われた");
});

if (pageErrors.length) results.push({ name: "ブラウザ実行時エラー", status: "FAIL", detail: pageErrors.join(" / ") });
console.log(JSON.stringify(results, null, 2));
await browser.close();
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
