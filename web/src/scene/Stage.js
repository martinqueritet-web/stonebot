import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Colour of the backdrop, sampled from the photo's terracotta wall. */
export const BACKDROP = new THREE.Color('#a4552f');

const FinishShader = {
  name: 'FinishShader',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.035 },
    vignette: { value: 0.32 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float vignette;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // photographic vignette
      vec2 q = vUv - 0.5;
      q.x *= resolution.x / resolution.y;
      float v = smoothstep(1.05, 0.25, length(q) * 1.15);
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      // fine luminance grain (breaks banding in the smooth backdrop)
      float n = hash(vUv * resolution + fract(time) * 97.0) - 0.5;
      c.rgb += n * grain * (0.6 + 0.4 * (1.0 - dot(c.rgb, vec3(0.333))));
      gl_FragColor = c;
    }
  `,
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = BACKDROP.clone();
    this.scene.fog = new THREE.Fog(BACKDROP.clone(), 70, 190);

    this.camera = new THREE.PerspectiveCamera(24, 1, 1, 600);
    this.camera.position.set(0, 7, 40);

    // image based lighting: a soft studio room
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    this.scene.environmentRotation.y = 0.6;

    this.buildLights();
    this.buildSet();

    this.quality = 'high';
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.buildComposer();
  }

  buildLights() {
    // key: large warm softbox from the upper left, like the reference photo
    const key = new THREE.DirectionalLight('#fff0dc', 2.6);
    key.position.set(-14, 22, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = key.shadow.camera;
    s.left = -22;
    s.right = 22;
    s.top = 24;
    s.bottom = -24;
    s.near = 1;
    s.far = 90;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 6;
    key.shadow.blurSamples = 16;
    this.key = key;
    this.keyBase = key.position.clone();
    this.scene.add(key, key.target);

    // warm rim from behind right: separates the layers from the backdrop
    const rim = new THREE.DirectionalLight('#ffc48a', 1.6);
    rim.position.set(16, 12, -18);
    this.rim = rim;
    this.scene.add(rim);

    // soft fill from the front right, bounce from the board
    const fill = new THREE.DirectionalLight('#ffe2c4', 0.45);
    fill.position.set(12, 4, 20);
    this.scene.add(fill);
    const hemi = new THREE.HemisphereLight('#ffe7cf', '#8a4a2a', 0.35);
    this.scene.add(hemi);
  }

  buildSet() {
    this.setGroup = new THREE.Group();
    this.scene.add(this.setGroup);
  }

  /** Wooden board and plastered wall, once materials are ready. */
  addSet(mats) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mats.board);
    board.rotation.x = -Math.PI / 2;
    board.receiveShadow = true;
    this.setGroup.add(board);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(700, 320), mats.wall);
    wall.position.set(0, 150, -130);
    this.setGroup.add(wall);
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x || 1, size.y || 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.gtao);

    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 40, aperture: 0.00012, maxblur: 0.006 });
    this.composer.addPass(this.bokeh);

    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  setQuality(level) {
    if (level === this.quality) return;
    this.quality = level;
    this.gtao.enabled = level === 'high';
    this.bokeh.enabled = level !== 'low';
    this.key.shadow.mapSize.set(level === 'low' ? 1024 : 2048, level === 'low' ? 1024 : 2048);
    if (this.key.shadow.map) {
      this.key.shadow.map.dispose();
      this.key.shadow.map = null;
    }
    this.pixelRatio = level === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, level === 'medium' ? 1.25 : 1.75);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.finish.uniforms.resolution.value.set(w * this.pixelRatio, h * this.pixelRatio);
  }

  /** Mouse-driven light: the key light glides a little with the cursor. */
  setLightFromPointer(x, y) {
    this.key.position.set(this.keyBase.x + x * 7, this.keyBase.y + y * 4, this.keyBase.z);
    this.rim.position.x = 16 - x * 5;
  }

  setFocus(distance, strength) {
    const u = this.bokeh.uniforms;
    u.focus.value = distance;
    u.aperture.value = 0.00022 * strength;
    u.maxblur.value = 0.0075 * strength;
  }

  render(time) {
    this.finish.uniforms.time.value = time;
    this.composer.render();
  }
}
