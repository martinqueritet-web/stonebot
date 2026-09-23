import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { createNoise, fbm3, circleNoise, makeProfile, curve, revolve, smoothstep, mulberry32 } from '../geometry.js';

/* Dimensions in centimetres (1 unit = 1 cm), measured on the reference photo. */
export const BUN = {
  topRadius: 5.8,
  topHeight: 3.95,
  lip: 0.45, // rounded crust edge that curls under the cut face
  bottomRadius: 5.65,
  bottomHeight: 2.6,
};

function radialShape(noise, phi, amount) {
  return 1 + amount * (0.7 * circleNoise(noise, phi, 0.9, 1.3) + 0.3 * circleNoise(noise, phi, 2.2, 4.1));
}

/* ------------------------------------------------------------------ top bun */

export function buildTopBun(mats, seed = 7) {
  const { topRadius: R, topHeight: H, lip } = BUN;
  const noise = createNoise(seed);
  const group = new THREE.Group();
  group.name = 'bun_top';

  // crown -> shoulder (superellipse dome) -> curled lip under the bun
  const dome = curve((s) => {
    const a = (1 - s) * (Math.PI / 2); // s=0 crown, s=1 shoulder
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return [(R - 0.02) * Math.pow(ca, 0.62), lip + (H - lip) * Math.pow(sa, 0.95)];
  }, 70);
  const lipPts = curve((s) => {
    const b = -s * (Math.PI / 2);
    return [R - lip + lip * Math.cos(b), lip + lip * Math.sin(b)];
  }, 14);
  const crustProfile = makeProfile([{ name: 'crust', band: [0, 1], points: [...dome, ...lipPts.slice(1)] }]);

  const shape = (pos, phi) => {
    const k = radialShape(noise, phi, 0.022);
    pos.x *= k;
    pos.z *= k;
  };

  const inside = new THREE.Vector3(0, H * 0.4, 0);
  const crustGeo = revolve(crustProfile, {
    radial: 200,
    inside,
    deform(pos, { phi, t, normal }) {
      // gentle asymmetric rise, like a real bun that proofed unevenly
      pos.y *= 1 + 0.035 * Math.sin(phi + 0.8) * smoothstep(0.2, 0.9, pos.y / H);
      const w = 1 - smoothstep(0.9, 1.0, t); // no displacement at the seam with the cut face
      const px = pos.x * 0.28;
      const py = pos.y * 0.28;
      const pz = pos.z * 0.28;
      const d = 0.13 * fbm3(noise, px, py, pz, 3) + 0.022 * fbm3(noise, px * 7 + 9, py * 7, pz * 7, 2);
      pos.addScaledVector(normal, d * w);
      shape(pos, phi);
    },
  });
  const crust = new THREE.Mesh(crustGeo, mats.bunTopCrust);

  // toasted cut face, slightly concave
  const faceR = R - lip;
  const faceProfile = makeProfile([
    { name: 'face', band: [0, 1], points: curve((s) => [s * faceR, 0.1 * (1 - s * s)], 30) },
  ]);
  const faceGeo = revolve(faceProfile, {
    radial: 200,
    uv: 'planar',
    planarRadius: R,
    inside,
    deform(pos, { phi, t }) {
      const w = 1 - smoothstep(0.85, 1.0, t);
      pos.y += 0.05 * fbm3(noise, pos.x * 0.9, 3.3, pos.z * 0.9, 3) * w;
      shape(pos, phi);
    },
  });
  const face = new THREE.Mesh(faceGeo, mats.crumb);

  // sesame seeds scattered over the dome, never overlapping
  const seeds = buildSesame(crustGeo, mats.sesame, seed + 11);

  for (const m of [crust, face, seeds]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return { group, meshes: [crust, face, seeds], height: H };
}

function buildSesame(crustGeo, material, seed) {
  // weight attribute: seeds on the crown and upper sides, none on the lower lip
  const t = crustGeo.attributes.profileT;
  const w = new Float32Array(t.count);
  for (let i = 0; i < t.count; i++) w[i] = 1 - smoothstep(0.7, 0.86, t.getX(i));
  crustGeo.setAttribute('seedWeight', new THREE.BufferAttribute(w, 1));
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(crustGeo)).setWeightAttribute('seedWeight');
  sampler.setRandomGenerator(mulberry32(seed));
  sampler.build();

  const rand = mulberry32(seed + 1);
  const minDist = 0.26;
  const cell = minDist;
  const grid = new Map();
  const accepted = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const keyOf = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let tries = 0; tries < 9000 && accepted.length < 620; tries++) {
    sampler.sample(p, n);
    const ix = Math.floor(p.x / cell);
    const iy = Math.floor(p.y / cell);
    const iz = Math.floor(p.z / cell);
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++)
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dz = -1; dz <= 1 && ok; dz++) {
          const list = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
          if (list) for (const q of list) if (q.distanceToSquared(p) < minDist * minDist) ok = false;
        }
    if (!ok) continue;
    const k = keyOf(p.x, p.y, p.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p.clone());
    accepted.push({ p: p.clone(), n: n.clone() });
  }

  // teardrop seed: flat on its belly, pointed at one end
  const geo = new THREE.SphereGeometry(1, 18, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    z *= 1 - 0.38 * ((x + 1) / 2);
    if (y < 0) y *= 0.35;
    pos.setXYZ(i, x * 0.155, y * 0.042, z * 0.095);
  }
  geo.computeVertexNormals();

  const mesh = new THREE.InstancedMesh(geo, material, accepted.length);
  mesh.name = 'sesame';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  const cream = new THREE.Color('#fff6e4');
  const toasted = new THREE.Color('#e7c48a');
  accepted.forEach((a, i) => {
    q.setFromUnitVectors(up, a.n);
    q2.setFromAxisAngle(up, rand() * Math.PI * 2);
    q.multiply(q2);
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (rand() - 0.5) * 0.35);
    q.multiply(tilt);
    const sc = 0.85 + rand() * 0.3;
    s.set(sc, sc * (0.9 + rand() * 0.3), sc);
    const pos3 = a.p.clone().addScaledVector(a.n, 0.012);
    m.compose(pos3, q, s);
    mesh.setMatrixAt(i, m);
    color.copy(cream).lerp(toasted, Math.pow(rand(), 2.2));
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/* --------------------------------------------------------------- bottom bun */

export function buildBottomBun(mats, seed = 3) {
  const { bottomRadius: R, bottomHeight: H } = BUN;
  const noise = createNoise(seed);
  const group = new THREE.Group();
  group.name = 'bun_bottom';
  const corner = 0.75;
  const topLip = 0.2;

  const bottomFace = curve((s) => [s * (R - corner), 0], 16);
  const cornerPts = curve((s) => {
    const b = -Math.PI / 2 + s * (Math.PI / 2);
    return [R - corner + corner * Math.cos(b), corner + corner * Math.sin(b)];
  }, 12);
  const side = curve((s) => {
    const y = corner + s * (H - corner - topLip);
    const bulge = 0.1 * Math.sin(s * Math.PI) - 0.05 * s;
    return [R + bulge, y];
  }, 22);
  const lipPts = curve((s) => {
    const b = s * (Math.PI / 2);
    return [R - 0.05 - topLip + topLip * Math.cos(b), H - topLip + topLip * Math.sin(b)];
  }, 8);
  const crustProfile = makeProfile([
    { name: 'bottom', band: [0, 0.35], points: [...bottomFace, ...cornerPts.slice(1)] },
    { name: 'side', band: [0.35, 1], points: [...side, ...lipPts.slice(1)] },
  ]);

  const shape = (pos, phi) => {
    const k = radialShape(noise, phi, 0.02);
    pos.x *= k;
    pos.z *= k;
  };
  const inside = new THREE.Vector3(0, H * 0.5, 0);
  const crustGeo = revolve(crustProfile, {
    radial: 200,
    inside,
    deform(pos, { phi, t, normal, part }) {
      const w = part === 'side' ? 1 - smoothstep(0.93, 1.0, t) : smoothstep(0.2, 0.35, t);
      const d = 0.09 * fbm3(noise, pos.x * 0.3, pos.y * 0.3, pos.z * 0.3, 3)
        + 0.03 * fbm3(noise, pos.x * 1.4 + 5, pos.y * 3.2, pos.z * 1.4, 2); // horizontal creases
      pos.addScaledVector(normal, d * w);
      shape(pos, phi);
    },
  });
  const crust = new THREE.Mesh(crustGeo, mats.bunBottomCrust);

  const faceR = R - 0.05 - topLip;
  const faceProfile = makeProfile([
    { name: 'face', band: [0, 1], points: curve((s) => [s * faceR, H + 0.08 * (1 - s * s)], 30) },
  ]);
  const faceGeo = revolve(faceProfile, {
    radial: 200,
    uv: 'planar',
    planarRadius: R,
    inside,
    deform(pos, { phi, t }) {
      const w = 1 - smoothstep(0.85, 1.0, t);
      pos.y += 0.05 * fbm3(noise, pos.x * 0.9, 7.7, pos.z * 0.9, 3) * w;
      shape(pos, phi);
    },
  });
  const face = new THREE.Mesh(faceGeo, mats.crumb);

  for (const m of [crust, face]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return { group, meshes: [crust, face], height: H };
}
