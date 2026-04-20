import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const Q = [
  { id: "urgent-important", key: "a", label: "급하고 중요한 일", color: "#a5a1bb", bg: "#a5a1bb", textOn: "#4a4660", light: "rgba(165,161,187,0.12)", mid: "rgba(165,161,187,0.35)" },
  { id: "urgent-routine", key: "b", label: "급하고 루틴한 일", color: "#7a8c5e", bg: "#e7f0d8", textOn: "#4e5c3a", light: "rgba(231,240,216,0.45)", mid: "rgba(122,140,94,0.30)" },
  { id: "noturgent-important", key: "c", label: "안 급하지만 중요한 일", color: "#8aaa96", bg: "#deede4", textOn: "#4a6355", light: "rgba(222,237,228,0.45)", mid: "rgba(138,170,150,0.30)" },
  { id: "noturgent-routine", key: "d", label: "안 급한 루틴한 일", color: "#94a5a3", bg: "#c8d1d0", textOn: "#556362", light: "rgba(200,209,208,0.35)", mid: "rgba(148,165,163,0.30)" },
];
const T = [
  { id: "leader", label: "리더그룹", aliases: ["리더","리더그룹","leader"], color: "#8b7fb5" },
  { id: "product", label: "프로덕트", aliases: ["프로덕트","제품","product","프로덕"], color: "#6a9b83" },
  { id: "business", label: "비즈니스", aliases: ["비즈니스","비즈","business","biz"], color: "#7a8c5e" },
  { id: "story", label: "스토리", aliases: ["스토리","story","sns","콘텐츠"], color: "#c4956a" },
  { id: "offline", label: "오프라인", aliases: ["오프라인","offline","매장"], color: "#b07878" },
  { id: "personal", label: "개인", aliases: ["개인","personal","나"], color: "#94a5a3" },
];
const SLOTS = [
  { id: "am", label: "오전" },
  { id: "pm", label: "오후" },
  { id: "allday", label: "오전~오후" },
];
const uid = () => Math.random().toString(36).substr(2, 9);
const DK = ["일","월","화","수","목","금","토"];
const DKM = ["월","화","수","목","금","토","일"]; // Monday start
const fmt = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
const fmtS = (d) => { const dt = new Date(d); return `${dt.getMonth()+1}.${dt.getDate()}`; };
const fmtF = (d) => { const dt = new Date(d); return `${dt.getMonth()+1}월 ${dt.getDate()}일 ${DK[dt.getDay()]}요일`; };
const addD = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return fmt(dt); };
const diffD = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const TODAY = fmt(new Date());
// Monday-based week
const weekStart = (d) => { const dt = new Date(d); const dy = dt.getDay(); dt.setDate(dt.getDate() - (dy === 0 ? 6 : dy - 1)); return fmt(dt); };
const monthStart = (d) => { const dt = new Date(d); return fmt(new Date(dt.getFullYear(), dt.getMonth(), 1)); };
const monthEnd = (d) => { const dt = new Date(d); return fmt(new Date(dt.getFullYear(), dt.getMonth() + 1, 0)); };
const KEY = "papier-tasks-v4";

function parseBulkLine(line) {
  const parts = line.split("/").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const qKey = parts[0].toLowerCase();
  const quadrant = Q.find(q => q.key === qKey);
  if (!quadrant) return null;
  const text = parts[1];
  if (!text) return null;
  let team = "personal";
  if (parts[2]) { const tL = parts[2].toLowerCase().trim(); const f = T.find(t => t.aliases.some(a => tL.includes(a))); if (f) team = f.id; }
  let timeSlot = "am", estimate = 30;
  if (parts[3]) {
    const p = parts[3].toLowerCase().trim();
    if ((p.includes("오전") && p.includes("오후")) || p.includes("종일") || p.includes("allday")) timeSlot = "allday";
    else if (p.includes("오후") || p.includes("pm")) timeSlot = "pm";
    const m = p.match(/(\d+)\s*(분|min|h|시간)?/);
    if (m) { let v = parseInt(m[1]); if (m[2] === "h" || m[2] === "시간") v *= 60; estimate = v; }
  }
  let startDate = TODAY, endDate = TODAY;
  if (parts[4]) {
    const p = parts[4].replace(/\s/g, "");
    const dp = /(\d{1,2})[./](\d{1,2})/g;
    const ms = [...p.matchAll(dp)];
    const y = new Date().getFullYear();
    if (ms.length >= 1) { startDate = `${y}-${String(parseInt(ms[0][1])).padStart(2,"0")}-${String(parseInt(ms[0][2])).padStart(2,"0")}`; endDate = startDate; }
    if (ms.length >= 2) { endDate = `${y}-${String(parseInt(ms[1][1])).padStart(2,"0")}-${String(parseInt(ms[1][2])).padStart(2,"0")}`; }
  }
  let startHour = timeSlot === "pm" ? 13 : 9;
  // Parse specific hour from time field, e.g. "오전 9시 1h", "오후 2시 30분"
  if (parts[3]) {
    const hm = parts[3].match(/(\d{1,2})\s*시/);
    if (hm) startHour = parseInt(hm[1]);
    // If says 오후 and hour <= 12, add 12
    if (parts[3].includes("오후") && startHour <= 12 && startHour !== 12) startHour += 12;
    if (parts[3].includes("오전") && startHour === 12) startHour = 0;
  }
  return { id: uid(), text, quadrant: quadrant.id, team, timeSlot, estimate, startHour, startDate, endDate, progress: 0, done: false, createdAt: Date.now() + Math.random() };
}

