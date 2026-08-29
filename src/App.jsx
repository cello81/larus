import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCircle2, Circle, Plus, Trophy, History, Settings, X, Gift, Trash2, Repeat, User } from "lucide-react";

const MEMBER_COLORS = [
  { bg: "#2F4538", text: "#FFFFFF" },
  { bg: "#8A4B3B", text: "#FFFFFF" },
  { bg: "#3E5C76", text: "#FFFFFF" },
  { bg: "#6B4E71", text: "#FFFFFF" },
  { bg: "#4B6B43", text: "#FFFFFF" },
  { bg: "#8A6D3B", text: "#FFFFFF" },
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
  const [pendingComplete, setPendingComplete] = useState(null);
  const [pendingRedeem, setPendingRedeem] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await loadAllShared();
      setMembers(data.members || []);
      setTasks(data.tasks || []);
      setRewards(data.rewards || []);
      setLog(data.log || []);
      setReady(true);
    })();
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
    const next = [...members, { id: uid(), name, color }];
    persist("members", next, setMembers);
    setShowAddMember(false);
    if (!currentUser) setCurrentUser(next[next.length - 1].id);
  }
  function deleteMember(id) {
    persist("members", members.filter((m) => m.id !== id), setMembers);
    if (currentUser === id) setCurrentUser(null);
  }
  function addReward({ name, cost }) {
    const next = [...rewards, { id: uid(), name, cost }];
    persist("rewards", next, setRewards);
    setShowAddReward(false);
  }
  function deleteReward(id) {
    persist("rewards", rewards.filter((r) => r.id !== id), setRewards);
  }

  function confirmComplete(memberId) {
    const task = pendingComplete;
    const member = members.find((m) => m.id === memberId);
    const entry = {
      id: uid(),
      type: "complete",
      taskId: task.id,
      taskName: task.name,
      memberId,
      memberName: member.name,
      points: task.points,
      timestamp: Date.now(),
    };
    persist("log", [entry, ...log], setLog);
    setPendingComplete(null);
  }

  function confirmRedeem(memberId) {
    const reward = pendingRedeem;
    const member = members.find((m) => m.id === memberId);
    const entry = {
      id: uid(),
      type: "redeem",
      taskId: null,
      taskName: reward.name,
      memberId,
      memberName: member.name,
      points: -reward.cost,
      timestamp: Date.now(),
    };
    persist("log", [entry, ...log], setLog);
    setPendingRedeem(null);
  }

  const memberById = (id) => members.find((m) => m.id === id);

  if (!ready) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#666", fontFamily: "system-ui, sans-serif" }}>
        Larus wird geladen…
      </div>
    );
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
      }}
    >
      {/* Header */}
      <div style={{ background: "#2F4538", color: "#fff", padding: "1.1rem 1.25rem 1rem" }}>
        <div style={{ fontSize: "12px", opacity: 0.75, letterSpacing: "0.02em", marginBottom: "2px" }}>
          Larus
        </div>
        <div style={{ fontSize: "20px", fontWeight: 600 }}>
          {tab === "tasks" && "Aufgaben"}
          {tab === "board" && "Punktestand & Belohnungen"}
          {tab === "history" && "Verlauf"}
          {tab === "settings" && "Verwalten"}
        </div>
      </div>

      {/* Who am I */}
      {members.length > 0 && (
        <div style={{ display: "flex", gap: "6px", padding: "10px 12px", overflowX: "auto", borderBottom: "1px solid #e5e4dd" }}>
          <span style={{ fontSize: "12px", color: "#8a897f", alignSelf: "center", marginRight: "2px", whiteSpace: "nowrap" }}>
            Ich bin:
          </span>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setCurrentUser(m.id)}
              style={{
                border: currentUser === m.id ? `2px solid ${m.color.bg}` : "1px solid #ddd",
                background: currentUser === m.id ? m.color.bg : "#fff",
                color: currentUser === m.id ? m.color.text : "#444",
                borderRadius: "999px",
                padding: "4px 12px",
                fontSize: "13px",
                whiteSpace: "nowrap",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, padding: "14px", overflowY: "auto", minHeight: "360px" }}>
        {tab === "tasks" && (
          <TasksView
            openTasks={openTasks}
            doneTasks={doneTasks}
            memberById={memberById}
            onComplete={(t) => setPendingComplete(t)}
            onDelete={deleteTask}
            onAdd={() => setShowAddTask(true)}
          />
        )}
        {tab === "board" && (
          <BoardView
            members={members}
            pointsByMember={pointsByMember}
            rewards={rewards}
            onRedeem={(r) => setPendingRedeem(r)}
            onAddReward={() => setShowAddReward(true)}
            onDeleteReward={deleteReward}
          />
        )}
        {tab === "history" && <HistoryView log={log} />}
        {tab === "settings" && (
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
        <NavButton icon={<Settings size={20} />} label="Verwalten" active={tab === "settings"} onClick={() => setTab("settings")} />
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
      {pendingComplete && (
        <PickMemberModal
          title={`Wer hat "${pendingComplete.name}" erledigt?`}
          members={members}
          defaultId={currentUser}
          onClose={() => setPendingComplete(null)}
          onPick={confirmComplete}
        />
      )}
      {pendingRedeem && (
        <PickMemberModal
          title={`Wer löst "${pendingRedeem.name}" ein?`}
          members={members}
          defaultId={currentUser}
          onClose={() => setPendingRedeem(null)}
          onPick={confirmRedeem}
        />
      )}
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

function TasksView({ openTasks, doneTasks, memberById, onComplete, onDelete, onAdd }) {
  return (
    <div>
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

      {openTasks.length === 0 && doneTasks.length === 0 && (
        <p style={{ color: "#8a897f", fontSize: "14px", textAlign: "center", marginTop: "2rem" }}>
          Noch keine Aufgaben. Leg los!
        </p>
      )}

      {openTasks.map((t) => (
        <TaskRow key={t.id} task={t} memberById={memberById} done={false} onComplete={() => onComplete(t)} onDelete={() => onDelete(t.id)} />
      ))}

      {doneTasks.length > 0 && (
        <>
          <div style={{ fontSize: "12px", color: "#a0a09a", margin: "16px 0 6px", fontWeight: 500 }}>
            Erledigt
          </div>
          {doneTasks.map((t) => (
            <TaskRow key={t.id} task={t} memberById={memberById} done={true} onDelete={() => onDelete(t.id)} />
          ))}
        </>
      )}
    </div>
  );
}

function TaskRow({ task, memberById, done, onComplete, onDelete }) {
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
      <button onClick={onDelete} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer", padding: "4px" }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function BoardView({ members, pointsByMember, rewards, onRedeem, onAddReward, onDeleteReward }) {
  const ranked = [...members].sort((a, b) => (pointsByMember[b.id] || 0) - (pointsByMember[a.id] || 0));
  return (
    <div>
      {members.length === 0 && (
        <p style={{ color: "#8a897f", fontSize: "14px", textAlign: "center", marginTop: "1rem" }}>
          Füge zuerst Familienmitglieder hinzu (unter Verwalten).
        </p>
      )}
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
          <button onClick={() => onDeleteReward(r.id)} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer" }}>
            <Trash2 size={14} />
          </button>
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
          <div style={{ flex: 1, fontSize: "14px", color: "#2a2a26" }}>{m.name}</div>
          <button onClick={() => onDeleteMember(m.id)} style={{ border: "none", background: "none", color: "#c6c5bc", cursor: "pointer" }}>
            <Trash2 size={15} />
          </button>
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

function PickMemberModal({ title, members, defaultId, onClose, onPick }) {
  if (members.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose}>
        <p style={{ fontSize: "13px", color: "#8a897f" }}>Füge zuerst eine Person unter Verwalten hinzu.</p>
      </ModalShell>
    );
  }
  return (
    <ModalShell title={title} onClose={onClose}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            style={{
              border: m.id === defaultId ? `2px solid ${m.color.bg}` : "1px solid #ddd",
              background: "#fff",
              borderRadius: "10px",
              padding: "10px 14px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#2a2a26",
              cursor: "pointer",
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
