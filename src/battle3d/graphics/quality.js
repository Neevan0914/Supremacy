// Graphics quality presets. LOW keeps the original lightweight look; each step
// up layers on physically based lighting, materials and post-processing.
export const QUALITY_LEVELS = ["low", "medium", "high", "ultra"];
export const STORAGE_KEY = "supremacy.graphics";

const PRESETS = {
  low: {
    pixelRatio: 1,
    antialias: false,
    shadowMapSize: 1024,
    softShadows: false,
    physicalSky: false, // original gradient sky + hemisphere light
    envLighting: false,
    texSize: 0, // 0 = original flat procedural textures
    detailModels: false,
    grass: 0,
    post: false,
    msaa: 0,
    ao: 0,
    bloom: false,
    reflections: false,
    puddles: false,
    lensFx: false,
    dynamicLights: false,
    physicalMaterials: false,
  },
  medium: {
    pixelRatio: 1.25,
    antialias: true,
    shadowMapSize: 2048,
    softShadows: true,
    physicalSky: true,
    envLighting: true,
    texSize: 512,
    detailModels: true,
    grass: 0,
    post: false,
    msaa: 0,
    ao: 0,
    bloom: false,
    reflections: false,
    puddles: true,
    lensFx: false,
    dynamicLights: false,
    physicalMaterials: false,
  },
  high: {
    pixelRatio: 1.5,
    antialias: false,
    shadowMapSize: 2048,
    softShadows: true,
    physicalSky: true,
    envLighting: true,
    texSize: 1024,
    detailModels: true,
    grass: 26000,
    post: true,
    msaa: 4,
    ao: 8,
    bloom: true,
    reflections: false,
    puddles: true,
    lensFx: true,
    dynamicLights: true,
    physicalMaterials: false,
  },
  ultra: {
    pixelRatio: 2,
    antialias: false,
    shadowMapSize: 4096,
    softShadows: true,
    physicalSky: true,
    envLighting: true,
    texSize: 1024,
    detailModels: true,
    grass: 70000,
    post: true,
    msaa: 4,
    ao: 16,
    bloom: true,
    reflections: true, // real-time planar reflections in puddles
    puddles: true,
    lensFx: true,
    dynamicLights: true,
    physicalMaterials: true, // fabric sheen, clear-coated helmets & wood
  },
};

export function defaultQuality() {
  try {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return coarse ? "medium" : "high";
  } catch {
    return "high";
  }
}

export function storedQuality() {
  try {
    const q = localStorage.getItem(STORAGE_KEY);
    if (QUALITY_LEVELS.includes(q)) return q;
  } catch {}
  return defaultQuality();
}

export function saveQuality(level) {
  if (!QUALITY_LEVELS.includes(level)) return;
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {}
}

export function resolveQuality(name) {
  const level = QUALITY_LEVELS.includes(name) ? name : storedQuality();
  return { level, ...PRESETS[level] };
}
