-- Site usernames.
--
-- Not accounts and not authentication. A name is claimed first-come and bound to
-- a random token the browser keeps, so re-using it from elsewhere fails. The
-- point is only to give abuse controls something durable to attach to: you can
-- shed a username, but you have to keep picking new ones, which is tedious
-- enough to discourage casual griefing. It deliberately costs nothing in
-- privacy terms — no address is recorded here or anywhere else.
CREATE TABLE IF NOT EXISTS usernames (
  name_key   TEXT PRIMARY KEY,   -- casefolded name, the uniqueness key
  name       TEXT NOT NULL,      -- display form as typed
  token_hash TEXT NOT NULL,      -- SHA-256 of the browser's token; never the token
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

-- Which username published a listing, so one account cannot flood the directory.
ALTER TABLE lobbies ADD COLUMN host_key TEXT;
CREATE INDEX IF NOT EXISTS idx_lobbies_host_key ON lobbies (host_key);
