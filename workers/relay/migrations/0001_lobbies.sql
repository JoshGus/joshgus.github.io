-- Open lobby directory.
--
-- Rows are written by the room Durable Object, never by a browser: the DO is
-- the only party that actually knows a room exists and how many players are in
-- it, so a client cannot advertise a room that isn't there or lie about its
-- size.
--
-- There is deliberately NO IP COLUMN, and none should ever be added. Hiding
-- player addresses is the reason the transport is a relay at all; a public
-- directory keyed by address would hand back exactly what that bought.
CREATE TABLE IF NOT EXISTS lobbies (
  id            TEXT PRIMARY KEY,   -- "<game>:<CODE>", matches the DO name
  game          TEXT NOT NULL,
  code          TEXT NOT NULL,
  host_name     TEXT NOT NULL,      -- sanitized display name
  players       INTEGER NOT NULL,
  max_players   INTEGER NOT NULL,
  has_password  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,   -- epoch ms
  updated_at    INTEGER NOT NULL    -- epoch ms; used to hide stale rows
);

-- Listing is always "open lobbies for this game, freshest first".
CREATE INDEX IF NOT EXISTS idx_lobbies_game ON lobbies (game, updated_at DESC);
-- Sweeping stale rows scans by time across all games.
CREATE INDEX IF NOT EXISTS idx_lobbies_updated ON lobbies (updated_at);
