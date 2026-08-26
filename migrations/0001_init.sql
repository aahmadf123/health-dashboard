-- Health Dashboard schema.
--
-- Every synced row carries three timestamps, and the split between the first
-- two matters:
--
--   updated_at      the CLIENT's wall clock. The only input to last-write-wins.
--                   The Worker never overwrites it.
--   server_seen_at  the WORKER's clock, stamped on every write. The only input
--                   to the pull cursor.
--   deleted_at      non-null marks a tombstone. The row stays so the deletion
--                   reaches other devices instead of them resurrecting it.
--
-- Using updated_at as the pull cursor as well would mean a device with a slow
-- clock writes rows stamped in the past, which another device's cursor has
-- already passed, so those rows would never be delivered. Splitting the clocks
-- keeps skew confined to conflict resolution, where it is bounded and harmless.
--
-- Payload columns are nullable because a tombstone carries no payload; the
-- CHECK constraints put the model's required fields back for live rows, so a
-- malformed write fails in the database rather than corrupting a chart.
--
-- Migrations must be additive. The previous Worker version is still serving
-- during a rollout, so never drop or rename a column here.

CREATE TABLE scale (
  id             TEXT PRIMARY KEY,
  date_time      TEXT,
  ts             INTEGER,   -- epoch ms, derived; lets rollups shift to local time
  weight_lb                REAL,
  bmi                      REAL,
  body_fat_pct             REAL,
  muscle_mass_lb           REAL,
  muscle_mass_pct          REAL,
  body_water_pct           REAL,
  lean_body_mass_lb        REAL,
  bone_mass_lb             REAL,
  protein_pct              REAL,
  visceral_fat             REAL,
  bmr                      REAL,
  metabolic_age            REAL,
  skeletal_muscle_lb       REAL,
  skeletal_muscle_rate_pct REAL,
  fat_content_lb           REAL,
  subcutaneous_fat_pct     REAL,
  notes                    TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date_time IS NOT NULL AND ts IS NOT NULL AND weight_lb IS NOT NULL))
);
CREATE INDEX scale_seen ON scale(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX scale_live ON scale(ts) WHERE deleted_at IS NULL;

CREATE TABLE vitals (
  id             TEXT PRIMARY KEY,
  date_time      TEXT,
  ts             INTEGER,   -- epoch ms, derived; lets rollups shift to local time
  systolic  REAL,
  diastolic REAL,
  pulse     REAL,
  notes     TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date_time IS NOT NULL AND ts IS NOT NULL AND systolic IS NOT NULL AND diastolic IS NOT NULL))
);
CREATE INDEX vitals_seen ON vitals(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX vitals_live ON vitals(ts) WHERE deleted_at IS NULL;

CREATE TABLE labs (
  id             TEXT PRIMARY KEY,
  date           TEXT,      -- YYYY-MM-DD
  source TEXT,
  notes  TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date IS NOT NULL AND source IS NOT NULL))
);
CREATE INDEX labs_seen ON labs(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX labs_live ON labs(date) WHERE deleted_at IS NULL;

CREATE TABLE injections (
  id             TEXT PRIMARY KEY,
  date_time      TEXT,
  ts             INTEGER,   -- epoch ms, derived; lets rollups shift to local time
  medication TEXT,
  dose_mg    REAL,
  site       TEXT,
  notes      TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date_time IS NOT NULL AND ts IS NOT NULL AND medication IS NOT NULL AND dose_mg IS NOT NULL))
);
CREATE INDEX injections_seen ON injections(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX injections_live ON injections(ts) WHERE deleted_at IS NULL;

CREATE TABLE measurements (
  id             TEXT PRIMARY KEY,
  date           TEXT,      -- YYYY-MM-DD
  neck_in        REAL,
  chest_in       REAL,
  waist_in       REAL,
  hips_in        REAL,
  left_arm_in    REAL,
  right_arm_in   REAL,
  left_thigh_in  REAL,
  right_thigh_in REAL,
  notes          TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date IS NOT NULL))
);
CREATE INDEX measurements_seen ON measurements(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX measurements_live ON measurements(date) WHERE deleted_at IS NULL;

CREATE TABLE sleep (
  id             TEXT PRIMARY KEY,
  date           TEXT,      -- YYYY-MM-DD
  hours   REAL,
  quality REAL,
  notes   TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date IS NOT NULL AND hours IS NOT NULL))
);
CREATE INDEX sleep_seen ON sleep(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX sleep_live ON sleep(date) WHERE deleted_at IS NULL;

CREATE TABLE journal (
  id             TEXT PRIMARY KEY,
  date_time      TEXT,
  ts             INTEGER,   -- epoch ms, derived; lets rollups shift to local time
  tags     TEXT,
  severity REAL,
  notes    TEXT,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  server_seen_at INTEGER NOT NULL,
  CHECK (deleted_at IS NOT NULL OR (date_time IS NOT NULL AND ts IS NOT NULL AND json_valid(tags)))
);
CREATE INDEX journal_seen ON journal(server_seen_at);
-- Every trends query filters on live rows, so the index does too.
CREATE INDEX journal_live ON journal(ts) WHERE deleted_at IS NULL;
-- Markers are normalized rather than a JSON column on the panel. A panel and
-- its markers still sync as one unit, matching how the importer's
-- mergeLabPanels treats them, so markers need no timestamps of their own and
-- are replaced wholesale whenever their panel is written. The reason to
-- normalize is markers_name below: charting one marker across the whole
-- history becomes a single indexed query instead of a scan over every panel.
CREATE TABLE lab_markers (
  panel_id   TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  value      REAL,               -- null for non-numeric values such as ">17.5"
  value_text TEXT NOT NULL,
  unit       TEXT NOT NULL,
  ref_low    REAL,
  ref_high   REAL,
  status     TEXT NOT NULL,
  PRIMARY KEY (panel_id, name)
);
CREATE INDEX lab_markers_name ON lab_markers(name);

-- Settings is a single row. The injectionSchedule sub-object is flattened.
CREATE TABLE settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  units                  TEXT    NOT NULL DEFAULT 'lb'     CHECK (units IN ('lb','kg')),
  theme                  TEXT    NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  height_in              REAL,
  goal_weight_lb         REAL,
  schedule_medication    TEXT    NOT NULL DEFAULT 'Wegovy (semaglutide)',
  schedule_dose_mg       REAL    NOT NULL DEFAULT 0.25,
  schedule_interval_days REAL    NOT NULL DEFAULT 7,
  updated_at             INTEGER NOT NULL DEFAULT 0,
  server_seen_at         INTEGER NOT NULL DEFAULT 0
);
-- server_seen_at = 0 keeps this seed row invisible to a first pull, so a new
-- device is not handed defaults that would clobber its own settings.
INSERT INTO settings (id) VALUES (1);
