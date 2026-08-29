import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCircle2, Circle, Plus, Trophy, History, Settings, X, Gift, Trash2, Repeat, User, LogOut, Download, Share } from "lucide-react";

const MEMBER_COLORS = [
  { bg: "#2F4538", text: "#FFFFFF" },
  { bg: "#8A4B3B", text: "#FFFFFF" },
  { bg: "#3E5C76", text: "#FFFFFF" },
  { bg: "#6B4E71", text: "#FFFFFF" },
  { bg: "#4B6B43", text: "#FFFFFF" },
  { bg: "#8A6D3B", text: "#FFFFFF" },
];

const DEFAULT_MEMBERS = [
  { name: "Tamara", role: "admin" },
  { name: "Marcel", role: "member" },
  { name: "Lya", role: "member" },
  { name: "Jana", role: "member" },
  { name: "Nela", role: "member" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function startOfWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}
function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.toDateString() === db.toDateString();
}
function isSameWeek(a, b) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

const API_URL = "api/data.php";
const LOGIN_KEY = "larus_user_id";
const INSTALL_DISMISSED_KEY = "larus_install_dismissed";

async function loadAllShared() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Netzwerkfehler");
    return await res.json();
  } catch (e) {
    console.error("Laden fehlgeschlagen", e);
    return {};
  }
}
async function saveShared(key, value) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  } catch (e) {
    console.error("Speichern fehlgeschlagen", e);
  }
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function HouseholdApp() {
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState("tasks");
  const [currentUser, setCurrentUser] = useState(null);

  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddReward, setShowAddReward] = useState(false);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"
  );

  useEffect(() => {
    (async () => {
      const data = await loadAllShared();
      let loadedMembers = data.members || [];

      if (loadedMembers.length === 0) {
        loadedMembers = DEFAULT_MEMBERS.map((m, i) => ({
          id: uid(),
          name: m.name,
          role: m.role,
          color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        }));
        saveShared("members", loadedMembers);
      }

      setMembers(loadedMembers);
      setTasks(data.tasks || []);
      setRewards(data.rewards || []);
      setLog(data.log || []);

      const savedUserId = localStorage.getItem(LOGIN_KEY);
      if (savedUserId && loadedMembers.some((m) => m.id === savedUserId)) {
        setCurrentUser(savedUserId);
      }

      setReady(true);
    })();
  }, []);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const persist = useCallback((key, value, setter) => {
    setter(value);
    saveShared(key, value);
  }, []);

  const pointsByMember = useMemo(() => {
    const totals = {};
    members.forEach((m) => (totals[m.id] = 0));
    log.forEach((entry) => {
      totals[entry.memberId] = (totals[entry.memberId] || 0) + entry.points;
    });
    return totals;
  }, [members, log]);

  const isTaskOpenToday = useCallback(
    (task) => {
      const relevant = log.filter((e) => e.taskId === task.id && e.type === "complete");
      if (relevant.length === 0) return true;
      const last = relevant.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
      if (task.recurring === "once") return false;
      if (task.recurring === "daily") return !isSameDay(last.timestamp, Date.now());
      if (task.recurring === "weekly") return !isSameWeek(last.timestamp, Date.now());
      return true;
    },
    [log]
  );

  const openTasks = tasks.filter(isTaskOpenToday);
  const doneTasks = tasks.filter((t) => !isTaskOpenToday(t));

  function addTask({ name, points, recurring, assignedTo }) {
    const next = [...tasks, { id: uid(), name, points, recurring, assignedTo: assignedTo || null }];
    persist("tasks", next, setTasks);
    setShowAddTask(false);
  }
  function deleteTask(id) {
    persist("tasks", tasks.filter((t) => t.id !== id), setTasks);
  }
  function addMember(name) {
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    const next = [...members, { id: uid(), name, role: "member", color }];
    persist("members", next, setMembers);
    setShowAddMember(false);
  }
  function deleteMember(id) {
    persist("members", members.filter((m) => m.id !== id), setMembers);
  }
  function addReward({ name, cost }) {
    const next = [...rewards, { id: uid(), name, cost }];
    persist("rewards", next, setRewards);
    setShowAddReward(false);
  }
  function deleteReward(id) {
    persist("rewards", rewards.filter((r) => r.id !== id), setRewards);
  }

  function completeTask(task) {
    const member = members.find((m) => m.id === currentUser);
    if (!member) return;
    const entry = {
      id: uid(),
      type: "complete",
      taskId: task.id,
      taskName: task.name,
      memberId: member.id,
      memberName: member.name,
      points: task.points,
      timestamp: Date.now(),
    };
    persist("log", [entry, ...log], setLog);
  }

  function redeemReward(reward) {
    const member = members.find((m) => m.id === currentUser);
    if (!member) return;
    const entry = {
      id: uid(),
      type: "redeem",
      taskId: null,
      taskName: reward.name,
      memberId: member.id,
      memberName: member.name,
      points: -reward.cost,
      timestamp: Date.now(),
    };
    persist("log", [entry, ...log], setLog);
  }

  function login(memberId) {
    localStorage.setItem(LOGIN_KEY, memberId);
    setCurrentUser(memberId);
  }
  function logout() {
    localStorage.removeItem(LOGIN_KEY);
    setCurrentUser(null);
    setTab("tasks");
  }

  async function triggerInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
  }
  function dismissInstallBanner() {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    setInstallDismissed(true);
  }

  const memberById = (id) => members.find((m) => m.id === id);
  const me = memberById(currentUser);
  const isAdmin = me?.role === "admin";

  const showInstallBanner =
    !installDismissed && !isStandalone() && (deferredInstallPrompt || isIOS());

  if (!ready) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#666", fontFamily: "system-ui, sans-serif" }}>
        Larus wird geladen…
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen members={members} onLogin={login} />;
  }

  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#F4F4EF",
        minHeight: "600px",
        maxWidth: "420px",
        margin: "0 auto",
        borderRadius: "20px",
        overflow: "hidden",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ background: "#2F4538", color: "#fff", padding: "1.1rem 1.25rem 1rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "12px", opacity: 0.75, letterSpacing: "0.02em", marginBottom: "2px" }}>
            Larus &middot; {me?.name}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 600 }}>
            {tab === "tasks" && "Aufgaben"}
            {tab === "board" && "Punktestand & Belohnungen"}
            {tab === "history" && "Verlauf"}
            {tab === "settings" && "Verwalten"}
          </div>
        </div>
        <button
          onClick={logout}
          title="Wechseln"
          style={{ border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: "8px", padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
        >
          <LogOut size={14} />
        </button>
      </div>

      {showInstallBanner && (
        <InstallBanner isIOS={isIOS()} onInstall={triggerInstall} onDismiss={dismissInstallBanner} />
      )}

      {/* Content */}
      <div style={{ flex: 1, padding: "14px", overflowY: "auto", minHeight: "360px" }}>
        {tab === "tasks" && (
          <TasksView
            openTasks={openTasks}
            doneTasks={doneTasks}
            memberById={memberById}
            isAdmin={isAdmin}
            onComplete={completeTask}
            onDelete={deleteTask}
            onAdd={() => setShowAddTask(true)}
          />
        )}
        {tab === "board" && (
          <BoardView
            members={members}
            pointsByMember={pointsByMember}
            rewards={rewards}
            isAdmin={isAdmin}
            onRedeem={redeemReward}
            onAddReward={() => setShowAddReward(true)}
            onDeleteReward={deleteReward}
          />
        )}
        {tab === "history" && <HistoryView log={log} />}
        {tab === "settings" && isAdmin && (
          <SettingsView
            members={members}
            onAddMember={() => setShowAddMember(true)}
            onDeleteMember={deleteMember}
          />
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ display: "flex", borderTop: "1px solid #e5e4dd", background: "#fff" }}>
        <NavButton icon={<CheckCircle2 size={20} />} label="Aufgaben" active={tab === "tasks"} onClick={() => setTab("tasks")} />
        <NavButton icon={<Trophy size={20} />} label="Punkte" active={tab === "board"} onClick={() => setTab("board")} />
        <NavButton icon={<History size={20} />} label="Verlauf" active={tab === "history"} onClick={() => setTab("history")} />
        {isAdmin && (
          <NavButton icon={<Settings size={20} />} label="Verwalten" active={tab === "settings"} onClick={() => setTab("settings")} />
        )}
      </div>

      {showAddTask && (
        <AddTaskModal members={members} onClose={() => setShowAddTask(false)} onSave={addTask} />
      )}
      {showAddMember && (
        <SimpleInputModal
          title="Person hinzufügen"
          placeholder="Name"
          onClose={() => setShowAddMember(false)}
          onSave={addMember}
        />
      )}
      {showAddReward && (
        <AddRewardModal onClose={() => setShowAddReward(false)} onSave={addReward} />
      )}
    </div>
  );
}

