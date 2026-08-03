const STORAGE_KEY = "selfGrowthAppState";
const OLD_TODO_STORAGE_KEY = "todos";
const XP_RULES = Object.freeze({
  habit: 5,
  missionByOrder: Object.freeze([2, 2, 4]),
  missionMaxCount: 3,
  todo: 1,
  todoMaxCount: 5,
  completionBonus: 2,
  levelThreshold: 40
});
const HABIT_THEMES = Object.freeze({
  balance: { label: "自分らしく続ける" },
  life: { label: "暮らしを整える" },
  body: { label: "体を育てる" },
  learning: { label: "学びを育てる" },
  mind: { label: "心を整える" },
  care: { label: "誰かを大切にする" }
});
const GARDEN_THEMES = Object.freeze({
  consistency: {
    label: "積み重ね",
    treeId: "keyaki",
    treeLabel: "ケヤキ",
    message: "毎日の小さな一歩が、\n静かに積み重なっています。"
  },
  challenge: {
    label: "挑戦",
    treeId: "nara",
    treeLabel: "ナラ",
    message: "踏み出した一歩が、\n静かに根を広げています。"
  }
});
let levelUpAnimationPending = false;
let pendingXpAnimation = null;
let editContext = null;
let scheduleTaskId = null;
let selectedGardenTheme = null;
let gardenStartPending = false;

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDateString(date = new Date()) {
  const appDate = new Date(date);
  appDate.setHours(appDate.getHours() - 3);
  return formatLocalDate(appDate);
}

function getPreviousDateString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return formatLocalDate(date);
}

