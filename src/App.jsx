import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, Plus, Trophy, History, Settings, X, Gift, Trash2, LogOut, Download, Share, Delete, ArrowLeft, Lock, Clock, LayoutGrid, List as ListIcon, Wallet } from "lucide-react";

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

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.toDateString() === db.toDateString();
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
    daysUntilDue: ratio <= 1 ? Math.max(0, Math.round(freq - days)) : 0,
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
  const [overallResetAt, setOverallResetAt] = useState(0);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("tasks");
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPinMember, setPendingPinMember] = useState(null);

  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddReward, setShowAddReward] = useState(false);
  const [pinTargetMember, setPinTargetMember] = useState(null);
  const [allowanceTargetMember, setAllowanceTargetMember] = useState(null);
  const [completeAtTask, setCompleteAtTask] = useState(null);
  const [historyTask, setHistoryTask] = useState(null);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"
  );

  const isFirstLoadRef = useRef(true);

  const loadData = useCallback(async () => {
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
    setOverallResetAt(data.overallResetAt || 0);

    if (isFirstLoadRef.current) {
      const savedUserId = localStorage.getItem(LOGIN_KEY);
      if (savedUserId && loadedMembers.some((m) => m.id === savedUserId)) {
        setCurrentUser(savedUserId);
      }
      setReady(true);
      isFirstLoadRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-fetch shared data whenever the app is opened or regains focus, so
  // everyone always sees the latest tasks/points without a manual reload.
  useEffect(() => {
    function onFocus() {
      loadData();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") loadData();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadData]);

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
      if (entry.timestamp >= overallResetAt) {
        overall[entry.memberId] = (overall[entry.memberId] || 0) + entry.points;
      }
      if (entry.timestamp >= statsResetAt) {
        current[entry.memberId] = (current[entry.memberId] || 0) + entry.points;
      }
    });
    return { current, overall };
  }, [members, log, statsResetAt, overallResetAt]);

  const allowanceProgress = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      if (!m.allowance?.enabled) return;
      const since = m.allowancePaidAt || 0;
      const earned = log
        .filter((e) => e.memberId === m.id && e.type === "complete" && e.timestamp >= since)
        .reduce((sum, e) => sum + e.points, 0);
      map[m.id] = Math.max(0, earned);
    });
    return map;
  }, [members, log]);

  function resetStats() {
    persist("statsResetAt", Date.now(), setStatsResetAt);
  }
  function masterReset() {
    const now = Date.now();
    persist("statsResetAt", now, setStatsResetAt);
    persist("overallResetAt", now, setOverallResetAt);
    persist("members", members.map((m) => ({ ...m, allowancePaidAt: now })), setMembers);
  }
  function setMemberRole(id, role) {
    persist("members", members.map((m) => (m.id === id ? { ...m, role } : m)), setMembers);
  }
  function payoutAllowance(member) {
    const now = Date.now();
    persist("members", members.map((m) => (m.id === member.id ? { ...m, allowancePaidAt: now } : m)), setMembers);
    const entry = {
      id: uid(),
      type: "payout",
      taskId: null,
      taskName: `Sackgeld ausgezahlt (CHF ${member.allowance.amount.toFixed(2).replace(/\.00$/, "")})`,
      memberId: member.id,
      memberName: member.name,
      points: 0,
      timestamp: now,
    };
    persist("log", [entry, ...log], setLog);
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
  function setMemberAllowance(id, allowance) {
    persist("members", members.map((m) => (m.id === id ? { ...m, allowance } : m)), setMembers);
    setAllowanceTargetMember(null);
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
    const ts = timestamp || Date.now();
    const alreadyDone = log.some((e) => e.taskId === task.id && e.type === "complete" && isSameDay(e.timestamp, ts));
    if (alreadyDone) {
      showToast(`"${task.name}" wurde für diesen Tag bereits als erledigt markiert.`);
      return;
    }
    const entry = {
      id: uid(),
      type: "complete",
      taskId: task.id,
      taskName: task.name,
      memberId: member.id,
      memberName: member.name,
      points: task.points,
      timestamp: ts,
    };
    persist("log", [entry, ...log], setLog);
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
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
      {toast && (
        <div
          style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0) + 10px)",
            left: "12px",
            right: "12px",
            zIndex: 50,
            background: "#2a2a26",
            color: "#fff",
            fontSize: "13px",
            padding: "10px 14px",
            borderRadius: "10px",
            boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
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
            onOpenHistory={(t) => setHistoryTask(t)}
          />
        )}
        {tab === "board" && (
          <BoardView
            members={members}
            pointsByMember={pointsByMember}
            allowanceProgress={allowanceProgress}
            rewards={rewards}
            isAdmin={isAdmin}
            currentUserId={currentUser}
            onRedeem={redeemReward}
            onAddReward={() => setShowAddReward(true)}
            onDeleteReward={deleteReward}
            onPayout={payoutAllowance}
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
            onMasterReset={masterReset}
            onSetAllowance={(m) => setAllowanceTargetMember(m)}
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
      {allowanceTargetMember && (
        <AllowanceModal
          member={allowanceTargetMember}
          onClose={() => setAllowanceTargetMember(null)}
          onSave={(allowance) => setMemberAllowance(allowanceTargetMember.id, allowance)}
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
      {historyTask && (
        <TaskHistoryModal task={historyTask} log={log} onClose={() => setHistoryTask(null)} />
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

const ZONE_CARD_COLORS = ["#3E5C76", "#4B6B43", "#8A6D3B", "#6B4E71", "#2F4538", "#8A4B3B", "#4B6B85", "#6B5E4B"];

function TasksView({ tasks, zones, log, memberById, isAdmin, currentUserId, onComplete, onCompleteAt, onDeleteTask, onAddTask, onAddZone, onOpenHistory }) {
  const [openZoneId, setOpenZoneId] = useState(null);
  const [viewMode, setViewMode] = useState("list");

  const visibleTasks = useMemo(() => {
    if (isAdmin) return tasks;
    return tasks.filter((t) => !t.assignedTo || t.assignedTo === currentUserId);
  }, [tasks, isAdmin, currentUserId]);

  const zoneNameById = useMemo(() => {
    const map = {};
    zones.forEach((z) => (map[z.id] = z.name));
    return map;
  }, [zones]);

  const zoneColorById = useMemo(() => {
    const map = {};
    zones.forEach((z, i) => (map[z.id] = ZONE_CARD_COLORS[i % ZONE_CARD_COLORS.length]));
    map.__none = ZONE_CARD_COLORS[zones.length % ZONE_CARD_COLORS.length];
    return map;
  }, [zones]);

  const flatSorted = useMemo(() => {
    return visibleTasks
      .map((t) => ({ task: t, dirt: getDirtiness(t, log) }))
      .sort((a, b) => b.dirt.ratio - a.dirt.ratio);
  }, [visibleTasks, log]);

  const grouped = useMemo(() => {
    const byZone = {};
    zones.forEach((z) => (byZone[z.id] = []));
    byZone.__none = [];
    visibleTasks.forEach((t) => {
      const key = t.zoneId && byZone[t.zoneId] ? t.zoneId : "__none";
      byZone[key].push(t);
    });

    function buildGroup(zone, taskList, colorIndex) {
      const items = taskList
        .map((t) => ({ task: t, dirt: getDirtiness(t, log) }))
        .sort((a, b) => b.dirt.ratio - a.dirt.ratio);
      const avgRatio = items.length === 0 ? 0 : items.reduce((sum, x) => sum + x.dirt.ratio, 0) / items.length;
      return { zone, items, avgRatio, cardColor: ZONE_CARD_COLORS[colorIndex % ZONE_CARD_COLORS.length] };
    }

    const groups = zones.map((z, i) => buildGroup(z, byZone[z.id], i));
    if (byZone.__none.length > 0) {
      groups.push(buildGroup({ id: "__none", name: "Sonstiges" }, byZone.__none, zones.length));
    }
    return groups.filter((g) => g.items.length > 0).sort((a, b) => b.avgRatio - a.avgRatio);
  }, [visibleTasks, zones, log]);

  const openGroup = grouped.find((g) => g.zone.id === openZoneId);

  if (openGroup) {
    return (
      <div
        style={{
          margin: "-14px",
          padding: "14px",
          minHeight: "calc(100% + 28px)",
          background: openGroup.cardColor,
        }}
      >
        <button
          onClick={() => setOpenZoneId(null)}
          style={{ border: "none", background: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", padding: 0, marginBottom: "14px" }}
        >
          <ArrowLeft size={15} /> Alle Bereiche
        </button>
        <div style={{ fontSize: "19px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>{openGroup.zone.name}</div>

        {isAdmin && (
          <button
            onClick={onAddTask}
            style={{
              width: "100%",
              border: "1px dashed rgba(255,255,255,0.4)",
              borderRadius: "12px",
              background: "transparent",
              padding: "9px",
              color: "#fff",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginBottom: "14px",
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Aufgabe in diesem Bereich
          </button>
        )}

        {openGroup.items.map(({ task: t, dirt }) => (
          <ZoneTaskRow
            key={t.id}
            task={t}
            dirt={dirt}
            assignee={t.assignedTo ? memberById(t.assignedTo) : null}
            isAdmin={isAdmin}
            onComplete={() => onComplete(t)}
            onCompleteAt={() => onCompleteAt(t)}
            onDelete={() => onDeleteTask(t.id)}
            onOpenHistory={() => onOpenHistory(t)}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        {isAdmin && (
          <>
            <button onClick={onAddTask} style={dashedBtnStyle}>
              <Plus size={16} /> Aufgabe
            </button>
            <button onClick={onAddZone} style={dashedBtnStyle}>
              <Plus size={16} /> Bereich
            </button>
          </>
        )}
        <div style={{ display: "flex", background: "#EDECE4", borderRadius: "10px", padding: "3px", flexShrink: 0 }}>
          <button
            onClick={() => setViewMode("grid")}
            title="Kacheln"
            style={{
              border: "none",
              borderRadius: "7px",
              padding: "6px 9px",
              cursor: "pointer",
              background: viewMode === "grid" ? "#fff" : "transparent",
              color: viewMode === "grid" ? "#2F4538" : "#a0a09a",
              display: "flex",
              boxShadow: viewMode === "grid" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            title="Liste"
            style={{
              border: "none",
              borderRadius: "7px",
              padding: "6px 9px",
              cursor: "pointer",
              background: viewMode === "list" ? "#fff" : "transparent",
              color: viewMode === "list" ? "#2F4538" : "#a0a09a",
              display: "flex",
              boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            <ListIcon size={15} />
          </button>
        </div>
      </div>

      {grouped.length === 0 && (
        <p style={{ color: "#8a897f", fontSize: "14px", textAlign: "center", marginTop: "2rem" }}>
          Noch keine Aufgaben.
        </p>
      )}

      {viewMode === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {grouped.map((g) => {
            const dotColor = g.avgRatio >= 1 ? OVERDUE_COLOR : g.avgRatio >= 0.5 ? WARN_COLOR : CLEAN_COLOR;
            const overdueCount = g.items.filter((x) => x.dirt.overdueDays > 0).length;
            return (
              <button
                key={g.zone.id}
                onClick={() => setOpenZoneId(g.zone.id)}
                style={{
                  position: "relative",
                  textAlign: "left",
                  border: "none",
                  borderRadius: "14px",
                  background: g.cardColor,
                  color: "#fff",
                  padding: "14px",
                  minHeight: "96px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: dotColor }} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 600, paddingRight: "26px" }}>{g.zone.name}</span>
                <span style={{ fontSize: "11.5px", opacity: 0.85 }}>
                  {overdueCount > 0 ? `${overdueCount} überfällig` : `${g.items.length} Aufgabe(n)`}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div>
          {flatSorted.map(({ task: t, dirt }) => (
            <ZoneTaskRow
              key={t.id}
              task={t}
              dirt={dirt}
              zoneName={t.zoneId ? zoneNameById[t.zoneId] : "Sonstiges"}
              color={t.zoneId ? zoneColorById[t.zoneId] : zoneColorById.__none}
              asCard
              assignee={t.assignedTo ? memberById(t.assignedTo) : null}
              isAdmin={isAdmin}
              onComplete={() => onComplete(t)}
              onCompleteAt={() => onCompleteAt(t)}
              onDelete={() => onDeleteTask(t.id)}
              onOpenHistory={() => onOpenHistory(t)}
            />
          ))}
        </div>
      )}
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

function PillBar({ ratio, color }) {
  const fillPercent = Math.max(4, Math.min(ratio, 1) * 100);
  return (
    <div
      style={{
        position: "relative",
        width: "78px",
        height: "22px",
        borderRadius: "11px",
        background: "rgba(255,255,255,0.28)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ position: "absolute", inset: 0, left: 0, width: `${fillPercent}%`, background: color, borderRadius: "11px" }} />
      {[25, 50, 75].map((p) => (
        <div key={p} style={{ position: "absolute", top: "3px", bottom: "3px", left: `${p}%`, width: "1px", background: "rgba(255,255,255,0.5)" }} />
      ))}
    </div>
  );
}

function ZoneTaskRow({ task, dirt, assignee, isAdmin, onComplete, onCompleteAt, onDelete, onOpenHistory, zoneName, color, asCard }) {
  return (
    <div
      style={
        asCard
          ? { background: color, borderRadius: "14px", padding: "12px", marginBottom: "10px" }
          : { padding: "12px 2px", borderBottom: "1px solid rgba(255,255,255,0.18)" }
      }
    >
      <div onClick={onOpenHistory} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", cursor: "pointer", marginBottom: "10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "14.5px", fontWeight: 600, color: "#fff" }}>{task.name}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: "1px" }}>
            {task.points} Pkt.{zoneName ? ` · ${zoneName}` : ""}{assignee ? ` · ${assignee.name}` : ""}
          </div>
          <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.85)", fontWeight: dirt.overdueDays > 0 ? 700 : 400 }}>
            {dirt.overdueDays > 0
              ? `${dirt.overdueDays} Tg. überfällig`
              : dirt.daysUntilDue === 0
              ? "Heute fällig"
              : `Fällig in ${dirt.daysUntilDue} Tg.`}
          </span>
        </div>
        <PillBar ratio={dirt.ratio} color={dirt.color} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          style={{
            flex: 1,
            border: "none",
            background: "rgba(255,255,255,0.95)",
            color: "#2a2a26",
            borderRadius: "12px",
            height: "46px",
            fontSize: "14.5px",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
          }}
        >
          <CheckCircle2 size={19} /> Erledigt
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCompleteAt(); }}
          title="Mit Datum erledigen"
          style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: "12px", width: "46px", height: "46px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Clock size={17} />
        </button>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ border: "none", background: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "4px", flexShrink: 0 }}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function BoardView({ members, pointsByMember, allowanceProgress, rewards, isAdmin, currentUserId, onRedeem, onAddReward, onDeleteReward, onPayout }) {
  const { current, overall } = pointsByMember;
  const ranked = [...members].sort((a, b) => (current[b.id] || 0) - (current[a.id] || 0));
  const allowanceMembers = members
    .filter((m) => m.allowance?.enabled)
    .filter((m) => isAdmin || m.id === currentUserId);
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

      {allowanceMembers.length > 0 && (
        <>
          <div style={{ fontSize: "12px", color: "#a0a09a", margin: "18px 0 6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "5px" }}>
            <Wallet size={13} /> Sackgeld
          </div>
          {allowanceMembers.map((m) => {
            const pts = allowanceProgress[m.id] || 0;
            const need = m.allowance.requiredPoints;
            const percent = Math.min(100, Math.round((pts / need) * 100));
          const reached = pts >= need;
          return (
            <div key={m.id} style={{ background: "#fff", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#2a2a26" }}>{m.name}</span>
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: reached ? CLEAN_COLOR : "#5a5a52" }}>
                  CHF {m.allowance.amount.toFixed(2).replace(/\.00$/, "")} / {m.allowance.frequency === "weekly" ? "Woche" : "Monat"}
                </span>
              </div>
              <DirtBar percent={percent} color={reached ? CLEAN_COLOR : "#E0A72E"} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px" }}>
                <span style={{ fontSize: "11.5px", color: "#a0a09a" }}>
                  {reached
                    ? `Ziel erreicht (${pts}/${need} Pkt.)`
                    : `${pts} von ${need} Punkten – noch ${need - pts} nötig`}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => onPayout(m)}
                    style={{ border: "1px solid #ddd", background: "none", color: "#5a5a52", borderRadius: "8px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", flexShrink: 0, marginLeft: "8px" }}
                  >
                    Ausgezahlt
                  </button>
                )}
              </div>
            </div>
          );
        })}
        </>
      )}

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
              {e.type === "complete" ? "hat erledigt:" : e.type === "payout" ? "" : "hat eingelöst:"} {e.taskName}
            </div>
            <div style={{ fontSize: "11.5px", color: "#a0a09a", marginTop: "1px" }}>
              {new Date(e.timestamp).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          {e.type !== "payout" && (
            <div style={{ fontSize: "13px", fontWeight: 600, color: e.points >= 0 ? "#4B6B43" : "#8A4B3B" }}>
              {e.points >= 0 ? "+" : ""}{e.points}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SettingsView({ members, zones, currentUserId, onAddMember, onDeleteMember, onSetPin, onSetRole, onAddZone, onDeleteZone, onResetStats, onMasterReset, onSetAllowance }) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingMasterReset, setConfirmingMasterReset] = useState(false);

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
          <button onClick={() => onSetAllowance(m)} style={{ border: "none", background: "none", color: m.allowance?.enabled ? "#2F4538" : "#c6c5bc", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }} title="Sackgeld einstellen">
            <Wallet size={14} />
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

      <div style={{ background: "#fff", borderRadius: "12px", padding: "12px", marginTop: "10px", border: "1px solid #f0d9d3" }}>
        <p style={{ fontSize: "12.5px", color: "#5a5a52", margin: "0 0 10px", lineHeight: 1.5 }}>
          <strong style={{ color: "#8A4B3B" }}>Master-Reset:</strong> setzt wirklich <em>alle</em> Statistiken zurück – aktuelle Rangliste, Gesamt-Punkte pro Person und den Sackgeld-Fortschritt aller Kinder. Der Verlauf (Wer hat wann was erledigt) und die Aufgaben-Fälligkeiten bleiben erhalten.
        </p>
        {!confirmingMasterReset ? (
          <button
            onClick={() => setConfirmingMasterReset(true)}
            style={{ border: "none", background: "#8A4B3B", color: "#fff", borderRadius: "10px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", width: "100%" }}
          >
            Master-Reset
          </button>
        ) : (
          <div>
            <p style={{ fontSize: "12.5px", color: "#8A4B3B", fontWeight: 600, margin: "0 0 8px" }}>
              Wirklich alles zurücksetzen? Das betrifft alle Personen und lässt sich nicht rückgängig machen.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { onMasterReset(); setConfirmingMasterReset(false); }}
                style={{ flex: 1, border: "none", background: "#8A4B3B", color: "#fff", borderRadius: "10px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Ja, alles zurücksetzen
              </button>
              <button
                onClick={() => setConfirmingMasterReset(false)}
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
  const [frequencyDays, setFrequencyDays] = useState("7");
  const [points, setPoints] = useState("5");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState("");

  function numChange(setter) {
    return (e) => {
      setter(e.target.value.replace(/[^0-9]/g, ""));
      setError("");
    };
  }

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
      <input style={inputStyle} type="text" inputMode="numeric" placeholder="7" value={frequencyDays} onChange={numChange(setFrequencyDays)} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Punkte</label>
      <input style={inputStyle} type="text" inputMode="numeric" placeholder="5" value={points} onChange={numChange(setPoints)} />
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
          const freq = Math.max(1, parseInt(frequencyDays, 10) || 1);
          const pts = Math.max(1, parseInt(points, 10) || 1);
          onSave({ name: name.trim(), zoneId, frequencyDays: freq, points: pts, assignedTo });
        }}
      >
        Aufgabe speichern
      </button>
    </ModalShell>
  );
}

function AddRewardModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("20");
  const [error, setError] = useState("");
  return (
    <ModalShell title="Neue Belohnung" onClose={onClose}>
      <input style={inputStyle} placeholder="z.B. Filmabend aussuchen" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Kosten in Punkten</label>
      <input
        style={inputStyle}
        type="text"
        inputMode="numeric"
        placeholder="20"
        value={cost}
        onChange={(e) => { setCost(e.target.value.replace(/[^0-9]/g, "")); setError(""); }}
      />
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          if (!name.trim()) return setError("Bitte einen Namen eingeben.");
          const c = Math.max(1, parseInt(cost, 10) || 1);
          onSave({ name: name.trim(), cost: c });
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

function TaskHistoryModal({ task, log, onClose }) {
  const freq = taskFrequencyDays(task);
  const freqMs = freq * DAY_MS;
  const entries = log
    .filter((e) => e.taskId === task.id && e.type === "complete")
    .sort((a, b) => a.timestamp - b.timestamp);

  const starts = [task.createdAt ?? (entries[0]?.timestamp ?? Date.now()), ...entries.map((e) => e.timestamp)];
  const teeth = entries.map((e, i) => ({
    start: starts[i],
    end: e.timestamp,
    memberName: e.memberName,
    done: true,
  }));
  const lastStart = entries.length ? entries[entries.length - 1].timestamp : (task.createdAt ?? Date.now());
  teeth.push({ start: lastStart, end: Date.now(), memberName: null, done: false });

  const fmt = (ts) => new Date(ts).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });

  return (
    <ModalShell title={`Verlauf: ${task.name}`} onClose={onClose}>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "6px", marginBottom: "12px" }}>
        {teeth.map((t, i) => {
          const ratio = freqMs > 0 ? (t.end - t.start) / freqMs : 0;
          const peak = Math.min(ratio, 1.5) / 1.5;
          const color = ratio >= 1 ? OVERDUE_COLOR : ratio >= 0.5 ? WARN_COLOR : CLEAN_COLOR;
          const h = Math.max(4, peak * 60);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: "42px" }}>
              <svg width="42" height="66" viewBox="0 0 42 66">
                <line x1="0" y1="60" x2="42" y2="60" stroke="#EDECE4" strokeWidth="1" />
                <polygon points={`0,60 34,${60 - h} 34,60`} fill={color} opacity={t.done ? 1 : 0.55} />
                {t.done && <circle cx="34" cy={60 - h} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />}
              </svg>
              <span style={{ fontSize: "9.5px", color: "#a0a09a", marginTop: "2px", whiteSpace: "nowrap" }}>
                {t.done ? fmt(t.end) : "jetzt"}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: "12px", color: "#a0a09a", marginBottom: "6px", fontWeight: 500 }}>
        Erledigt-Verlauf
      </div>
      {entries.length === 0 ? (
        <p style={{ fontSize: "13px", color: "#c6c5bc" }}>Noch nie erledigt.</p>
      ) : (
        <div style={{ maxHeight: "180px", overflowY: "auto" }}>
          {[...entries].reverse().map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0efe9", fontSize: "13px" }}>
              <span style={{ color: "#2a2a26" }}>{e.memberName}</span>
              <span style={{ color: "#a0a09a" }}>
                {new Date(e.timestamp).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
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

function AllowanceModal({ member, onClose, onSave }) {
  const existing = member.allowance || {};
  const [amount, setAmount] = useState(existing.amount ? String(existing.amount) : "10");
  const [frequency, setFrequency] = useState(existing.frequency || "weekly");
  const [requiredPoints, setRequiredPoints] = useState(existing.requiredPoints ? String(existing.requiredPoints) : "20");
  const [error, setError] = useState("");

  return (
    <ModalShell title={`Sackgeld für ${member.name}`} onClose={onClose}>
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Betrag in CHF</label>
      <input
        style={inputStyle}
        type="text"
        inputMode="decimal"
        placeholder="10"
        value={amount}
        onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.,]/g, "")); setError(""); }}
      />
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Häufigkeit</label>
      <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
        <option value="weekly">Wöchentlich</option>
        <option value="monthly">Monatlich</option>
      </select>
      <label style={{ fontSize: "12px", color: "#8a897f" }}>Dafür benötigte Punkte</label>
      <input
        style={inputStyle}
        type="text"
        inputMode="numeric"
        placeholder="20"
        value={requiredPoints}
        onChange={(e) => { setRequiredPoints(e.target.value.replace(/[^0-9]/g, "")); setError(""); }}
      />
      <p style={{ fontSize: "11.5px", color: "#c6c5bc", margin: "0 0 10px", lineHeight: 1.4 }}>
        Der Fortschritt zählt ab der letzten Auszahlung dieser Person (Button "Ausgezahlt" auf der Punkte-Seite) – unabhängig von der allgemeinen Statistik und den anderen Kindern.
      </p>
      {error && <div style={{ color: "#8A4B3B", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
      <button
        style={primaryBtn}
        onClick={() => {
          const amt = parseFloat(amount.replace(",", ".")) || 0;
          const pts = Math.max(1, parseInt(requiredPoints, 10) || 1);
          if (amt <= 0) return setError("Bitte einen Betrag grösser 0 eingeben.");
          onSave({ enabled: true, amount: amt, frequency, requiredPoints: pts });
        }}
      >
        Speichern
      </button>
      {member.allowance?.enabled && (
        <button
          style={{ ...primaryBtn, background: "none", color: "#8A4B3B", marginTop: "8px", border: "1px solid #f0d9d3" }}
          onClick={() => onSave({ enabled: false, amount: existing.amount, frequency, requiredPoints: existing.requiredPoints })}
        >
          Sackgeld deaktivieren
        </button>
      )}
    </ModalShell>
  );
}