function LoginScreen({ members, onLogin }) {
  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#2F4538",
        minHeight: "600px",
        maxWidth: "420px",
        margin: "0 auto",
        borderRadius: "20px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        boxSizing: "border-box",
      }}
    >
      <div style={{ color: "#fff", fontSize: "24px", fontWeight: 600, marginBottom: "6px" }}>Larus</div>
      <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "14px", marginBottom: "28px", textAlign: "center" }}>
        Wer bist du?
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "280px" }}>
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onLogin(m.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              border: "none",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              borderRadius: "12px",
              padding: "12px 16px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: m.color.bg, border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>
              {m.name.slice(0, 2).toUpperCase()}
            </div>
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function InstallBanner({ isIOS, onInstall, onDismiss }) {
  return (
    <div style={{ background: "#EFEAD9", padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #e5e4dd" }}>
      <Download size={16} color="#8A6D3B" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: "12.5px", color: "#5a5240", lineHeight: 1.4 }}>
        {isIOS ? (
          <>Als App installieren: <Share size={11} style={{ verticalAlign: "-1px" }} />-Symbol antippen, dann "Zum Home-Bildschirm".</>
        ) : (
          "Larus lässt sich als App installieren – schneller Zugriff vom Startbildschirm."
        )}
      </div>
      {!isIOS && (
        <button onClick={onInstall} style={{ border: "none", background: "#2F4538", color: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          Installieren
        </button>
      )}
      <button onClick={onDismiss} style={{ border: "none", background: "none", color: "#a89f88", cursor: "pointer", padding: "2px" }}>
        <X size={14} />
      </button>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: "none",
        background: "transparent",
        padding: "9px 4px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "3px",
        color: active ? "#2F4538" : "#a0a09a",
        cursor: "pointer",
      }}
    >
      {icon}
      <span style={{ fontSize: "11px", fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}

function TasksView({ openTasks, doneTasks, memberById, isAdmin, onComplete, onDelete, onAdd }) {
  return (
    <div>
      {isAdmin && (
        <button
          onClick={onAdd}
          style={{
            width: "100%",
            border: "1px dashed #c6c5bc",
            borderRadius: "12px",
            background: "transparent",
            padding: "10px",
            color: "#5a5a52",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            marginBottom: "12px",
            cursor: "pointer",
          }}
        >
          <Plus size={16} /> Neue Aufgabe
        </button>
      )}

      {openTasks.length === 0 && doneTasks.length === 0 && (
        <p style={{ color: "#8a897f", fontSize: "14px", textAlign: "center", marginTop: "2rem" }}>
          Noch keine Aufgaben.
        </p>
      )}

      {openTasks.map((t) => (
        <TaskRow key={t.id} task={t} memberById={memberById} done={false} isAdmin={isAdmin} onComplete={() => onComplete(t)} onDelete={() => onDelete(t.id)} />
      ))}

      {doneTasks.length > 0 && (
        <>
          <div style={{ fontSize: "12px", color: "#a0a09a", margin: "16px 0 6px", fontWeight: 500 }}>
            Erledigt
          </div>
          {doneTasks.map((t) => (
            <TaskRow key={t.id} task={t} memberById={memberById} done={true} isAdmin={isAdmin} onDelete={() => onDelete(t.id)} />
          ))}
        </>
      )}
    </div>
  );
}

function TaskRow({ task, memberById, done, isAdmin, onComplete, onDelete }) {
  const assignee = task.assignedTo ? memberById(task.assignedTo) : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "#fff",
        borderRadius: "12px",
        padding: "10px 12px",
        marginBottom: "8px",
        opacity: done ? 0.55 : 1,
      }}
    >
      <button onClick={done ? undefined : onComplete} style={{ border: "none", background: "none", padding: 0, cursor: done ? "default" : "pointer", color: done ? "#8fbf6f" : "#c6c5bc" }}>
        {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 500, color: "#2a2a26", textDecoration: done ? "line-through" : "none" }}>
          {task.name}
        </div>
        <div style={{ fontSize: "12px", color: "#a0a09a", display: "flex", gap: "8px", marginTop: "2px" }}>
          <span>{task.points} Pkt.</span>
          {task.recurring !== "once" && (
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <Repeat size={11} /> {task.recurring === "daily" ? "täglich" : "wöchentlich"}
            </span>
          )}
          {assignee && (
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <User size={11} /> {assignee.name}
            </span>
          )}
        </div>
      </div>
      {isAdmin && (
        <button onClick={onDelete} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer", padding: "4px" }}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function BoardView({ members, pointsByMember, rewards, isAdmin, onRedeem, onAddReward, onDeleteReward }) {
  const ranked = [...members].sort((a, b) => (pointsByMember[b.id] || 0) - (pointsByMember[a.id] || 0));
  return (
    <div>
      {ranked.map((m, i) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px" }}>
          <div style={{ fontSize: "13px", color: "#a0a09a", width: "16px", fontWeight: 600 }}>{i + 1}</div>
          <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: m.color.bg, color: m.color.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600 }}>
            {m.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, fontSize: "14px", fontWeight: 500, color: "#2a2a26" }}>{m.name}</div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#E0A72E" }}>{pointsByMember[m.id] || 0} Pkt.</div>
        </div>
      ))}

      <div style={{ fontSize: "12px", color: "#a0a09a", margin: "18px 0 6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "5px" }}>
        <Gift size={13} /> Belohnungen
      </div>
      {isAdmin && (
        <button
          onClick={onAddReward}
          style={{
            width: "100%",
            border: "1px dashed #c6c5bc",
            borderRadius: "12px",
            background: "transparent",
            padding: "9px",
            color: "#5a5a52",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            marginBottom: "10px",
            cursor: "pointer",
          }}
        >
          <Plus size={14} /> Belohnung hinzufügen
        </button>
      )}
      {rewards.length === 0 && (
        <p style={{ color: "#c6c5bc", fontSize: "13px", textAlign: "center" }}>Noch keine Belohnungen definiert.</p>
      )}
      {rewards.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px" }}>
          <div style={{ flex: 1, fontSize: "14px", fontWeight: 500, color: "#2a2a26" }}>{r.name}</div>
          <div style={{ fontSize: "13px", color: "#E0A72E", fontWeight: 600 }}>{r.cost} Pkt.</div>
          <button onClick={() => onRedeem(r)} style={{ border: "1px solid #2F4538", color: "#2F4538", background: "none", borderRadius: "8px", padding: "5px 10px", fontSize: "12px", cursor: "pointer" }}>
            Einlösen
          </button>
          {isAdmin && (
            <button onClick={() => onDeleteReward(r.id)} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer" }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryView({ log }) {
  if (log.length === 0) {
    return <p style={{ color: "#8a897f", fontSize: "14px", textAlign: "center", marginTop: "2rem" }}>Noch keine Einträge.</p>;
  }
  return (
    <div>
      {log.slice(0, 100).map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "9px 12px", marginBottom: "7px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13.5px", color: "#2a2a26" }}>
              <strong style={{ fontWeight: 600 }}>{e.memberName}</strong>{" "}
              {e.type === "complete" ? "hat erledigt:" : "hat eingelöst:"} {e.taskName}
            </div>
            <div style={{ fontSize: "11.5px", color: "#a0a09a", marginTop: "1px" }}>
              {new Date(e.timestamp).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: e.points >= 0 ? "#4B6B43" : "#8A4B3B" }}>
            {e.points >= 0 ? "+" : ""}{e.points}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsView({ members, onAddMember, onDeleteMember }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "#a0a09a", margin: "0 0 6px", fontWeight: 500 }}>
        Familienmitglieder
      </div>
      {members.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "9px 12px", marginBottom: "7px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: m.color.bg, color: m.color.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600 }}>
            {m.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, fontSize: "14px", color: "#2a2a26" }}>
            {m.name}
            {m.role === "admin" && (
              <span style={{ marginLeft: "6px", fontSize: "10px", color: "#E0A72E", fontWeight: 600, letterSpacing: "0.03em" }}>ADMIN</span>
            )}
          </div>
          {m.role !== "admin" && (
            <button onClick={() => onDeleteMember(m.id)} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer" }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAddMember}
        style={{
          width: "100%",
          border: "1px dashed #c6c5bc",
          borderRadius: "12px",
          background: "transparent",
          padding: "10px",
          color: "#5a5a52",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          marginTop: "4px",
          cursor: "pointer",
        }}
      >
        <Plus size={16} /> Person hinzufügen
      </button>
      <p style={{ fontSize: "12px", color: "#c6c5bc", marginTop: "18px", lineHeight: 1.5 }}>
        Alle Daten werden geteilt gespeichert – jede Person, die diese App öffnet, sieht dieselben Aufgaben und Punkte.
        Nur Admins (Tamara) können Aufgaben und Belohnungen anlegen oder löschen.
      </p>
    </div>
  );
}

/* ---------- Modals ---------- */

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 10 }}>
      <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", padding: "18px", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#2a2a26" }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", color: "#a0a09a", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "9px 12px",
  fontSize: "14px",
  marginBottom: "10px",
  boxSizing: "border-box",
};
const primaryBtn = {
  width: "100%",
  border: "none",
  background: "#2F4538",
  color: "#fff",
  borderRadius: "10px",
  padding: "11px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

function SimpleInputModal({ title, placeholder, onClose, onSave }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <ModalShell title={title} onClose={onClose}>
      <input style={inputStyle} placeholder={placeholder} value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} />
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          if (!value.trim()) return setError("Bitte einen Namen eingeben.");
          onSave(value.trim());
        }}
      >
        Speichern
      </button>
    </ModalShell>
  );
}