function addDaysToDateString(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function formatDisplayDate(dateString) {
  const [, month, day] = dateString.split("-").map(Number);
  return `${month}月${day}日`;
}

function createInitialState() {
  return {
    version: 11,
    lastUsedDate: getLocalDateString(),
    totalPoints: 0,
    habit: {
      name: "",
      theme: "balance",
      completedToday: false,
      streak: 0,
      lastCompletedDate: null,
      startedDate: null,
      pointAwardDates: [],
      totalCompletedDays: 0
    },
    missions: [],
    tasks: [],
    daily: {
      date: getLocalDateString(),
      missionXpCount: 0,
      todoXpCount: 0,
      achievementBonusAwarded: false,
      completionBonusXp: 0
    },
    reflections: {},
    growthGarden: createInitialGardenState()
  };
}

function createInitialGardenState() {
  return {
    version: 1,
    selectedTheme: null,
    startedAt: null,
    startedDate: null,
    countedDates: [],
    lastCalculatedAt: null
  };
}

function mergeState(savedState) {
  const initialState = createInitialState();
  const savedHabit = savedState && savedState.habit ? savedState.habit : {};
  const savedDaily = savedState && savedState.daily ? savedState.daily : {};
  const savedGarden = savedState?.growthGarden && typeof savedState.growthGarden === "object"
    ? savedState.growthGarden
    : {};
  const savedHabitDates = Array.isArray(savedHabit.pointAwardDates)
    ? [...new Set(savedHabit.pointAwardDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
    : [];
  const savedGardenDates = Array.isArray(savedGarden.countedDates)
    ? [...new Set(savedGarden.countedDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
    : [];
  const knownHabitDates = new Set([...savedHabitDates, ...savedGardenDates]);
  const savedStreak = Math.max(0, Number(savedHabit.streak) || 0);
  const inferredStartedDate = savedHabit.name && savedStreak > 0 && /^\d{4}-\d{2}-\d{2}$/.test(savedHabit.lastCompletedDate || "")
    ? addDaysToDateString(savedHabit.lastCompletedDate, -(savedStreak - 1))
    : savedHabit.name ? getLocalDateString() : null;

  return {
    ...initialState,
    ...(savedState || {}),
    version: 11,
    habit: {
      ...initialState.habit,
      ...savedHabit,
      theme: HABIT_THEMES[savedHabit.theme] ? savedHabit.theme : "balance",
      streak: savedStreak,
      startedDate: /^\d{4}-\d{2}-\d{2}$/.test(savedHabit.startedDate || "")
        ? savedHabit.startedDate
        : inferredStartedDate,
      pointAwardDates: savedHabitDates,
      totalCompletedDays: Math.max(
        Number(savedHabit.totalCompletedDays) || 0,
        knownHabitDates.size,
        savedStreak
      )
    },
    daily: {
      ...initialState.daily,
      ...savedDaily,
      missionXpCount: Number(savedDaily.missionXpCount) || 0,
      todoXpCount: Math.min(
        Number(savedDaily.todoXpCount ?? savedDaily.taskPointCount) || 0,
        XP_RULES.todoMaxCount
      ),
      completionBonusXp: Number(savedDaily.completionBonusXp) ||
        (savedDaily.achievementBonusAwarded
          ? (Number(savedState?.version) <= 2 ? 10 : XP_RULES.completionBonus)
          : 0)
    },
    missions: Array.isArray(savedState?.missions)
      ? savedState.missions.map((mission) => ({
          ...mission,
          pointAwarded:
            typeof mission.pointAwarded === "boolean"
              ? mission.pointAwarded
              : Boolean(mission.completed),
          xpAwarded: Number(mission.xpAwarded) || 0
        }))
      : [],
    tasks: Array.isArray(savedState?.tasks)
      ? savedState.tasks.map((task) => ({
          ...task,
          xpAwarded: Number(task.xpAwarded) || 0,
          visibleFrom: typeof task.visibleFrom === "string" ? task.visibleFrom : null
        }))
      : [],
    reflections:
      savedState?.reflections && typeof savedState.reflections === "object"
        ? Object.fromEntries(
            Object.entries(savedState.reflections).map(([date, reflection]) => [
              date,
              { ...reflection, xpAwarded: Boolean(reflection?.xpAwarded) }
            ])
          )
        : {},
    growthGarden: {
      ...createInitialGardenState(),
      ...savedGarden,
      selectedTheme: GARDEN_THEMES[savedGarden.selectedTheme]
        ? savedGarden.selectedTheme
        : null,
      countedDates: savedGardenDates
    }
  };
}

function loadState() {
  try {
    const savedText = localStorage.getItem(STORAGE_KEY);
    if (savedText) {
      return mergeState(JSON.parse(savedText));
    }
  } catch (error) {
    console.warn("保存データを読み込めなかったため、初期状態で開始します。", error);
  }

  const initialState = createInitialState();

  // 旧TODOアプリのデータがあれば、通常タスクとして引き継ぎます。
  try {
    const oldTodos = JSON.parse(localStorage.getItem(OLD_TODO_STORAGE_KEY) || "[]");
    if (Array.isArray(oldTodos)) {
      initialState.tasks = oldTodos
        .filter((todo) => todo && typeof todo.text === "string")
        .map((todo) => ({
          id: todo.id || createId(),
          text: todo.text,
          completed: Boolean(todo.completed),
          pointAwarded: Boolean(todo.completed),
          xpAwarded: 0,
          visibleFrom: null,
          completedDate: null
        }));
    }
  } catch (error) {
    console.warn("旧TODOデータは読み込めませんでした。", error);
  }

  return initialState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let state = loadState();
handleDateChange();
let habitCardExpanded = !state.habit.completedToday;
let missionCardExpanded = !isMissionComplete();
let todoCardExpanded = !isTodoComplete();
let missionQuickAddOpen = false;

const elements = {
  homeView: document.getElementById("homeView"),
  themeView: document.getElementById("themeView"),
  gardenView: document.getElementById("gardenView"),
  gardenEntryButton: document.getElementById("gardenEntryButton"),
  themeOptions: [...document.querySelectorAll(".theme-option")],
  startGardenButton: document.getElementById("startGardenButton"),
  gardenSaveError: document.getElementById("gardenSaveError"),
  gardenThemeLabel: document.getElementById("gardenThemeLabel"),
  gardenHabitThemeLabel: document.getElementById("gardenHabitThemeLabel"),
  gardenStageLabel: document.getElementById("gardenStageLabel"),
  gardenHabitDays: document.getElementById("gardenHabitDays"),
  gardenLandscape: document.getElementById("gardenLandscape"),
  gardenBaseImage: document.getElementById("gardenBaseImage"),
  gardenTreeImage: document.getElementById("gardenTreeImage"),
  gardenImageFallback: document.getElementById("gardenImageFallback"),
  gardenMessage: document.getElementById("gardenMessage"),
  gardenFlowers: [...document.querySelectorAll(".garden-flower-layer i")],
  gardenPathStones: [...document.querySelectorAll(".garden-path-layer i")],
  gardenBird: document.querySelector(".garden-bird"),
  gardenButterfly: document.querySelector(".garden-butterfly"),
  currentDate: document.getElementById("currentDate"),
  levelCard: document.getElementById("progressCard"),
  levelUpNotice: document.getElementById("levelUpNotice"),
  levelText: document.getElementById("levelText"),
  pointText: document.getElementById("pointText"),
  levelRemainingText: document.getElementById("levelRemainingText"),
  levelProgress: document.getElementById("levelProgress"),
  totalPointText: document.getElementById("totalPointText"),
  totalHabitDays: document.getElementById("totalHabitDays"),
  habitForm: document.getElementById("habitForm"),
  habitCard: document.getElementById("habitCard"),
  habitCardBody: document.getElementById("habitCardBody"),
  habitCollapseButton: document.getElementById("habitCollapseButton"),
  habitMenu: document.getElementById("habitMenu"),
  habitEditButton: document.getElementById("habitEditButton"),
  habitThemeButton: document.getElementById("habitThemeButton"),
  habitDeleteButton: document.getElementById("habitDeleteButton"),
  habitInput: document.getElementById("habitInput"),
  habitThemeSelect: document.getElementById("habitThemeSelect"),
  habitCheckbox: document.getElementById("habitCheckbox"),
  habitCheckLabel: document.getElementById("habitCheckLabel"),
  habitName: document.getElementById("habitName"),
  habitCollapsedName: document.getElementById("habitCollapsedName"),
  habitStreak: document.getElementById("habitStreak"),
  missionForm: document.getElementById("missionForm"),
  missionCard: document.getElementById("missionCard"),
  missionCardBody: document.getElementById("missionCardBody"),
  missionCollapseButton: document.getElementById("missionCollapseButton"),
  missionOpenButton: document.getElementById("missionOpenButton"),
  missionInput: document.getElementById("missionInput"),
  missionError: document.getElementById("missionError"),
  missionList: document.getElementById("missionList"),
  missionCount: document.getElementById("missionCount"),
  todoCard: document.getElementById("todoCard"),
  todoCardBody: document.getElementById("todoCardBody"),
  todoCollapseButton: document.getElementById("todoCollapseButton"),
  taskForm: document.getElementById("taskForm"),
  taskOpenButton: document.getElementById("taskOpenButton"),
  taskInput: document.getElementById("taskInput"),
  taskError: document.getElementById("taskError"),
  taskList: document.getElementById("taskList"),
  taskCount: document.getElementById("taskCount"),
  futureTodoDetails: document.getElementById("futureTodoDetails"),
  futureTodoCount: document.getElementById("futureTodoCount"),
  futureTodoGroups: document.getElementById("futureTodoGroups"),
  editDialog: document.getElementById("editDialog"),
  editForm: document.getElementById("editForm"),
  editDialogTitle: document.getElementById("editDialogTitle"),
  editInput: document.getElementById("editInput"),
  editCancelButton: document.getElementById("editCancelButton"),
  habitThemeDialog: document.getElementById("habitThemeDialog"),
  habitThemeForm: document.getElementById("habitThemeForm"),
  habitThemeDialogSelect: document.getElementById("habitThemeDialogSelect"),
  habitThemeCancelButton: document.getElementById("habitThemeCancelButton"),
  scheduleDialog: document.getElementById("scheduleDialog"),
  scheduleDialogTitle: document.getElementById("scheduleDialogTitle"),
  scheduleDateForm: document.getElementById("scheduleDateForm"),
  scheduleDateInput: document.getElementById("scheduleDateInput"),
  scheduleCancelButton: document.getElementById("scheduleCancelButton")
};

setUpEventListeners();
renderAll();
renderAppRoute();
window.setInterval(() => {
  const beforeDate = state.lastUsedDate;
  handleDateChange();
  if (state.lastUsedDate !== beforeDate) {
    habitCardExpanded = true;
    missionCardExpanded = true;
    todoCardExpanded = true;
    renderAll();
  }
  else renderCurrentDate();
}, 60000);

function handleDateChange() {
  const today = getLocalDateString();
  const dueTasks = state.tasks.filter(
    (task) => task.visibleFrom && task.visibleFrom <= today
  );

  if (dueTasks.length > 0) {
    const futureTaskIds = new Set(dueTasks.map((task) => task.id));
    state.tasks = [
      ...state.tasks.filter((task) => !futureTaskIds.has(task.id)),
      ...dueTasks.map((task) => ({ ...task, visibleFrom: null }))
    ];
  }

  if (state.lastUsedDate === today && state.daily.date === today) {
    if (dueTasks.length > 0) saveState();
    return;
  }

  state.lastUsedDate = today;
  state.habit.completedToday = false;
  state.missions = [];
  state.tasks = state.tasks.filter((task) => !task.completed);
  state.daily = {
    date: today,
    missionXpCount: 0,
    todoXpCount: 0,
    achievementBonusAwarded: false,
    completionBonusXp: 0
  };
  saveState();
}

function setUpEventListeners() {
  elements.gardenEntryButton.addEventListener("click", openGrowthGarden);
  elements.themeOptions.forEach((option) => {
    option.addEventListener("click", () => selectGardenTheme(option.dataset.theme));
  });
  elements.startGardenButton.addEventListener("click", startGrowthGarden);
  document.querySelectorAll("[data-garden-back]").forEach((button) => {
    button.addEventListener("click", () => { window.location.hash = ""; });
  });
  window.addEventListener("hashchange", renderAppRoute);
  elements.gardenBaseImage.addEventListener("error", showGardenImageFallback);
  elements.gardenBaseImage.addEventListener("load", hideGardenImageFallback);
  elements.gardenTreeImage.addEventListener("error", showGardenImageFallback);
  elements.gardenTreeImage.addEventListener("load", hideGardenImageFallback);
  elements.habitCollapseButton.addEventListener("click", () => toggleCard("habit"));
  elements.missionCollapseButton.addEventListener("click", () => toggleCard("mission"));
  elements.todoCollapseButton.addEventListener("click", () => toggleCard("todo"));
  elements.habitForm.addEventListener("submit", saveHabitName);
  elements.habitCheckbox.addEventListener("change", toggleHabit);
  elements.habitEditButton.addEventListener("click", () => openEditDialog("habit"));
  elements.habitThemeButton.addEventListener("click", openHabitThemeDialog);
  elements.habitDeleteButton.addEventListener("click", deleteHabit);
  elements.habitThemeForm.addEventListener("submit", saveHabitTheme);
  elements.habitThemeCancelButton.addEventListener("click", () => elements.habitThemeDialog.close());
  elements.missionOpenButton.addEventListener("click", () => openQuickAdd("mission"));
  elements.missionForm.addEventListener("submit", addMission);
  elements.taskOpenButton.addEventListener("click", () => openQuickAdd("task"));
  elements.taskForm.addEventListener("submit", addTask);
  elements.editForm.addEventListener("submit", saveEditedItem);
  elements.editCancelButton.addEventListener("click", () => elements.editDialog.close());
  elements.scheduleDialog.querySelectorAll("[data-schedule-days]").forEach((button) => {
    button.addEventListener("click", () => scheduleTaskByDays(Number(button.dataset.scheduleDays)));
  });
  elements.scheduleDateForm.addEventListener("submit", scheduleTaskByDate);
  elements.scheduleCancelButton.addEventListener("click", () => elements.scheduleDialog.close());
  document.addEventListener("toggle", closeOtherMenus, true);
  document.addEventListener("click", closeMenusFromOutside);
}

function openGrowthGarden() {
  window.location.hash = state.growthGarden.selectedTheme ? "garden" : "garden-theme";
}

function selectGardenTheme(themeId) {
  if (!GARDEN_THEMES[themeId] || state.growthGarden.selectedTheme) return;
  selectedGardenTheme = themeId;
  elements.themeOptions.forEach((option) => {
    const isSelected = option.dataset.theme === themeId;
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
  elements.startGardenButton.disabled = false;
  elements.gardenSaveError.textContent = "";
}

function startGrowthGarden() {
  if (gardenStartPending || state.growthGarden.selectedTheme || !GARDEN_THEMES[selectedGardenTheme]) return;
  gardenStartPending = true;
  elements.startGardenButton.disabled = true;
  const now = new Date();
  state.growthGarden = {
    version: 1,
    selectedTheme: selectedGardenTheme,
    startedAt: now.toISOString(),
    startedDate: getLocalDateString(now),
    countedDates: [],
    lastCalculatedAt: now.toISOString()
  };
  try {
    saveState();
    window.location.hash = "garden";
  } catch (error) {
    state.growthGarden = createInitialGardenState();
    gardenStartPending = false;
    elements.startGardenButton.disabled = false;
    elements.gardenSaveError.textContent = "保存できませんでした。もう一度お試しください。";
  }
}

function renderAppRoute() {
  const themeIsValid = Boolean(GARDEN_THEMES[state.growthGarden.selectedTheme]);
  let route = window.location.hash.replace("#", "");
  if (route === "garden" && !themeIsValid) route = "garden-theme";
  if (route === "garden-theme" && themeIsValid) route = "garden";
  if (!new Set(["garden", "garden-theme"]).has(route)) route = "home";

  elements.homeView.hidden = route !== "home";
  elements.themeView.hidden = route !== "garden-theme";
  elements.gardenView.hidden = route !== "garden";
  document.body.classList.toggle("garden-mode", route !== "home");
  if (route === "garden-theme") renderThemeSelection();
  if (route === "garden") renderGardenScreen();
  window.scrollTo(0, 0);
}

function renderThemeSelection() {
  selectedGardenTheme = null;
  gardenStartPending = false;
  elements.themeOptions.forEach((option) => {
    option.classList.remove("selected");
    option.setAttribute("aria-checked", "false");
  });
  elements.startGardenButton.disabled = true;
  elements.gardenSaveError.textContent = "";
}

function getGardenStage(completedDays) {
  if (completedDays >= 365) return 7;
  if (completedDays >= 180) return 6;
  if (completedDays >= 90) return 5;
  if (completedDays >= 45) return 4;
  if (completedDays >= 21) return 3;
  if (completedDays >= 7) return 2;
  return 1;
}

function getGardenGrowthProgress(completedDays) {
  const days = Math.max(0, Number(completedDays) || 0);
  const milestones = [0, 7, 21, 45, 90, 180, 365];
  const opacity = [0, 0.08, 0.18, 0.32, 0.5, 0.72, 1];
  for (let index = 1; index < milestones.length; index += 1) {
    if (days <= milestones[index]) {
      const ratio = (days - milestones[index - 1]) / (milestones[index] - milestones[index - 1]);
      return opacity[index - 1] + (opacity[index] - opacity[index - 1]) * ratio;
    }
  }
  return 1;
}

function renderGardenScreen() {
  const themeId = state.growthGarden.selectedTheme;
  const theme = GARDEN_THEMES[themeId];
  if (!theme) {
    window.location.hash = "garden-theme";
    return;
  }
  const stage = getGardenStage(state.habit.totalCompletedDays);
  const growthOpacity = getGardenGrowthProgress(state.habit.totalCompletedDays);
  const stageLabels = [
    "はじまりの庭",
    "小さな芽吹き",
    "緑が広がる庭",
    "花の気配",
    "木陰が生まれた庭",
    "灯りのある庭",
    "気付いたら、豊かな庭"
  ];
  const stageMessages = [
    "まだ小さな景色も、\n今日の一歩から始まります。",
    "土のそばに、\n新しい緑が見えはじめました。",
    "少しずつ、庭に\nやわらかな緑が広がっています。",
    "積み重ねのそばに、\n小さな花が咲きはじめました。",
    "育った木が、\n静かな木陰をつくっています。",
    "帰ってこられる場所に、\nあたたかな灯りがともりました。",
    "毎日の積み重ねが、\nあなただけの景色になりました。"
  ];
  elements.gardenThemeLabel.textContent = theme.label;
  elements.gardenHabitThemeLabel.textContent = HABIT_THEMES[state.habit.theme].label;
  elements.gardenStageLabel.textContent = stageLabels[stage - 1];
  elements.gardenHabitDays.textContent = `${state.habit.totalCompletedDays}日`;
  elements.gardenLandscape.dataset.theme = themeId;
  elements.gardenLandscape.dataset.habitTheme = state.habit.theme;
  elements.gardenLandscape.querySelector(".garden-scene").dataset.stage = String(stage);
  elements.gardenLandscape.style.setProperty("--garden-growth", String(growthOpacity));
  elements.gardenMessage.innerHTML = stageMessages[stage - 1].replace("\n", "<br>");
  const matureImage = themeId === "challenge"
    ? "assets/garden/scenes/garden-mature-nara.webp"
    : "assets/garden/scenes/garden-mature.webp";
  if (!elements.gardenTreeImage.getAttribute("src").endsWith(matureImage)) {
    elements.gardenTreeImage.src = matureImage;
  }
  elements.gardenTreeImage.alt = `${state.habit.totalCompletedDays}日の積み重ねが映る、${theme.treeLabel}の${stageLabels[stage - 1]}`;
  const completedMissions = state.missions.filter((mission) => mission.completed).length;
  const completedTodos = getTodayTasks().filter((task) => task.completed).length;
  elements.gardenFlowers.forEach((flower, index) => flower.classList.toggle("visible", index < completedMissions));
  elements.gardenPathStones.forEach((stone, index) => stone.classList.toggle("visible", index < completedTodos));
  elements.gardenBird.classList.toggle("visible", state.habit.totalCompletedDays >= 45);
  elements.gardenButterfly.classList.toggle("visible", state.habit.totalCompletedDays >= 90);
  elements.gardenImageFallback.hidden = true;
  elements.gardenBaseImage.hidden = false;
  elements.gardenTreeImage.hidden = false;
}

function syncGardenHabitDate(isCompleted) {
  const garden = state.growthGarden;
  if (!GARDEN_THEMES[garden.selectedTheme] || !garden.startedDate) return;
  const today = getLocalDateString();
  if (today < garden.startedDate) return;
  const dates = new Set(garden.countedDates);
  if (isCompleted) dates.add(today);
  else dates.delete(today);
  garden.countedDates = [...dates].sort();
  garden.lastCalculatedAt = new Date().toISOString();
}

function showGardenImageFallback() {
  elements.gardenBaseImage.hidden = true;
  elements.gardenTreeImage.hidden = true;
  elements.gardenImageFallback.hidden = false;
}

function hideGardenImageFallback() {
  if (
    !elements.gardenBaseImage.complete || elements.gardenBaseImage.naturalWidth === 0 ||
    !elements.gardenTreeImage.complete || elements.gardenTreeImage.naturalWidth === 0
  ) return;
  elements.gardenBaseImage.hidden = false;
  elements.gardenTreeImage.hidden = false;
  elements.gardenImageFallback.hidden = true;
}

function isMissionComplete() {
  return state.missions.length > 0 &&
    state.missions.every((mission) => mission.completed);
}

function getTodayTasks() {
  return state.tasks.filter((task) => !isFutureTask(task));
}

function isTodoComplete() {
  const todayTasks = getTodayTasks();
  return todayTasks.every((task) => task.completed);
}

function toggleCard(type) {
  if (type === "habit") {
    if (!state.habit.completedToday) return;
    habitCardExpanded = !habitCardExpanded;
  } else if (type === "mission") {
    if (!isMissionComplete()) return;
    missionCardExpanded = !missionCardExpanded;
  } else {
    if (!isTodoComplete()) return;
    todoCardExpanded = !todoCardExpanded;
    if (!todoCardExpanded) elements.futureTodoDetails.open = false;
  }
  renderCollapsibleCards();
}

function renderCollapsibleCards() {
  elements.habitCardBody.hidden = !habitCardExpanded;
  elements.habitCollapseButton.setAttribute("aria-expanded", String(habitCardExpanded));
  elements.habitCollapseButton.disabled = !state.habit.completedToday;
  elements.habitCard.classList.toggle("collapsed", !habitCardExpanded);
  elements.missionCardBody.hidden = !missionCardExpanded;
  elements.missionCollapseButton.setAttribute("aria-expanded", String(missionCardExpanded));
  elements.missionCollapseButton.disabled = !isMissionComplete();
  elements.missionCard.classList.toggle("collapsed", !missionCardExpanded);
  elements.todoCardBody.hidden = !todoCardExpanded;
  elements.todoCollapseButton.setAttribute("aria-expanded", String(todoCardExpanded));
  elements.todoCollapseButton.disabled = !isTodoComplete();
  elements.todoCard.classList.toggle("collapsed", !todoCardExpanded);
}

function addPoints(points) {
  const previousLevel = Math.floor(state.totalPoints / XP_RULES.levelThreshold);
  state.totalPoints += points;
  levelUpAnimationPending =
    levelUpAnimationPending ||
    Math.floor(state.totalPoints / XP_RULES.levelThreshold) > previousLevel;
}

function removePoints(points) {
  state.totalPoints = Math.max(0, state.totalPoints - Math.max(0, points));
}

function saveHabitName(event) {
  event.preventDefault();
  const name = elements.habitInput.value.trim();

  if (!name) {
    elements.habitInput.focus();
    return;
  }

  state.habit.name = name;
  state.habit.theme = HABIT_THEMES[elements.habitThemeSelect.value]
    ? elements.habitThemeSelect.value
    : "balance";
  state.habit.startedDate = getLocalDateString();
  state.habit.streak = 0;
  state.habit.lastCompletedDate = null;
  elements.habitInput.value = "";
  saveState();
  renderAll();
}

function openHabitThemeDialog() {
  elements.habitMenu.open = false;
  elements.habitThemeDialogSelect.value = state.habit.theme;
  elements.habitThemeDialog.showModal();
  elements.habitThemeDialogSelect.focus();
}

function saveHabitTheme(event) {
  event.preventDefault();
  const theme = elements.habitThemeDialogSelect.value;
  if (!HABIT_THEMES[theme]) return;
  state.habit.theme = theme;
  saveState();
  renderAll();
  elements.habitThemeDialog.close();
}

function openQuickAdd(type) {
  const isMission = type === "mission";
  const form = isMission ? elements.missionForm : elements.taskForm;
  const button = isMission ? elements.missionOpenButton : elements.taskOpenButton;
  const input = isMission ? elements.missionInput : elements.taskInput;
  if (isMission) missionQuickAddOpen = true;
  form.hidden = false;
  button.hidden = true;
  input.focus();
}

function closeQuickAdd(type) {
  const isMission = type === "mission";
  const form = isMission ? elements.missionForm : elements.taskForm;
  const button = isMission ? elements.missionOpenButton : elements.taskOpenButton;
  const input = isMission ? elements.missionInput : elements.taskInput;
  if (isMission) missionQuickAddOpen = false;
  form.hidden = true;
  button.hidden = isMission && state.missions.length >= XP_RULES.missionMaxCount;
  input.value = "";
  input.blur();
}

function closeOtherMenus(event) {
  if (!event.target.matches("details.action-menu") || !event.target.open) return;
  document.querySelectorAll("details.action-menu[open]").forEach((menu) => {
    if (menu !== event.target) menu.open = false;
  });
}

function closeMenusFromOutside(event) {
  if (event.target.closest("details.action-menu")) return;
  document.querySelectorAll("details.action-menu[open]").forEach((menu) => {
    menu.open = false;
  });
}

function openEditDialog(type, id = null) {
  const item = type === "habit"
    ? state.habit
    : state[type === "mission" ? "missions" : "tasks"].find((entry) => entry.id === id);
  if (!item) return;
  editContext = { type, id };
  elements.editDialogTitle.textContent =
    type === "habit" ? "習慣を編集" : type === "mission" ? "Missionを編集" : "Todoを編集";
  elements.editInput.maxLength = type === "habit" ? 50 : type === "mission" ? 80 : 100;
  elements.editInput.value = type === "habit" ? item.name : item.text;
  document.querySelectorAll("details.action-menu[open]").forEach((menu) => { menu.open = false; });
  elements.editDialog.showModal();
  elements.editInput.focus();
  elements.editInput.select();
}

function saveEditedItem(event) {
  event.preventDefault();
  const value = elements.editInput.value.trim();
  if (!value || !editContext) return;
  if (editContext.type === "habit") {
    if (value !== state.habit.name) {
      state.habit.name = value;
      state.habit.completedToday = false;
      state.habit.streak = 0;
      state.habit.lastCompletedDate = null;
      state.habit.startedDate = getLocalDateString();
      habitCardExpanded = true;
      checkAndAwardAchievementBonus();
    }
  } else {
    const collection = editContext.type === "mission" ? state.missions : state.tasks;
    const item = collection.find((entry) => entry.id === editContext.id);
    if (!item) return;
    item.text = value;
  }
  saveState();
  elements.editDialog.close();
  renderAll();
}

function openScheduleDialog(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  scheduleTaskId = id;
  elements.scheduleDialogTitle.textContent = task.visibleFrom
    ? "表示日を変更"
    : "あとで表示";
  const today = getLocalDateString();
  elements.scheduleDateInput.min = today;
  elements.scheduleDateInput.value = task.visibleFrom || today;
  document.querySelectorAll("details.action-menu[open]").forEach((menu) => { menu.open = false; });
  elements.scheduleDialog.showModal();
}

function scheduleTaskByDays(days) {
  const today = getLocalDateString();
  applyTaskSchedule(days === 0 ? null : addDaysToDateString(today, days));
}

function scheduleTaskByDate(event) {
  event.preventDefault();
  const today = getLocalDateString();
  const selectedDate = elements.scheduleDateInput.value;
  if (!selectedDate) return;
  applyTaskSchedule(selectedDate <= today ? null : selectedDate);
}

function applyTaskSchedule(visibleFrom) {
  const taskIndex = state.tasks.findIndex((item) => item.id === scheduleTaskId);
  if (taskIndex < 0) return;
  const task = state.tasks[taskIndex];

  if (task.completed) {
    removePoints(task.xpAwarded);
    if (task.xpAwarded > 0) {
      state.daily.todoXpCount = Math.max(0, state.daily.todoXpCount - 1);
    }
    task.completed = false;
    task.pointAwarded = false;
    task.xpAwarded = 0;
    task.completedDate = null;
  }

  task.visibleFrom = visibleFrom;
  if (!visibleFrom) todoCardExpanded = true;
  state.tasks.splice(taskIndex, 1);
  state.tasks.push(task);
  elements.scheduleDialog.close();
  saveState();
  renderAll();
}

function isFutureTask(task, today = getLocalDateString()) {
  return Boolean(task.visibleFrom && task.visibleFrom > today);
}

function deleteHabit() {
  const today = getLocalDateString();
  const pointDateIndex = state.habit.pointAwardDates.indexOf(today);
  if (pointDateIndex >= 0) {
    removePoints(XP_RULES.habit);
    state.habit.pointAwardDates.splice(pointDateIndex, 1);
    state.habit.totalCompletedDays = Math.max(0, state.habit.totalCompletedDays - 1);
  }
  const habitHistory = {
    pointAwardDates: [...state.habit.pointAwardDates],
    totalCompletedDays: state.habit.totalCompletedDays
  };
  state.habit = { ...createInitialState().habit, ...habitHistory };
  syncGardenHabitDate(false);
  habitCardExpanded = true;
  elements.habitMenu.open = false;
  checkAndAwardAchievementBonus();
  saveState();
  renderAll();
}

function vibrateOnCompletion() {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(40);
  } catch (error) {
    // 振動非対応・制限中でも完了処理は継続します。
  }
}

function toggleHabit() {
  const today = getLocalDateString();
  const previousPoints = state.totalPoints;
  state.habit.completedToday = elements.habitCheckbox.checked;

  if (state.habit.completedToday) {
    vibrateOnCompletion();
    updateHabitStreak(today);

    if (!state.habit.pointAwardDates.includes(today)) {
      state.habit.pointAwardDates.push(today);
      state.habit.totalCompletedDays += 1;
      addPoints(XP_RULES.habit);
    }
  } else {
    const pointDateIndex = state.habit.pointAwardDates.indexOf(today);
    if (pointDateIndex >= 0) {
      state.habit.pointAwardDates.splice(pointDateIndex, 1);
      state.habit.totalCompletedDays = Math.max(0, state.habit.totalCompletedDays - 1);
      removePoints(XP_RULES.habit);
    }
  }

  checkAndAwardAchievementBonus();
  if (state.habit.completedToday) {
    queueXpAnimation("habit", null, state.totalPoints - previousPoints);
  }
  if (!state.habit.completedToday) habitCardExpanded = true;
  syncGardenHabitDate(state.habit.completedToday);
  saveState();
  renderAll();
}

function updateHabitStreak(today) {
  if (state.habit.lastCompletedDate === today) {
    return;
  }

  const yesterday = getPreviousDateString(today);
  state.habit.streak =
    state.habit.lastCompletedDate === yesterday ? state.habit.streak + 1 : 1;
  state.habit.lastCompletedDate = today;
}

function addMission(event) {
  event.preventDefault();
  const text = elements.missionInput.value.trim();

  if (!text) {
    elements.missionError.textContent = "Missionを入力してください。";
    return;
  }

  if (state.missions.length >= XP_RULES.missionMaxCount) {
    elements.missionError.textContent = "Missionは3件まで登録できます。";
    return;
  }

  state.missions.push({
    id: createId(),
    text,
    completed: false,
    pointAwarded: false,
    xpAwarded: 0
  });
  missionCardExpanded = true;
  checkAndAwardAchievementBonus();
  elements.missionError.textContent = "";
  closeQuickAdd("mission");
  saveState();
  renderAll();
}

function toggleMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (!mission) return;

  const previousPoints = state.totalPoints;
  mission.completed = !mission.completed;
  if (mission.completed) {
    vibrateOnCompletion();
    if (!mission.pointAwarded) {
      if (state.daily.missionXpCount < XP_RULES.missionMaxCount) {
        const missionIndex = state.missions.findIndex((item) => item.id === id);
        const missionXp = XP_RULES.missionByOrder[missionIndex] || 0;
        addPoints(missionXp);
        state.daily.missionXpCount += 1;
        mission.xpAwarded = missionXp;
      }
      mission.pointAwarded = true;
    }
  } else if (mission.pointAwarded) {
    removePoints(mission.xpAwarded);
    if (mission.xpAwarded > 0) {
      state.daily.missionXpCount = Math.max(0, state.daily.missionXpCount - 1);
    }
    mission.pointAwarded = false;
    mission.xpAwarded = 0;
  }
  checkAndAwardAchievementBonus();
  if (mission.completed) {
    queueXpAnimation("mission", id, state.totalPoints - previousPoints);
  }
  if (!isMissionComplete()) missionCardExpanded = true;
  saveState();
  renderAll();
}

function deleteMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (mission?.xpAwarded > 0) {
    removePoints(mission.xpAwarded);
    state.daily.missionXpCount = Math.max(0, state.daily.missionXpCount - 1);
  }
  state.missions = state.missions.filter((mission) => mission.id !== id);
  missionCardExpanded = true;
  checkAndAwardAchievementBonus();
  saveState();
  renderAll();
}

function addTask(event) {
  event.preventDefault();
  const text = elements.taskInput.value.trim();

  if (!text) {
    elements.taskError.textContent = "タスクを入力してください。";
    return;
  }

  state.tasks.push({
    id: createId(),
    text,
    completed: false,
    pointAwarded: false,
    xpAwarded: 0,
    completedDate: null,
    visibleFrom: null
  });
  todoCardExpanded = true;
  elements.taskError.textContent = "";
  closeQuickAdd("task");
  saveState();
  renderAll();
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  const previousPoints = state.totalPoints;
  task.completed = !task.completed;
  if (task.completed) vibrateOnCompletion();

  if (task.completed && !task.pointAwarded) {
    if (state.daily.todoXpCount < XP_RULES.todoMaxCount) {
      addPoints(XP_RULES.todo);
      state.daily.todoXpCount += 1;
      task.xpAwarded = XP_RULES.todo;
    }
    task.pointAwarded = true;
    task.completedDate = getLocalDateString();
  } else if (!task.completed && task.pointAwarded) {
    removePoints(task.xpAwarded);
    if (task.xpAwarded > 0) {
      state.daily.todoXpCount = Math.max(0, state.daily.todoXpCount - 1);
    }
    task.pointAwarded = false;
    task.xpAwarded = 0;
    task.completedDate = null;
  }

  if (task.completed) {
    queueXpAnimation("task", id, state.totalPoints - previousPoints);
  }
  if (!isTodoComplete()) todoCardExpanded = true;
  saveState();
  renderAll();
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (task?.xpAwarded > 0) {
    removePoints(task.xpAwarded);
    state.daily.todoXpCount = Math.max(0, state.daily.todoXpCount - 1);
  }
  state.tasks = state.tasks.filter((task) => task.id !== id);
  if (!isTodoComplete()) todoCardExpanded = true;
  saveState();
  renderAll();
}

function queueXpAnimation(type, id, amount) {
  pendingXpAnimation = amount > 0 ? { type, id, amount } : null;
}

function checkAndAwardAchievementBonus() {
  const isComplete = Boolean(
    state.habit.name &&
    state.habit.completedToday &&
    isMissionComplete()
  );

  if (isComplete && !state.daily.achievementBonusAwarded) {
    addPoints(XP_RULES.completionBonus);
    state.daily.achievementBonusAwarded = true;
    state.daily.completionBonusXp = XP_RULES.completionBonus;
  } else if (!isComplete && state.daily.achievementBonusAwarded) {
    removePoints(state.daily.completionBonusXp);
    state.daily.achievementBonusAwarded = false;
    state.daily.completionBonusXp = 0;
  }
}

function renderAll() {
  renderCurrentDate();
  renderLevel();
  renderHabit();
  renderMissions();
  renderTasks();
  renderFutureTasks();
  renderCollapsibleCards();
  renderLevelUpAnimation();
  renderXpAnimation();
}

function renderCurrentDate() {
  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  elements.currentDate.textContent =
    `${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）`;
}

function renderLevel() {
  const level = Math.floor(state.totalPoints / XP_RULES.levelThreshold) + 1;
  const currentLevelPoints = state.totalPoints % XP_RULES.levelThreshold;
  const remainingPoints = XP_RULES.levelThreshold - currentLevelPoints;
  const percentage = (currentLevelPoints / XP_RULES.levelThreshold) * 100;

  elements.levelText.textContent = `Lv.${level}`;
  elements.pointText.textContent = `${currentLevelPoints} / ${XP_RULES.levelThreshold}XP`;
  elements.levelRemainingText.textContent = `あと${remainingPoints}XPでLevel Up`;
  elements.totalPointText.textContent = `累計 ${state.totalPoints}XP`;
  elements.totalHabitDays.textContent = `${state.habit.totalCompletedDays}日`;
  setProgress(elements.levelProgress, percentage);
}

function setProgress(element, percentage) {
  element.style.width = `${percentage}%`;
  element.parentElement.setAttribute("aria-valuenow", String(percentage));
  element.parentElement.setAttribute("aria-valuemin", "0");
  element.parentElement.setAttribute("aria-valuemax", "100");
}

function renderHabit() {
  const hasHabit = Boolean(state.habit.name);
  elements.habitName.textContent = hasHabit
    ? state.habit.name
    : "習慣を登録してください";
  elements.habitCollapsedName.textContent = hasHabit ? state.habit.name : "";
  elements.habitCheckbox.disabled = !hasHabit;
  elements.habitCheckbox.checked = hasHabit && state.habit.completedToday;
  elements.habitCheckLabel.classList.toggle("empty-row", !hasHabit);
  elements.habitCheckLabel.classList.toggle(
    "completed",
    hasHabit && state.habit.completedToday
  );
  elements.habitStreak.textContent = hasHabit && state.habit.startedDate === getLocalDateString()
    ? "今日からスタート 🌱"
    : state.habit.streak > 0
      ? `継続 ${state.habit.streak}日目 🔥`
      : "今日からスタート 🌱";
  elements.habitForm.hidden = hasHabit;
  elements.habitThemeSelect.value = state.habit.theme;
  elements.habitMenu.hidden = !hasHabit;
}

function renderMissions() {
  elements.missionList.innerHTML = "";
  const nextMissionNumber = state.missions.length + 1;
  elements.missionInput.placeholder = `Mission${["①", "②", "③"][nextMissionNumber - 1] || ""}を入力してEnter`;
  elements.missionInput.setAttribute("aria-label", `Mission${nextMissionNumber}`);
  const completedCount = state.missions.filter((mission) => mission.completed).length;
  elements.missionCount.textContent = isMissionComplete()
    ? "すべて完了"
    : `${completedCount}件完了`;
  const isFull = state.missions.length >= XP_RULES.missionMaxCount;
  elements.missionForm.hidden = isFull || (state.missions.length > 0 && !missionQuickAddOpen);
  elements.missionOpenButton.hidden = isFull || !elements.missionForm.hidden;

  const sortedMissions = [...state.missions].sort(
    (first, second) => Number(first.completed) - Number(second.completed)
  );

  sortedMissions.forEach((mission) => {
    elements.missionList.appendChild(
      createListItem(mission, toggleMission, deleteMission)
    );
  });
}

function renderTasks() {
  elements.taskList.innerHTML = "";
  const todayTasks = getTodayTasks();
  const sortedTasks = [...todayTasks].sort(
    (first, second) => Number(first.completed) - Number(second.completed)
  );

  sortedTasks.forEach((task) => {
    elements.taskList.appendChild(createListItem(task, toggleTask, deleteTask));
  });

  const incompleteCount = todayTasks.filter((task) => !task.completed).length;
  elements.taskCount.textContent = isTodoComplete()
    ? "すべて完了"
    : `未完了${incompleteCount}件`;
}

function renderFutureTasks() {
  const futureTasks = state.tasks
    .filter((task) => isFutureTask(task))
    .sort((first, second) => first.visibleFrom.localeCompare(second.visibleFrom));
  elements.futureTodoCount.textContent = String(futureTasks.length);
  elements.futureTodoGroups.innerHTML = "";

  if (futureTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "future-empty";
    empty.textContent = "あとで表示するTodoはありません";
    elements.futureTodoGroups.appendChild(empty);
    return;
  }

  const groups = new Map();
  futureTasks.forEach((task) => {
    if (!groups.has(task.visibleFrom)) groups.set(task.visibleFrom, []);
    groups.get(task.visibleFrom).push(task);
  });

  groups.forEach((tasks, date) => {
    const group = document.createElement("section");
    group.className = "future-date-group";
    const heading = document.createElement("h3");
    heading.textContent = formatDisplayDate(date);
    const list = document.createElement("ul");
    list.className = "future-list";
    tasks.forEach((task) => list.appendChild(createFutureListItem(task)));
    group.append(heading, list);
    elements.futureTodoGroups.appendChild(group);
  });
}

function createListItem(item, onToggle, onDelete) {
  const listItem = document.createElement("li");
  listItem.className = `item-row${item.completed ? " completed" : ""}`;
  listItem.dataset.itemId = item.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.completed;
  checkbox.setAttribute("aria-label", `${item.text}を完了`);
  checkbox.addEventListener("change", () => onToggle(item.id));

  const text = document.createElement("span");
  text.className = "item-text";
  text.textContent = item.text;

  const menu = document.createElement("details");
  menu.className = "action-menu item-action-menu";

  const summary = document.createElement("summary");
  summary.textContent = "•••";
  summary.setAttribute("aria-label", `${item.text}の操作`);

  const panel = document.createElement("div");
  panel.className = "action-menu-panel";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", () => {
    const type = onToggle === toggleMission ? "mission" : "task";
    openEditDialog(type, item.id);
  });

  if (onToggle === toggleTask) {
    const scheduleButton = document.createElement("button");
    scheduleButton.type = "button";
    scheduleButton.textContent = "あとで表示";
    scheduleButton.addEventListener("click", () => openScheduleDialog(item.id));
    panel.appendChild(scheduleButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-action";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => onDelete(item.id));

  panel.prepend(editButton);
  panel.appendChild(deleteButton);
  menu.append(summary, panel);
  listItem.append(checkbox, text, menu);
  return listItem;
}

function createFutureListItem(task) {
  const listItem = document.createElement("li");
  listItem.className = "future-item";
  listItem.dataset.itemId = task.id;

  const text = document.createElement("span");
  text.className = "item-text";
  text.textContent = task.text;

  const menu = document.createElement("details");
  menu.className = "action-menu item-action-menu";
  const summary = document.createElement("summary");
  summary.textContent = "•••";
  summary.setAttribute("aria-label", `${task.text}の操作`);
  const panel = document.createElement("div");
  panel.className = "action-menu-panel";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", () => openEditDialog("task", task.id));
  const scheduleButton = document.createElement("button");
  scheduleButton.type = "button";
  scheduleButton.textContent = "表示日の変更";
  scheduleButton.addEventListener("click", () => openScheduleDialog(task.id));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-action";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => deleteTask(task.id));

  panel.append(editButton, scheduleButton, deleteButton);
  menu.append(summary, panel);
  listItem.append(text, menu);
  return listItem;
}

function renderLevelUpAnimation() {
  if (!levelUpAnimationPending) return;
  levelUpAnimationPending = false;
  elements.levelCard.classList.remove("level-up");
  elements.levelUpNotice.classList.remove("show");
  requestAnimationFrame(() => {
    elements.levelCard.classList.add("level-up");
    elements.levelUpNotice.classList.add("show");
    window.setTimeout(() => {
      elements.levelCard.classList.remove("level-up");
      elements.levelUpNotice.classList.remove("show");
    }, 1200);
  });
}

function renderXpAnimation() {
  if (!pendingXpAnimation) return;
  const { type, id, amount } = pendingXpAnimation;
  pendingXpAnimation = null;
  const target = type === "habit"
    ? (habitCardExpanded ? elements.habitCheckLabel : elements.habitCard)
    : type === "mission" && !missionCardExpanded
        ? elements.missionCard
      : document.querySelector(
        `${type === "mission" ? "#missionList" : "#taskList"} [data-item-id="${CSS.escape(id)}"]`
      );
  if (!target) return;
  const reward = document.createElement("span");
  reward.className = "xp-reward";
  reward.textContent = `+${amount}XP`;
  target.appendChild(reward);
  reward.addEventListener("animationend", () => reward.remove(), { once: true });
  window.setTimeout(() => reward.remove(), 1200);
}
