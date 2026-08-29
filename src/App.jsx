import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCircle2, Plus, Trophy, History, Settings, X, Gift, Trash2, LogOut, Download, Share, Delete, ArrowLeft, Lock, Clock } from "lucide-react";

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
  { name: "Marcel", role: "admin" },
  { name: "Lya", role: "member" },
  { name: "Jana", role: "member" },
  { name: "Nela", role: "member" },
];

const DEFAULT_ZONES = ["Küche", "Bad", "Wohnzimmer", "Schlafzimmer"];

const CLEAN_COLOR = "#4B6B43";
const WARN_COLOR = "#E0A72E";
const OVERDUE_COLOR = "#8A4B3B";

const uid = () => Math.random().toString(36).slice(2, 10);
const DAY_MS = 86400000;

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

function taskFrequencyDays(task) {
  if (task.frequencyDays) return task.frequencyDays;
  if (task.recurring === "daily") return 1;
  if (task.recurring === "weekly") return 7;
  return 30;
}

function lastCompletedAt(taskId, log) {
  const entries = log.filter((e) => e.taskId === taskId && e.type === "complete");
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)).timestamp;
}

function getDirtiness(task, log) {
  const freq = taskFrequencyDays(task);
  const last = lastCompletedAt(task.id, log);
  const baseline = last ?? task.createdAt ?? Date.now() - freq * DAY_MS;
  const days = (Date.now() - baseline) / DAY_MS;
  const ratio = freq > 0 ? days / freq : 0;
  let color = CLEAN_COLOR;
  if (ratio >= 1) color = OVERDUE_COLOR;
  else if (ratio >= 0.5) color = WARN_COLOR;
  return {
    ratio,
    percent: Math.max(0, Math.min(ratio * 100, 100)),
    days: Math.floor(days),
    everCompleted: last !== null,
    color,
    overdueDays: ratio > 1 ? Math.round(days - freq) : 0,
  };
}

