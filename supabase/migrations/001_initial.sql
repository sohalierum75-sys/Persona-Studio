-- ============================================================
-- Persona Studio — Supabase Migration 001
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

-- ── Enable UUID extension ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Characters ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.characters (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  identity_fields  JSONB NOT NULL DEFAULT '[]',
  avatar_data_url  TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS characters_user_id_idx ON public.characters(user_id);
CREATE INDEX IF NOT EXISTS characters_updated_at_idx ON public.characters(updated_at);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "characters_select" ON public.characters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "characters_insert" ON public.characters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "characters_update" ON public.characters FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "characters_delete" ON public.characters FOR DELETE USING (auth.uid() = user_id);

-- ── Outfits ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outfits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id    UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  color_family    TEXT,
  tags            JSONB NOT NULL DEFAULT '[]',
  image_data_url  TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outfits_user_id_idx ON public.outfits(user_id);
CREATE INDEX IF NOT EXISTS outfits_character_id_idx ON public.outfits(character_id);

ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outfits_select" ON public.outfits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "outfits_insert" ON public.outfits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_update" ON public.outfits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_delete" ON public.outfits FOR DELETE USING (auth.uid() = user_id);

-- ── Locations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'other',
  description     TEXT,
  tags            JSONB NOT NULL DEFAULT '[]',
  image_data_url  TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS locations_user_id_idx ON public.locations(user_id);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_select" ON public.locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "locations_insert" ON public.locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "locations_update" ON public.locations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "locations_delete" ON public.locations FOR DELETE USING (auth.uid() = user_id);

-- ── Episodes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.episodes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id  UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  scene_ids     JSONB NOT NULL DEFAULT '[]',
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS episodes_user_id_idx ON public.episodes(user_id);
CREATE INDEX IF NOT EXISTS episodes_character_id_idx ON public.episodes(character_id);

ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episodes_select" ON public.episodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "episodes_insert" ON public.episodes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "episodes_update" ON public.episodes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "episodes_delete" ON public.episodes FOR DELETE USING (auth.uid() = user_id);

-- ── Scenes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scenes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id          UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  "order"             INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  action              TEXT,
  scene_description   TEXT,
  dialogue            TEXT,
  duration            TEXT,
  outfit_id           UUID REFERENCES public.outfits(id) ON DELETE SET NULL,
  outfit_override     TEXT,
  location_id         UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  camera_angle        TEXT,
  format              TEXT NOT NULL DEFAULT 'image',
  scene_connection    TEXT NOT NULL DEFAULT 'new',
  props               TEXT,
  notes               TEXT,
  prompts             JSONB NOT NULL DEFAULT '[]',
  reference_images    JSONB NOT NULL DEFAULT '[]',
  custom_field_values JSONB NOT NULL DEFAULT '{}',
  scene_hash          TEXT,
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS scenes_user_id_idx ON public.scenes(user_id);
CREATE INDEX IF NOT EXISTS scenes_episode_id_idx ON public.scenes(episode_id);
CREATE INDEX IF NOT EXISTS scenes_updated_at_idx ON public.scenes(updated_at);

-- Enforce outfit ownership: scene's outfit must belong to the same user
CREATE OR REPLACE FUNCTION check_scene_outfit_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outfit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.outfits WHERE id = NEW.outfit_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'outfit_id references another user''s outfit';
    END IF;
  END IF;
  IF NEW.location_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.locations WHERE id = NEW.location_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'location_id references another user''s location';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER scenes_ownership_check
  BEFORE INSERT OR UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION check_scene_outfit_ownership();

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenes_select" ON public.scenes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scenes_insert" ON public.scenes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scenes_update" ON public.scenes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scenes_delete" ON public.scenes FOR DELETE USING (auth.uid() = user_id);

-- ── User settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings    JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "settings_insert" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Reference assets ─────────────────────────────────────
-- Note: large image data stays in IndexedDB locally.
-- This table stores metadata + the storage path for cloud uploads.
CREATE TABLE IF NOT EXISTS public.reference_assets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT,
  storage_path TEXT,  -- e.g. "user_id/characters/char_id/asset_id.webp"
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reference_assets_user_id_idx ON public.reference_assets(user_id);

ALTER TABLE public.reference_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_select" ON public.reference_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "assets_insert" ON public.reference_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "assets_delete" ON public.reference_assets FOR DELETE USING (auth.uid() = user_id);

-- ── Storage bucket ────────────────────────────────────────
-- Run this in SQL editor (or via Dashboard → Storage):
--
-- INSERT INTO storage.buckets (id, name, public) VALUES ('persona-assets', 'persona-assets', false);
--
-- CREATE POLICY "assets_upload" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'persona-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- CREATE POLICY "assets_read" ON storage.objects FOR SELECT
--   USING (bucket_id = 'persona-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- CREATE POLICY "assets_delete" ON storage.objects FOR DELETE
--   USING (bucket_id = 'persona-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Realtime ──────────────────────────────────────────────
-- Enable realtime on key tables:
ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.episodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scenes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.outfits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
