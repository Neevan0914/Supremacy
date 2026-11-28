// Analytic HDR sky with sun disc, Mie glow, horizon haze and procedural
// drifting clouds. Also bakes an image-based-lighting environment from it.
import * as THREE from "three";

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pin to the far plane
}`;

const fragmentShader = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 groundCol;
uniform float sunDisc;
uniform float time;
uniform float cloudCover;
varying vec3 vDir;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float cosT = dot(d, sunDir);

  // Rayleigh-ish gradient with a bright, slightly warm horizon band.
  vec3 sky = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  sky = mix(sky, horizon * 1.08, exp(-max(h, 0.0) * 14.0) * 0.6);

  // Mie forward scattering around the sun.
  float g = 0.8;
  float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
  sky += sunColor * mie * 0.018 * (0.5 + 0.5 * exp(-max(h, 0.0) * 4.0));
  sky += sunColor * pow(max(cosT, 0.0), 6.0) * 0.12;

  // Clouds on a virtual plane.
  if (h > 0.0 && cloudCover > 0.0) {
    vec2 uv = d.xz / (h + 0.08) * 0.55 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv * 1.6);
    float c = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.35, n);
    float thick = fbm(uv * 1.6 + sunDir.xz * 0.08);
    float lit = clamp(1.0 - (thick - n) * 6.0, 0.0, 1.0);
    vec3 cloudCol = mix(horizon * 0.75, sunColor * 1.15 + zenith * 0.25, lit * 0.8 + 0.2);
    cloudCol += sunColor * pow(max(cosT, 0.0), 12.0) * 0.6 * (1.0 - c);   // silver lining
    float fade = smoothstep(0.0, 0.22, h);
    sky = mix(sky, cloudCol, c * fade * 0.92);
  }

  // Sun disc (with soft limb).
  float disc = smoothstep(0.99955, 0.99975, cosT);
  sky += sunColor * disc * sunDisc;

  // Below the horizon fade to a hazy ground colour.
  if (h < 0.0) sky = mix(horizon * 0.92, groundCol, smoothstep(0.0, 0.3, -h));

  gl_FragColor = vec4(sky, 1.0);
}`;

export function createSky({ sunDir, cloudCover = 0.48 }) {
  const uniforms = {
    sunDir: { value: sunDir.clone().normalize() },
    sunColor: { value: new THREE.Color(1.0, 0.9, 0.76).multiplyScalar(1.6) },
    zenith: { value: new THREE.Color(0.11, 0.24, 0.52) },
    horizon: { value: new THREE.Color(0.62, 0.66, 0.68) },
    groundCol: { value: new THREE.Color(0.24, 0.22, 0.18) },
    sunDisc: { value: 40 },
    time: { value: 0 },
    cloudCover: { value: cloudCover },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.scale.setScalar(400);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    uniforms,
    // Linear colour matching the sky right at the horizon — used for fog.
    fogColor: uniforms.horizon.value.clone().multiplyScalar(0.98),
    bakeEnvironment(renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(mesh.geometry, material);
      envSky.scale.setScalar(100);
      envScene.add(envSky);
      const disc = uniforms.sunDisc.value;
      uniforms.sunDisc.value = 6; // keep IBL free of fireflies; the sun light handles direct
      const rt = pmrem.fromScene(envScene, 0.0, 0.1, 1000);
      uniforms.sunDisc.value = disc;
      pmrem.dispose();
      return rt;
    },
    update(t) {
      uniforms.time.value = t;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