export default function HouseholdApp() {
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState([]);
  const [zones, setZones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [log, setLog] = useState([]);
  const [statsResetAt, setStatsResetAt] = useState(0);
  const [tab, setTab] = useState("tasks");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPinMember, setPendingPinMember] = useState(null);

  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddReward, setShowAddReward] = useState(false);
  const [pinTargetMember, setPinTargetMember] = useState(null);
  const [completeAtTask, setCompleteAtTask] = useState(null);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"
  );

  useEffect(() => {
    (async () => {
      const data = await loadAllShared();
      let loadedMembers = data.members || [];
      let loadedZones = data.zones || [];

      if (loadedMembers.length === 0) {
        loadedMembers = DEFAULT_MEMBERS.map((m, i) => ({
          id: uid(),
          name: m.name,
          role: m.role,
          color: MEMBER_COLORS[i % MEMBER_COLORS.length],
          pin: null,
        }));
        saveShared("members", loadedMembers);
      }
      if (loadedZones.length === 0) {
        loadedZones = DEFAULT_ZONES.map((name) => ({ id: uid(), name }));
        saveShared("zones", loadedZones);
      }

      setMembers(loadedMembers);
      setZones(loadedZones);
      setTasks(data.tasks || []);
      setRewards(data.rewards || []);
      setLog(data.log || []);
      setStatsResetAt(data.statsResetAt || 0);

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
    const current = {};
    const overall = {};
    members.forEach((m) => {
      current[m.id] = 0;
      overall[m.id] = 0;
    });
    log.forEach((entry) => {
      overall[entry.memberId] = (overall[entry.memberId] || 0) + entry.points;
      if (entry.timestamp >= statsResetAt) {
        current[entry.memberId] = (current[entry.memberId] || 0) + entry.points;
      }
    });
    return { current, overall };
  }, [members, log, statsResetAt]);

  function resetStats() {
    persist("statsResetAt", Date.now(), setStatsResetAt);
  }
  function setMemberRole(id, role) {
    persist("members", members.map((m) => (m.id === id ? { ...m, role } : m)), setMembers);
  }

  function addTask({ name, zoneId, frequencyDays, points, assignedTo }) {
    const next = [
      ...tasks,
      { id: uid(), name, zoneId: zoneId || null, frequencyDays, points, assignedTo: assignedTo || null, createdAt: Date.now() },
    ];
    persist("tasks", next, setTasks);
    setShowAddTask(false);
  }
  function deleteTask(id) {
    persist("tasks", tasks.filter((t) => t.id !== id), setTasks);
  }
  function addZone(name) {
    const next = [...zones, { id: uid(), name }];
    persist("zones", next, setZones);
    setShowAddZone(false);
  }
  function deleteZone(id) {
    persist("zones", zones.filter((z) => z.id !== id), setZones);
    persist("tasks", tasks.map((t) => (t.zoneId === id ? { ...t, zoneId: null } : t)), setTasks);
  }
  function addMember(name) {
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    const next = [...members, { id: uid(), name, role: "member", color, pin: null }];
    persist("members", next, setMembers);
    setShowAddMember(false);
  }
  function deleteMember(id) {
    persist("members", members.filter((m) => m.id !== id), setMembers);
  }
  function setMemberPin(id, pin) {
    persist("members", members.map((m) => (m.id === id ? { ...m, pin: pin || null } : m)), setMembers);
    setPinTargetMember(null);
  }
  function addReward({ name, cost }) {
    const next = [...rewards, { id: uid(), name, cost }];
    persist("rewards", next, setRewards);
    setShowAddReward(false);
  }
  function deleteReward(id) {
    persist("rewards", rewards.filter((r) => r.id !== id), setRewards);
  }

  function completeTask(task, timestamp) {
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
      timestamp: timestamp || Date.now(),
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

  function selectLoginMember(member) {
    if (member.pin) {
      setPendingPinMember(member.id);
    } else {
      login(member.id);
    }
  }
  function login(memberId) {
    localStorage.setItem(LOGIN_KEY, memberId);
    setCurrentUser(memberId);
    setPendingPinMember(null);
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

  if (pendingPinMember) {
    const member = memberById(pendingPinMember);
    return (
      <PinScreen
        member={member}
        onSuccess={() => login(member.id)}
        onBack={() => setPendingPinMember(null)}
      />
    );
  }

  if (!currentUser) {
    return <LoginScreen members={members} onSelect={selectLoginMember} />;
  }

  return (
    <div className="app-shell">
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
      <div style={{ flex: 1, padding: "14px", overflowY: "auto", minHeight: 0 }}>
        {tab === "tasks" && (
          <TasksView
            tasks={tasks}
            zones={zones}
            log={log}
            memberById={memberById}
            isAdmin={isAdmin}
            currentUserId={currentUser}
            onComplete={completeTask}
            onCompleteAt={(t) => setCompleteAtTask(t)}
            onDeleteTask={deleteTask}
            onAddTask={() => setShowAddTask(true)}
            onAddZone={() => setShowAddZone(true)}
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
            zones={zones}
            currentUserId={currentUser}
            onAddMember={() => setShowAddMember(true)}
            onDeleteMember={deleteMember}
            onSetPin={(m) => setPinTargetMember(m)}
            onSetRole={setMemberRole}
            onAddZone={() => setShowAddZone(true)}
            onDeleteZone={deleteZone}
            onResetStats={resetStats}
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
        <AddTaskModal zones={zones} members={members} onClose={() => setShowAddTask(false)} onSave={addTask} />
      )}
      {showAddZone && (
        <SimpleInputModal title="Bereich hinzufügen" placeholder="z.B. Küche" onClose={() => setShowAddZone(false)} onSave={addZone} />
      )}
      {showAddMember && (
        <SimpleInputModal title="Person hinzufügen" placeholder="Name" onClose={() => setShowAddMember(false)} onSave={addMember} />
      )}
      {showAddReward && (
        <AddRewardModal onClose={() => setShowAddReward(false)} onSave={addReward} />
      )}
      {pinTargetMember && (
        <PinSetModal
          member={pinTargetMember}
          onClose={() => setPinTargetMember(null)}
          onSave={(pin) => setMemberPin(pinTargetMember.id, pin)}
        />
      )}
      {completeAtTask && (
        <CompleteAtModal
          task={completeAtTask}
          onClose={() => setCompleteAtTask(null)}
          onSave={(timestamp) => {
            completeTask(completeAtTask, timestamp);
            setCompleteAtTask(null);
          }}
        />
      )}
    </div>
  );
}

function LoginScreen({ members, onSelect }) {
  return (
    <div className="login-shell">
      <div style={{ color: "#fff", fontSize: "24px", fontWeight: 600, marginBottom: "6px" }}>Larus</div>
      <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "14px", marginBottom: "28px", textAlign: "center" }}>
        Wer bist du?
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "280px" }}>
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
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
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: m.color.bg, border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600, flexShrink: 0 }}>
              {m.name.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
            {m.pin && <Lock size={13} color="rgba(255,255,255,0.5)" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function PinScreen({ member, onSuccess, onBack }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  function press(d) {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError(false);
    if (next.length === 4) {
      if (next === member.pin) {
        setTimeout(() => onSuccess(), 120);
      } else {
        setError(true);
        setTimeout(() => setDigits(""), 400);
      }
    }
  }
  function backspace() {
    setDigits((d) => d.slice(0, -1));
    setError(false);
  }

  return (
    <div className="login-shell">
      <button
        onClick={onBack}
        style={{ position: "absolute", top: "calc(1rem + env(safe-area-inset-top, 0))", left: "1rem", border: "none", background: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}
      >
        <ArrowLeft size={16} /> Zurück
      </button>

      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: member.color.bg, border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600, marginBottom: "10px" }}>
        {member.name.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ color: "#fff", fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>{member.name}</div>
      <div style={{ color: error ? "#F0999" : "rgba(255,255,255,0.6)", fontSize: "13px", marginBottom: "22px" }}>
        {error ? "Falscher Code" : "Code eingeben"}
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "28px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: i < digits.length ? (error ? "#E0A72E" : "#fff") : "transparent",
              border: "1.5px solid rgba(255,255,255,0.6)",
            }}
          />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gap: "14px" }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} style={pinKeyStyle}>
            {d}
          </button>
        ))}
        <div />
        <button onClick={() => press("0")} style={pinKeyStyle}>0</button>
        <button onClick={backspace} style={{ ...pinKeyStyle, fontSize: "16px" }}>
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}

