import * as THREE from 'three';
import './styles/main.css';
import { Stage } from './scene/Stage.js';
import { MaterialLibrary } from './scene/materials.js';
import { Burger } from './scene/Burger.js';
import { CameraRig } from './scene/CameraRig.js';
import { Pointer } from './interaction/Pointer.js';
import { Labels } from './ui/Labels.js';
import { Detail } from './ui/Detail.js';
import { INGREDIENTS } from './content/ingredients.js';
import { smoothstep } from './scene/geometry.js';

const $ = (s) => document.querySelector(s);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
// ?p=0.5 freezes the scroll progress (handy for screenshots and tuning)
const params = new URLSearchParams(location.search);
const fixedProgress = params.has('p') ? THREE.MathUtils.clamp(parseFloat(params.get('p')) || 0, 0, 1) : null;

const canvas = $('#webgl');
const stage = new Stage(canvas);
const manager = new THREE.LoadingManager();
const library = new MaterialLibrary(stage.renderer, manager);
const mats = library.build();
stage.addSet(mats);

const burger = new Burger(mats);
stage.scene.add(burger.root);
const rig = new CameraRig(stage.camera);

/* ---------------------------------------------------------------- state */
const state = {
  progress: 0, // raw scroll progress through the experience
  smooth: 0, // damped progress used by the animation
  hoverId: null,
  focusId: null,
  experienceVisible: true,
  interactive: true,
};

/* ------------------------------------------------------------------- UI */
const detail = new Detail($('#detail'), {
  onClose: () => select(null),
  onNavigate: (id) => select(id),
});
const labels = new Labels($('#labels'), {
  onHover: (id) => setHover(id),
  onSelect: (id) => select(id),
});

function setHover(id) {
  state.hoverId = id;
  burger.setHover(id ?? state.focusId);
  document.documentElement.classList.toggle('is-pointing', !!id);
}

function select(id) {
  state.focusId = id;
  if (id) detail.open(id);
  else detail.close();
  document.documentElement.classList.toggle('has-detail', !!id);
  burger.setHover(id ?? state.hoverId);
}

const pointer = new Pointer({
  canvas,
  camera: stage.camera,
  rig,
  pickables: burger.pickables,
  onHover: (id) => setHover(id),
  onSelect: (id) => select(id),
  isInteractive: () => state.interactive,
});

$('#reset-view').addEventListener('click', () => rig.reset());

// progress rail: one tick per ingredient
const rail = $('#rail-ticks');
rail.innerHTML = INGREDIENTS.map((it) => `<li data-id="${it.id}"><span>${it.name}</span></li>`).join('');
const railTicks = [...rail.children];
const counter = $('#rail-count');

/* --------------------------------------------------------------- scroll */
const experience = $('#experience');
function readScroll() {
  const rect = experience.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  state.progress = THREE.MathUtils.clamp(-rect.top / total, 0, 1);
  state.experienceVisible = rect.bottom > 0;
  state.interactive = rect.bottom > window.innerHeight * 0.35;
  if (fixedProgress !== null) state.progress = fixedProgress;
}
window.addEventListener('scroll', readScroll, { passive: true });

