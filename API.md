# FUSE Stats API v1

REST API for querying aggregate HEAT match statistics and per-session data. Hosted as a Supabase Edge Function at `/functions/v1/api-v1`.

**Base URL:** `https://jypsytkbliqrwjipolhx.supabase.co/functions/v1/api-v1`

---

## Authentication

The API supports two access tiers:

### Public (no key)

The `/stats` endpoint is publicly accessible without an API key. No registration required.

### Authenticated (API key)

All other endpoints require an API key passed in one of two headers:

```
x-api-key: fuse_<base64url token>
```

or

```
Authorization: Bearer fuse_<base64url token>
```

Keys are prefixed with `fuse_` and can be minted by authenticated FUSE users from their profile page.

### Rate Limiting

| Tier | Limit | Window | Keyed On |
|------|-------|--------|----------|
| Public (no key) | 20 req/min | 1 min | Client IP |
| Authenticated | 120 req/min | 1 min | API key user ID |

Exceeded requests return `429`. Public 429 responses include a message suggesting authentication for higher limits.

### Data Access Model

Stats are aggregated from all users who have opted in to 3rd-party API access. Session-level endpoints require an API key and respect the same opt-in.

---

## Endpoints

### `GET /stats`

Aggregate match statistics with optional filters and grouping. **Public** — no API key required.

When called without `player_name`, returns aggregate stats across all opted-in players. When called with `player_name`, returns stats for that player only.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `player_name` | `string` | no | Filter to a specific player. Omit for cross-player global stats. |
| `group_by` | `string` | no | Group results by: `vehicle`, `role`, `map`, `mode`, `agent`, `player`. Omit for a single aggregate row. |
| `vehicle` | `string` | no | Filter by vehicle name (e.g. `g11_leopard2k_st`). |
| `agent` | `int` | no | Filter by agent ID. |
| `map_slug` | `string` | no | Filter by map slug (e.g. `03_sunstroke`). |
| `game_mode` | `string` | no | Filter by game mode (e.g. `Conquest`, `Control`). |

Filters and `group_by` can be combined freely. For example, `?group_by=vehicle&game_mode=Conquest` returns per-vehicle stats filtered to Conquest mode only.

**Response (200):**

```json
{
  "stats": [
    {
      "group_key": "g11_leopard2k_st",
      "total_sessions": 33,

      "avg_kills": 8.58,
      "avg_deaths": 2.15,
      "avg_assists": 2.73,
      "avg_damage": 27976.2,
      "avg_score": 3842.1,
      "avg_kd": 3.99,
      "max_damage": 52410,

      "win_rate": 42.4,
      "loss_rate": 54.5,
      "draw_rate": 3.0,
      "wins": 14,
      "losses": 18,
      "draws": 1,

      "avg_duration": 612.3,
      "avg_ally_score": 948.2,
      "avg_enemy_score": 1021.5,

      "damage_per_kill": 3260.6,
      "kills_per_min": 0.84,
      "score_per_min": 376.5,

      "pm_sessions": 15,
      "hit_rate": 62.1,
      "crit_rate": 41.8,
      "shell_dmg_pct": 38.2,
      "ability_dmg_pct": 7.5,
      "blocked_dmg_pct": 4.1,
      "ramming_dmg_pct": 1.2,
      "dmg_taken_ratio": 24.3,
      "total_heal": 28400,
      "captures_per_game": 1.3,

      "team_sessions": 15,
      "dmg_share": 52.4,
      "kill_share": 58.1,
      "death_share": 18.2,
      "team_kd": 1.05,
      "enemy_kd": 0.92
    }
  ],
  "group_by": "vehicle"
}
```

Results are sorted by `total_sessions` descending.

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `group_key` | `string` | Grouping value (vehicle name, role, map slug, mode, agent ID, player name, or `"all"`) |
| `total_sessions` | `int` | Number of matching sessions |
| | | **Core Averages** |
| `avg_kills` | `float` | Average kills per session |
| `avg_deaths` | `float` | Average deaths per session |
| `avg_assists` | `float` | Average assists per session |
| `avg_damage` | `float` | Average damage per session |
| `avg_score` | `float` | Average score per session |
| `avg_kd` | `float` | Overall kill/death ratio (total kills / total deaths) |
| `max_damage` | `int` | Highest damage in a single session |
| | | **Win/Loss** |
| `win_rate` | `float` | Win percentage (0–100) |
| `loss_rate` | `float` | Loss percentage (0–100) |
| `draw_rate` | `float` | Draw percentage (0–100) |
| `wins` | `int` | Total wins |
| `losses` | `int` | Total losses |
| `draws` | `int` | Total draws |
| | | **Duration & Scores** |
| `avg_duration` | `float` | Average match duration in seconds |
| `avg_ally_score` | `float` | Average ally team score |
| `avg_enemy_score` | `float` | Average enemy team score |
| | | **Efficiency** |
| `damage_per_kill` | `float` | Average damage dealt per kill |
| `kills_per_min` | `float` | Kills per minute of play |
| `score_per_min` | `float` | Score per minute of play |
| | | **Combat Breakdown** (from post-match data) |
| `pm_sessions` | `int` | Sessions with post-match data (subset of `total_sessions`) |
| `hit_rate` | `float` | Shot hit percentage (0–100) |
| `crit_rate` | `float` | Critical hit percentage of hits (0–100) |
| `shell_dmg_pct` | `float` | Shell damage as % of total damage |
| `ability_dmg_pct` | `float` | Ability damage as % of total damage |
| `blocked_dmg_pct` | `float` | Blocked damage as % of total damage |
| `ramming_dmg_pct` | `float` | Ramming damage as % of total damage |
| `dmg_taken_ratio` | `float` | Damage taken as % of damage dealt |
| `total_heal` | `float` | Total healing done |
| `captures_per_game` | `float` | Average base captures per session |
| | | **Team Contribution** (from sessions with team data) |
| `team_sessions` | `int` | Sessions with team data (subset of `total_sessions`) |
| `dmg_share` | `float` | Player's damage as % of ally team total |
| `kill_share` | `float` | Player's kills as % of ally team total |
| `death_share` | `float` | Player's deaths as % of ally team total |
| `team_kd` | `float` | Ally team overall K/D |
| `enemy_kd` | `float` | Enemy team overall K/D |

