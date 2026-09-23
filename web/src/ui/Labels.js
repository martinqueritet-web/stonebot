import * as THREE from 'three';
import { INGREDIENTS } from '../content/ingredients.js';
import { LAYERS } from '../scene/choreography.js';
import { smoothstep } from '../scene/geometry.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const pad = (n) => String(n).padStart(2, '0');

/**
 * Editorial captions tied to the 3D ingredients by a hairline leader.
 * Positions are projected every frame; captions on each side are spaced so
 * they never overlap, and each line draws itself as its ingredient separates.
 */
export class Labels {
  constructor(root, { onHover, onSelect }) {
    this.root = root;
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.classList.add('labels__lines');
    root.appendChild(this.svg);
    this.items = INGREDIENTS.map((ing, i) => {
      const side = LAYERS[ing.id].label.side;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `label label--${side}`;
      el.dataset.ui = '';
      el.dataset.id = ing.id;
      el.innerHTML = `
        <span class="label__index">${pad(i + 1)}</span>
        <span class="label__body">
          <span class="label__name">${ing.name}</span>
          <span class="label__tag">${ing.tagline}</span>
        </span>`;
      el.addEventListener('mouseenter', () => onHover(ing.id));
      el.addEventListener('mouseleave', () => onHover(null));
      el.addEventListener('focus', () => onHover(ing.id));
      el.addEventListener('blur', () => onHover(null));
      el.addEventListener('click', () => onSelect(ing.id));
      root.appendChild(el);

      const line = document.createElementNS(SVGNS, 'path');
      line.classList.add('labels__line');
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.classList.add('labels__dot');
      dot.setAttribute('r', '3');
      const halo = document.createElementNS(SVGNS, 'circle');
      halo.classList.add('labels__halo');
      halo.setAttribute('r', '9');
      this.svg.append(line, halo, dot);
      return { id: ing.id, side, el, line, dot, halo, vis: 0, width: 0, height: 0, y: 0 };
    });
    this.v = new THREE.Vector3();
    this.measure();
    window.addEventListener('resize', () => this.measure());
  }

  measure() {
    for (const it of this.items) {
      it.width = it.el.offsetWidth;
      it.height = it.el.offsetHeight;
    }
  }

  /** Most recently revealed ingredient (phones show one caption at a time). */
  currentId(p) {
    let best = null;
    let from = -1;
    for (const it of this.items) {
      const f = LAYERS[it.id].label.from;
      if (f <= p && f > from) {
        from = f;
        best = it.id;
      }
    }
    return best;
  }

  update({ p, camera, burger, rig, active, focusId, hoverId, fade, dt }) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const compact = w < 760;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    burger.root.updateMatrixWorld();

    const center = burger.centerOf('bun_bottom', this.v.clone());
    center.project(camera);

    const placed = { left: [], right: [] };
    for (const it of this.items) {
      const cfg = LAYERS[it.id].label;
      let vis = smoothstep(cfg.from, cfg.to, p) * fade;
      if (focusId) vis *= it.id === focusId ? 1 : 0.18;
      if (compact && it.id !== this.currentId(p)) vis = 0;
      it.vis += (vis - it.vis) * (1 - Math.exp(-dt * 10));
      const a = burger.anchorWorld(it.id, rig.right, it.side, this.v).project(camera);
      it.ax = (a.x * 0.5 + 0.5) * w;
      it.ay = (-a.y * 0.5 + 0.5) * h;
      it.visible = it.vis > 0.01 && active && a.z < 1;
      if (it.visible) placed[it.side].push(it);
    }

    const gap = compact ? 18 : Math.min(120, Math.max(44, w * 0.055));
    const minSpace = compact ? 40 : 60;
    for (const side of ['left', 'right']) {
      const list = placed[side].sort((a, b) => a.ay - b.ay);
      // relax: push down, then pull back up if clipped at the bottom
      let prev = (compact ? 70 : 96) - minSpace;
      for (const it of list) {
        it.y = Math.max(it.ay, prev + minSpace);
        prev = it.y;
      }
      let next = h - 40;
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        it.y = Math.min(it.y, next);
        next = it.y - minSpace;
      }
    }

    for (const it of this.items) {
      if (!it.visible) {
        it.el.style.opacity = '0';
        it.el.style.visibility = 'hidden';
        it.line.style.opacity = '0';
        it.dot.style.opacity = '0';
        it.halo.style.opacity = '0';
        continue;
      }
      if (compact) {
        // single caption centred under the burger, tied to it by the leader
        const ly = h - 96;
        const cx = w / 2;
        it.line.setAttribute('d', `M ${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L ${cx.toFixed(1)} ${(ly - it.height / 2 - 8).toFixed(1)}`);
        const len = Math.hypot(cx - it.ax, ly - it.height / 2 - 8 - it.ay);
        it.line.style.strokeDasharray = `${len}`;
        it.line.style.strokeDashoffset = `${len * (1 - it.vis)}`;
        it.line.style.opacity = String(it.vis);
        it.dot.setAttribute('cx', it.ax.toFixed(1));
        it.dot.setAttribute('cy', it.ay.toFixed(1));
        it.dot.style.opacity = String(it.vis);
        it.halo.style.opacity = '0';
        it.el.style.visibility = 'visible';
        it.el.style.opacity = String(smoothstep(0.35, 1, it.vis));
        it.el.style.transform = `translate3d(${(cx - it.width / 2).toFixed(1)}px, ${(ly - it.height / 2).toFixed(1)}px, 0)`;
        continue;
      }
      const dir = it.side === 'left' ? -1 : 1;
      let lx = it.ax + dir * gap;
      // keep inside the viewport
      if (dir < 0) lx = Math.max(lx, it.width + 16);
      else lx = Math.min(lx, w - it.width - 16);
      const ly = it.y;
      const elbowX = it.ax + dir * Math.min(gap * 0.45, 36);
      const d = `M ${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L ${elbowX.toFixed(1)} ${ly.toFixed(1)} L ${(lx - dir * 8).toFixed(1)} ${ly.toFixed(1)}`;
      it.line.setAttribute('d', d);
      const len = Math.hypot(elbowX - it.ax, ly - it.ay) + Math.abs(lx - dir * 8 - elbowX);
      it.line.style.strokeDasharray = `${len}`;
      it.line.style.strokeDashoffset = `${len * (1 - it.vis)}`;
      it.line.style.opacity = String(Math.min(1, it.vis * 1.4));
      it.dot.setAttribute('cx', it.ax.toFixed(1));
      it.dot.setAttribute('cy', it.ay.toFixed(1));
      it.dot.style.opacity = String(it.vis);
      it.halo.setAttribute('cx', it.ax.toFixed(1));
      it.halo.setAttribute('cy', it.ay.toFixed(1));
      const hot = hoverId === it.id || focusId === it.id;
      it.halo.style.opacity = String(hot ? it.vis * 0.9 : 0);
      it.el.classList.toggle('is-hot', hot);
      it.el.style.visibility = 'visible';
      it.el.style.opacity = String(smoothstep(0.35, 1, it.vis));
      const tx = dir < 0 ? lx - it.width : lx;
      const lift = (1 - smoothstep(0.3, 1, it.vis)) * 10;
      it.el.style.transform = `translate3d(${tx.toFixed(1)}px, ${(ly - it.height / 2 + lift).toFixed(1)}px, 0)`;
    }
  }
}
