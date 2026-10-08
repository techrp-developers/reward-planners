ALTER TABLE content_zone_entries
  ADD COLUMN motion_effect ENUM('none', 'falling_petals', 'twinkle', 'shine_sweep', 'glow_pulse', 'slow_zoom') NOT NULL DEFAULT 'none',
  ADD COLUMN motion_intensity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  ADD COLUMN motion_speed ENUM('slow', 'normal', 'fast') NOT NULL DEFAULT 'normal';
