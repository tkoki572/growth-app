const STORAGE_KEY = "selfGrowthAppState";
const OLD_TODO_STORAGE_KEY = "todos";
const POINTS_PER_LEVEL = 40;

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
    version: 1,
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
      taskPointCount: 0,
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
    habit: { ...initialState.habit, ...savedHabit },
    daily: { ...initialState.daily, ...savedDaily },
    missions: Array.isArray(savedState?.missions) ? savedState.missions : [],
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
  levelText: document.getElementById("levelText"),
  pointText: document.getElementById("pointText"),
  levelRemainingText: document.getElementById("levelRemainingText"),
  levelProgress: document.getElementById("levelProgress"),
  totalPointText: document.getElementById("totalPointText"),
  achievementText: document.getElementById("achievementText"),
  achievementProgress: document.getElementById("achievementProgress"),
  achievementDetail: document.getElementById("achievementDetail"),
  habitForm: document.getElementById("habitForm"),
  habitInput: document.getElementById("habitInput"),
  habitCheckbox: document.getElementById("habitCheckbox"),
  habitCheckLabel: document.getElementById("habitCheckLabel"),
  habitName: document.getElementById("habitName"),
  habitStreak: document.getElementById("habitStreak"),
  missionForm: document.getElementById("missionForm"),
  missionInput: document.getElementById("missionInput"),
  missionAddButton: document.getElementById("missionAddButton"),
  missionError: document.getElementById("missionError"),
  missionList: document.getElementById("missionList"),
  missionCount: document.getElementById("missionCount"),
  taskForm: document.getElementById("taskForm"),
  taskInput: document.getElementById("taskInput"),
  taskError: document.getElementById("taskError"),
  taskList: document.getElementById("taskList"),
  taskCount: document.getElementById("taskCount"),
  reflectionForm: document.getElementById("reflectionForm"),
  satisfactionRange: document.getElementById("satisfactionRange"),
  satisfactionValue: document.getElementById("satisfactionValue"),
  goodThingInput: document.getElementById("goodThingInput"),
  reflectionMessage: document.getElementById("reflectionMessage")
};

setUpEventListeners();
renderAll();

function handleDateChange() {
  const today = getLocalDateString();

  if (state.lastUsedDate === today && state.daily.date === today) {
    return;
  }

  state.lastUsedDate = today;
  state.habit.completedToday = false;
  state.missions = [];
  state.daily = {
    date: today,
    taskPointCount: 0,
    achievementBonusAwarded: false
  };
  saveState();
}

function setUpEventListeners() {
  elements.habitForm.addEventListener("submit", saveHabitName);
  elements.habitCheckbox.addEventListener("change", toggleHabit);
  elements.missionForm.addEventListener("submit", addMission);
  elements.taskForm.addEventListener("submit", addTask);
  elements.reflectionForm.addEventListener("submit", saveReflection);
  elements.satisfactionRange.addEventListener("input", updateSatisfactionLabel);
}

function addPoints(points) {
  state.totalPoints += points;
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

function toggleHabit() {
  const today = getLocalDateString();
  state.habit.completedToday = elements.habitCheckbox.checked;

  if (state.habit.completedToday) {
    updateHabitStreak(today);

    if (!state.habit.pointAwardDates.includes(today)) {
      state.habit.pointAwardDates.push(today);
      addPoints(5);
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

  if (state.missions.length >= 3) {
    elements.missionError.textContent = "Missionは3件まで登録できます。";
    return;
  }

  state.missions.push({ id: createId(), text, completed: false });
  elements.missionInput.value = "";
  elements.missionError.textContent = "";
  saveState();
  renderAll();
}

function toggleMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (!mission) return;

  mission.completed = !mission.completed;
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
  elements.taskError.textContent = "";
  saveState();
  renderAll();
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  task.completed = !task.completed;

  if (task.completed && !task.pointAwarded) {
    const points = getNextTaskPoints();
    addPoints(points);
    task.pointAwarded = true;
    task.completedDate = getLocalDateString();
    state.daily.taskPointCount += 1;
  }

  saveState();
  renderAll();
}

function getNextTaskPoints() {
  const nextCompletionNumber = state.daily.taskPointCount + 1;
  if (nextCompletionNumber <= 5) return 2;
  if (nextCompletionNumber <= 10) return 1;
  return 0;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  saveState();
  renderAll();
}

function getAchievement() {
  const hasHabit = Boolean(state.habit.name);
  const total = state.missions.length + (hasHabit ? 1 : 0);
  const completedMissions = state.missions.filter((mission) => mission.completed).length;
  const completed = completedMissions + (hasHabit && state.habit.completedToday ? 1 : 0);
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percentage };
}

function checkAndAwardAchievementBonus() {
  const achievement = getAchievement();

  if (
    achievement.total > 0 &&
    achievement.completed === achievement.total &&
    !state.daily.achievementBonusAwarded
  ) {
    addPoints(10);
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
  elements.reflectionMessage.textContent = `${today} の振り返りを保存しました。`;
}

function renderAll() {
  renderLevel();
  renderAchievement();
  renderHabit();
  renderMissions();
  renderTasks();
  renderReflection();
}

function renderLevel() {
  const level = Math.floor(state.totalPoints / POINTS_PER_LEVEL) + 1;
  const currentLevelPoints = state.totalPoints % POINTS_PER_LEVEL;
  const remainingPoints = POINTS_PER_LEVEL - currentLevelPoints;
  const percentage = (currentLevelPoints / POINTS_PER_LEVEL) * 100;

  elements.levelText.textContent = `Lv.${level}`;
  elements.pointText.textContent = `${currentLevelPoints} / ${POINTS_PER_LEVEL}pt`;
  elements.levelRemainingText.textContent = `あと${remainingPoints}ptでLevel Up`;
  elements.totalPointText.textContent = `累計 ${state.totalPoints}pt`;
  setProgress(elements.levelProgress, percentage);
}

function renderAchievement() {
  const achievement = getAchievement();
  elements.achievementText.textContent = `${achievement.percentage}%`;
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
}

function renderMissions() {
  elements.missionList.innerHTML = "";
  elements.missionCount.textContent = `${state.missions.length} / 3件`;
  elements.missionAddButton.disabled = state.missions.length >= 3;

  state.missions.forEach((mission) => {
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
  elements.taskCount.textContent = `未完了 ${incompleteCount}件`;
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
  const todayReflection = state.reflections[getLocalDateString()];

  if (todayReflection) {
    elements.satisfactionRange.value = String(todayReflection.satisfaction);
    elements.goodThingInput.value = todayReflection.goodThing;
  }

  updateSatisfactionLabel();
}

function updateSatisfactionLabel() {
  elements.satisfactionValue.textContent = `${elements.satisfactionRange.value} / 5`;
}
