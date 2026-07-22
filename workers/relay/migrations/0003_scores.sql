-- Daily leaderboard for the seeded single-player games (Daily Break, Daily
-- Links). One row per user per game per day; a better score replaces the old.
--
-- HONESTY NOTE: these scores are unverifiable. The games run entirely in the
-- browser, no server ever witnesses a shot, so whatever is posted here is taken
-- on trust. Bounds checks and rate limits below stop casual nonsense, not a
-- determined person with devtools. The UI says as much rather than pretending
-- otherwise. Verifying properly would mean re-simulating the physics here from
-- a submitted shot sequence — possible for these seeded games, but a different
-- project.
--
-- As everywhere else in this Worker: no IP column, ever.
CREATE TABLE IF NOT EXISTS scores (
  id         TEXT PRIMARY KEY,   -- "<game>:<day>:<name_key>", so one entry each
  game       TEXT NOT NULL,      -- 'pool' | 'minigolf'
  day        TEXT NOT NULL,      -- 'YYYY-MM-DD', the seed the game was played on
  name_key   TEXT NOT NULL,      -- claimed username (usernames.name_key)
  name       TEXT NOT NULL,      -- display form at time of submission
  score      INTEGER NOT NULL,   -- lower is better for both of these games
  detail     TEXT,               -- short human summary, e.g. "7 shots"
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The only read pattern: today's board for one game, best first.
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (game, day, score ASC);
