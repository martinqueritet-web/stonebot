import * as THREE from 'three';
import { createNoise, thickSheet, smoothstep } from '../geometry.js';

export const CHEESE = {
  size: 10.6, // American cheese slice, slightly stretched by the melt
  thickness: 0.13,
  lift: 0.13, // gap above the smoothed patty surface (covers the crust lumps)
};

/**
 * A melted square slice draped over a patty. The slice is flat where it rests
 * on the patty, then bends over the rim with a soft radius and hangs down
 * the side, pooling slightly when it would pass below the patty.
 */
export function buildCheese(mat, patty, { seed, rotation, maxDrop = 1.25, melt = 1.35 }) {
  const { size, thickness, lift } = CHEESE;
  const noise = createNoise(seed);
  const half = size / 2;
  const cr = Math.cos(rotation);
  const sr = Math.sin(rotation);

  const fn = (u, v, out) => {
    // square -> rounded square
    let x = u * 2 - 1;
    let w = v * 2 - 1;
    const m = 7;
    const len = Math.max(Math.abs(x), Math.abs(w));
    const sup = Math.pow(Math.pow(Math.abs(x), m) + Math.pow(Math.abs(w), m), 1 / m);
    if (sup > 1e-6) {
      x *= len / sup;
      w *= len / sup;
    }
    // melted, wavy outline
    const ang = Math.atan2(w, x);
    const edge = smoothstep(0.55, 1.0, len);
    const wob = 1 + edge * (0.035 * noise.noise(Math.cos(ang) * 2.2, Math.sin(ang) * 2.2) + 0.015 * noise.noise(Math.cos(ang) * 7, Math.sin(ang) * 7 + 3));
    let px = x * half * wob;
    let pz = w * half * wob;
    // rotate the slice around Y
    const rx = px * cr - pz * sr;
    const rz = px * sr + pz * cr;
    px = rx;
    pz = rz;

    const d = Math.hypot(px, pz);
    const phi = Math.atan2(pz, px);
    const Rp = patty.radiusAt(phi);
    const rEdge = Rp * 0.88;
    if (d <= rEdge) {
      out.set(px, patty.topHeightAt(px, pz) + lift + 0.012 * noise.noise(px * 0.6, pz * 0.6), pz);
      return;
    }
    // drape: bend over the rim then hang
    const yEdge = patty.topHeightAt(Math.cos(phi) * rEdge, Math.sin(phi) * rEdge) + lift;
    const rb = Math.max(0.35, Rp * 1.035 - rEdge + 0.06 * noise.noise(phi * 3, 1.7));
    const s = (d - rEdge) * melt;
    let h;
    let y;
    const arc = rb * (Math.PI / 2);
    if (s < arc) {
      h = rEdge + rb * Math.sin(s / rb);
      y = yEdge - rb * (1 - Math.cos(s / rb));
    } else {
      const drop = s - arc;
      const hang = Math.min(drop, maxDrop);
      const pool = Math.max(0, drop - maxDrop);
      h = rEdge + rb + hang * 0.06 + pool * 0.35;
      y = yEdge - rb - hang - pool * 0.12;
    }
    h += 0.05 * noise.noise(phi * 4.0, y * 1.5);
    out.set(Math.cos(phi) * h, y, Math.sin(phi) * h);
  };

  const geo = thickSheet({
    nu: 120,
    nv: 120,
    fn,
    thickness: (u, v) => {
      const e = Math.min(u, v, 1 - u, 1 - v);
      return thickness * (0.55 + 0.45 * smoothstep(0.0, 0.04, e));
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, meshes: [mesh], topOffset: lift + thickness };
}
