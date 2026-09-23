import * as THREE from 'three';

/**
 * Mouse / touch input:
 *  - move         -> parallax + light (normalised pointer)
 *  - drag         -> orbit around the burger (mouse & pen)
 *  - ctrl/⌘/alt + wheel, pinch, or wheel while dragging -> zoom
 *  - hover        -> ingredient highlight
 *  - click / tap  -> ingredient details
 *  - double click -> reset view
 * A plain wheel keeps scrolling the page: it drives the deconstruction.
 */
export class Pointer {
  constructor({ canvas, camera, rig, pickables, onHover, onSelect, isInteractive }) {
    this.canvas = canvas;
    this.camera = camera;
    this.rig = rig;
    this.pickables = pickables;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.isInteractive = isInteractive;
    this.ndc = new THREE.Vector2(0, 0);
    this.smooth = new THREE.Vector2(0, 0); // for parallax
    this.raycaster = new THREE.Raycaster();
    this.dragging = false;
    this.down = null;
    this.moved = false;
    this.needsPick = false;
    this.hoverId = null;
    this.coarse = window.matchMedia('(pointer: coarse)').matches;

    window.addEventListener('pointermove', (e) => this.handleMove(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.handleDown(e));
    window.addEventListener('pointerup', (e) => this.handleUp(e));
    window.addEventListener('pointercancel', () => this.endDrag());
    window.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    window.addEventListener('dblclick', (e) => {
      if (this.onScene(e)) rig.reset();
    });
    // Safari pinch
    window.addEventListener('gesturechange', (e) => {
      if (!this.isInteractive()) return;
      e.preventDefault();
      rig.zoomBy(1 / Math.pow(e.scale, 0.08));
    });
  }

  /** True when the event is over the 3D scene rather than UI. */
  onScene(e) {
    if (!this.isInteractive()) return false;
    const el = e.target;
    if (!(el instanceof Element)) return true;
    return !el.closest('[data-ui]');
  }

  handleMove(e) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ndc.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
    if (this.down && e.pointerType !== 'touch') {
      const dx = e.clientX - this.down.x;
      const dy = e.clientY - this.down.y;
      if (!this.dragging && Math.hypot(dx, dy) > 4) {
        this.dragging = true;
        document.documentElement.classList.add('is-dragging');
      }
      if (this.dragging) {
        this.rig.drag(e.clientX - this.last.x, e.clientY - this.last.y);
        this.moved = true;
      }
      this.last = { x: e.clientX, y: e.clientY };
    }
    this.needsPick = e.pointerType !== 'touch';
  }

  handleDown(e) {
    if (!this.onScene(e) || e.button > 0) return;
    this.down = { x: e.clientX, y: e.clientY };
    this.last = { ...this.down };
    this.moved = false;
  }

  handleUp(e) {
    const wasDown = this.down;
    const wasDrag = this.dragging;
    this.endDrag();
    if (!wasDown || wasDrag) return;
    if (Math.hypot(e.clientX - wasDown.x, e.clientY - wasDown.y) > 6) return;
    if (!this.onScene(e)) return;
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.onSelect(this.pick());
  }

  endDrag() {
    this.down = null;
    if (this.dragging) {
      this.dragging = false;
      document.documentElement.classList.remove('is-dragging');
    }
  }

  handleWheel(e) {
    if (!this.isInteractive()) return;
    const zoomGesture = e.ctrlKey || e.metaKey || e.altKey || this.dragging;
    if (!zoomGesture) return; // let the page scroll: it drives the animation
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.rig.zoomBy(Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0015)));
  }

  pick() {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const h of hits) {
      if (h.object.visible && h.object.userData.layerId) return h.object.userData.layerId;
    }
    return null;
  }

  update() {
    if (!this.needsPick || this.dragging || !this.isInteractive()) {
      if (!this.isInteractive() && this.hoverId) {
        this.hoverId = null;
        this.onHover(null);
      }
      return;
    }
    this.needsPick = false;
    const id = this.pick();
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.onHover(id);
    }
  }
}
