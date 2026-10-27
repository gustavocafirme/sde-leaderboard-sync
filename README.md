# Star Drift Evolution - Leaderboard Sync Engine

An automated data processing and synchronization engine designed for **Star Drift Evolution**. This system processes game leaderboard CSV files, computes complex skill ratings across multiple mathematical engines (SSR, SSR-FI, Prestige Points, and Country C-SSR), and updates a Supabase PostgreSQL database.

## Architecture & Features

- **Multi-Engine Rating Calculations:**
  - **SSR & SSR-W Engine:** Weighted skill rating decay model accounting for position and gap-to-2nd tie-breakers.
  - **FI Engine:** Performance index metrics calculated relative to world record tick times across tracks.
  - **Prestige Points Engine:** Competitive ranking point distribution system.
  - **Country C-SSR Engine:** Country leaderboard aggregated score calculations using official country assignments.
- **Selective Synchronization:** Flexible argument parsing allowing isolated or batch updates for tracks, master cars, player metadata, and global leaderboards.
- **Data Integrity & Normalization:** Unified country acronym mapping, alias resolution, and automated row updates via Supabase upserts.

## Command-Line Arguments

The sync engine accepts CLI flags to control execution scope and save server resources:

| Flag | Description |
| :--- | :--- |
| `--fetchall` or `fetchall` | Synchronizes all static master tables (cars, tracks) and executes full leaderboard/player/country rating processing. |
| `--tracks` | Forces synchronization of the `tracks` master table from `tracks.csv`. |
| `--cars` | Forces synchronization of the `cars` master table from `cars.csv`. |
| `--countries` | Enables country metadata updates alongside ratings. |
| `--noplayersandleaderboards` | Bypasses main leaderboard calculations, player updates, and C-SSR database writes. |

## Prerequisites

- **Node.js** (v16+ recommended)
- **Supabase Account** with an active PostgreSQL database.
- Extracted game data files located inside `UserData/LeaderboardTracking/`.

## Environment Setup

Create a `.env` file in the project root with your Supabase credentials:

```env
SUPABASE_URL=[https://your-supabase-project.supabase.co](https://your-supabase-project.supabase.co)
SUPABASE_ANON_KEY=your-supabase-anon-key
GAME_TRACKING_DIR=path/to/UserData/LeaderboardTracking # Optional override
```
**Security Note:** *Never commit your* `.env` *file to version control. Ensure* `.env` *is listed in your* `.gitignore`*.*

## Usage
Run the sync process using Node.js:
```
# Standard sync (processes leaderboards, players, and country C-SSR)
node index.js

# Full sync including static master tables (cars and tracks)
node index.js --fetchall

# Sync only cars and tracks without processing leaderboards
node index.js --cars --tracks --noplayersandleaderboards
```