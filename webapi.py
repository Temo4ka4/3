# -*- coding: utf-8 -*-
"""
FastAPI backend for Homework Bot web panel.
Run with: uvicorn webapi:app --host 0.0.0.0 --port 8000
Place this file next to your existing Python bot so it can import db.get_conn.
"""
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any
import datetime as dt

try:
    from db import get_conn
except Exception:
    # fallback: local sqlite file named bot.db in the same folder
    import sqlite3
    def get_conn():
        return sqlite3.connect('bot.db', check_same_thread=False)

app = FastAPI(title="Homework Bot API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/homework")
def homework(date: str):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT id, text FROM homework WHERE hw_date=?", (date,))
        row = cur.fetchone()
        if not row:
            return {"date": date, "text": "— Записей пока нет."}
        hid, txt = row
        return {"date": date, "text": txt or "—"}

@app.get("/schedule/{kind}")
def schedule(kind: str):
    files = []
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT file_id, file_unique_id FROM schedules WHERE kind=? ORDER BY id DESC LIMIT 10", (kind,))
        for fid, _ in cur.fetchall():
            # In Telegram, file_id is not directly downloadable; expose as opaque id
            files.append(f"telegram-file:{fid}")
    return {"kind": kind, "files": files}

@app.get("/rebuses")
def rebuses():
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT kind, payload, answer, COALESCE(difficulty,'medium') FROM rebuses ORDER BY id DESC LIMIT 100")
        items = [{"kind":k,"payload":p,"answer":a,"difficulty":d} for (k,p,a,d) in cur.fetchall()]
    return {"items": items}

@app.get("/rebuses/top")
def rebuses_top():
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("""
        SELECT rs.user_id, SUM(rs.score) as total_score, COALESCE(u.username,'') as username
        FROM rebus_stats rs LEFT JOIN users u ON u.user_id=rs.user_id
        GROUP BY rs.user_id ORDER BY total_score DESC LIMIT 20
        """)
        top = [{"user_id":uid, "username":uname, "score":score} for (uid,score,uname) in cur.fetchall()]
    return {"top": top}

@app.get("/users")
def users():
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT user_id, username, first_name, muted_all FROM users ORDER BY created_at DESC LIMIT 100")
        rows = [{"user_id":u, "username":un, "first_name":fn, "muted_all":ma} for (u,un,fn,ma) in cur.fetchall()]
    return {"users": rows}

@app.get("/users/{user_id}")
def user(user_id: int):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT user_id, username, first_name, muted_all FROM users WHERE user_id=?", (user_id,))
        row = cur.fetchone()
        if not row: return {"user": None}
        u, un, fn, ma = row
        return {"user": {"user_id":u, "username":un, "first_name":fn, "muted_all":ma}}

@app.get("/classes")
def classes():
    # No classes table in the current DB; return placeholder for compatibility
    return {"classes": []}

@app.get("/classes/{class_id}")
def class_by_id(class_id: int):
    return {"cls": None}

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
def set_modes(payload: Dict[str, Any] = Body(...)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("INSERT INTO flags(key,value) VALUES('vacation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ('1' if payload.get('vacation') else '0',))
        cur.execute("INSERT INTO flags(key,value) VALUES('maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ('1' if payload.get('maintenance') else '0',))
    return {"ok": True}

@app.post("/broadcast")
def broadcast(payload: Dict[str, Any] = Body(...)):
    # This is just a stub. Real broadcast should be done by your bot via telebot.
    return {"ok": True, "accepted": True, "scope": payload.get("scope","all")}

@app.get("/stats")
def stats():
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM users"); users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM homework"); hws = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM rebus_stats"); rstats = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM rebuses"); reb_count = cur.fetchone()[0]
        cur.execute("SELECT text, COUNT(*) c FROM events WHERE created_at >= datetime('now','-14 day') GROUP BY text ORDER BY c DESC LIMIT 8")
        top = cur.fetchall()
    return {"users":users, "homework":hws, "rebuses":reb_count, "sessions":rstats, "topClicks": top}