/* --------------------------------------------------------------- resize */
function resize() {
  stage.resize();
  labels.measure();
  readScroll();
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------- quality */
const perf = { frames: 0, time: 0, level: coarse ? 'medium' : 'high', cooldown: 0 };
stage.setQuality(perf.level);
function adaptQuality(dt) {
  perf.frames++;
  perf.time += dt;
  perf.cooldown -= dt;
  if (perf.frames < 90) return;
  const avg = perf.time / perf.frames;
  perf.frames = 0;
  perf.time = 0;
  if (perf.cooldown > 0 || document.hidden) return;
  if (avg > 1 / 38 && perf.level !== 'low') {
    perf.level = perf.level === 'high' ? 'medium' : 'low';
    stage.setQuality(perf.level);
    perf.cooldown = 3;
  }
}

/* ---------------------------------------------------------------- loop */
const timer = new THREE.Timer();
timer.connect(document);
const heroCopy = $('#hero-copy');
const finale = $('#finale');
const hint = $('#hint');
const resetBtn = $('#reset-view');
const tmp = new THREE.Vector3();
let hintSeen = false;

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();

  // scroll inertia: the scene glides to the scroll position
  state.smooth += (state.progress - state.smooth) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5));
  if (Math.abs(state.progress - state.smooth) < 1e-5 || fixedProgress !== null) state.smooth = state.progress;
  const p = state.smooth;

  if (state.experienceVisible) {
    pointer.update();
    burger.update(p, dt, state.focusId);

    const focus = state.focusId ? burger.centerOf(state.focusId, tmp) : null;
    const wide = window.innerWidth > 900;
    // composition: burger sits right of the title in the hero, left of the detail panel
    const heroShift = wide ? -5.5 * (1 - smoothstep(0.0, 0.08, p)) : 0;
    const panelShift = state.focusId && wide ? 7 : 0;
    rig.update(p, dt, {
      pointer: pointer.ndc,
      dragging: pointer.dragging,
      focus,
      shift: panelShift || heroShift,
      extent: burger.extentAt(p),
      reducedMotion,
    });
    stage.setLightFromPointer(rig.px, rig.py);
    stage.setFocus(rig.distance, rig.dof);
    stage.render(t);

    labels.update({
      p,
      camera: stage.camera,
      burger,
      rig,
      active: state.interactive,
      focusId: state.focusId,
      hoverId: state.hoverId,
      dt,
      fade: 1,
    });

    // copy & chrome driven by progress
    const heroOut = smoothstep(0.0, 0.06, p);
    heroCopy.style.opacity = String(1 - heroOut);
    heroCopy.style.transform = `translate3d(0, ${(-heroOut * 40).toFixed(1)}px, 0)`;
    heroCopy.style.visibility = heroOut > 0.99 ? 'hidden' : 'visible';
    const fin = smoothstep(0.88, 0.96, p) * (state.focusId ? 0 : 1);
    finale.style.opacity = String(fin);
    finale.style.transform = `translate3d(0, ${((1 - fin) * 24).toFixed(1)}px, 0)`;
    finale.style.visibility = fin < 0.01 ? 'hidden' : 'visible';
    if (!hintSeen && (p > 0.12 || pointer.dragging)) {
      hintSeen = true;
      hint.classList.add('is-hidden');
    }
    resetBtn.classList.toggle('is-visible', rig.isOffset);

    let revealed = 0;
    railTicks.forEach((li, i) => {
      const id = INGREDIENTS[i].id;
      const l = burger.byId[id];
      const on = l.cfg.label.from + 0.04 < p;
      if (on) revealed++;
      li.classList.toggle('is-on', on);
      li.classList.toggle('is-hot', id === state.hoverId || id === state.focusId);
    });
    counter.textContent = `${String(revealed).padStart(2, '0')} / ${String(INGREDIENTS.length).padStart(2, '0')}`;
    $('#rail-fill').style.transform = `scaleY(${p.toFixed(4)})`;

    if (!coarse) adaptQuality(dt);
  }
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------- start */
const loaderBar = $('#loader-bar');
const loaderPct = $('#loader-pct');
manager.onProgress = (_url, loaded, total) => {
  const k = loaded / total;
  loaderBar.style.transform = `scaleX(${k})`;
  loaderPct.textContent = `${Math.round(k * 100)}`;
};
manager.onLoad = async () => {
  resize();
  // compile shaders up front so the first scroll never hitches
  try {
    await stage.renderer.compileAsync(stage.scene, stage.camera);
  } catch {
    /* compileAsync is optional */
  }
  document.documentElement.classList.add('is-ready');
  requestAnimationFrame(frame);
  const open = params.get('open') || location.hash.slice(1);
  if (burger.byId[open]) select(open);
};

// deep link: #bun_top etc. opens an ingredient once ready
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (burger.byId[id]) select(id);
});

resize();
