const motionFields = {
  motionEffect: { column: 'motion_effect', fallback: 'none', allowed: ['none', 'falling_petals', 'twinkle', 'shine_sweep', 'glow_pulse', 'slow_zoom'] },
  motionIntensity: { column: 'motion_intensity', fallback: 'medium', allowed: ['low', 'medium', 'high'] },
  motionSpeed: { column: 'motion_speed', fallback: 'normal', allowed: ['slow', 'normal', 'fast'] },
};

function validateMotion(data, zone) {
  if (zone !== 'promotional_banner') return;
  for (const [name, { allowed }] of Object.entries(motionFields)) {
    if (data[name] !== undefined && !allowed.includes(data[name])) {
      const error = new Error(`${name} must be one of: ${allowed.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

function motionValues(entry) {
  return Object.fromEntries(Object.entries(motionFields).map(([name, { column, fallback }]) => [
    name, entry.zone === 'promotional_banner' ? (entry[name] ?? entry[column] ?? fallback) : fallback,
  ]));
}

module.exports = { motionFields, validateMotion, motionValues };
