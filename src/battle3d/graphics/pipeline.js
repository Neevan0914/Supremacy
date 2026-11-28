// Renderer + post-processing chain for the battle, configured per quality level.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";

// Shadow maps only need one update per frame; stop later scene renders in
// the chain (GTAO normal pass) from redrawing them.
class ShadowLockPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
  }
  render(renderer) {
    renderer.shadowMap.autoUpdate = false;
  }
}

// GTAO that ignores sprites, transparent effects and wind-animated grass,
// which would otherwise leave occlusion "ghosts" behind.
class BattleGTAOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      if (o.isSprite || o.userData.noAO || (o.material && o.material.transparent)) o.visible = false;
    });
  }
}

// Final grade in display space: gentle S-curve, vignette, film grain and a
// touch of lateral chromatic aberration toward the frame edges.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.28 },
    grain: { value: 0.035 },
    aberration: { value: 0.0016 },
    saturation: { value: 1.06 },
    contrast: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, aberration, saturation, contrast;
    uniform vec2 resolution;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * aberration * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
      col *= 1.0 - vignette * smoothstep(0.12, 0.62, r2 * 1.6);
      float n = rand(vUv * resolution + fract(time * 7.13) * 100.0) - 0.5;
      col += n * grain * (1.0 - l * 0.6);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Mirror of the scene about the ground plane (y = 0), rendered into a
// half-resolution HDR target and sampled by the ground's puddle shader.
class PlanarReflection {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    this.target.texture.generateMipmaps = false;
    this.camera = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.hide = [];
    this._v = { view: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(), camPos: new THREE.Vector3(), rot: new THREE.Matrix4(), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4() };
  }
  setSize(w, h) {
    this.target.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
  }
  update(renderer, scene, camera) {
    const { view, look, target, camPos, rot, plane, clip, q } = this._v;
    const normal = new THREE.Vector3(0, 1, 0),
      origin = new THREE.Vector3();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(origin, camPos);
    if (view.dot(normal) > 0) return;
    view.reflect(normal).negate();
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(origin, look).reflect(normal).negate();
    const vc = this.camera;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    vc.lookAt(target);
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // Oblique near plane so nothing below the ground leaks into the mirror.
    plane.setFromNormalAndCoplanarPoint(normal, origin).applyMatrix4(vc.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vc.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1 - 0.003;
    pm[14] = clip.w;

    const hidden = this.hide.slice();
    scene.traverse((o) => o.userData.noReflect && hidden.push(o));
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    hidden.forEach((o, i) => (o.visible = vis[i]));
  }
  dispose() {
    this.target.dispose();
  }
}

export function createPipeline(gfx) {
  const renderer = new THREE.WebGLRenderer({
    antialias: gfx.antialias,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfx.pixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = gfx.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = gfx.physicalSky ? 1.0 : 1.25;

  let composer = null,
    gtao = null,
    bloom = null,
    finish = null,
    renderPass = null;
  const reflection = gfx.reflections ? new PlanarReflection() : null;

  function setupComposer(scene, camera) {
    if (!gfx.post || composer) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: gfx.msaa });
    composer = new EffectComposer(renderer, rt);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    composer.addPass(new ShadowLockPass());
    if (gfx.ao) {
      gtao = new BattleGTAOPass(scene, camera, 1, 1);
      gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.5, scale: 1.0, samples: gfx.ao });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: gfx.ao >= 16 ? 16 : 8 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
    }
    if (gfx.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.6, 2.4);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    finish = new ShaderPass(FinishShader);
    if (!gfx.lensFx) {
      finish.uniforms.grain.value = 0;
      finish.uniforms.aberration.value = 0;
    }
    composer.addPass(finish);
  }

  let elapsed = 0;
  return {
    renderer,
    reflection,
    attach(scene, camera) {
      setupComposer(scene, camera);
    },
    setSize(w, h) {
      renderer.setSize(w, h, false);
      const pr = renderer.getPixelRatio();
      if (composer) {
        composer.setPixelRatio(pr);
        composer.setSize(w, h);
        finish.uniforms.resolution.value.set(w * pr, h * pr);
      }
      if (reflection) reflection.setSize(w * pr, h * pr);
    },
    render(scene, camera, dt) {
      elapsed += dt;
      renderer.shadowMap.autoUpdate = true;
      if (reflection) {
        reflection.update(renderer, scene, camera);
        renderer.shadowMap.autoUpdate = false; // shadows already fresh this frame
      }
      if (composer) {
        finish.uniforms.time.value = elapsed;
        composer.render(dt);
      } else renderer.render(scene, camera);
      renderer.shadowMap.autoUpdate = true;
    },
    dispose() {
      if (composer) {
        composer.passes.forEach((p) => p.dispose && p.dispose());
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      if (reflection) reflection.dispose();
    },
  };
}
