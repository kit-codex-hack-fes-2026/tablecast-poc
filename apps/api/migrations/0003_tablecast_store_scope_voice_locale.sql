ALTER TABLE stores ADD COLUMN team_id TEXT REFERENCES team(id);
CREATE UNIQUE INDEX stores_team_id ON stores(team_id) WHERE team_id IS NOT NULL;
ALTER TABLE voice_turns ADD COLUMN locale TEXT NOT NULL DEFAULT 'ja' CHECK(locale IN ('ja','en'));