export default function App({ session }) {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("day");
  const [curDate, setCurDate] = useState(TODAY);
  const [showAdd, setShowAdd] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState([]);
  const [editTask, setEditTask] = useState(null);
  const [teamF, setTeamF] = useState("all");
  const [dragId, setDragId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [fText, setFText] = useState(""); const [fTeam, setFTeam] = useState("personal");
  const [fSlot, setFSlot] = useState("am"); const [fEst, setFEst] = useState(30);
  const [fStart, setFStart] = useState(TODAY); const [fEnd, setFEnd] = useState(TODAY);
  const [fProg, setFProg] = useState(0); const [fHour, setFHour] = useState(9);
  const [fMemo, setFMemo] = useState("");
  const inRef = useRef(null); const bulkRef = useRef(null);

  const userId = session?.user?.id;
  const initialLoadDone = useRef(false);

  // Load tasks from Supabase on mount
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: true });
      if (!error && data) {
        setTasks(data.map(r => ({
          id: r.id, text: r.text, quadrant: r.quadrant, team: r.team,
          timeSlot: r.time_slot, estimate: r.estimate, startHour: r.start_hour,
          startDate: r.start_date, endDate: r.end_date, progress: r.progress,
          done: r.done, memo: r.memo, createdAt: r.created_at,
        })));
      }
      initialLoadDone.current = true;
      setLoaded(true);
    })();
  }, [userId]);

  // Realtime subscription — auto-refresh when data changes on another device
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` }, () => {
        // Reload all tasks when any change happens
        supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: true }).then(({ data }) => {
          if (data) {
            setTasks(data.map(r => ({
              id: r.id, text: r.text, quadrant: r.quadrant, team: r.team,
              timeSlot: r.time_slot, estimate: r.estimate, startHour: r.start_hour,
              startDate: r.start_date, endDate: r.end_date, progress: r.progress,
              done: r.done, memo: r.memo, createdAt: r.created_at,
            })));
          }
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Helper: save single task to Supabase
  const saveTaskToDb = async (t) => {
    if (!userId) return;
    await supabase.from('tasks').upsert({
      id: t.id, user_id: userId, text: t.text, quadrant: t.quadrant,
      team: t.team, time_slot: t.timeSlot, estimate: t.estimate,
      start_hour: t.startHour || 9, start_date: t.startDate, end_date: t.endDate,
      progress: t.progress, done: t.done, memo: t.memo || null,
      created_at: t.createdAt,
    }, { onConflict: 'id' });
  };

  // Helper: delete single task from Supabase
  const deleteTaskFromDb = async (id) => {
    if (!userId) return;
    await supabase.from('tasks').delete().eq('id', id);
  };

  // Helper: save multiple tasks to Supabase
  const saveTasksToDb = async (newTasks) => {
    if (!userId || !newTasks.length) return;
    const rows = newTasks.map(t => ({
      id: t.id, user_id: userId, text: t.text, quadrant: t.quadrant,
      team: t.team, time_slot: t.timeSlot, estimate: t.estimate,
      start_hour: t.startHour || 9, start_date: t.startDate, end_date: t.endDate,
      progress: t.progress, done: t.done, memo: t.memo || null,
      created_at: t.createdAt,
    }));
    await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
  };
  useEffect(() => { if ((showAdd || editTask) && inRef.current) setTimeout(() => inRef.current?.focus(), 50); }, [showAdd, editTask]);
  useEffect(() => { if (showBulk && bulkRef.current) setTimeout(() => bulkRef.current?.focus(), 50); }, [showBulk]);
  useEffect(() => { const lines = bulkText.split("\n").filter(l => l.trim()); setBulkPreview(lines.map(l => ({ raw: l, result: parseBulkLine(l) }))); }, [bulkText]);

  const reset = () => { setFText(""); setFTeam("personal"); setFSlot("am"); setFEst(30); setFStart(curDate); setFEnd(curDate); setFProg(0); setFHour(9); setFMemo(""); };
  const addTask = (quadrant, slot) => {
    if (!fText.trim()) return;
    const t = { id: uid(), text: fText.trim(), quadrant, team: fTeam, timeSlot: slot || fSlot, estimate: fEst, startHour: fHour, startDate: fStart, endDate: fEnd, progress: 0, done: false, memo: fMemo, createdAt: Date.now() };
    setTasks(p => [...p, t]);
    saveTaskToDb(t);
    reset(); setShowAdd(null);
  };
  const saveEdit = () => {
    if (!editTask) return;
    const updated = { ...editTask, text: fText, team: fTeam, timeSlot: fSlot, estimate: fEst, startHour: fHour, startDate: fStart, endDate: fEnd, progress: fProg, memo: fMemo };
    setTasks(p => p.map(t => t.id === editTask.id ? updated : t));
    saveTaskToDb(updated);
    setEditTask(null); reset();
  };
  const openEdit = (t) => { setFText(t.text); setFTeam(t.team); setFSlot(t.timeSlot || "am"); setFEst(t.estimate); setFHour(t.startHour || 9); setFStart(t.startDate || TODAY); setFEnd(t.endDate || TODAY); setFProg(t.progress || 0); setFMemo(t.memo || ""); setEditTask(t); setShowAdd(null); };
  const toggleDone = (id) => {
    setTasks(p => {
      const updated = p.map(t => t.id === id ? { ...t, done: !t.done, progress: t.done ? t.progress : 100 } : t);
      const t = updated.find(x => x.id === id);
      if (t) saveTaskToDb(t);
      return updated;
    });
  };
  const delTask = (id) => {
    setTasks(p => p.filter(t => t.id !== id));
    deleteTaskFromDb(id);
    if (editTask?.id === id) { setEditTask(null); reset(); }
  };
  const updateDates = (id, s, e) => {
    setTasks(p => {
      const updated = p.map(t => t.id === id ? { ...t, startDate: s, endDate: e } : t);
      const t = updated.find(x => x.id === id);
      if (t) saveTaskToDb(t);
      return updated;
    });
  };
  const submitBulk = () => {
    const valid = bulkPreview.filter(p => p.result).map(p => p.result);
    if (!valid.length) return;
    setTasks(p => [...p, ...valid]);
    saveTasksToDb(valid);
    setBulkText(""); setShowBulk(false);
  };

  // Expose for child components
  window._saveTaskToDb = saveTaskToDb;

  const inRange = (t, s, e) => { const ts = t.startDate || TODAY; const te = t.endDate || ts; return te >= s && ts <= e; };
  const taskInSlot = (t, slot) => t.timeSlot === slot || t.timeSlot === "allday";
  const getVisible = () => {
    let r;
    if (view === "day") r = [curDate, curDate];
    else if (view === "week") { const ws = weekStart(curDate); r = [ws, addD(ws, 6)]; }
    else if (view === "month") r = [monthStart(curDate), monthEnd(curDate)];
    else r = null;
    return tasks.filter(t => { if (teamF !== "all" && t.team !== teamF) return false; if (!r) return true; return inRange(t, r[0], r[1]); });
  };
  const nav = (dir) => {
    if (view === "day") setCurDate(addD(curDate, dir));
    else if (view === "week") setCurDate(addD(curDate, dir * 7));
    else setCurDate(() => { const d = new Date(curDate); d.setMonth(d.getMonth() + dir); return fmt(d); });
  };
  const getLabel = () => {
    if (view === "day") return fmtF(curDate);
    if (view === "week") { const ws = weekStart(curDate); return `${fmtS(ws)} — ${fmtS(addD(ws, 6))}`; }
    const d = new Date(curDate); return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  };

  const vis = getVisible();
  const doneN = vis.filter(t => t.done).length;
  const pct = vis.length ? Math.round(doneN / vis.length * 100) : 0;
  const pill = (a) => ({ fontSize: 12, padding: "6px 14px", borderRadius: 20, border: "none", background: a ? "#4a4660" : "rgba(0,0,0,0.04)", color: a ? "#fff" : "#888", cursor: "pointer", fontWeight: a ? 600 : 400, fontFamily: "inherit", transition: "all 0.2s" });
  const validCount = bulkPreview.filter(p => p.result).length;

  return (
    <div style={{ fontFamily: FONT_KR, maxWidth: 1060, margin: "0 auto", padding: "28px 20px", color: "#2d2d2d", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>papier priority</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.04em" }}>오늘의 우선순위</h1>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => { setShowBulk(true); setBulkText(""); }} style={{ background: "#4a4660", color: "#fff", border: "none", borderRadius: 12, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 300, lineHeight: 1 }}>+</span> 일괄 입력
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{ background: "rgba(0,0,0,0.04)", color: "#999", border: "none", borderRadius: 12, padding: "9px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            로그아웃
          </button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["day","일간"],["week","주간"],["month","월간"],["gantt","간트"]].map(([k,l]) => <button key={k} onClick={() => setView(k)} style={pill(view===k)}>{l}</button>)}
      </div>
      {/* Nav */}
      {view !== "gantt" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => nav(-1)} style={{ background: "none", border: "none", borderRadius: 20, width: 32, height: 32, cursor: "pointer", fontSize: 13, color: "#666", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: "center", letterSpacing: "-0.02em" }}>{getLabel()}</span>
          <button onClick={() => nav(1)} style={{ background: "none", border: "none", borderRadius: 20, width: 32, height: 32, cursor: "pointer", fontSize: 13, color: "#666", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          <button onClick={() => setCurDate(TODAY)} style={{ background: "rgba(0,0,0,0.04)", border: "none", borderRadius: 14, padding: "5px 12px", cursor: "pointer", fontSize: 11, color: "#666", fontFamily: "inherit", fontWeight: 500 }}>오늘</button>
        </div>
      )}
      {/* Team filter */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setTeamF("all")} style={{ ...pill(teamF==="all"), fontSize: 11, padding: "4px 12px" }}>전체</button>
        {T.map(t => <button key={t.id} onClick={() => setTeamF(teamF===t.id?"all":t.id)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 14, border: "none", background: teamF===t.id ? `${t.color}22` : "rgba(0,0,0,0.03)", color: teamF===t.id ? t.color : "#999", cursor: "pointer", fontWeight: teamF===t.id ? 600 : 400, fontFamily: "inherit" }}><span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: t.color, marginRight: 5, verticalAlign: "middle" }}/>{t.label}</button>)}
      </div>
      {/* Progress */}
      <div style={{ background: "#f7f7f7", borderRadius: 16, padding: "14px 18px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8, color: "#666" }}>
          <span><b style={{ color: "#2d2d2d" }}>{doneN}</b> / {vis.length} 완료</span><span style={{ fontWeight: 600, color: "#2d2d2d" }}>{pct}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#a5a1bb,#8aaa96)", borderRadius: 2, transition: "width 0.4s" }} /></div>
      </div>

      {/* Bulk Modal */}
      {showBulk && <BulkModal onSubmit={(items) => { setTasks(p => [...p, ...items]); saveTasksToDb(items); setShowBulk(false); }} onClose={() => setShowBulk(false)} />}
      {/* Edit Modal */}
      {editTask && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,0.35)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => { setEditTask(null); reset(); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 48px rgba(0,0,0,0.12)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>할 일 수정</h3>
            <FormFields f={{ fText, setFText, fTeam, setFTeam, fSlot, setFSlot, fEst, setFEst, fStart, setFStart, fEnd, setFEnd, fProg, setFProg, fHour, setFHour, fMemo, setFMemo }} inRef={inRef} showProg />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: "#4a4660", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>저장</button>
              <button onClick={() => { setEditTask(null); reset(); }} style={{ padding: "10px 18px", borderRadius: 12, border: "none", background: "rgba(0,0,0,0.04)", fontSize: 13, color: "#999", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MAIN VIEW ═══ */}
      {view === "gantt" ? (
        <GanttView tasks={vis} onEdit={openEdit} onToggle={toggleDone} onUpdateDates={updateDates} />
      ) : (
        <>
          {/* Quadrant Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {Q.map(q => {
              const qt = vis.filter(t => t.quadrant === q.id);
              const amT = qt.filter(t => taskInSlot(t, "am") && !t.done);
              const pmT = qt.filter(t => taskInSlot(t, "pm") && !t.done);
              const totalActive = new Set([...amT, ...pmT]).size;
              const amKey = `${q.id}-am`, pmKey = `${q.id}-pm`;
              const isOver = dragOverTarget === amKey || dragOverTarget === pmKey;
              return (
                <div key={q.id} style={{ background: "#f7f7f7", border: "none", borderRadius: 18, overflow: "hidden", transition: "all 0.25s", boxShadow: isOver ? `0 4px 20px ${q.mid}` : "none" }}>
                  <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: q.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: q.textOn }}>{q.label}</span>
                    {totalActive > 0 && <span style={{ fontSize: 10, background: q.bg, color: q.textOn, padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>{totalActive}</span>}
                  </div>
                  <div style={{ display: "flex", minHeight: 120 }}>
                    <HalfCol label="오전" colKey={amKey} slot="am" q={q} tasks={qt.filter(t => taskInSlot(t,"am"))} showAdd={showAdd} setShowAdd={setShowAdd} onAddTask={addTask} form={{ fText, setFText, fTeam, setFTeam, fSlot, setFSlot, fEst, setFEst, fStart, setFStart, fEnd, setFEnd, fHour, setFHour, fMemo, setFMemo }} inRef={inRef} reset={reset} curDate={curDate} onToggle={toggleDone} onDel={delTask} onEdit={openEdit} dragOverTarget={dragOverTarget} setDragOverTarget={setDragOverTarget} dragId={dragId} setDragId={setDragId} setTasks={setTasks} borderRight />
                    <HalfCol label="오후" colKey={pmKey} slot="pm" q={q} tasks={qt.filter(t => taskInSlot(t,"pm"))} showAdd={showAdd} setShowAdd={setShowAdd} onAddTask={addTask} form={{ fText, setFText, fTeam, setFTeam, fSlot, setFSlot, fEst, setFEst, fStart, setFStart, fEnd, setFEnd, fHour, setFHour, fMemo, setFMemo }} inRef={inRef} reset={reset} curDate={curDate} onToggle={toggleDone} onDel={delTask} onEdit={openEdit} dragOverTarget={dragOverTarget} setDragOverTarget={setDragOverTarget} dragId={dragId} setDragId={setDragId} setTasks={setTasks} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline / Calendar below quadrants */}
          {(view === "day" || view === "week") && <TimelineView tasks={vis} view={view} curDate={curDate} onEdit={openEdit} onToggle={toggleDone} />}
          {view === "month" && <CalendarView tasks={vis} curDate={curDate} onEdit={openEdit} />}
        </>
      )}
      <div style={{ marginTop: 16, padding: "12px 16px", background: "#f5f4f0", borderRadius: 12, fontSize: 11, color: "#aaa", lineHeight: 1.7, textAlign: "center" }}>
        드래그로 사분면 이동 · 클릭해서 수정 · 간트 바 드래그로 일정 조정
      </div>
    </div>
  );
}

/* ═══════════ Timeline View (Day / Week) — hourly grid ═══════════ */
const FONT_EN = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_KR = "'Apple SD Gothic Neo', 'AppleSDGothicNeo', -apple-system, sans-serif";
const HOURS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1]; // 6AM~1AM
const hourLabel = (h) => {
  if (h === 0) return { kr: "자정", en: "12" };
  if (h === 12) return { kr: "정오", en: "12" };
  if (h < 12) return { kr: `오전`, en: `${h}` };
  return { kr: `오후`, en: `${h - 12}` };
};
const slotToHours = (task) => {
  const startH = task.startHour || (task.timeSlot === "pm" ? 13 : 9);
  const durH = Math.max(1, Math.ceil((task.estimate || 30) / 60));
  return { startH, durH };
};

function TimelineView({ tasks, view, curDate, onEdit, onToggle }) {
  const dates = view === "day" ? [curDate] : Array.from({ length: 7 }, (_, i) => addD(weekStart(curDate), i));
  const activeTasks = tasks.filter(t => !t.done);
  const ROW_H = 52;
  const LABEL_W = 56;
  const colCount = dates.length;

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.05)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
      {/* Header row with day columns */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid rgba(0,0,0,0.04)" }} />
        {dates.map(date => {
          const dt = new Date(date);
          const isToday = date === TODAY;
          const isWE = dt.getDay() === 0 || dt.getDay() === 6;
          return (
            <div key={date} style={{ flex: 1, textAlign: "center", padding: "10px 4px 8px", borderRight: "1px solid rgba(0,0,0,0.04)", background: isToday ? "rgba(165,161,187,0.06)" : "transparent" }}>
              <div style={{ fontFamily: FONT_KR, fontSize: 10, color: isToday ? "#4a4660" : isWE ? "#bbb" : "#999", fontWeight: 500 }}>{DK[dt.getDay()]}</div>
              <div style={{ fontFamily: FONT_EN, fontSize: 18, fontWeight: 500, color: isToday ? "#4a4660" : "#2d2d2d", marginTop: 2 }}>
                {isToday ? <span style={{ background: "#4a4660", color: "#fff", borderRadius: 12, padding: "2px 8px" }}>{dt.getDate()}</span> : dt.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour grid */}
      <div style={{ position: "relative", overflowY: "auto", maxHeight: 600 }}>
        {HOURS.map((h, hi) => (
          <div key={h} style={{ display: "flex", height: ROW_H, borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
            {/* Hour label */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid rgba(0,0,0,0.04)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 2 }}>
              {h === 0 ? (
                <span style={{ fontFamily: FONT_KR, fontSize: 11, color: "#aaa", fontWeight: 500 }}>자정</span>
              ) : h === 12 ? (
                <span style={{ fontFamily: FONT_KR, fontSize: 11, color: "#aaa", fontWeight: 500 }}>정오</span>
              ) : (
                <span style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontFamily: FONT_KR, fontSize: 9, color: "#bbb", fontWeight: 500 }}>{h < 12 ? "오전" : "오후"}</span>
                  <span style={{ fontFamily: FONT_EN, fontSize: 12, color: "#999", fontWeight: 500 }}>{h <= 12 ? h : h - 12}</span>
                  <span style={{ fontFamily: FONT_KR, fontSize: 9, color: "#bbb", fontWeight: 500 }}>시</span>
                </span>
              )}
            </div>
            {/* Day columns (empty grid cells) */}
            {dates.map((date, di) => {
              const isToday = date === TODAY;
              return (
                <div key={date} style={{ flex: 1, borderRight: di < colCount - 1 ? "1px solid rgba(0,0,0,0.03)" : "none", background: isToday ? "rgba(165,161,187,0.02)" : "transparent" }} />
              );
            })}
          </div>
        ))}

        {/* Overlaid task blocks */}
        <div style={{ position: "absolute", top: 0, left: LABEL_W, right: 0, bottom: 0, pointerEvents: "none" }}>
          {dates.map((date, di) => {
            const dayTasks = activeTasks.filter(t => {
              const ts = t.startDate || TODAY, te = t.endDate || ts;
              return date >= ts && date <= te;
            });
            return dayTasks.map((t) => {
              const { startH, durH } = slotToHours(t);
              const qq = Q.find(q => q.id === t.quadrant);
              const tm = T.find(x => x.id === t.team);
              const rowIdx = HOURS.indexOf(startH);
              if (rowIdx < 0) return null;

              const top = rowIdx * ROW_H + 3;
              const height = Math.max(durH * ROW_H - 6, ROW_H - 6);

              // Overlap handling
              const sameDayTimeTasks = dayTasks.filter(ot => {
                const os = slotToHours(ot);
                return !(startH + durH <= os.startH || os.startH + os.durH <= startH);
              });
              const overlapIdx = sameDayTimeTasks.indexOf(t);
              const overlapCount = sameDayTimeTasks.length;

              const pctLeft = (di / colCount) * 100;
              const pctW = (1 / colCount) * 100;
              const subPctW = pctW / overlapCount;
              const subPctLeft = pctLeft + overlapIdx * subPctW;

              const endH = startH + durH;
              const fmtHr = (hr) => {
                if (hr === 0 || hr === 24) return "자정";
                if (hr === 12) return "정오";
                return hr <= 12 ? `${hr}시` : `${hr-12}시`;
              };
              const timeStr = `${startH < 12 ? "오전" : "오후"} ${fmtHr(startH)} ~ ${endH < 12 || endH === 24 ? "" : ""}${fmtHr(endH)}`;

              return (
                <div key={t.id + "-" + date}
                  onClick={() => onEdit(t)}
                  style={{
                    position: "absolute",
                    top,
                    height,
                    left: `calc(${subPctLeft}% + 3px)`,
                    width: `calc(${subPctW}% - 6px)`,
                    background: qq?.color || "#999",
                    borderRadius: 8,
                    padding: "6px 8px",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    overflow: "hidden",
                    border: `1px solid rgba(255,255,255,0.15)`,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <div style={{ fontFamily: FONT_KR, fontSize: 11, fontWeight: 600, color: "#fff", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</div>
                  <div style={{ fontFamily: FONT_EN, fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ fontFamily: FONT_KR }}>{t.timeSlot === "allday" ? "오전" : t.timeSlot === "am" ? "오전" : "오후"}</span>
                    <span>{fmtHr(startH)}</span>
                    <span>~</span>
                    <span>{fmtHr(endH > 24 ? endH - 24 : endH)}</span>
                  </div>
                  {tm && <div style={{ fontFamily: FONT_KR, fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{tm.label}</div>}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Calendar View (Month) ═══════════ */
function CalendarView({ tasks, curDate, onEdit }) {
  const ms = monthStart(curDate);
  const me = monthEnd(curDate);
  const firstDay = new Date(ms).getDay(); // 0=Sun
  const startPad = firstDay === 0 ? 6 : firstDay - 1; // Monday-based
  const totalDays = diffD(ms, me) + 1;
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: addD(ms, -(startPad - i)), outside: true });
  for (let i = 0; i < totalDays; i++) cells.push({ date: addD(ms, i), outside: false });
  const rem = (7 - cells.length % 7) % 7;
  for (let i = 0; i < rem; i++) cells.push({ date: addD(me, i + 1), outside: true });

  const activeTasks = tasks.filter(t => !t.done);

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.05)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12, fontWeight: 700, color: "#666" }}>
        월간 캘린더
      </div>
      {/* Day headers - Monday start */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
        {DKM.map(d => <div key={d} style={{ textAlign: "center", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#aaa" }}>{d}</div>)}
      </div>
      {/* Cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {cells.map((c, i) => {
          const dt = new Date(c.date);
          const isToday = c.date === TODAY;
          const dayTasks = activeTasks.filter(t => {
            const ts = t.startDate || TODAY, te = t.endDate || ts;
            return c.date >= ts && c.date <= te;
          });
          return (
            <div key={i} style={{ minHeight: 72, borderRight: (i + 1) % 7 !== 0 ? "1px solid rgba(0,0,0,0.03)" : "none", borderBottom: "1px solid rgba(0,0,0,0.03)", padding: "4px 5px", background: c.outside ? "rgba(0,0,0,0.015)" : isToday ? "rgba(165,161,187,0.06)" : "transparent" }}>
              <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 400, color: c.outside ? "#ccc" : isToday ? "#4a4660" : "#666", marginBottom: 3 }}>
                {isToday ? <span style={{ background: "#4a4660", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{dt.getDate()}</span> : dt.getDate()}
              </div>
              {dayTasks.slice(0, 3).map(t => {
                const qq = Q.find(q => q.id === t.quadrant);
                return (
                  <div key={t.id} onClick={() => onEdit(t)} style={{ fontSize: 9, padding: "2px 5px", marginBottom: 2, borderRadius: 4, background: `${qq?.color || "#999"}20`, color: qq?.textOn || "#555", fontWeight: 500, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
                    {t.text}
                  </div>
                );
              })}
              {dayTasks.length > 3 && <div style={{ fontSize: 8, color: "#aaa", paddingLeft: 4 }}>+{dayTasks.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════ Mini Task ═══════════ */
function MiniTask({ t, onEdit, onToggle }) {
  const qq = Q.find(q => q.id === t.quadrant);
  const tm = T.find(x => x.id === t.team);
  return (
    <div onClick={() => onEdit(t)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", marginBottom: 2, borderRadius: 7, background: `${qq?.color || "#999"}10`, cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = `${qq?.color || "#999"}20`}
      onMouseLeave={e => e.currentTarget.style.background = `${qq?.color || "#999"}10`}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: qq?.color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 500, color: "#2d2d2d", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
      {tm && <span style={{ fontSize: 8, color: tm.color, fontWeight: 600 }}>{tm.label}</span>}
      {t.timeSlot === "allday" && <span style={{ fontSize: 8, color: "#a5a1bb", fontWeight: 600 }}>종일</span>}
      <span style={{ fontSize: 8, color: "#bbb" }}>{t.estimate < 60 ? `${t.estimate}분` : `${t.estimate/60}h`}</span>
    </div>
  );
}

/* ═══════════ Half Column ═══════════ */
function HalfCol({ label, colKey, slot, q, tasks, showAdd, setShowAdd, onAddTask, form, inRef, reset, curDate, onToggle, onDel, onEdit, dragOverTarget, setDragOverTarget, dragId, setDragId, setTasks, borderRight }) {
  const isOver = dragOverTarget === colKey;
  const active = tasks.filter(t => !t.done).sort((a,b) => a.createdAt - b.createdAt);
  const done = tasks.filter(t => t.done);
  const all = [...active, ...done];
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverTarget(colKey); }}
      onDrop={e => { e.preventDefault(); if (dragId) { setTasks(p => { const updated = p.map(t => t.id === dragId ? { ...t, quadrant: q.id, timeSlot: slot } : t); const t = updated.find(x => x.id === dragId); if (t && window._saveTaskToDb) window._saveTaskToDb(t); return updated; }); } setDragId(null); setDragOverTarget(null); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverTarget(null); }}
      style={{ flex: 1, padding: "0 0 10px", borderRight: borderRight ? "1px solid rgba(0,0,0,0.04)" : "none", background: isOver ? q.light : "transparent", transition: "background 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#aaa" }}>{label}</span>
        <button onClick={() => { if (showAdd === colKey) setShowAdd(null); else { setShowAdd(colKey); reset(); form.setFSlot(slot); form.setFStart(curDate); form.setFEnd(curDate); } }}
          style={{ width: 20, height: 20, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.03)", color: "#bbb", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
      </div>
      {showAdd === colKey && (
        <div style={{ padding: "8px 10px" }}>
          <div style={{ background: "#fafaf8", borderRadius: 12, padding: 10, border: "none" }}>
            <FormFields f={form} inRef={inRef} onEnter={() => onAddTask(q.id, slot)} compact />
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              <button onClick={() => onAddTask(q.id, slot)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: q.color, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>추가</button>
              <button onClick={() => setShowAdd(null)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "rgba(0,0,0,0.04)", fontSize: 11, color: "#999", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ padding: "4px 8px 0", display: "flex", flexDirection: "column", gap: 3 }}>
        {all.map(t => <TCard key={t.id} t={t} q={q} onToggle={onToggle} onDel={onDel} onEdit={onEdit} onDS={() => setDragId(t.id)} onDE={() => { setDragId(null); setDragOverTarget(null); }} />)}
      </div>
    </div>
  );
}

/* ═══════════ Form Fields ═══════════ */
function FormFields({ f, inRef, onEnter, showProg, compact }) {
  const { fText, setFText, fTeam, setFTeam, fSlot, setFSlot, fEst, setFEst, fStart, setFStart, fEnd, setFEnd, fProg, setFProg, fHour, setFHour, fMemo, setFMemo } = f;
  const chip = (a, c) => ({ fontSize: compact ? 9 : 10, padding: compact ? "3px 7px" : "4px 10px", borderRadius: 10, border: "none", background: a ? `${c}20` : "rgba(0,0,0,0.03)", color: a ? c : "#aaa", cursor: "pointer", fontWeight: a ? 700 : 400, fontFamily: "inherit", transition: "all 0.15s" });
  const hourOpts = [];
  for (let h = 6; h <= 23; h++) hourOpts.push(h);
  hourOpts.push(0, 1);
  const fmtHour = (h) => { if (h === 0) return "자정"; if (h === 12) return "정오"; return h < 12 ? `오전 ${h}시` : `오후 ${h-12}시`; };
  const inputStyle = { width: "100%", border: "none", borderRadius: 10, padding: compact ? "7px 10px" : "9px 12px", fontSize: compact ? 12 : 13, fontWeight: 500, fontFamily: "inherit", boxSizing: "border-box", outline: "none", background: "#f2f2f2" };
  return (
    <>
      <input ref={inRef} value={fText} onChange={e => setFText(e.target.value)} onKeyDown={e => e.key === "Enter" && onEnter?.()}
        placeholder="할 일을 입력하세요" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#bbb", marginBottom: 3, fontWeight: 600 }}>팀</div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{T.map(t => <button key={t.id} onClick={() => setFTeam(t.id)} style={chip(fTeam === t.id, t.color)}>{t.label}</button>)}</div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#bbb", marginBottom: 3, fontWeight: 600 }}>시간대</div>
        <div style={{ display: "flex", gap: 3 }}>
          {SLOTS.map(s => <button key={s.id} onClick={() => { setFSlot(s.id); if (s.id === "pm" && fHour < 12) setFHour(13); if (s.id === "am" && fHour >= 13) setFHour(9); }} style={chip(fSlot === s.id, s.id === "allday" ? "#4a4660" : s.id === "am" ? "#c4956a" : "#8b7fb5")}>{s.label}</button>)}
        </div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#bbb", marginBottom: 3, fontWeight: 600 }}>시작 시각 · 소요시간</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <select value={fHour} onChange={e => setFHour(Number(e.target.value))} style={{ fontSize: 11, border: "none", borderRadius: 7, padding: "5px 8px", fontFamily: "inherit", background: "#f2f2f2", outline: "none", color: "#2d2d2d" }}>
            {hourOpts.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
          </select>
          <div style={{ width: 1, height: 14, background: "rgba(0,0,0,0.06)" }} />
          {[15,30,60,120,180,240].map(m => <button key={m} onClick={() => setFEst(m)} style={chip(fEst === m, "#6a9b83")}>{m < 60 ? `${m}분` : `${m/60}h`}</button>)}
        </div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#bbb", marginBottom: 3, fontWeight: 600 }}>기간</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" value={fStart} onChange={e => { setFStart(e.target.value); if (e.target.value > fEnd) setFEnd(e.target.value); }} style={{ fontSize: 11, border: "none", borderRadius: 7, padding: "5px 8px", fontFamily: "inherit", background: "#f2f2f2", outline: "none" }} />
          <span style={{ color: "#ccc", fontSize: 11 }}>~</span>
          <input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)} min={fStart} style={{ fontSize: 11, border: "none", borderRadius: 7, padding: "5px 8px", fontFamily: "inherit", background: "#f2f2f2", outline: "none" }} />
        </div>
      </div>
      {/* Memo */}
      <div style={{ marginBottom: showProg ? 8 : 0 }}>
        <div style={{ fontSize: 9, color: "#bbb", marginBottom: 3, fontWeight: 600 }}>메모 <span style={{ color: "#ccc", fontWeight: 400 }}>({(fMemo || "").length}/200)</span></div>
        <textarea value={fMemo || ""} onChange={e => { if (e.target.value.length <= 200) setFMemo(e.target.value); }}
          placeholder="메모를 남겨보세요"
          style={{ width: "100%", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box", outline: "none", background: "#f2f2f2", resize: "vertical", minHeight: 48, lineHeight: 1.5 }} />
      </div>
      {showProg && <div style={{ marginTop: 4 }}><div style={{ fontSize: 9, color: "#bbb", marginBottom: 3, fontWeight: 600 }}>진행률 <span style={{ color: "#4a4660", fontWeight: 800 }}>{fProg}%</span></div><input type="range" min={0} max={100} step={10} value={fProg} onChange={e => setFProg(Number(e.target.value))} style={{ width: "100%", accentColor: "#a5a1bb" }} /></div>}
    </>
  );
}

/* ═══════════ Task Card ═══════════ */
function TCard({ t, q, onToggle, onDel, onEdit, onDS, onDE }) {
  const tm = T.find(x => x.id === t.team);
  const multi = t.startDate !== t.endDate;
  const [hov, setHov] = useState(false);
  const slotL = t.timeSlot === "allday" ? "종일" : t.timeSlot === "am" ? "오전" : "오후";
  return (
    <div draggable onDragStart={onDS} onDragEnd={onDE} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: t.done ? "rgba(0,0,0,0.015)" : hov ? "#fafaf8" : "#fff", borderRadius: 10, padding: "7px 9px", display: "flex", alignItems: "flex-start", gap: 6, cursor: "grab", border: "none", opacity: t.done ? 0.4 : 1, transition: "all 0.2s" }}>
      <button onClick={() => onToggle(t.id)} style={{ width: 16, height: 16, minWidth: 16, borderRadius: 5, border: "none", background: t.done ? q.color : "rgba(0,0,0,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", marginTop: 1 }}>{t.done && "✓"}</button>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onEdit(t)}>
        <div style={{ fontSize: 11, fontWeight: 500, textDecoration: t.done ? "line-through" : "none", color: t.done ? "#bbb" : "#2d2d2d", lineHeight: 1.4, wordBreak: "break-word" }}>{t.text}</div>
        {t.memo && <div style={{ fontSize: 9, color: "#aaa", lineHeight: 1.4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.memo}</div>}
        <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
          {tm && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 5, background: `${tm.color}15`, color: tm.color, fontWeight: 600 }}>{tm.label}</span>}
          {t.timeSlot === "allday" && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(74,70,96,0.1)", color: "#4a4660", fontWeight: 600 }}>종일</span>}
          <span style={{ fontSize: 8, color: "#bbb" }}>{t.estimate < 60 ? `${t.estimate}분` : `${t.estimate/60}h`}</span>
          {multi && <span style={{ fontSize: 8, color: "#bbb" }}>{fmtS(t.startDate)}~{fmtS(t.endDate)}</span>}
          {(t.progress > 0 && !t.done) && <div style={{ display: "flex", alignItems: "center", gap: 2 }}><div style={{ width: 24, height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${t.progress}%`, height: "100%", background: q.color, borderRadius: 2 }} /></div><span style={{ fontSize: 7, color: q.color, fontWeight: 700 }}>{t.progress}%</span></div>}
        </div>
      </div>
      <button onClick={() => onDel(t.id)} style={{ background: "none", border: "none", color: hov ? "#ccc" : "transparent", fontSize: 13, cursor: "pointer", padding: "0 1px", lineHeight: 1, transition: "color 0.2s" }} onMouseEnter={e => e.target.style.color = "#b07878"} onMouseLeave={e => e.target.style.color = hov ? "#ccc" : "transparent"}>×</button>
    </div>
  );
}

