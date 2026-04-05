-- Counties (master table, all ~3,143)
CREATE TABLE counties (
  fips CHAR(5) PRIMARY KEY,
  name TEXT NOT NULL,
  state_fips CHAR(2) NOT NULL,
  state_name TEXT NOT NULL,
  state_abbr CHAR(2) NOT NULL,
  county_seat TEXT,
  land_area_sq_mi REAL,
  latitude REAL,
  longitude REAL,
  is_curated BOOLEAN DEFAULT FALSE
);

-- Raw census data
CREATE TABLE raw_census (
  fips CHAR(5) PRIMARY KEY REFERENCES counties(fips),
  population INT,
  median_household_income INT,
  per_capita_income INT,
  pct_bachelors_or_higher REAL,
  pct_high_school_or_higher REAL,
  median_age REAL,
  unemployment_rate REAL,
  total_housing_units INT,
  pct_owner_occupied REAL
);

-- Raw GDP data
CREATE TABLE raw_gdp (
  fips CHAR(5) PRIMARY KEY REFERENCES counties(fips),
  gdp_total BIGINT,
  gdp_per_capita REAL
);

-- Raw health rankings
CREATE TABLE raw_health (
  fips CHAR(5) PRIMARY KEY REFERENCES counties(fips),
  health_outcomes_rank INT,
  health_factors_rank INT,
  life_expectancy REAL,
  pct_smokers REAL,
  pct_obese REAL,
  pct_uninsured REAL,
  violent_crime_rate REAL,
  primary_care_physicians_rate REAL,
  pct_some_college REAL
);

-- Raw FEMA disaster data
CREATE TABLE raw_fema (
  fips CHAR(5) PRIMARY KEY REFERENCES counties(fips),
  total_disasters INT,
  disaster_types TEXT[],
  most_recent_disaster_year INT
);

-- Derived game cards
CREATE TABLE cards (
  fips CHAR(5) PRIMARY KEY REFERENCES counties(fips),
  display_population TEXT,
  display_income TEXT,
  display_gdp TEXT,
  display_area TEXT,
  display_disasters TEXT,
  display_landmarks TEXT,
  stat_power INT,
  stat_resilience INT,
  stat_population INT,
  stat_terrain INT,
  stat_chaos INT,
  stat_culture INT,
  total_score INT,
  rarity TEXT CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  county_type TEXT,
  flavor_text TEXT
);

-- RLS policies (anon full access for pipeline)
ALTER TABLE counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_census ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_gdp ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_fema ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_counties" ON counties FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_raw_census" ON raw_census FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_raw_gdp" ON raw_gdp FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_raw_health" ON raw_health FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_raw_fema" ON raw_fema FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_cards" ON cards FOR ALL TO anon USING (true) WITH CHECK (true);
