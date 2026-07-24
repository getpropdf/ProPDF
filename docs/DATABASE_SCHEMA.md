# ProPDF — Database Schema

## Scope

The **lean browser edition stores no database** — it keeps only the UI theme in
`localStorage`. The schema below is the **local-only SQLite** design used by the
optional **Power Pack** (batch automation, audit logs, recent files, workflow
templates). It is included here as a deliverable and a forward-compatible
reference. **No data ever leaves the machine.**

Database file (Power Pack): `%LOCALAPPDATA%\ProPDF\propdf.db`

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- App settings (key/value)
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recent files (paths only — never file contents)
CREATE TABLE recent_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT NOT NULL,
    display_name TEXT NOT NULL,
    tool_id     TEXT,                  -- which tool last touched it
    size_bytes  INTEGER,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    last_used   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recent_last_used ON recent_files(last_used DESC);

-- Audit log (actions only — no document content is stored)
CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL DEFAULT (datetime('now')),
    tool_id     TEXT NOT NULL,
    action      TEXT NOT NULL,         -- e.g. 'merge', 'ocr', 'compress'
    input_count INTEGER,
    output_count INTEGER,
    status      TEXT NOT NULL,         -- 'success' | 'error'
    detail      TEXT                   -- error message / params summary (no PII)
);
CREATE INDEX idx_audit_ts ON audit_log(ts DESC);

-- Workflow templates (saved tool + options presets)
CREATE TABLE workflows (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    steps_json  TEXT NOT NULL,         -- ordered list of {tool_id, options}
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Watch folders (batch automation)
CREATE TABLE watch_folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_path TEXT NOT NULL UNIQUE,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
    output_path TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_run    TEXT
);

-- Batch job runs
CREATE TABLE batch_jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    total       INTEGER NOT NULL DEFAULT 0,
    succeeded   INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'running'  -- running|done|cancelled|error
);
```

## Privacy notes

- **No document content** is ever written to any table — only file *paths*,
  action metadata, and user-defined settings/templates.
- The `audit_log.detail` column must never store extracted personal data; it holds
  only operation parameters and error strings.
- The entire database is local; deleting `propdf.db` removes all history.
