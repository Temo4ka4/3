# -*- coding: utf-8 -*-
from fastapi import FastAPI, Body, Response, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx, hashlib, hmac, json, urllib.parse, time

# --- DB hookup ---
try:
    from db import get_conn
except Exception:
    import sqlite3
    def get_conn():
        return sqlite3.connect('bot.db', check_same_thread=False)

# --- Config ---
try:
    from config import TOKEN as TELEGRAM_TOKEN
except Exception:
    TELEGRAM_TOKEN = None

try:
    from config import ADMIN_IDS
except Exception:
    ADMIN_IDS = []  # список user_id админов, если есть

app = FastAPI(title="Homework Bot API", version="6.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== Helpers =====================

def ensure_tables(con):
    cur = con.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        school TEXT, city TEXT, shift TEXT,
        join_code TEXT, info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    cur.execute("""CREATE TABLE IF NOT EXISTS user_classes (
        user_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id)
    )""")

def parse_init_data(init: str):
    # Validate Telegram WebApp initData
    if not init or not TELEGRAM_TOKEN:
        return None
    try:
        parts = dict([p.split('=',1) for p in init.split('&') if '=' in p])
        hash_recv = parts.pop('hash', None)
        data_check_string = '\n'.join([f"{k}={urllib.parse.unquote_plus(v)}" for k,v in sorted(parts.items())])
        secret = hashlib.sha256(("WebAppData" + TELEGRAM_TOKEN).encode()).digest()
        h = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
        if h != hash_recv:
            return None
        user = json.loads(urllib.parse.unquote_plus(parts.get('user', '{}')))
        return {"user_id": user.get("id"), "username": user.get("username","")}
    except Exception:
        return None

def require_admin(init: str):
    u = parse_init_data(init)
    if not u:
        raise HTTPException(401, "initData invalid or missing")
    uid = u["user_id"]
    if ADMIN_IDS and uid in ADMIN_IDS:
        return u
    # else check DB table admins if exists
    with get_conn() as con:
        cur = con.cursor()
        try:
            cur.execute("SELECT 1 FROM admins WHERE user_id=?", (uid,))
            r = cur.fetchone()
            if r:
                return u
        except Exception:
            pass
    # fallback: if no ADMIN_IDS provided and no table, deny
    raise HTTPException(403, "admin required")

# ===================== Models =====================
class HWIn(BaseModel):
    date: str
    text: str

class HWDel(BaseModel):
    date: str

class ScheduleIn(BaseModel):
    kind: str
    file_id: str

class ScheduleClearIn(BaseModel):
    kind: str

class UserIdIn(BaseModel):
    user_id: int

class JoinIn(BaseModel):
    class_id: int
    join_code: str | None = None

# ===================== Auth =====================
@app.get("/auth/me")
def auth_me(init: str = ""):
    u = parse_init_data(init)
    is_admin = False
    if u:
        uid = u["user_id"]
        if ADMIN_IDS and uid in ADMIN_IDS:
            is_admin = True
        else:
            with get_conn() as con:
                cur = con.cursor()
                try:
                    cur.execute("SELECT 1 FROM admins WHERE user_id=?", (uid,))
                    is_admin = bool(cur.fetchone())
                except Exception:
                    is_admin = False
    return {"is_admin": is_admin, **(u or {})}

# ===================== Homework =====================
@app.get("/homework")
def homework(date: str):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT id, text FROM homework WHERE hw_date=?", (date,))
        row = cur.fetchone()
        if not row:
            return {"date": date, "text": "— Записей пока нет."}
        _, txt = row
        return {"date": date, "text": txt or "—"}

@app.post("/homework")
def hw_save(payload: HWIn, init: str = ""):
    require_admin(init)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute(
            "INSERT INTO homework(hw_date, text) VALUES(?, ?) "
            "ON CONFLICT(hw_date) DO UPDATE SET text=excluded.text",
            (payload.date, payload.text)
        )
    return {"ok": True}

@app.post("/homework/delete")
def hw_delete(payload: HWDel, init: str = ""):
    require_admin(init)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM homework WHERE hw_date=?", (payload.date,))
    return {"ok": True}

# ===================== Schedule =====================
@app.get("/schedule/{kind}")
def schedule(kind: str, init: str = ""):
    files = []
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT file_id FROM schedules WHERE kind=? ORDER BY id DESC LIMIT 30", (kind,))
        files = [fid for (fid,) in cur.fetchall()]
    return {"kind": kind, "files": files}

@app.post("/schedule")
def schedule_add(payload: ScheduleIn, init: str = ""):
    require_admin(init)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("INSERT INTO schedules(kind,file_id,file_unique_id) VALUES(?,?,?)",
                    (payload.kind, payload.file_id, ''))
    return {"ok": True}

@app.post("/schedule/clear")
def schedule_clear(payload: ScheduleClearIn, init: str = ""):
    require_admin(init)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM schedules WHERE kind=?", (payload.kind,))
    return {"ok": True}

# --- Telegram file proxy ---
@app.get("/file/{file_id}")
async def file_proxy(file_id: str):
    if not TELEGRAM_TOKEN:
        raise HTTPException(500, "TELEGRAM_TOKEN not configured")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getFile", params={"file_id": file_id})
        j = r.json()
        if not j.get("ok"): raise HTTPException(404, "getFile failed")
        file_path = j["result"]["file_path"]
        fr = await c.get(f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{file_path}")
        return Response(content=fr.content, media_type=fr.headers.get("content-type","image/jpeg"))

# ===================== Classes =====================
@app.get("/classes")
def classes_all():
    with get_conn() as con:
        ensure_tables(con)
        cur = con.cursor()
        cur.execute("SELECT id,title,school,city,shift,join_code,info,created_at FROM classes ORDER BY id DESC LIMIT 200")
        rows = cur.fetchall()
        return {"classes":[{"id":r[0],"title":r[1],"school":r[2],"city":r[3],"shift":r[4],"join_code":r[5],"info":r[6],"created_at":r[7]} for r in rows]}

@app.get("/classes/search")
def classes_search(q: str = ""):
    q = q.strip()
    with get_conn() as con:
        ensure_tables(con)
        cur = con.cursor()
        if q:
            like = f"%{q}%"
            cur.execute("""
                SELECT id,title,school,city,shift,join_code,info,created_at
                FROM classes
                WHERE title LIKE ? OR school LIKE ? OR city LIKE ?
                ORDER BY id DESC LIMIT 200
            """, (like,like,like))
        else:
            cur.execute("SELECT id,title,school,city,shift,join_code,info,created_at FROM classes ORDER BY id DESC LIMIT 200")
        rows = cur.fetchall()
        return {"classes":[{"id":r[0],"title":r[1],"school":r[2],"city":r[3],"shift":r[4],"join_code":r[5],"info":r[6],"created_at":r[7]} for r in rows]}

@app.post("/classes/join")
def classes_join(payload: JoinIn, init: str = ""):
    u = parse_init_data(init)
    if not u:
        raise HTTPException(401, "initData invalid or missing")
    user_id = u["user_id"]
    with get_conn() as con:
        ensure_tables(con)
        cur = con.cursor()
        cur.execute("SELECT join_code FROM classes WHERE id=?", (payload.class_id,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(404, "class not found")
        need_code = r[0] or ""
        if need_code and (payload.join_code or "") != need_code:
            raise HTTPException(403, "wrong join_code")
        cur.execute("INSERT INTO user_classes(user_id,class_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET class_id=excluded.class_id", (user_id, payload.class_id))
    return {"ok": True}

# ===================== Users =====================
@app.post("/users/block")
def user_block(payload: UserIdIn, init: str = ""):
    require_admin(init)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("UPDATE users SET muted_all=1 WHERE user_id=?", (payload.user_id,))
        if cur.rowcount == 0:
            cur.execute("INSERT INTO users(user_id, muted_all) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET muted_all=1", (payload.user_id,))
    return {"ok": True}

@app.post("/users/unblock")
def user_unblock(payload: UserIdIn, init: str = ""):
    require_admin(init)
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("UPDATE users SET muted_all=0 WHERE user_id=?", (payload.user_id,))
    return {"ok": True}

# ===================== Modes =====================
@app.get("/modes")
def modes():
    with get_conn() as con:
        cur = con.cursor()
        def f(key):
            cur.execute("SELECT value FROM flags WHERE key=?", (key,))
            r = cur.fetchone()
            return (r[0]=='1') if r else False
        return {"vacation": f("vacation"), "maintenance": f("maintenance")}

@app.post("/modes")
def set_modes(payload: dict = Body(...), init: str = ""):
    require_admin(init)
    vac = '1' if payload.get('vacation') else '0'
    maint = '1' if payload.get('maintenance') else '0'
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("INSERT INTO flags(key,value) VALUES('vacation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (vac,))
        cur.execute("INSERT INTO flags(key,value) VALUES('maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (maint,))
    return {"ok": True}

# ===================== Rebuses stats (for chart completeness) =====================
@app.get("/rebuses/top")
def rebuses_top():
    with get_conn() as con:
        cur = con.cursor()
        try:
            cur.execute("""
                SELECT rs.user_id, SUM(rs.score) as total_score, COALESCE(u.username,'') as username
                FROM rebus_stats rs LEFT JOIN users u ON u.user_id=rs.user_id
                GROUP BY rs.user_id ORDER BY total_score DESC LIMIT 20
            """)
            top = [{"user_id":uid, "username":uname, "score":score} for (uid,score,uname) in cur.fetchall()]
        except Exception:
            top = []
    return {"top": top}

# ===================== Broadcast =====================
@app.post("/broadcast")
def broadcast(payload: dict = Body(...), init: str = ""):
    require_admin(init)
    scope = payload.get("scope","all")
    text = payload.get("text","")
    # build auto texts
    if scope in ("auto_homework","auto_homework_schedule"):
        from datetime import datetime
        d = datetime.now().strftime("%Y-%m-%d")
        with get_conn() as con:
            cur = con.cursor()
            cur.execute("SELECT text FROM homework WHERE hw_date=?", (d,))
            row = cur.fetchone()
            hwtext = row[0] if row else "— Записей пока нет."
            built = f"📖 ДЗ на сегодня ({d}):\n{hwtext}"
            if scope == "auto_homework_schedule":
                built += "\n\n🗓 Расписание: смотри в панели."
        text = built
    # send to all users via Telegram
    ok = True
    details = 0
    if TELEGRAM_TOKEN:
        with get_conn() as con:
            cur = con.cursor()
            cur.execute("SELECT user_id FROM users WHERE COALESCE(muted_all,0)=0")
            users = [u for (u,) in cur.fetchall()]
        try:
            import asyncio
            async def send_all():
                async with httpx.AsyncClient(timeout=10) as c:
                    for uid in users:
                        try:
                            await c.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={"chat_id":uid,"text":text})
                        except Exception:
                            pass
            asyncio.run(send_all())
            details = len(users)
        except Exception:
            ok = False
    return {"ok": ok, "sent": details, "scope": scope}

# ===================== Stats =====================
@app.get("/stats")
def stats(init: str = ""):
    # allow admins to see detailed stats; others get public
    me = parse_init_data(init) if init else None
    with get_conn() as con:
        cur = con.cursor()
        try:
            cur.execute("SELECT COUNT(*) FROM users"); users = cur.fetchone()[0]
        except Exception: users = 0
        try:
            cur.execute("SELECT COUNT(*) FROM homework"); hws = cur.fetchone()[0]
        except Exception: hws = 0
        try:
            cur.execute("SELECT COUNT(*) FROM rebuses"); reb_count = cur.fetchone()[0]
        except Exception: reb_count = 0
        try:
            cur.execute("SELECT COUNT(*) FROM rebus_stats"); rstats = cur.fetchone()[0]
        except Exception: rstats = 0
        top = []
        try:
            cur.execute("""
                SELECT text, COUNT(*) c
                FROM events
                WHERE created_at >= datetime('now','-14 day')
                GROUP BY text
                ORDER BY c DESC
                LIMIT 12
            """)
            top = cur.fetchall()
        except Exception:
            top = []
    return {"users":users, "homework":hws, "rebuses":reb_count, "sessions":rstats, "topClicks": top}