function AddTaskModal({ members, onClose, onSave }) {
  const [name, setName] = useState("");
  const [points, setPoints] = useState(5);
  const [recurring, setRecurring] = useState("once");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState("");
  return (
    <ModalShell title="Neue Aufgabe" onClose={onClose}>
      <input style={inputStyle} placeholder="z.B. Küche putzen" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Punkte</label>
      <input style={inputStyle} type="number" min="1" step="1" value={points} onChange={(e) => setPoints(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Wiederholung</label>
      <select style={inputStyle} value={recurring} onChange={(e) => setRecurring(e.target.value)}>
        <option value="once">Einmalig</option>
        <option value="daily">Täglich</option>
        <option value="weekly">Wöchentlich</option>
      </select>
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Zuständig (optional)</label>
      <select style={inputStyle} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
        <option value="">Egal wer</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          if (!name.trim()) return setError("Bitte einen Namen eingeben.");
          onSave({ name: name.trim(), points, recurring, assignedTo });
        }}
      >
        Aufgabe speichern
      </button>
    </ModalShell>
  );
}

function AddRewardModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState(20);
  const [error, setError] = useState("");
  return (
    <ModalShell title="Neue Belohnung" onClose={onClose}>
      <input style={inputStyle} placeholder="z.B. Filmabend aussuchen" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Kosten in Punkten</label>
      <input style={inputStyle} type="number" min="1" step="1" value={cost} onChange={(e) => setCost(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          if (!name.trim()) return setError("Bitte einen Namen eingeben.");
          onSave({ name: name.trim(), cost });
        }}
      >
        Belohnung speichern
      </button>
    </ModalShell>
  );
}
