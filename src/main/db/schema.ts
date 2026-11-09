// Database schema. Each migration runs once, in order; never edit a released one, add a new one.
export const migrations: string[] = [
  `
  CREATE TABLE country_profile (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,            -- ISO code, e.g. LB
    name TEXT NOT NULL,
    base_currency TEXT NOT NULL,          -- pricing currency, e.g. USD
    local_currency TEXT,                  -- e.g. LBP
    vat_pct TEXT NOT NULL,                -- decimals stored as text to keep exact values
    default_standard TEXT NOT NULL,       -- POMI, CESMM4, NRM2, CLIENT
    units TEXT NOT NULL DEFAULT 'metric',
    languages TEXT NOT NULL DEFAULT 'en'  -- comma list, e.g. en,ar,fr
  );

  CREATE TABLE city (
    id INTEGER PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES country_profile(id),
    name TEXT NOT NULL,
    cost_factor TEXT NOT NULL DEFAULT '1'
  );

  CREATE TABLE library (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    country_id INTEGER NOT NULL REFERENCES country_profile(id),
    kind TEXT NOT NULL CHECK (kind IN ('master','project')),
    source_library_id INTEGER REFERENCES library(id)
  );

  CREATE TABLE resource (
    id INTEGER PRIMARY KEY,
    library_id INTEGER NOT NULL REFERENCES library(id),
    code TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('material','labor','equipment','subcontract')),
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    UNIQUE (library_id, code)
  );

  CREATE TABLE price (
    id INTEGER PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    supplier TEXT,
    source TEXT,
    valid_from TEXT NOT NULL              -- ISO date
  );

  CREATE TABLE project (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    client TEXT,
    country_id INTEGER NOT NULL REFERENCES country_profile(id),
    city_id INTEGER REFERENCES city(id),
    currency TEXT NOT NULL,
    vat_pct TEXT NOT NULL,
    standard TEXT NOT NULL,
    library_id INTEGER REFERENCES library(id),
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE estimate (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','locked')),
    exchange_rate TEXT,                   -- local currency per base currency unit
    exchange_rate_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, revision)
  );

  CREATE TABLE wbs_node (
    id INTEGER PRIMARY KEY,
    estimate_id INTEGER NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES wbs_node(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE boq_section (
    id INTEGER PRIMARY KEY,
    estimate_id INTEGER NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES boq_section(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    standard_ref TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE boq_item (
    id INTEGER PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES boq_section(id) ON DELETE CASCADE,
    wbs_node_id INTEGER REFERENCES wbs_node(id),
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '0',   -- manual quantity, or sum of takeoff lines
    quantity_from_takeoff INTEGER NOT NULL DEFAULT 1,
    rate_mode TEXT NOT NULL DEFAULT 'buildup' CHECK (rate_mode IN ('buildup','lump_sum','subcontract')),
    fixed_rate TEXT,                      -- used when rate_mode is not buildup
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE takeoff_line (
    id INTEGER PRIMARY KEY,
    boq_item_id INTEGER NOT NULL REFERENCES boq_item(id) ON DELETE CASCADE,
    description TEXT,
    drawing_ref TEXT,
    count TEXT, length TEXT, width TEXT, height TEXT,
    deduct INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE buildup_line (
    id INTEGER PRIMARY KEY,
    boq_item_id INTEGER NOT NULL REFERENCES boq_item(id) ON DELETE CASCADE,
    resource_id INTEGER NOT NULL REFERENCES resource(id),
    consumption TEXT NOT NULL,
    waste_pct TEXT NOT NULL DEFAULT '0'
  );

  CREATE TABLE markup (
    id INTEGER PRIMARY KEY,
    estimate_id INTEGER NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('site_overhead','head_office','risk','profit','other')),
    name TEXT NOT NULL,
    percent TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE app_user (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('estimator','reviewer','admin'))
  );
  `
]
