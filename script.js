const STORAGE_KEY = "selfGrowthAppState";
const OLD_TODO_STORAGE_KEY = "todos";
const XP_RULES = Object.freeze({
  habit: 5,
  mission: 2,
  missionMaxCount: 3,
  todo: 1,
  todoMaxCount: 5,
  completionBonus: 5,
  levelThreshold: 40
});
let levelUpAnimationPending = false;
let missionCompleteMessageTimer = null;

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousDateString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return getLocalDateString(date);
}

function createInitialState() {
  return {
    version: 3,
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
      achievementBonusAwarded: false
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
    version: 3,
    habit: { ...initialState.habit, ...savedHabit },
    daily: {
      ...initialState.daily,
      ...savedDaily,
      missionXpCount: Number(savedDaily.missionXpCount) || 0,
      todoXpCount: Math.min(
        Number(savedDaily.todoXpCount ?? savedDaily.taskPointCount) || 0,
        XP_RULES.todoMaxCount
      )
    },
    missions: Array.isArray(savedState?.missions)
      ? savedState.missions.map((mission) => ({
          ...mission,
          pointAwarded:
            typeof mission.pointAwarded === "boolean"
              ? mission.pointAwarded
              : Boolean(mission.completed)
        }))
      : [],
    tasks: Array.isArray(savedState?.tasks) ? savedState.tasks : [],
    reflections:
      savedState?.reflections && typeof savedState.reflections === "object"
        ? savedState.reflections
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

const elements = {
  currentDate: document.getElementById("currentDate"),
  levelCard: document.getElementById("levelCard"),
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
  habitEditButton: document.getElementById("habitEditButton"),
  habitInput: document.getElementById("habitInput"),
  habitCheckbox: document.getElementById("habitCheckbox"),
  habitCheckLabel: document.getElementById("habitCheckLabel"),
  habitName: document.getElementById("habitName"),
  habitStreak: document.getElementById("habitStreak"),
  missionForm: document.getElementById("missionForm"),
  missionInput: document.getElementById("missionInput"),
  missionAddButton: document.getElementById("missionAddButton"),
  missionError: document.getElementById("missionError"),
  missionCompleteMessage: document.getElementById("missionCompleteMessage"),
  missionList: document.getElementById("missionList"),
  missionCount: document.getElementById("missionCount"),
  taskForm: document.getElementById("taskForm"),
  taskInput: document.getElementById("taskInput"),
  taskError: document.getElementById("taskError"),
  taskList: document.getElementById("taskList"),
  taskCount: document.getElementById("taskCount"),
  reflectionForm: document.getElementById("reflectionForm"),
  reflectionSection: document.getElementById("reflectionSection"),
  satisfactionRange: document.getElementById("satisfactionRange"),
  satisfactionValue: document.getElementById("satisfactionValue"),
  goodThingInput: document.getElementById("goodThingInput"),
  reflectionMessage: document.getElementById("reflectionMessage")
};

setUpEventListeners();
renderAll();
window.setInterval(() => {
  const beforeDate = state.lastUsedDate;
  handleDateChange();
  if (state.lastUsedDate !== beforeDate) renderAll();
  else renderCurrentDateAndReflectionVisibility();
}, 60000);

function handleDateChange() {
  const today = getLocalDateString();

  if (state.lastUsedDate === today && state.daily.date === today) {
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
    achievementBonusAwarded: false
  };
  saveState();
}

function setUpEventListeners() {
  elements.habitForm.addEventListener("submit", saveHabitName);
  elements.habitCheckbox.addEventListener("change", toggleHabit);
  elements.habitEditButton.addEventListener("click", editHabitName);
  elements.missionForm.addEventListener("submit", addMission);
  elements.taskForm.addEventListener("submit", addTask);
  elements.reflectionForm.addEventListener("submit", saveReflection);
  elements.satisfactionRange.addEventListener("input", updateSatisfactionLabel);
}

function addPoints(points) {
  const previousLevel = Math.floor(state.totalPoints / XP_RULES.levelThreshold);
  state.totalPoints += points;
  levelUpAnimationPending =
    levelUpAnimationPending ||
    Math.floor(state.totalPoints / XP_RULES.levelThreshold) > previousLevel;
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

function editHabitName() {
  elements.habitInput.value = state.habit.name;
  elements.habitForm.hidden = false;
  elements.habitEditButton.hidden = true;
  elements.habitInput.focus();
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
  state.habit.completedToday = elements.habitCheckbox.checked;

  if (state.habit.completedToday) {
    vibrateOnCompletion();
    updateHabitStreak(today);

    if (!state.habit.pointAwardDates.includes(today)) {
      state.habit.pointAwardDates.push(today);
      addPoints(XP_RULES.habit);
    }
  }

  checkAndAwardAchievementBonus();
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

  state.missions.push({ id: createId(), text, completed: false, pointAwarded: false });
  elements.missionInput.value = "";
  elements.missionInput.blur();
  elements.missionError.textContent = "";
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

  mission.completed = !mission.completed;
  if (mission.completed) {
    vibrateOnCompletion();
    if (!mission.pointAwarded) {
      if (state.daily.missionXpCount < XP_RULES.missionMaxCount) {
        addPoints(XP_RULES.mission);
        state.daily.missionXpCount += 1;
      }
      mission.pointAwarded = true;
    }
  }
  checkAndAwardAchievementBonus();
  saveState();
  renderAll();
}

function deleteMission(id) {
  state.missions = state.missions.filter((mission) => mission.id !== id);
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
    completedDate: null
  });
  elements.taskInput.value = "";
  elements.taskInput.blur();
  elements.taskError.textContent = "";
  saveState();
  renderAll();
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  task.completed = !task.completed;
  if (task.completed) vibrateOnCompletion();

  if (task.completed && !task.pointAwarded) {
    if (state.daily.todoXpCount < XP_RULES.todoMaxCount) {
      addPoints(XP_RULES.todo);
      state.daily.todoXpCount += 1;
    }
    task.pointAwarded = true;
    task.completedDate = getLocalDateString();
  }

  saveState();
  renderAll();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  saveState();
  renderAll();
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
  const achievement = getAchievement();

  if (
    state.habit.name &&
    state.habit.completedToday &&
    state.missions.length === XP_RULES.missionMaxCount &&
    state.missions.every((mission) => mission.completed) &&
    !state.daily.achievementBonusAwarded
  ) {
    addPoints(XP_RULES.completionBonus);
    state.daily.achievementBonusAwarded = true;
  }
}

function saveReflection(event) {
  event.preventDefault();
  const today = getLocalDateString();

  state.reflections[today] = {
    date: today,
    satisfaction: Number(elements.satisfactionRange.value),
    goodThing: elements.goodThingInput.value.trim()
  };

  saveState();
  elements.reflectionMessage.textContent = "今日の振り返りを保存しました。";
}

function renderAll() {
  renderCurrentDate();
  renderLevel();
  renderAchievement();
  renderHabit();
  renderMissions();
  renderTasks();
  renderReflection();
  renderLevelUpAnimation();
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
  elements.habitStreak.textContent = `連続 ${state.habit.streak}日`;
  elements.habitForm.hidden = hasHabit;
  elements.habitEditButton.hidden = !hasHabit;
}

function renderMissions() {
  elements.missionList.innerHTML = "";
  elements.missionCount.textContent = `${state.missions.length} / ${XP_RULES.missionMaxCount}件`;
  elements.missionForm.hidden = state.missions.length >= XP_RULES.missionMaxCount;

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
  const sortedTasks = [...state.tasks].sort(
    (first, second) => Number(first.completed) - Number(second.completed)
  );

  sortedTasks.forEach((task) => {
    elements.taskList.appendChild(createListItem(task, toggleTask, deleteTask));
  });

  const incompleteCount = state.tasks.filter((task) => !task.completed).length;
  elements.taskCount.textContent = `${incompleteCount}件`;
}

function createListItem(item, onToggle, onDelete) {
  const listItem = document.createElement("li");
  listItem.className = `item-row${item.completed ? " completed" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.completed;
  checkbox.setAttribute("aria-label", `${item.text}を完了`);
  checkbox.addEventListener("change", () => onToggle(item.id));

  const text = document.createElement("span");
  text.className = "item-text";
  text.textContent = item.text;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "削除";
  deleteButton.setAttribute("aria-label", `${item.text}を削除`);
  deleteButton.addEventListener("click", () => onDelete(item.id));

  listItem.append(checkbox, text, deleteButton);
  return listItem;
}

function renderReflection() {
  renderCurrentDateAndReflectionVisibility();
  if (elements.reflectionSection.hidden) return;

  const todayReflection = state.reflections[getLocalDateString()];

  if (todayReflection) {
    elements.satisfactionRange.value = String(todayReflection.satisfaction);
    elements.goodThingInput.value = todayReflection.goodThing;
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

function updateSatisfactionLabel() {
  elements.satisfactionValue.textContent = `${elements.satisfactionRange.value} / 5`;
}
