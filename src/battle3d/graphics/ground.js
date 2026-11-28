// PBR battlefield ground: anti-tiling macro variation plus rain puddles that
// reflect the sky (IBL) or, on ULTRA, the actual scene (planar reflection).
import * as THREE from "three";
import { fbm, greyCanvas, mulberry } from "./textures.js";
import { pbrTextures } from "./textures.js";

const WET_SPAN = 64; // metres covered by the wetness map, centred on origin

function wetnessTexture(seed) {
  const size = 256,
    r = mulberry(seed),
    n = fbm(size, 6, 5, r),
    f = fbm(size, 24, 3, r);
  const c = greyCanvas(size, (i) => {
    const x = (i % size) / size - 0.5,
      y = ((i / size) | 0) / size - 0.5;
    // keep puddles mostly in the open middle & away from map edges
    const edge = Math.max(0, 1 - Math.max(Math.abs(x), Math.abs(y)) * 2.1);
    return Math.max(0, Math.min(1, (n[i] - 0.58) * 5 + (f[i] - 0.5) * 0.6)) * Math.min(1, edge * 3);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  // CPU-side lookup so grass can stay out of the water.
  const px = c.getContext("2d").getImageData(0, 0, size, size).data;
  t.userData.sample = (x, z) => {
    const u = x / WET_SPAN + 0.5,
      v = z / WET_SPAN + 0.5;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
    // canvas row 0 is v = 1 (CanvasTexture flipY)
    return px[(((1 - v) * size) | 0) * size * 4 + ((u * size) | 0) * 4] / 255;
  };
  return t;
}

function macroTexture() {
  const size = 256,
    n = fbm(size, 3, 6, mulberry(77));
  const t = new THREE.CanvasTexture(greyCanvas(size, (i) => n[i]));
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createGroundMaterial(gfx, { seed, reflection, envIntensity = 1 }) {
  const tex = pbrTextures("ground", Math.min(1024, gfx.texSize), 60, 16);
  const wet = gfx.puddles ? wetnessTexture(seed ^ 0x9e3779b9) : null;
  const macro = macroTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    roughnessMap: tex.roughnessMap,
    roughness: 1,
    metalness: 0,
    normalScale: new THREE.Vector2(1.2, 1.2),
    envMapIntensity: envIntensity,
  });
  const uniforms = {
    uWet: { value: wet },
    uMacro: { value: macro },
    uReflect: { value: reflection ? reflection.target.texture : null },
    uReflectMatrix: { value: reflection ? reflection.matrix : new THREE.Matrix4() },
    uTime: { value: 0 },
  };
  mat.defines = { USE_PUDDLES: wet ? 1 : 0, USE_PLANAR: reflection ? 1 : 0 };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uWet, uMacro, uReflect;
        uniform mat4 uReflectMatrix;
        uniform float uTime;
        float gWet = 0.0;
        vec2 gRipple = vec2(0.0);`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // Break up texture tiling with a second, rotated sample + macro tint.
        vec2 wuv = mat2(0.8, -0.6, 0.6, 0.8) * vWPos.xz * 0.043;
        vec3 alt = texture2D(map, wuv).rgb;
        float macro = texture2D(uMacro, vWPos.xz / 90.0).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, alt, 0.4) * mix(0.72, 1.22, macro);
        #if USE_PUDDLES
          vec2 wetUv = vWPos.xz / ${WET_SPAN.toFixed(1)} + 0.5;
          float wraw = texture2D(uWet, wetUv).r;
          gWet = smoothstep(0.42, 0.6, wraw);
          float damp = smoothstep(0.08, 0.45, wraw);
          diffuseColor.rgb *= mix(1.0, 0.55, damp);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.52, 0.48), gWet);
        #endif`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        #if USE_PUDDLES
          roughnessFactor = mix(roughnessFactor, 0.03, gWet);
          roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, smoothstep(0.08, 0.45, texture2D(uWet, vWPos.xz / ${WET_SPAN.toFixed(1)} + 0.5).r));
        #endif`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        #if USE_PUDDLES
          // Standing water is flat apart from faint wind ripples.
          vec2 rp = vWPos.xz * 3.1;
          vec3 ripple = vec3(sin(rp.x + uTime * 1.3) * 0.5 + sin(rp.y * 1.3 - uTime * 1.1) * 0.5, 0.0, cos(rp.y * 0.9 + uTime * 0.8) * 0.5) * 0.015;
          gRipple = ripple.xz;
          vec3 flatN = normalize(nonPerturbedNormal + (viewMatrix * vec4(ripple, 0.0)).xyz);
          normal = normalize(mix(normal, flatN, gWet));
        #endif`,
      )
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
        #if USE_PLANAR
          vec4 rpos = uReflectMatrix * vec4(vWPos, 1.0);
          vec2 ruv = rpos.xy / rpos.w + gRipple * 0.4;
          vec3 refl = texture2D(uReflect, ruv).rgb;
          radiance = mix(radiance, refl, gWet);
        #endif`,
      );
  };
  return {
    material: mat,
    wetAt: wet ? wet.userData.sample : () => 0,
    textures: [tex.map, tex.normalMap, tex.roughnessMap, wet, macro].filter(Boolean),
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}