/* ═══════════ Bulk Modal — AI 자연어 분석 ═══════════ */
function BulkModal({ onSubmit, onClose }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => { if (ref.current) setTimeout(() => ref.current?.focus(), 50); }, []);

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setParsed([]);
    try {
      const todayStr = TODAY;
      const prompt = `You are a task parser for a priority management app. Today's date is ${todayStr}.

Parse the following natural language input into structured tasks. Each task needs:
- text: the task title (concise, clear)
- quadrant: one of "urgent-important", "urgent-routine", "noturgent-important", "noturgent-routine"
  - urgent-important: 급하고 중요한 일 (meetings, deadlines, critical decisions)
  - urgent-routine: 급하고 루틴한 일 (emails, quick admin tasks, routine replies)
  - noturgent-important: 안 급하지만 중요한 일 (long-term projects, planning, self-improvement)
  - noturgent-routine: 안 급한 루틴한 일 (health habits, organizing, low-priority admin)
- team: one of "leader", "product", "business", "story", "offline", "personal"
  - Determine from context. Default to "personal" if unclear.
- timeSlot: "am", "pm", or "allday"
- startHour: 6-23 or 0-1 (24h format). Default 9 for am, 14 for pm.
- estimate: minutes (default 30)
- startDate: "${todayStr}" format YYYY-MM-DD
- endDate: "${todayStr}" format YYYY-MM-DD (same as startDate if single day)
- memo: any extra context or notes from the original text (parenthetical remarks, etc.)

Respond ONLY with a JSON array, no markdown, no explanation. Example:
[{"text":"메일 답장","quadrant":"urgent-routine","team":"business","timeSlot":"am","startHour":9,"estimate":30,"startDate":"${todayStr}","endDate":"${todayStr}","memo":"오전에 빨리 끝내기"}]

Input:
${text}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const raw = data.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const items = JSON.parse(clean);
      setParsed(items.map(item => ({
        id: uid(),
        text: item.text,
        quadrant: item.quadrant,
        team: item.team || "personal",
        timeSlot: item.timeSlot || "am",
        startHour: item.startHour || 9,
        estimate: item.estimate || 30,
        startDate: item.startDate || TODAY,
        endDate: item.endDate || item.startDate || TODAY,
        progress: 0,
        done: false,
        memo: item.memo || "",
        createdAt: Date.now() + Math.random(),
      })));
    } catch (e) {
      setError("분석에 실패했어요. 다시 시도해주세요.");
      console.error(e);
    }
    setLoading(false);
  };

  const handleSubmit = () => {
    if (parsed.length === 0) return;
    onSubmit(parsed);
  };

  const removeItem = (idx) => setParsed(p => p.filter((_, i) => i !== idx));

  const quadrantLabel = (qId) => {
    const labels = { "urgent-important": "급하고 중요", "urgent-routine": "급하고 루틴", "noturgent-important": "중요·안급함", "noturgent-routine": "루틴·안급함" };
    return labels[qId] || qId;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,0.35)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, padding: 28, width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "auto", boxShadow: "0 12px 48px rgba(0,0,0,0.15)" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>할 일 입력</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#999", lineHeight: 1.6 }}>
          자유롭게 적으면 AI가 자동으로 분류해요
        </p>

        {/* Example */}
        <div style={{ background: "#f7f7f7", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 11, color: "#888", lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: "#666", marginBottom: 4 }}>이렇게 적어보세요</div>
          <div>오전까지 비즈니스 파트 메일 답장하기</div>
          <div>오후 3시에 프로덕트 팀 회의 (중요함)</div>
          <div>이번 주 안에 홈페이지 개선하기</div>
          <div>일주일동안 건강하게 먹고 운동하기</div>
        </div>

        {/* Input */}
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"오전까지 메일 답장 끝내기\n오후 3시 프로덕트 팀 회의\n이번 주 홈페이지 개선..."}
          style={{
            width: "100%", minHeight: 140, border: "none", borderRadius: 14,
            padding: "14px 16px", fontSize: 13, fontFamily: FONT_KR,
            lineHeight: 2, resize: "vertical", boxSizing: "border-box",
            outline: "none", background: "#f2f2f2",
          }}
        />

        {/* Analyze button */}
        <button onClick={handleAnalyze} disabled={loading || !text.trim()}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
            background: loading ? "#999" : text.trim() ? "#4a4660" : "rgba(0,0,0,0.08)",
            color: text.trim() ? "#fff" : "#ccc",
            fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
            fontFamily: "inherit", marginTop: 12, marginBottom: 8,
          }}>
          {loading ? "분석 중..." : "AI로 분석하기"}
        </button>

        {error && <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(176,120,120,0.1)", color: "#b07878", fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {/* Results */}
        {parsed.length > 0 && (
          <div style={{ marginTop: 8, borderRadius: 14, overflow: "hidden", background: "#f7f7f7" }}>
            <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#666", display: "flex", justifyContent: "space-between" }}>
              <span>분석 결과</span>
              <span style={{ color: "#6a9b83" }}>{parsed.length}개</span>
            </div>
            {parsed.map((t, i) => {
              const qq = Q.find(q => q.id === t.quadrant);
              const tm = T.find(x => x.id === t.team);
              return (
                <div key={i} style={{ padding: "10px 14px", background: "#fff", marginBottom: 1, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: qq?.color, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2d2d2d" }}>{t.text}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 6, background: `${qq?.color}20`, color: qq?.textOn, fontWeight: 600 }}>{quadrantLabel(t.quadrant)}</span>
                      {tm && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 6, background: `${tm.color}15`, color: tm.color, fontWeight: 600 }}>{tm.label}</span>}
                      <span style={{ fontSize: 9, color: "#aaa" }}>{t.timeSlot === "allday" ? "종일" : t.timeSlot === "am" ? "오전" : "오후"} {t.startHour}시</span>
                      <span style={{ fontSize: 9, color: "#aaa" }}>{t.estimate < 60 ? `${t.estimate}분` : `${t.estimate/60}h`}</span>
                      {t.startDate !== t.endDate && <span style={{ fontSize: 9, color: "#aaa" }}>{fmtS(t.startDate)}~{fmtS(t.endDate)}</span>}
                    </div>
                    {t.memo && <div style={{ fontSize: 10, color: "#aaa", marginTop: 3 }}>{t.memo}</div>}
                  </div>
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: "#ccc", fontSize: 14, cursor: "pointer", padding: 0 }}
                    onMouseEnter={e => e.target.style.color = "#b07878"} onMouseLeave={e => e.target.style.color = "#ccc"}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Submit */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={handleSubmit} disabled={!parsed.length}
            style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", background: parsed.length ? "#4a4660" : "rgba(0,0,0,0.08)", color: parsed.length ? "white" : "#ccc", fontSize: 14, fontWeight: 700, cursor: parsed.length ? "pointer" : "default", fontFamily: "inherit" }}>
            {parsed.length ? `${parsed.length}개 추가하기` : "먼저 분석해주세요"}
          </button>
          <button onClick={onClose} style={{ padding: "11px 20px", borderRadius: 12, border: "none", background: "rgba(0,0,0,0.04)", fontSize: 14, color: "#999", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Gantt Bar ═══════════ */
function GanttBar({ task, minD, dw, dates, onUpdate, onEdit }) {
  const qq = Q.find(x => x.id === task.quadrant);
  const c = qq?.color || "#999";
  const s = diffD(minD, task.startDate || TODAY);
  const dur = diffD(task.startDate || TODAY, task.endDate || task.startDate || TODAY) + 1;
  const startX = useRef(0), origS = useRef(s), origD = useRef(dur);
  const [dragging, setDragging] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleMouseDown = (e, mode) => {
    e.stopPropagation(); e.preventDefault();
    setDragging(mode); startX.current = e.clientX; origS.current = s; origD.current = dur;
    const onMove = (ev) => {
      const dx = ev.clientX - startX.current, ds = Math.round(dx / dw);
      let ns = origS.current, nd = origD.current;
      if (mode === "move") ns = origS.current + ds;
      else if (mode === "left") { ns = origS.current + ds; nd = origD.current - ds; if (nd < 1) { nd = 1; ns = origS.current + origD.current - 1; } }
      else { nd = origD.current + ds; if (nd < 1) nd = 1; }
      if (ns < 0) { nd += ns; ns = 0; } if (nd < 1) nd = 1;
      setPreview({ left: ns * dw + 3, width: nd * dw - 6 });
    };
    const onUp = (ev) => {
      const dx = ev.clientX - startX.current, ds = Math.round(dx / dw);
      let ns = origS.current, nd = origD.current;
      if (mode === "move") ns = origS.current + ds;
      else if (mode === "left") { ns = origS.current + ds; nd = origD.current - ds; if (nd < 1) { nd = 1; ns = origS.current + origD.current - 1; } }
      else { nd = origD.current + ds; if (nd < 1) nd = 1; }
      if (ns < 0) { nd += ns; ns = 0; } if (nd < 1) nd = 1;
      onUpdate(task.id, addD(minD, ns), addD(minD, ns + nd - 1));
      setDragging(null); setPreview(null);
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };

  const bL = preview ? preview.left : s * dw + 3, bW = preview ? preview.width : dur * dw - 6;
  return (
    <div style={{ position: "absolute", left: bL, top: 10, width: bW, height: 24, borderRadius: 8, background: `${c}25`, overflow: "visible", border: `1.5px solid ${dragging ? c : `${c}30`}`, cursor: dragging === "move" ? "grabbing" : "grab", transition: dragging ? "none" : "left 0.15s, width 0.15s", boxShadow: dragging ? `0 3px 12px ${c}30` : "none", zIndex: dragging ? 10 : 2, userSelect: "none" }}>
      <div onMouseDown={e => handleMouseDown(e, "left")} style={{ position: "absolute", left: -2, top: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 3 }} />
      <div onMouseDown={e => handleMouseDown(e, "move")} onClick={() => { if (!dragging) onEdit(task); }} style={{ position: "absolute", left: 8, right: 8, top: 0, bottom: 0, cursor: dragging === "move" ? "grabbing" : "grab" }} />
      <div onMouseDown={e => handleMouseDown(e, "right")} style={{ position: "absolute", right: -2, top: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 3 }} />
      <div style={{ height: "100%", width: `${task.progress || 0}%`, background: `${c}50`, borderRadius: "6px 0 0 6px", pointerEvents: "none" }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: qq?.textOn || "#555", pointerEvents: "none" }}>{task.progress || 0}%</span>
      <div style={{ position: "absolute", left: 2, top: 5, bottom: 5, width: 3, borderRadius: 2, background: `${c}40`, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 2, top: 5, bottom: 5, width: 3, borderRadius: 2, background: `${c}40`, opacity: 0.5, pointerEvents: "none" }} />
    </div>
  );
}

/* ═══════════ Gantt View ═══════════ */
function GanttView({ tasks, onEdit, onToggle, onUpdateDates }) {
  const active = tasks.filter(t => !t.done).sort((a, b) => (a.startDate || TODAY) < (b.startDate || TODAY) ? -1 : 1);
  const done = tasks.filter(t => t.done);
  const allD = active.flatMap(t => [t.startDate || TODAY, t.endDate || t.startDate || TODAY]);
  if (!allD.length) allD.push(TODAY);
  let minD = allD.reduce((a, b) => a < b ? a : b), maxD = allD.reduce((a, b) => a > b ? a : b);
  minD = addD(minD, -2); maxD = addD(maxD, 7);
  const total = diffD(minD, maxD) + 1, dw = 40;
  const dates = []; for (let i = 0; i < total; i++) dates.push(addD(minD, i));
  const months = {}; dates.forEach(d => { const dt = new Date(d); const k = `${dt.getFullYear()}-${dt.getMonth()}`; if (!months[k]) months[k] = { label: `${dt.getFullYear()}년 ${dt.getMonth()+1}월`, count: 0 }; months[k].count++; });

  return (
    <div style={{ overflowX: "auto", borderRadius: 18, border: "1px solid rgba(0,0,0,0.05)", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
      <div style={{ minWidth: total * dw + 240 }}>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
          <div style={{ width: 240, minWidth: 240, borderRight: "1px solid rgba(0,0,0,0.04)" }} />
          {Object.values(months).map((m, i) => <div key={i} style={{ width: m.count * dw, fontSize: 10, fontWeight: 700, color: "#888", padding: "8px 10px", borderRight: "1px solid rgba(0,0,0,0.03)", boxSizing: "border-box" }}>{m.label}</div>)}
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)", position: "sticky", top: 0, background: "#fafaf8", zIndex: 2 }}>
          <div style={{ width: 240, minWidth: 240, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#888", borderRight: "1px solid rgba(0,0,0,0.04)" }}>할 일</div>
          {dates.map(d => { const dt = new Date(d); const isT = d === TODAY; const isWE = dt.getDay() === 0 || dt.getDay() === 6;
            return <div key={d} style={{ width: dw, textAlign: "center", padding: "7px 0", fontSize: 10, color: isT ? "#4a4660" : isWE ? "#ccc" : "#999", fontWeight: isT ? 800 : 400, background: isT ? "rgba(165,161,187,0.1)" : isWE ? "rgba(0,0,0,0.015)" : "transparent", borderBottom: isT ? "2.5px solid #a5a1bb" : "none", boxSizing: "border-box" }}><div>{dt.getDate()}</div><div style={{ fontSize: 9, marginTop: 1, opacity: 0.7 }}>{DK[dt.getDay()]}</div></div>; })}
        </div>
        {active.map(task => {
          const qq = Q.find(x => x.id === task.quadrant); const tm = T.find(x => x.id === task.team); const c = qq?.color || "#999";
          const slotL = task.timeSlot === "allday" ? "종일" : task.timeSlot === "am" ? "오전" : "오후";
          return (
            <div key={task.id} style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.02)", minHeight: 44 }}>
              <div style={{ width: 240, minWidth: 240, padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 8, borderRight: "1px solid rgba(0,0,0,0.03)", cursor: "pointer" }} onClick={() => onEdit(task)}>
                <button onClick={e => { e.stopPropagation(); onToggle(task.id); }} style={{ width: 16, height: 16, minWidth: 16, borderRadius: 5, border: `2px solid ${qq?.mid || "rgba(0,0,0,0.1)"}`, background: "transparent", cursor: "pointer" }} />
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.text}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 1 }}>
                    {tm && <span style={{ fontSize: 9, color: tm.color, fontWeight: 600 }}>{tm.label}</span>}
                    <span style={{ fontSize: 9, color: "#bbb" }}>{slotL} · {fmtS(task.startDate||TODAY)}~{fmtS(task.endDate||TODAY)}</span>
                  </div>
                </div>
              </div>
              <div style={{ position: "relative", flex: 1 }}>
                {(() => { const ti = dates.indexOf(TODAY); return ti >= 0 ? <div style={{ position: "absolute", left: ti * dw + dw / 2, top: 0, bottom: 0, width: 2, background: "rgba(165,161,187,0.35)", zIndex: 1, borderRadius: 1 }} /> : null; })()}
                {dates.map((d, i) => { const dt = new Date(d); return (dt.getDay() === 0 || dt.getDay() === 6) ? <div key={d} style={{ position: "absolute", left: i * dw, top: 0, bottom: 0, width: dw, background: "rgba(0,0,0,0.012)" }} /> : null; })}
                <GanttBar task={task} minD={minD} dw={dw} dates={dates} onUpdate={onUpdateDates} onEdit={onEdit} />
              </div>
            </div>
          );
        })}
        {!active.length && <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#ccc" }}>할 일을 추가하면 간트 차트에 표시됩니다</div>}
        {done.length > 0 && <div style={{ padding: "10px 14px", fontSize: 11, color: "#bbb", borderTop: "1px solid rgba(0,0,0,0.03)" }}>✓ 완료 {done.length}개</div>}
      </div>
      <div style={{ padding: "10px 14px", background: "#f5f4f0", borderTop: "1px solid rgba(0,0,0,0.03)", fontSize: 10, color: "#aaa", textAlign: "center" }}>바 드래그로 이동 · 양 끝 드래그로 기간 조정</div>
    </div>
  );
}
