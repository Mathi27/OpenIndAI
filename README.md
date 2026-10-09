# OpenIndustri-AI

An interactive 3D industrial safety training game that runs in your browser.

You play a new maintenance technician in a fictional petrochemical plant. Your job is to decide whether it's safe to start work on a stopped pump. You walk the plant in first person, talk to your supervisor, inspect equipment and documents, and make a go / no-go decision. After that you answer a short knowledge check and see your results.

Everything runs **locally on your own computer**. There are no cloud services, no accounts with outside companies, and no AI models.

> ⚠️ **Training simulation only.** The safety content is a provisional teaching scenario that still needs review by a qualified safety expert. It is not a real procedure, and game scores are not a professional qualification.

---

## How it works (in one minute)

The project has two parts that run at the same time:

| Part | What it is | Runs on |
|------|------------|---------|
| **Backend** (`backend/`) | A Python (FastAPI) server. It handles logins, saves progress in a local SQLite file and checks every game action. | `http://127.0.0.1:8000` |
| **Frontend** (`frontend/`) | The game itself (Babylon.js + TypeScript), served by Vite. | `http://127.0.0.1:5173` ← **open this one** |

You will open **two terminal windows**, one for each part, and keep both running while you play.

---

## 1. Install the requirements (one time only)

You need **Python 3.11 or newer** and **Node.js 22 or newer**. Git is optional; it's only needed if you clone instead of downloading a ZIP.

### macOS

1. Open the **Terminal** app (press `⌘ Space`, type *Terminal*, press Enter).
2. Check what you already have:
   ```bash
   python3 --version
   node --version
   ```
   You need `Python 3.11` or higher and `v22` or higher.
