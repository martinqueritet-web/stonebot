import * as THREE from 'three';
import { buildTopBun, buildBottomBun, BUN } from './parts/bun.js';
import { buildPatty, PATTY } from './parts/patty.js';
import { buildCheese, CHEESE } from './parts/cheese.js';
import { buildSauce, buildPickles, buildOnions } from './parts/toppings.js';
import { LAYERS, monotoneSpline } from './choreography.js';
import { smoothstep } from './geometry.js';

const HIGHLIGHT = new THREE.Color('#ff9a4a');
const _c = new THREE.Color();

/**
 * Assembles every ingredient as its own group, stacked like the reference
 * photo, and animates the scroll-driven separation.
 */
export class Burger {
  constructor(mats) {
    this.root = new THREE.Group();
    this.root.name = 'burger';
    this.layers = [];

    const own = (m) => m.clone(); // per-layer materials: independent highlight

    // --- build, bottom to top -------------------------------------------
    const bunBottom = buildBottomBun({ bunBottomCrust: mats.bunBottomCrust, crumb: own(mats.crumb) });
    const onions = buildOnions(own(mats.onion));
    const pattyB = buildPatty(own(mats.patty), 1234);
    const cheeseB = buildCheese(own(mats.cheese), pattyB, { seed: 77, rotation: 0.42, maxDrop: 0.9, melt: 1.2 });
    const pattyT = buildPatty(own(mats.patty), 4321);
    const cheeseT = buildCheese(own(mats.cheese), pattyT, { seed: 17, rotation: -0.18, maxDrop: 1.3, melt: 1.4 });
    const onCheese = (x, z) => pattyT.topHeightAt(x, z) + CHEESE.lift + CHEESE.thickness * 0.8;
    const sauce = buildSauce(own(mats.sauce), onCheese, { offset: [0.2, 0.9] });
    const pickles = buildPickles(own(mats.pickle), (x, z) => onCheese(x, z) + 0.14, {
      slices: [
        { at: [-3.35, 1.6], radius: 1.45, tilt: 0.05 },
        { at: [3.1, 1.9], radius: 1.4, tilt: -0.06 },
        { at: [0.4, -3.2], radius: 1.5 },
        { at: [-1.2, 3.6], radius: 1.35, tilt: 0.04 },
      ],
    });
    const bunTop = buildTopBun({ bunTopCrust: mats.bunTopCrust, crumb: own(mats.crumb), sesame: mats.sesame });

    // --- assembled heights (cm) -----------------------------------------
    const yOnions = BUN.bottomHeight + 0.02;
    const yPattyB = yOnions + 0.62;
    const yPattyT = yPattyB + PATTY.thickness * 1.08 + CHEESE.lift + CHEESE.thickness;
    const yBunTop = yPattyT + PATTY.thickness * 1.02 + 0.72;

    const add = (id, part, y, anchor) => {
      const cfg = LAYERS[id];
      const g = new THREE.Group();
      g.name = id;
      g.add(part.group);
      g.position.y = y;
      this.root.add(g);
      const materials = new Set();
      part.meshes.forEach((m) => {
        m.userData.layerId = id;
        materials.add(m.material);
      });
      this.layers.push({
        id,
        group: g,
        meshes: part.meshes,
        materials: [...materials].map((mat) => ({
          mat,
          emissive: mat.emissive.clone(),
          intensity: mat.emissiveIntensity,
        })),
        baseY: y,
        lift: monotoneSpline(cfg.lift),
        cfg,
        anchor, // { r: radius of the visible edge, y: local height of the label anchor }
        hover: 0,
        hoverTarget: 0,
        separation: 0,
      });
    };

    add('bun_bottom', bunBottom, 0, { r: BUN.bottomRadius, y: BUN.bottomHeight * 0.55 });
    add('onions', onions, yOnions, { r: 5.5, y: 0.35 });
    add('patty_bottom', pattyB, yPattyB, { r: PATTY.radius, y: PATTY.thickness * 0.5 });
    add('cheese_bottom', cheeseB, yPattyB, { r: PATTY.radius * 0.95, y: PATTY.thickness + 0.15 });
    add('patty_top', pattyT, yPattyT, { r: PATTY.radius, y: PATTY.thickness * 0.5 });
    add('cheese_top', cheeseT, yPattyT, { r: PATTY.radius * 0.95, y: PATTY.thickness + 0.15 });
    add('sauce', sauce, yPattyT, { r: 4.2, y: PATTY.thickness + 0.4 });
    add('pickles', pickles, yPattyT, { r: 4.4, y: PATTY.thickness + 0.55 });
    add('bun_top', bunTop, yBunTop, { r: BUN.topRadius, y: BUN.topHeight * 0.45 });

    this.byId = Object.fromEntries(this.layers.map((l) => [l.id, l]));
    this.pickables = this.layers.flatMap((l) => l.meshes);
    this.progress = 0;
    this._center = new THREE.Vector3();
  }

  /** Vertical extent of the stack at progress p (for camera framing). */
  extentAt(p) {
    const top = this.byId.bun_top;
    return top.baseY + top.lift(p) + BUN.topHeight;
  }

  setHover(id) {
    for (const l of this.layers) l.hoverTarget = l.id === id ? 1 : 0;
  }

  update(p, dt, focusId = null) {
    this.progress = p;
    const k = 1 - Math.exp(-dt * 10);
    for (const l of this.layers) {
      const lift = l.lift(p);
      const keys = l.cfg.lift;
      const last = keys[keys.length - 1];
      // 0 -> 1 as the layer travels to its final position
      l.separation = last[1] > 0 ? THREE.MathUtils.clamp(lift / last[1], 0, 1) : smoothstep(0.7, 0.86, p);
      const s = smoothstep(0, 1, l.separation);

      l.hover += (l.hoverTarget - l.hover) * k;
      const focusBoost = focusId === l.id ? 1 : 0;
      const h = Math.max(l.hover, focusBoost * 0.6);

      l.group.position.y = l.baseY + lift + h * 0.18 * s;
      l.group.rotation.y = l.cfg.yaw * s;
      l.group.rotation.x = l.cfg.tilt * s;

      // subtle warm lift: base emission plus a faint glow, never a flat tint
      for (const m of l.materials) {
        _c.copy(m.emissive).multiplyScalar(m.intensity);
        m.mat.emissive.copy(_c).add(_c.copy(HIGHLIGHT).multiplyScalar(h * 0.045));
        m.mat.emissiveIntensity = 1;
      }
    }
  }

  /** World-space anchor for a label: the edge of the layer facing `side`. */
  anchorWorld(id, cameraRight, side, target) {
    const l = this.byId[id];
    const dir = side === 'left' ? -1 : 1;
    target.set(0, l.anchor.y, 0);
    l.group.localToWorld(target);
    target.addScaledVector(cameraRight, dir * l.anchor.r * 0.96);
    return target;
  }

  centerOf(id, target) {
    const l = this.byId[id];
    target.set(0, l.anchor.y, 0);
    return l.group.localToWorld(target);
  }
}
