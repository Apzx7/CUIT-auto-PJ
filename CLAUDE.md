# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mtrafficdsys (锋御净网) — a malicious network traffic detection and analysis system. Full-stack web app for uploading PCAP files, extracting multi-protocol features (TCP/UDP, DNS, HTTP, ICMP, TLS), running YARA rule-based detection + AI analysis (Qwen-Flash via DashScope), and generating PDF reports. Built for the China College Computer Competition.

## Commands

### One-click startup
- Windows: `start.bat` (launches backend + frontend in separate windows)
- Linux/macOS: `start.sh`

### Backend (FastAPI + Uvicorn)
```bash
cd backend
conda activate mtraffic
python main.py          # starts on 127.0.0.1:8080
```

### Frontend (React + Vite)
```bash
cd frontend
npm install             # first time only
npm run dev             # starts on localhost:5173
npm run build           # production build
npm run preview         # preview production build
```

### Environment setup
```bash
conda create -n mtraffic --file conda_requirements.txt
conda activate mtraffic
```
The `conda_requirements.txt` is in conda export format, not pip format. Use conda, not pip.

## Configuration

`backend/configs/init.yaml` (gitignored, create manually) — contains MySQL, Uvicorn, CORS, and DashScope API key settings. See README_zh.md §4.1 for the YAML template.

Frontend API base URL is configured via `frontend/.env` with `VITE_API_BASE=http://127.0.0.1:8080`.

## Architecture

### High-level flow
```
PCAP upload → protocol feature extraction (dpkt) → YARA rule scanning → AI analysis (DashScope/Qwen-Flash) → result storage (MySQL) → PDF report / JSON export
```

### Backend (`backend/`)

**Entry point**: `main.py` — creates FastAPI app, registers all routers, configures CORS middleware.

**Startup lifecycle** (`src/api/startup.py`): Uses FastAPI lifespan to (1) create MySQL database if missing, (2) create all tables via SQLAlchemy `Base.metadata.create_all`, (3) pre-compile and cache YARA rules.

**Module structure** under `src/`:
- `api/` — FastAPI route handlers organized by domain (detect, export, extract, logger, packet, rules). Each subdirectory has its own router.
- `core/` — Business logic layer:
  - `conf/` — YAML config loader (`ruamel.yaml`)
  - `data/parser/` — Protocol-specific PCAP parsers using `dpkt` (DNS, HTTP, ICMP, TCP/UDP, TLS). Single-pass scanning strategy.
  - `data/manager/` — CRUD operations (adder, deleter, shower)
  - `detection/` — Two-stage detection: YARA static scanning + LLM-based AI analysis
  - `storage/` — Singleton MySQL engine/session manager (`MysqlSimClass`)
  - `rules/` — YARA rule initialization, loading, querying
  - `filter/` — Query filters for protocol, rule, time-based filtering
  - `settings.py` — All SQLAlchemy ORM models (16 tables), MySQL URL, table name constants, DNS type mappings

**Database**: MySQL via SQLAlchemy ORM. Key tables: `UPLOADED_FILE_INFO`, `DETECTION_RESULT`, protocol-specific feature tables (TCP_UDP, DNS_REQUEST/RESPONSE, HTTP_REQUEST/RESPONSE, ICMP, TLS_CERTIFICATE), `YARA_RULES_FILE`, `BLACKLIST_IP/DOMAIN`, system/business logs. Files are tracked by UUID (`fid`) as the business key.

**Singleton pattern**: `MysqlSimClass` (`src/core/storage/mysql_control.py`) manages the SQLAlchemy engine and session factory as a singleton.

### Frontend (`frontend/`)

**Stack**: React 18 + React Router v6 + Vite 5 (ES modules).

**Routing** (`src/App.jsx`): Single-page app with routes: `/dashboard`, `/files`, `/rules`, `/traffic`, `/logs`, `/exports`, `/help`. Default redirects to `/dashboard`.

**API client** (`src/api/client.js`): Thin fetch wrapper with `apiGet`, `apiPost`, `apiPostForm`, `downloadFile`. Base URL from `VITE_API_BASE` env var, defaults to `http://127.0.0.1:8080`.

**Components**: Reusable UI in `src/components/` (Layout, Sidebar, Topbar, DataTable, DonutChart, StatCard). Pages in `src/pages/`.

## Key Conventions

- All backend route handlers are FastAPI `APIRouter` instances registered in `main.py`
- New API endpoints go in `src/api/<domain>/`, business logic in `src/core/`
- Database models are defined in `src/core/settings.py` — when adding fields, sync across: model definition, API response schema, frontend column mappings, and report export
- The `fid` (UUID string) is the primary business identifier for files, used across all tables as a foreign key
- YARA rules live under `backend/src/yara-rules/` organized by category (APT, Cve, HackTool, Malware, Miner, Misc)
- Root CA certificates for TLS validation are in `backend/src/root_certs/`
- Export/report output goes to `result/export/` and `result/report/` directories
- No test framework or linter is configured in this project