const pinKeyStyle = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: "20px",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

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

function DirtBar({ percent, color }) {
  return (
    <div style={{ height: "5px", borderRadius: "3px", background: "#EDECE4", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${percent}%`, background: color, borderRadius: "3px", transition: "width 0.3s" }} />
    </div>
  );
}

function TasksView({ tasks, zones, log, memberById, isAdmin, currentUserId, onComplete, onCompleteAt, onDeleteTask, onAddTask, onAddZone }) {
  const visibleTasks = useMemo(() => {
    if (isAdmin) return tasks;
    return tasks.filter((t) => !t.assignedTo || t.assignedTo === currentUserId);
  }, [tasks, isAdmin, currentUserId]);

  const grouped = useMemo(() => {
    const byZone = {};
    zones.forEach((z) => (byZone[z.id] = []));
    byZone.__none = [];
    visibleTasks.forEach((t) => {
      const key = t.zoneId && byZone[t.zoneId] ? t.zoneId : "__none";
      byZone[key].push(t);
    });

    function buildGroup(zone, taskList) {
      const items = taskList
        .map((t) => ({ task: t, dirt: getDirtiness(t, log) }))
        .sort((a, b) => b.dirt.ratio - a.dirt.ratio);
      const avgRatio = items.length === 0 ? 0 : items.reduce((sum, x) => sum + x.dirt.ratio, 0) / items.length;
      return { zone, items, avgRatio };
    }

    const groups = zones.map((z) => buildGroup(z, byZone[z.id]));
    if (byZone.__none.length > 0) {
      groups.push(buildGroup({ id: "__none", name: "Sonstiges" }, byZone.__none));
    }
    return groups.filter((g) => g.items.length > 0).sort((a, b) => b.avgRatio - a.avgRatio);
  }, [visibleTasks, zones, log]);

  return (
    <div>
      {isAdmin && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
          <button onClick={onAddTask} style={dashedBtnStyle}>
            <Plus size={16} /> Aufgabe
          </button>
          <button onClick={onAddZone} style={dashedBtnStyle}>
            <Plus size={16} /> Bereich
          </button>
        </div>
      )}

      {grouped.length === 0 && (
        <p style={{ color: "#8a897f", fontSize: "14px", textAlign: "center", marginTop: "2rem" }}>
          Noch keine Aufgaben.
        </p>
      )}

      {grouped.map((g) => {
        const zoneColor = g.avgRatio >= 1 ? OVERDUE_COLOR : g.avgRatio >= 0.5 ? WARN_COLOR : CLEAN_COLOR;
        return (
          <div key={g.zone.id} style={{ marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#2a2a26" }}>{g.zone.name}</span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: zoneColor }}>
                {Math.round(Math.min(g.avgRatio, 1.5) * 100)}%
              </span>
            </div>
            <div style={{ marginBottom: "8px" }}>
              <DirtBar percent={Math.min(g.avgRatio, 1) * 100} color={zoneColor} />
            </div>
            {g.items.map(({ task: t, dirt }) => (
              <TaskRow
                key={t.id}
                task={t}
                dirt={dirt}
                assignee={t.assignedTo ? memberById(t.assignedTo) : null}
                isAdmin={isAdmin}
                onComplete={() => onComplete(t)}
                onCompleteAt={() => onCompleteAt(t)}
                onDelete={() => onDeleteTask(t.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

const dashedBtnStyle = {
  flex: 1,
  border: "1px dashed #c6c5bc",
  borderRadius: "12px",
  background: "transparent",
  padding: "10px",
  color: "#5a5a52",
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  cursor: "pointer",
};

function TaskRow({ task, dirt, assignee, isAdmin, onComplete, onCompleteAt, onDelete }) {
  return (
    <div style={{ background: "#fff", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: dirt.color,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#2a2a26" }}>{task.name}</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: dirt.color }}>
              {Math.round(Math.min(dirt.ratio, 1.5) * 100)}%
            </span>
          </div>
          <div style={{ fontSize: "11.5px", color: "#a0a09a", marginTop: "1px" }}>
            {!dirt.everCompleted
              ? "Noch nie erledigt"
              : dirt.overdueDays > 0
              ? `${dirt.overdueDays} Tag(e) überfällig`
              : `vor ${dirt.days} Tag(en) erledigt`}
            {" · "}{task.points} Pkt.
            {assignee ? ` · ${assignee.name}` : ""}
          </div>
        </div>
        <button onClick={onCompleteAt} title="Mit Datum erledigen" style={{ border: "none", background: "none", color: "#a0a09a", cursor: "pointer", padding: "4px" }}>
          <Clock size={16} />
        </button>
        <button onClick={onComplete} style={{ border: "none", background: "#2F4538", color: "#fff", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          Erledigt
        </button>
        {isAdmin && (
          <button onClick={onDelete} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer", padding: "2px" }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <DirtBar percent={Math.min(dirt.ratio, 1) * 100} color={dirt.color} />
    </div>
  );
}

function BoardView({ members, pointsByMember, rewards, isAdmin, onRedeem, onAddReward, onDeleteReward }) {
  const { current, overall } = pointsByMember;
  const ranked = [...members].sort((a, b) => (current[b.id] || 0) - (current[a.id] || 0));
  return (
    <div>
      {ranked.map((m, i) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px" }}>
          <div style={{ fontSize: "13px", color: "#a0a09a", width: "16px", fontWeight: 600 }}>{i + 1}</div>
          <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: m.color.bg, color: m.color.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600 }}>
            {m.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#2a2a26" }}>{m.name}</div>
            <div style={{ fontSize: "11px", color: "#a0a09a" }}>Gesamt: {overall[m.id] || 0} Pkt.</div>
          </div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#E0A72E" }}>{current[m.id] || 0} Pkt.</div>
        </div>
      ))}

      <div style={{ fontSize: "12px", color: "#a0a09a", margin: "18px 0 6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "5px" }}>
        <Gift size={13} /> Belohnungen
      </div>
      {isAdmin && (
        <button onClick={onAddReward} style={{ ...dashedBtnStyle, width: "100%", marginBottom: "10px" }}>
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

function SettingsView({ members, zones, currentUserId, onAddMember, onDeleteMember, onSetPin, onSetRole, onAddZone, onDeleteZone, onResetStats }) {
  const [confirmingReset, setConfirmingReset] = useState(false);

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
          {m.id !== currentUserId && (
            <button
              onClick={() => onSetRole(m.id, m.role === "admin" ? "member" : "admin")}
              style={{ border: "1px solid #ddd", background: "none", color: "#5a5a52", cursor: "pointer", borderRadius: "8px", padding: "4px 8px", fontSize: "11px" }}
            >
              {m.role === "admin" ? "Admin entfernen" : "Zum Admin machen"}
            </button>
          )}
          <button onClick={() => onSetPin(m)} style={{ border: "none", background: "none", color: m.pin ? "#2F4538" : "#c6c5bc", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }} title="Code setzen">
            <Lock size={14} />
          </button>
          {m.role !== "admin" && (
            <button onClick={() => onDeleteMember(m.id)} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer" }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAddMember} style={{ ...dashedBtnStyle, width: "100%", marginTop: "4px" }}>
        <Plus size={16} /> Person hinzufügen
      </button>

      <div style={{ fontSize: "12px", color: "#a0a09a", margin: "20px 0 6px", fontWeight: 500 }}>
        Bereiche
      </div>
      {zones.map((z) => (
        <div key={z.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "9px 12px", marginBottom: "7px" }}>
          <div style={{ flex: 1, fontSize: "14px", color: "#2a2a26" }}>{z.name}</div>
          <button onClick={() => onDeleteZone(z.id)} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer" }}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button onClick={onAddZone} style={{ ...dashedBtnStyle, width: "100%", marginTop: "4px" }}>
        <Plus size={16} /> Bereich hinzufügen
      </button>

      <div style={{ fontSize: "12px", color: "#a0a09a", margin: "20px 0 6px", fontWeight: 500 }}>
        Statistik
      </div>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "12px" }}>
        <p style={{ fontSize: "12.5px", color: "#5a5a52", margin: "0 0 10px", lineHeight: 1.5 }}>
          Setzt die aktuelle Punkte-Rangliste für alle auf 0 zurück (z.B. für eine neue Runde). Der Verlauf und die Gesamt-Statistik pro Person bleiben erhalten.
        </p>
        {!confirmingReset ? (
          <button
            onClick={() => setConfirmingReset(true)}
            style={{ border: "1px solid #f0d9d3", background: "none", color: "#8A4B3B", borderRadius: "10px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", width: "100%" }}
          >
            Statistik zurücksetzen
          </button>
        ) : (
          <div>
            <p style={{ fontSize: "12.5px", color: "#8A4B3B", fontWeight: 600, margin: "0 0 8px" }}>
              Sicher? Die aktuelle Rangliste wird auf 0 gesetzt.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { onResetStats(); setConfirmingReset(false); }}
                style={{ flex: 1, border: "none", background: "#8A4B3B", color: "#fff", borderRadius: "10px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Ja, zurücksetzen
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                style={{ flex: 1, border: "1px solid #ddd", background: "none", color: "#5a5a52", borderRadius: "10px", padding: "9px", fontSize: "13px", cursor: "pointer" }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: "12px", color: "#c6c5bc", marginTop: "18px", lineHeight: 1.5 }}>
        Alle Daten werden geteilt gespeichert. Nur Admins können Aufgaben, Bereiche und Belohnungen verwalten.
        Das Schloss-Symbol setzt einen optionalen 4-stelligen Code fürs Anmelden auf diesem Gerät – kein Ersatz für ein echtes Passwort, nur ein einfacher Schutz innerhalb der Familie.
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

function AddTaskModal({ zones, members, onClose, onSave }) {
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState(zones[0]?.id || "");
  const [frequencyDays, setFrequencyDays] = useState(7);
  const [points, setPoints] = useState(5);
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState("");
  return (
    <ModalShell title="Neue Aufgabe" onClose={onClose}>
      <input style={inputStyle} placeholder="z.B. Boden wischen" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Bereich</label>
      <select style={inputStyle} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
        <option value="">Kein Bereich</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>{z.name}</option>
        ))}
      </select>
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Alle wie viele Tage fällig?</label>
      <input style={inputStyle} type="number" min="1" step="1" value={frequencyDays} onChange={(e) => setFrequencyDays(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Punkte</label>
      <input style={inputStyle} type="number" min="1" step="1" value={points} onChange={(e) => setPoints(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
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
          onSave({ name: name.trim(), zoneId, frequencyDays, points, assignedTo });
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

function CompleteAtModal({ task, onClose, onSave }) {
  function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const [value, setValue] = useState(() => toLocalInputValue(new Date()));
  const [error, setError] = useState("");

  return (
    <ModalShell title={`"${task.name}" erledigt am…`} onClose={onClose}>
      <input
        style={inputStyle}
        type="datetime-local"
        max={toLocalInputValue(new Date())}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(""); }}
      />
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          const ts = new Date(value).getTime();
          if (!value || Number.isNaN(ts)) return setError("Bitte ein gültiges Datum wählen.");
          if (ts > Date.now()) return setError("Das Datum darf nicht in der Zukunft liegen.");
          onSave(ts);
        }}
      >
        Speichern
      </button>
    </ModalShell>
  );
}

function PinSetModal({ member, onClose, onSave }) {
  const [value, setValue] = useState(member.pin || "");
  const [error, setError] = useState("");
  return (
    <ModalShell title={`Code für ${member.name}`} onClose={onClose}>
      <input
        style={inputStyle}
        type="tel"
        inputMode="numeric"
        maxLength={4}
        placeholder="4-stelliger Code"
        value={value}
        onChange={(e) => { setValue(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
      />
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          if (value.length !== 4) return setError("Bitte genau 4 Ziffern eingeben.");
          onSave(value);
        }}
      >
        Speichern
      </button>
      {member.pin && (
        <button
          style={{ ...primaryBtn, background: "none", color: "#8A4B3B", marginTop: "8px", border: "1px solid #f0d9d3" }}
          onClick={() => onSave(null)}
        >
          Code entfernen
        </button>
      )}
    </ModalShell>
  );
}
