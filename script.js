const STORAGE_KEY = "selfGrowthAppState";
const OLD_TODO_STORAGE_KEY = "todos";
const XP_RULES = Object.freeze({
  habit: 5,
  mission: 2,
  missionMaxCount: 3,
  todo: 1,
  todoMaxCount: 5,
  reflection: 2,
  completionBonus: 2,
  levelThreshold: 40
});
let levelUpAnimationPending = false;
let missionCompleteMessageTimer = null;
let pendingXpAnimation = null;
let editContext = null;
let scheduleTaskId = null;

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
    version: 6,
    lastUsedDate: getLocalDateString(),
    totalPoints: 0,
    habit: {
      name: "",
      completedToday: false,
      streak: 0,
      lastCompletedDate: null,
      pointAwardDates: []
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
    reflections: {}
  };
}

function mergeState(savedState) {
  const initialState = createInitialState();
  const savedHabit = savedState && savedState.habit ? savedState.habit : {};
  const savedDaily = savedState && savedState.daily ? savedState.daily : {};

  return {
    ...initialState,
    ...(savedState || {}),
    version: 6,
    habit: { ...initialState.habit, ...savedHabit },
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
        : {}
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

const elements = {
  currentDate: document.getElementById("currentDate"),
  levelCard: document.getElementById("progressCard"),
  levelUpNotice: document.getElementById("levelUpNotice"),
  levelText: document.getElementById("levelText"),
  pointText: document.getElementById("pointText"),
  levelRemainingText: document.getElementById("levelRemainingText"),
  levelProgress: document.getElementById("levelProgress"),
  totalPointText: document.getElementById("totalPointText"),
  achievementText: document.getElementById("achievementText"),
  achievementProgress: document.getElementById("achievementProgress"),
  achievementDetail: document.getElementById("achievementDetail"),
  habitForm: document.getElementById("habitForm"),
  habitCard: document.getElementById("habitCard"),
  habitCardBody: document.getElementById("habitCardBody"),
  habitCollapseButton: document.getElementById("habitCollapseButton"),
  habitMenu: document.getElementById("habitMenu"),
  habitEditButton: document.getElementById("habitEditButton"),
  habitDeleteButton: document.getElementById("habitDeleteButton"),
  habitInput: document.getElementById("habitInput"),
  habitCheckbox: document.getElementById("habitCheckbox"),
  habitCheckLabel: document.getElementById("habitCheckLabel"),
  habitName: document.getElementById("habitName"),
  habitStreak: document.getElementById("habitStreak"),
  missionForm: document.getElementById("missionForm"),
  missionCard: document.getElementById("missionCard"),
  missionCardBody: document.getElementById("missionCardBody"),
  missionCollapseButton: document.getElementById("missionCollapseButton"),
  missionOpenButton: document.getElementById("missionOpenButton"),
  missionInput: document.getElementById("missionInput"),
  missionError: document.getElementById("missionError"),
  missionCompleteMessage: document.getElementById("missionCompleteMessage"),
  missionList: document.getElementById("missionList"),
  missionCount: document.getElementById("missionCount"),
  taskForm: document.getElementById("taskForm"),
  taskOpenButton: document.getElementById("taskOpenButton"),
  taskInput: document.getElementById("taskInput"),
  taskError: document.getElementById("taskError"),
  taskList: document.getElementById("taskList"),
  taskCount: document.getElementById("taskCount"),
  futureTodoDetails: document.getElementById("futureTodoDetails"),
  futureTodoCount: document.getElementById("futureTodoCount"),
  futureTodoGroups: document.getElementById("futureTodoGroups"),
  reflectionForm: document.getElementById("reflectionForm"),
  reflectionSection: document.getElementById("reflectionSection"),
  satisfactionRange: document.getElementById("satisfactionRange"),
  satisfactionValue: document.getElementById("satisfactionValue"),
  goodThingInput: document.getElementById("goodThingInput"),
  reflectionMessage: document.getElementById("reflectionMessage"),
  reflectionEditButton: document.getElementById("reflectionEditButton"),
  reflectionCompleteMessage: document.getElementById("reflectionCompleteMessage"),
  editDialog: document.getElementById("editDialog"),
  editForm: document.getElementById("editForm"),
  editDialogTitle: document.getElementById("editDialogTitle"),
  editInput: document.getElementById("editInput"),
  editCancelButton: document.getElementById("editCancelButton"),
  scheduleDialog: document.getElementById("scheduleDialog"),
  scheduleDialogTitle: document.getElementById("scheduleDialogTitle"),
  scheduleDateForm: document.getElementById("scheduleDateForm"),
  scheduleDateInput: document.getElementById("scheduleDateInput"),
  scheduleCancelButton: document.getElementById("scheduleCancelButton")
};

setUpEventListeners();
renderAll();
window.setInterval(() => {
  const beforeDate = state.lastUsedDate;
  handleDateChange();
  if (state.lastUsedDate !== beforeDate) {
    habitCardExpanded = true;
    missionCardExpanded = true;
    renderAll();
  }
  else renderCurrentDateAndReflectionVisibility();
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
  elements.habitCollapseButton.addEventListener("click", () => toggleCard("habit"));
  elements.missionCollapseButton.addEventListener("click", () => toggleCard("mission"));
  elements.habitForm.addEventListener("submit", saveHabitName);
  elements.habitCheckbox.addEventListener("change", toggleHabit);
  elements.habitEditButton.addEventListener("click", () => openEditDialog("habit"));
  elements.habitDeleteButton.addEventListener("click", deleteHabit);
  elements.missionOpenButton.addEventListener("click", () => openQuickAdd("mission"));
  elements.missionForm.addEventListener("submit", addMission);
  elements.taskOpenButton.addEventListener("click", () => openQuickAdd("task"));
  elements.taskForm.addEventListener("submit", addTask);
  elements.reflectionForm.addEventListener("submit", saveReflection);
  elements.reflectionEditButton.addEventListener("click", editReflection);
  elements.satisfactionRange.addEventListener("input", updateSatisfactionLabel);
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

function isMissionComplete() {
  return state.missions.length === XP_RULES.missionMaxCount &&
    state.missions.every((mission) => mission.completed);
}

function toggleCard(type) {
  if (type === "habit") habitCardExpanded = !habitCardExpanded;
  else missionCardExpanded = !missionCardExpanded;
  renderCollapsibleCards();
}

function renderCollapsibleCards() {
  elements.habitCardBody.hidden = !habitCardExpanded;
  elements.habitCollapseButton.setAttribute("aria-expanded", String(habitCardExpanded));
  elements.habitCard.classList.toggle("collapsed", !habitCardExpanded);
  elements.missionCardBody.hidden = !missionCardExpanded;
  elements.missionCollapseButton.setAttribute("aria-expanded", String(missionCardExpanded));
  elements.missionCard.classList.toggle("collapsed", !missionCardExpanded);
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
  elements.habitInput.value = "";
  saveState();
  renderAll();
}

function openQuickAdd(type) {
  const isMission = type === "mission";
  const form = isMission ? elements.missionForm : elements.taskForm;
  const button = isMission ? elements.missionOpenButton : elements.taskOpenButton;
  const input = isMission ? elements.missionInput : elements.taskInput;
  form.hidden = false;
  button.hidden = true;
  input.focus();
}

function closeQuickAdd(type) {
  const isMission = type === "mission";
  const form = isMission ? elements.missionForm : elements.taskForm;
  const button = isMission ? elements.missionOpenButton : elements.taskOpenButton;
  const input = isMission ? elements.missionInput : elements.taskInput;
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
    state.habit.name = value;
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
  if (state.habit.pointAwardDates.includes(getLocalDateString())) {
    removePoints(XP_RULES.habit);
  }
  state.habit = { ...createInitialState().habit };
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
      addPoints(XP_RULES.habit);
    }
  } else {
    const pointDateIndex = state.habit.pointAwardDates.indexOf(today);
    if (pointDateIndex >= 0) {
      state.habit.pointAwardDates.splice(pointDateIndex, 1);
      removePoints(XP_RULES.habit);
    }
  }

  checkAndAwardAchievementBonus();
  if (state.habit.completedToday) {
    queueXpAnimation("habit", null, state.totalPoints - previousPoints);
  }
  habitCardExpanded = !state.habit.completedToday;
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
  elements.missionError.textContent = "";
  closeQuickAdd("mission");
  saveState();
  renderAll();
  if (state.missions.length === XP_RULES.missionMaxCount) {
    elements.missionCompleteMessage.textContent = "🎯 今日のMission完成！";
    window.clearTimeout(missionCompleteMessageTimer);
    missionCompleteMessageTimer = window.setTimeout(() => {
      elements.missionCompleteMessage.textContent = "";
    }, 3000);
  }
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
        addPoints(XP_RULES.mission);
        state.daily.missionXpCount += 1;
        mission.xpAwarded = XP_RULES.mission;
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
  missionCardExpanded = !isMissionComplete();
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
  saveState();
  renderAll();
}

function queueXpAnimation(type, id, amount) {
  pendingXpAnimation = amount > 0 ? { type, id, amount } : null;
}

function getAchievement() {
  const hasHabit = Boolean(state.habit.name);
  const total = hasHabit || state.missions.length > 0
    ? XP_RULES.missionMaxCount + 1
    : 0;
  const completedMissions = state.missions.filter((mission) => mission.completed).length;
  const completed = completedMissions + (hasHabit && state.habit.completedToday ? 1 : 0);
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percentage };
}

function checkAndAwardAchievementBonus() {
  const isComplete = Boolean(
    state.habit.name &&
    state.habit.completedToday &&
    state.missions.length === XP_RULES.missionMaxCount &&
    state.missions.every((mission) => mission.completed)
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

function saveReflection(event) {
  event.preventDefault();
  const today = getLocalDateString();
  const existingReflection = state.reflections[today];
  const isFirstXpAward = !existingReflection?.xpAwarded;

  state.reflections[today] = {
    date: today,
    satisfaction: Number(elements.satisfactionRange.value),
    goodThing: elements.goodThingInput.value.trim(),
    xpAwarded: true
  };

  if (isFirstXpAward) {
    addPoints(XP_RULES.reflection);
    queueXpAnimation("reflection", null, XP_RULES.reflection);
  }
  elements.goodThingInput.blur();
  saveState();
  renderAll();
}

function editReflection() {
  elements.reflectionForm.hidden = false;
  elements.reflectionEditButton.hidden = true;
  elements.reflectionCompleteMessage.hidden = true;
  elements.goodThingInput.focus();
}

function renderAll() {
  renderCurrentDate();
  renderLevel();
  renderAchievement();
  renderHabit();
  renderMissions();
  renderTasks();
  renderFutureTasks();
  renderReflection();
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

function renderCurrentDateAndReflectionVisibility() {
  renderCurrentDate();
  const hour = new Date().getHours();
  elements.reflectionSection.hidden = !(hour >= 18 || hour < 5);
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
  setProgress(elements.levelProgress, percentage);
}

function renderAchievement() {
  const achievement = getAchievement();
  elements.achievementText.textContent = String(achievement.percentage);
  elements.achievementDetail.textContent =
    achievement.total === 0
      ? "対象項目はまだありません"
      : `${achievement.completed} / ${achievement.total}件 達成`;
  setProgress(elements.achievementProgress, achievement.percentage);
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
  elements.habitCheckbox.disabled = !hasHabit;
  elements.habitCheckbox.checked = hasHabit && state.habit.completedToday;
  elements.habitCheckLabel.classList.toggle("empty-row", !hasHabit);
  elements.habitCheckLabel.classList.toggle(
    "completed",
    hasHabit && state.habit.completedToday
  );
  elements.habitStreak.textContent = `連続 ${state.habit.streak}日`;
  elements.habitForm.hidden = hasHabit;
  elements.habitMenu.hidden = !hasHabit;
}

function renderMissions() {
  elements.missionList.innerHTML = "";
  const completedCount = state.missions.filter((mission) => mission.completed).length;
  elements.missionCount.textContent = `${completedCount} / ${XP_RULES.missionMaxCount} 完了`;
  const isFull = state.missions.length >= XP_RULES.missionMaxCount;
  if (isFull) elements.missionForm.hidden = true;
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
  const todayTasks = state.tasks.filter((task) => !isFutureTask(task));
  const sortedTasks = [...todayTasks].sort(
    (first, second) => Number(first.completed) - Number(second.completed)
  );

  sortedTasks.forEach((task) => {
    elements.taskList.appendChild(createListItem(task, toggleTask, deleteTask));
  });

  const incompleteCount = todayTasks.filter((task) => !task.completed).length;
  elements.taskCount.textContent = `未完了：${incompleteCount}件`;
}

function renderFutureTasks() {
  const futureTasks = state.tasks
    .filter((task) => isFutureTask(task))
    .sort((first, second) => first.visibleFrom.localeCompare(second.visibleFrom));
  elements.futureTodoCount.textContent = `${futureTasks.length}件`;
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

function renderReflection() {
  renderCurrentDateAndReflectionVisibility();
  const todayReflection = state.reflections[getLocalDateString()];

  if (todayReflection) {
    elements.satisfactionRange.value = String(todayReflection.satisfaction);
    elements.goodThingInput.value = todayReflection.goodThing;
    elements.reflectionForm.hidden = true;
    elements.reflectionEditButton.hidden = false;
    elements.reflectionCompleteMessage.hidden = false;
  } else {
    elements.satisfactionRange.value = "3";
    elements.goodThingInput.value = "";
    elements.reflectionForm.hidden = false;
    elements.reflectionEditButton.hidden = true;
    elements.reflectionCompleteMessage.hidden = true;
  }

  updateSatisfactionLabel();
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
    : type === "reflection"
      ? elements.reflectionSection
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

function updateSatisfactionLabel() {
  elements.satisfactionValue.textContent = `${elements.satisfactionRange.value} / 5`;
}