3. If either is missing or too old, install it from the official site:
   - Python: <https://www.python.org/downloads/macos/>. Run the downloaded installer.
   - Node.js: <https://nodejs.org/>. Choose the **LTS** version and run the installer.

   (If you use [Homebrew](https://brew.sh/), `brew install python node` also works.)
4. Close Terminal, open it again, and repeat step 2 to confirm.

### Windows 10 / 11

1. Install **Python** from <https://www.python.org/downloads/windows/>.
   - ✅ On the first installer screen, **tick "Add python.exe to PATH"**. This is important.
2. Install **Node.js** from <https://nodejs.org/>. Choose the **LTS** version and keep the default options.
3. Open **PowerShell** (press the Windows key, type *PowerShell*, press Enter) and check:
   ```powershell
   python --version
   node --version
   ```
   You need `Python 3.11` or higher and `v22` or higher. If a command is "not recognized", restart your computer and try again.

> **Windows tip:** throughout this guide, Windows commands use `python`, while macOS commands use `python3`.

---

## 2. Get the project

Either download the project as a ZIP and unzip it, or clone it with Git:

```bash
git clone <repository-url> OpenIndustriAI
```

Then open a terminal **inside the project folder**:

- macOS: `cd ~/Desktop/OpenIndustriAI` (adjust to wherever you put it)
- Windows: `cd $HOME\Desktop\OpenIndustriAI`

---

## 3. Set up the backend (one time only)

This creates a private Python environment (`.venv`) inside `backend/` and installs the server's libraries into it.

**macOS**
```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

**Windows (PowerShell)**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

You don't need to "activate" the environment. The commands above and below call its Python directly.

---

## 4. Set up the frontend (one time only)

From the project folder:

```bash
cd frontend
npm install
```

This downloads the game's libraries into `frontend/node_modules` (a few hundred MB). It can take a few minutes the first time.

---

## 5. Run the project

You need **two terminals open at the same time**.

### Terminal 1: start the backend

**macOS**
```bash
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Windows (PowerShell)**
```powershell
cd backend
.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Wait until you see `Uvicorn running on http://127.0.0.1:8000`. On the very first start, it also creates the database file `backend/data/openindustri.db` and the demo accounts listed below.

### Terminal 2: start the frontend

Same command on macOS and Windows:

```bash
cd frontend
npm run dev
```

Wait until you see `Local: http://127.0.0.1:5173/`.

### Open the game

Go to **<http://127.0.0.1:5173>** in **Google Chrome** (recommended) or Safari.

### Stop the project

Press `Ctrl + C` in each terminal. Your progress is saved in `backend/data/openindustri.db` and will still be there next time.

---

## 6. Log in and play

These **demo accounts** are created automatically for local use:

| Username | Password | Use it for |
|----------|----------|------------|
| `trainee.dev` | `Trainee#2026` | Playing straight away. The profile is already set up. |
| `trainee.new` | `Trainee#2026` | Trying the full setup flow (industry → role → experience). |
| `admin.dev` | `Admin#2026` | Viewing all trainee results (use **Admin Login**). |

You can also create your own trainee account with **Trainee Login → Create an account**.

**To play the mission:**

1. Log in as `trainee.dev` and click **Start Simulation**.
2. Under *Hazard Recognition → Level 1*, click **Start mission** on **The Silent Pump**.
3. Click inside the 3D view to capture the mouse, then follow the objective in the top-left corner.

### Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move (hold `Shift` to walk faster) |
| Mouse | Look around (click the view first) |
| `E` | Talk / inspect / use the highlighted object |
| `C` | Handheld checklist |
| `T` | Toolbox (`1` `2` `3` to switch tools quickly) |
| `M` | Bigger / smaller minimap |
| `I` | Mission instructions |
| `H` | Ask for a hint |
| `Esc` | Pause menu (restart, settings, exit) |

**Language:** use the **English / தமிழ் / हिन्दी** buttons on the welcome screen, the main menu or in Settings. The whole mission, including dialogue and the knowledge check, switches language.

If you refresh the page or exit mid-mission, use **Continue Training** in the main menu to pick up where you left off.

---

## 7. Run the tests (optional)

**Backend tests.** From `backend/`:
- macOS: `.venv/bin/python -m pytest`
- Windows: `.venv\Scripts\python -m pytest`

**Frontend unit tests and type checks.** From `frontend/`:
```bash
npm test
npm run typecheck
```

**Full browser tests.** These play the whole mission in English, Tamil and Hindi, including the unsafe path, refresh recovery and admin checks. From `frontend/`:
```bash
npx playwright install chromium   # one time only, downloads a test browser
npm run test:e2e
```
The browser tests start their own temporary backend (port 8011) and frontend (port 5183) with a throwaway database, so they never change your real progress. Stop the normal servers first only if those ports are busy.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **"Cannot reach the local training server"** in the game | The backend isn't running. Start Terminal 1 (step 5) and refresh the page. |
| **`Port 8000 / 5173 is already in use`** | An old copy is still running. Close the other terminal, or restart your computer. |
| **`python` / `node` is not recognized (Windows)** | Re-run the installer and tick **Add to PATH** (Python), then restart your computer. |
| **`npm install` fails with an engine/version error** | Your Node.js is too old. Install the current **LTS** from <https://nodejs.org/>. |
| **Black screen or "3D graphics (WebGL) are not available"** | Use an up-to-date Chrome. In Chrome, go to **Settings → System** and turn on **Use graphics acceleration when available**, then restart Chrome. |
| **Mouse look doesn't work** | Click once inside the 3D view. If your browser blocks mouse capture, hold the **right mouse button** and drag, or use the **arrow keys**. |
| **No sound** | Browsers only allow sound after your first click. Click anywhere, and check the volume and mute options in **Settings**. |
| **Want to start fresh** | Stop the backend, delete `backend/data/openindustri.db`, and start it again. All progress and accounts are reset, and the demo accounts are recreated. |

---

## Project layout

```
OpenIndustriAI/
├── backend/            Python FastAPI server (login, progress, scoring, admin)
│   ├── app/            Server code
│   ├── data/           Local SQLite database (created on first run)
│   └── tests/          Backend tests (pytest)
├── frontend/           The browser game (Babylon.js + TypeScript + Vite)
│   ├── src/game/       3D world, player, HUD, dialogue, story flow
│   ├── src/ui/         Menus and screens
│   ├── src/i18n/       English, Tamil and Hindi text
│   ├── tests/          Unit tests (Vitest)
│   └── e2e/            Full browser tests (Playwright)
└── shared/             Content used by both parts
    ├── missions/       Mission definitions (steps, rules, dialogue, variants)
    ├── content/        Question bank, reference list, industry catalogues
    └── test-vectors/   Scenarios that both mission engines must agree on
```

---

## Current status

- **Playable:** *The Silent Pump* (Oil & Gas, Mechanical Maintenance Technician, Level 1), from start to finish in all three languages, with three scenario variants that rotate on each attempt.
- **Not yet playable:** every other mission is shown as **Upcoming**. The Heavy Manufacturing and Construction 3D worlds are not built yet.
- **Content review:** the safety rules, knowledge-check questions and references are drafts marked *UNVERIFIED — not for authoritative assessment*. The Tamil and Hindi texts are draft translations awaiting native-speaker review.