**Example Queries:**

```
GET /stats                                          → global aggregate, all players
GET /stats?player_name=AET3RNAL                     → single player aggregate
GET /stats?group_by=vehicle                         → per-vehicle stats, all players
GET /stats?group_by=player                          → per-player leaderboard
GET /stats?group_by=vehicle&game_mode=Conquest      → vehicles in Conquest mode
GET /stats?group_by=map&player_name=AET3RNAL        → per-map stats for one player
GET /stats?group_by=player&map_slug=06_aircraftcarrier  → player leaderboard on a specific map
```

**Errors:**

| Status | Condition |
|--------|-----------|
| `400` | Invalid `group_by` value |
| `403` | Player specified by `player_name` has not enabled API access |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

### `GET /sessions`

List match sessions for a player. **Requires API key.** Only returns sessions from users who have opted in for 3rd-party API access.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `player_name` | `string` | **yes** | — | Player username to query |
| `limit` | `int` | no | `50` | Max results per page (capped at 100) |
| `offset` | `int` | no | `0` | Pagination offset |

**Response (200):**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "session_id": "abc123",
      "started_at": "2026-07-01T12:00:00Z",
      "ended_at": "2026-07-01T12:08:30Z",
      "duration_s": 510.0,
      "outcome": "win",
      "map_slug": "03_sunstroke",
      "map_name": "SUNSTROKE",
      "game_mode": "Control",
      "player_name": "Player1",
      "player_vehicle": "g11_leopard2k_st",
      "player_role": "marksman",
      "player_agent_id": 29,
      "final_kills": 5,
      "final_deaths": 2,
      "final_assists": 3,
      "final_damage": 2400,
      "final_ally_score": 2,
      "final_enemy_score": 0,
      "peak_ping": 45,
      "avg_ping": 32.5,
      "avg_fps": 60.0,
      "sample_count": 102,
      "client_version": "1.2.3",
      "created_at": "2026-07-01T12:08:35Z"
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| `400` | Missing `player_name` |
| `401` | Missing or invalid API key |
| `403` | Player has not enabled API access |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

### `GET /sessions/:id`

Get a single match session by ID. **Requires API key.** Returns full summary.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | `string` | Session UUID |

**Response (200):**

```json
{
  "session": {
    "id": "uuid",
    "user_id": "uuid",
    "session_id": "abc123",
    "started_at": "2026-07-01T12:00:00Z",
    "ended_at": "2026-07-01T12:08:30Z",
    "duration_s": 510.0,
    "outcome": "win",
    "map_slug": "03_sunstroke",
    "map_name": "SUNSTROKE",
    "game_mode": "Control",
    "player_name": "Player1",
    "player_vehicle": "g11_leopard2k_st",
    "player_role": "marksman",
    "player_agent_id": 29,
    "final_kills": 5,
    "final_deaths": 2,
    "final_assists": 3,
    "final_damage": 2400,
    "final_ally_score": 2,
    "final_enemy_score": 0,
    "peak_ping": 45,
    "avg_ping": 32.5,
    "avg_fps": 60.0,
    "sample_count": 102,
    "client_version": "1.2.3",
    "created_at": "2026-07-01T12:08:35Z"
  }
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid API key |
| `403` | Player has not enabled API access |
| `404` | Session not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

### `GET /sessions/:id/samples`

Get the high-resolution sample blob for a match session. **Requires API key.** Samples are retained for 90 days; older sessions return `404`.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | `string` | Session UUID |

**Response (200):**

```json
{
  "session_id": "uuid",
  "samples": [
    {
      "t": 5,
      "hp": 100,
      "en": 80,
      "bo": 100,
      "pi": 45,
      "fp": 120,
      "al": 0,
      "es": 0,
      "ki": 0,
      "de": 0,
      "as": null,
      "da": 0,
      "ms": 3,
      "dki": 0,
      "dde": 0,
      "das": 0,
      "dda": 0,
      "dal": 0,
      "des": 0
    }
  ]
}
```

**Sample Fields:**

| Key | Type | Description |
|-----|------|-------------|
| `t` | `int` | Timestamp offset from match start (seconds) |
| `hp` | `int` | Vehicle health |
| `en` | `int` | Energy / mana |
| `bo` | `int` | Boost energy (0–100) |
| `pi` | `int` | Ping (ms) |
| `fp` | `int` | FPS |
| `al` | `int` | Ally score |
| `es` | `int` | Enemy score |
| `ki` | `int` | Cumulative kills |
| `de` | `int` | Cumulative deaths |
| `as` | `int\|null` | Cumulative assists |
| `da` | `int` | Cumulative damage |
| `ms` | `int` | Match state |
| `dki` | `int` | Delta kills since last sample |
| `dde` | `int` | Delta deaths since last sample |
| `das` | `int\|null` | Delta assists since last sample |
| `dda` | `int` | Delta damage since last sample |
| `dal` | `int` | Delta ally score since last sample |
| `des` | `int` | Delta enemy score since last sample |

**Errors:**

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid API key |
| `403` | Player has not enabled API access |
| `404` | Session or samples not found (samples purged after 90 days) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---
