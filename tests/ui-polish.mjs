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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, run) {
  try {
    await run();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error.message });
  }
}

async function loadExistingUser() {
  await page.goto(appUrl);
  await page.evaluate(() => {
    const prepared = createInitialState();
    prepared.tutorialCompleted = true;
    prepared.missionPromptHandledDate = getLocalDateString();
    prepared.habit.name = "読書";
    prepared.habit.startedDate = getLocalDateString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
  });
  await page.reload();
}

await test("Homeヘッダー・ブランドカラー・Version", async () => {
  await loadExistingUser();
  const ui = await page.evaluate(() => ({
    headlineCount: document.querySelectorAll("#homeView > .app-header h1, .header-subcopy").length,
    appName: document.querySelector(".app-name")?.textContent,
    footer: document.querySelector(".app-footer")?.textContent.replace(/\s+/g, " ").trim(),
    progressColor: getComputedStyle(document.documentElement).getPropertyValue("--color-progress").trim(),
    viewport: document.querySelector('meta[name="viewport"]')?.content
  }));
  assert(ui.headlineCount === 0, "Homeにコンセプト文が残っている");
  assert(ui.appName === "Rypace" && ui.footer === "Rypace v1.0", "ブランドまたはVersion表示が不正");
  assert(ui.progressColor === "#245f50", "XPバーがブランドの濃い緑ではない");
  assert(ui.viewport.includes("viewport-fit=cover"), "Safe Area用viewport設定がない");
});

await test("Todo追加と共通入力シート", async () => {
  await loadExistingUser();
  if (await page.locator("#todoCardBody").getAttribute("hidden") !== null) {
    await page.locator("#todoCollapseButton").click();
  }
  await page.locator("#taskOpenButton").scrollIntoViewIfNeeded();
  const homeTopBefore = await page.locator("#homeView").evaluate((element) => element.getBoundingClientRect().top);
  await page.locator("#taskOpenButton").click();
  const opened = await page.evaluate(() => ({
    open: taskAddDialog.open,
    active: document.activeElement === taskInput,
    sheetClass: taskAddDialog.classList.contains("input-sheet"),
    locked: document.documentElement.classList.contains("input-sheet-open"),
    bodyPosition: document.body.style.position,
    compact: taskAddDialog.classList.contains("compact-input-sheet"),
    sheetHeight: taskAddDialog.getBoundingClientRect().height,
    homeTransform: getComputedStyle(homeView).transform,
    buttonWidths: [...taskAddDialog.querySelectorAll(".dialog-actions button")].map((button) => button.getBoundingClientRect().width)
  }));
  assert(opened.open && opened.active && opened.sheetClass && opened.compact, "Todo追加がコンパクト入力シートで開かない");
  assert(opened.sheetHeight <= 220, "入力シートが必要以上に高い");
  assert(opened.locked && opened.bodyPosition === "fixed", "背景位置が固定されていない");
  assert(opened.homeTransform === "none", "背景HomeがvisualViewportで移動する構成になっている");
  assert(Math.abs(opened.buttonWidths[0] - opened.buttonWidths[1]) < 1, "Todo追加ボタンが1:1ではない");
  await page.setViewportSize({ width: 375, height: 560 });
  await page.waitForTimeout(100);
  const homeTopAfterViewportChange = await page.locator("#homeView").evaluate((element) => element.getBoundingClientRect().top);
  assert(Math.abs(homeTopAfterViewportChange - homeTopBefore) < 1, "viewport変化で背景Homeの位置が変化した");
  await page.locator("#taskCancelButton").click();
  await page.waitForFunction(() => !taskAddDialog.open && !document.documentElement.classList.contains("input-sheet-open"));
  const closed = await page.evaluate(() => !taskAddDialog.open && !document.documentElement.classList.contains("input-sheet-open"));
  assert(closed, "キャンセル後に入力シート状態が解除されない");
  await page.setViewportSize({ width: 375, height: 812 });

  await page.evaluate(() => openMissionAddDialog());
  const missionWidths = await page.locator("#missionAddDialog .dialog-actions button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
  assert(Math.abs(missionWidths[0] - missionWidths[1]) < 1, "Mission追加ボタンが1:1ではない");
  await page.evaluate(() => closeMissionAddDialog());
  await page.waitForFunction(() => !document.documentElement.classList.contains("input-sheet-open"));

  await page.evaluate(() => openEditDialog("habit"));
  const editWidths = await page.locator("#editDialog .dialog-actions button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
  assert(Math.abs(editWidths[0] - editWidths[1]) < 1, "編集ボタンが1:1ではない");
  await page.evaluate(() => editDialog.close());
  await page.waitForFunction(() => !document.documentElement.classList.contains("input-sheet-open"));
});

await test("独立Onboardingと既存ユーザー判定", async () => {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const firstRun = await page.evaluate(() => ({
    open: onboardingDialog.open,
    homeHidden: homeView.hidden,
    progress: onboardingProgress.textContent,
    background: getComputedStyle(onboardingDialog).backgroundColor
  }));
  assert(firstRun.open && firstRun.homeHidden && firstRun.progress === "1 / 4", "初回OnboardingがHomeから独立していない");
  assert(firstRun.background !== "rgba(0, 0, 0, 0)", "Onboarding背景が透明になっている");

  await loadExistingUser();
  const existing = await page.evaluate(() => ({ open: onboardingDialog.open, homeHidden: homeView.hidden }));
  assert(!existing.open && !existing.homeHidden, "既存ユーザーがOnboardingへ戻される");
});

if (pageErrors.length) results.push({ name: "JavaScript runtime", status: "FAIL", detail: pageErrors.join(" / ") });
console.log(JSON.stringify(results, null, 2));
await browser.close();
if (results.some((result) => result.status === "FAIL")) process.exit(1);
