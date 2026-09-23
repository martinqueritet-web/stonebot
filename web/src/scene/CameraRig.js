import * as THREE from 'three';
import { CAMERA_KEYS, monotoneSpline } from './choreography.js';

const DEG = Math.PI / 180;
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

/**
 * Scroll-driven camera path + user orbit/zoom + ingredient focus, all damped
 * so that every change of framing stays cinematic.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.path = Object.fromEntries(Object.entries(CAMERA_KEYS).map(([k, v]) => [k, monotoneSpline(v)]));
    // user controls
    this.orbitAz = 0;
    this.orbitEl = 0;
    this.velAz = 0;
    this.velEl = 0;
    this.zoom = 1;
    this.zoomTarget = 1;
    // smoothed pointer parallax
    this.px = 0;
    this.py = 0;
    // focus on a single ingredient
    this.focusW = 0;
    this.focusPoint = new THREE.Vector3();
    this.focusSmooth = new THREE.Vector3();
    this.shift = 0; // horizontal composition offset (film offset)
    this.target = new THREE.Vector3();
    this.distance = 40;
    this.dof = 0.5;
    this.right = new THREE.Vector3(1, 0, 0);
  }

  drag(dx, dy) {
    this.velAz = -dx * 0.28;
    this.velEl = dy * 0.18;
    this.orbitAz += this.velAz;
    this.orbitEl += this.velEl;
  }

  release() {
    // inertia is applied in update() from the last velocity
  }

  zoomBy(factor) {
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * factor, 0.5, 1.6);
  }

  reset() {
    this.orbitAzTarget = 0;
    this.orbitElTarget = 0;
    this.zoomTarget = 1;
    this.resetting = true;
  }

  get isOffset() {
    return Math.abs(this.orbitAz) > 2 || Math.abs(this.orbitEl) > 2 || Math.abs(this.zoomTarget - 1) > 0.03;
  }

  update(p, dt, { pointer, dragging, focus, shift, reducedMotion, extent }) {
    const cam = this.camera;
    // inertia
    if (!dragging) {
      this.orbitAz += this.velAz;
      this.orbitEl += this.velEl;
      this.velAz *= Math.exp(-dt * 5);
      this.velEl *= Math.exp(-dt * 5);
    }
    if (this.resetting) {
      this.orbitAz = damp(this.orbitAz, 0, 5, dt);
      this.orbitEl = damp(this.orbitEl, 0, 5, dt);
      if (Math.abs(this.orbitAz) < 0.05 && Math.abs(this.orbitEl) < 0.05) this.resetting = false;
    }
    this.zoom = damp(this.zoom, this.zoomTarget, 6, dt);
    const par = reducedMotion ? 0 : 1;
    this.px = damp(this.px, pointer.x * par, 3, dt);
    this.py = damp(this.py, pointer.y * par, 3, dt);
    this.focusW = damp(this.focusW, focus ? 1 : 0, 3.2, dt);
    if (focus) this.focusPoint.copy(focus);
    this.focusSmooth.lerp(this.focusPoint, 1 - Math.exp(-dt * 4));
    this.shift = damp(this.shift, shift, 3, dt);

    const P = this.path;
    const fov = P.fov(p);
    const baseEl = P.el(p);
    const el = THREE.MathUtils.clamp(baseEl + this.orbitEl + this.py * 2.5, -4, 62);
    this.orbitEl = el - baseEl - this.py * 2.5; // keep the clamp sticky
    const az = P.az(p) + this.orbitAz + this.px * 5;

    // distance that frames the current stack (vertical) and burger width
    cam.fov = fov;
    const aspect = cam.aspect;
    const tanV = Math.tan((fov * DEG) / 2);
    const span = extent * P.margin(p) + 1.5;
    const width = 17; // burger diameter plus breathing room for labels
    const dV = span / 2 / tanV;
    const dH = width / 2 / (tanV * aspect) * (aspect < 1 ? 1.25 : 1);
    let dist = Math.max(dV, dH) * P.fit(p);

    const target = this.target.set(0, extent * 0.5 - 0.3, 0);
    // focus: frame one ingredient
    const fw = this.focusW;
    if (fw > 0.001) {
      target.lerp(this.focusSmooth, fw);
      const dFocus = Math.max(7.5 / tanV, (width * 0.85) / 2 / (tanV * aspect));
      dist = THREE.MathUtils.lerp(dist, dFocus, fw);
    }
    dist *= this.zoom;
    this.distance = dist;

    const azR = az * DEG;
    const elR = el * DEG;
    cam.position.set(
      target.x + dist * Math.cos(elR) * Math.sin(azR),
      target.y + dist * Math.sin(elR),
      target.z + dist * Math.cos(elR) * Math.cos(azR),
    );
    cam.lookAt(target);
    cam.filmOffset = this.shift;
    cam.updateProjectionMatrix();
    this.right.set(Math.cos(azR), 0, -Math.sin(azR));
    this.dof = THREE.MathUtils.lerp(P.dof(p), 1.1, fw);
  }
}
