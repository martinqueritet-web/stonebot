import * as THREE from 'three';
import { createNoise, fbm3, circleNoise, makeProfile, curve, revolve, smoothstep } from '../geometry.js';

export const PATTY = {
  radius: 6.35,
  thickness: 1.25,
};

/**
 * Smashed beef patty: irregular outline, lacy crispy rim, lumpy seared faces.
 * Exposes the analytic top surface so the melted cheese can drape on it.
 */
export function buildPatty(mat, seed) {
  const { radius: R, thickness: T } = PATTY;
  const noise = createNoise(seed);
  const group = new THREE.Group();

  const edgeR = 0.9; // fraction of radius where the rim starts rounding
  const topAt = (r) => T * (1 - 0.16 * Math.pow(Math.min(1, r / R), 2.2));

  /** Radius multiplier of the outline for angle phi. */
  const radiusAt = (phi) =>
    R * (1 + 0.045 * circleNoise(noise, phi, 0.8, 2.0) + 0.028 * circleNoise(noise, phi, 2.4, 5.0));
  /** Local thickness variation. */
  const thick = (x, z) => 1 + 0.07 * noise.noise3d(x * 0.16, 11.0, z * 0.16);
  /** Height of the (smoothed) top surface at x, z in local space. */
  const topHeightAt = (x, z) => {
    const phi = Math.atan2(z, x);
    const r = Math.hypot(x, z) * (R / radiusAt(phi));
    return topAt(Math.min(r, R * edgeR)) * thick(x, z);
  };

  const rimTop = topAt(R * edgeR);
  const top = curve((s) => [s * R * edgeR, topAt(s * R * edgeR)], 34);
  const rim = curve((s) => {
    const a = Math.PI / 2 - s * Math.PI; // +90° (top) -> -90° (bottom)
    const cx = R * edgeR;
    const rx = R * (1 - edgeR);
    const ry = rimTop / 2;
    return [cx + rx * Math.cos(a), ry + ry * Math.sin(a)];
  }, 26);
  const bottom = curve((s) => [(1 - s) * R * edgeR, 0.04 * s], 18);
  const profile = makeProfile([
    { name: 'top', band: [0, 0.42], points: top },
    { name: 'rim', band: [0.42, 0.58], points: rim },
    { name: 'bottom', band: [0.58, 1], points: bottom },
  ]);

  const inside = new THREE.Vector3(0, T * 0.45, 0);
  const geo = revolve(profile, {
    radial: 256,
    inside,
    deform(pos, { phi, part, normal, t }) {
      const baseR = Math.hypot(pos.x, pos.z);
      const k = radiusAt(phi) / R;
      // lacy, torn edge: extra outward/inward jaggedness on the rim only
      const rimW = part === 'rim' ? Math.sin(((t - 0.42) / 0.16) * Math.PI) : 0;
      const lace = rimW
        * (0.32 * fbm3(noise, Math.cos(phi) * 3.1, pos.y * 0.9, Math.sin(phi) * 3.1, 3)
          + 0.12 * fbm3(noise, Math.cos(phi) * 11, pos.y * 2.1 + 4, Math.sin(phi) * 11, 2));
      if (baseR > 1e-4) {
        const nr = baseR * k + lace;
        pos.x *= nr / baseR;
        pos.z *= nr / baseR;
      }
      // thickness variation, crust lumps (along the normal)
      pos.y *= thick(pos.x, pos.z);
      const lx = pos.x * 0.85;
      const lz = pos.z * 0.85;
      const lumps = 0.06 * fbm3(noise, lx, pos.y * 0.85 + 20, lz, 3) + 0.018 * fbm3(noise, lx * 3.3, pos.y * 3, lz * 3.3, 2);
      pos.addScaledVector(normal, lumps + rimW * 0.1 * fbm3(noise, lx * 2, pos.y * 4, lz * 2, 2));
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return { group, meshes: [mesh], height: T, radiusAt, topHeightAt };
}
