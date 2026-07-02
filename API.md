# FUSE Stats API v1

REST API for querying aggregate HEAT match statistics and per-session data. Hosted as a Supabase Edge Function at `/functions/v1/api-v1`.

**Base URL:** `https://jypsytkbliqrwjipolhx.supabase.co/functions/v1/api-v1`

---

## Authentication

All requests require an API key passed in one of two headers:

```
x-api-key: fuse_<base64url token>
```

or

```
Authorization: Bearer fuse_<base64url token>
```

Keys are prefixed with `fuse_` and can be minted by authenticated FUSE users.

### Rate Limiting

| Action | User Limit | Window |
|--------|-----------|--------|
| `api_v1_read` | 120 req/min | 1 min |
| `api_key_mint` | 3 req/min | 1 min |

Rate limiting is keyed on the API key's `requested_by` user ID. Exceeded requests return `429`.

### Data Access Model

A single API key can query any user's data, but users must explicitly opt in to 3rd-party API access.

---

## Endpoints

### `GET /stats`

Aggregate match statistics with optional filters and grouping.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `group_by` | `string` | no | Group results by: `vehicle`, `agent`, `map`, `mode`. Omit for global aggregate. |
| `vehicle` | `string` | no | Filter by vehicle name (e.g. `g11_leopard2k_st`). |
| `agent` | `int` | no | Filter by agent ID. |
| `map_slug` | `string` | no | Filter by map slug. |
| `game_mode` | `string` | no | Filter by game mode. |
| `player_name` | `string` | no | Filter by player username. |

**Response (200):**

```json
{
  "stats": [
    {
      "group_key": "g11_leopard2k_st",
      "total_sessions": 142,
      "avg_kills": 3.21,
      "avg_deaths": 1.87,
      "avg_assists": 2.45,
      "avg_damage": 1842.50,
      "avg_kd": 1.72,
      "win_rate": 58.2,
      "loss_rate": 38.5,
      "draw_rate": 3.3,
      "avg_duration": 312.4,
      "avg_ally_score": 4520.0,
      "avg_enemy_score": 4180.0
    }
  ],
  "group_by": "vehicle"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `group_key` | `string` | Grouping value (vehicle name, agent ID, map slug, mode, or `"all"`) |
| `total_sessions` | `int` | Number of matching sessions |
| `avg_kills` | `float` | Average kills per session |
| `avg_deaths` | `float` | Average deaths per session |
| `avg_assists` | `float` | Average assists per session |
| `avg_damage` | `float` | Average damage per session |
| `avg_kd` | `float` | Average kill/death ratio |
| `win_rate` | `float` | Win percentage (0–100) |
| `loss_rate` | `float` | Loss percentage (0–100) |
| `draw_rate` | `float` | Draw percentage (0–100) |
| `avg_duration` | `float` | Average match duration in seconds |
| `avg_ally_score` | `float` | Average ally team score |
| `avg_enemy_score` | `float` | Average enemy team score |

**Errors:**

| Status | Condition |
|--------|-----------|
| `400` | Invalid `group_by` value |
| `401` | Missing or invalid API key |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

### `GET /sessions`

List match sessions for a player. Only returns sessions from users who have opted in for 3rd party API access.

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

Get a single match session by ID. Returns full summary.

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

Get the high-resolution sample blob for a match session. Samples are retained for 90 days; older sessions return `404`.

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