import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

/* ------------------------------------------------------------------ random */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNoise(seed) {
  return new SimplexNoise({ random: mulberry32(seed) });
}

/** Fractal simplex noise in [-1, 1]. */
export function fbm3(noise, x, y, z, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise.noise3d(x * f, y * f, z * f) * amp;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** Periodic noise around a circle: smooth function of the angle phi. */
export function circleNoise(noise, phi, freq, offset = 0) {
  return noise.noise3d(Math.cos(phi) * freq, Math.sin(phi) * freq, offset);
}

export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ----------------------------------------------------------------- profiles */

/**
 * Builds a 2D profile (radius x, height y) from several parts. Each part owns a
 * band [t0, t1] of the normalised texture radius used by the polar UV unwrap
 * (see tools/gen_textures.py). Inside a part, t is proportional to arc length.
 */
export function makeProfile(parts) {
  const out = [];
  for (const part of parts) {
    const pts = part.points;
    const lengths = [0];
    for (let i = 1; i < pts.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = lengths[lengths.length - 1] || 1;
    for (let i = 0; i < pts.length; i++) {
      if (out.length && i === 0) continue; // joint shared with previous part
      out.push({
        x: Math.max(0, pts[i][0]),
        y: pts[i][1],
        t: part.band[0] + (part.band[1] - part.band[0]) * (lengths[i] / total),
        part: part.name,
      });
    }
  }
  return out;
}

/** Samples a parametric curve fn(s), s in [0, 1], into n + 1 points. */
export function curve(fn, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(fn(i / n));
  return pts;
}

/* ---------------------------------------------------------- revolved solids */

const _tmp = new THREE.Vector3();

/**
 * Revolves a profile around the Y axis into an indexed, seamless mesh.
 * Points with x = 0 collapse into a single pole vertex (no pinched seam).
 *
 * options.deform(pos: Vector3, ctx) mutates the vertex; ctx = { phi, t, part,
 *   normal: Vector3 (undeformed outward normal), x, y, i }.
 * options.uv: 'polar' (azimuthal unwrap by profile t) or 'planar' (top view).
 * options.inside: a point inside the solid, used to orient faces outwards.
 */
export function revolve(profile, options = {}) {
  const radial = options.radial ?? 128;
  const uvMode = options.uv ?? 'polar';
  const planarRadius = options.planarRadius ?? 1;
  const inside = options.inside ?? new THREE.Vector3(0, 0, 0);

  const positions = [];
  const uvs = [];
  const tAttr = [];
  const rings = []; // per profile point: { start, count }
  const normal = new THREE.Vector3();

  profile.forEach((p, i) => {
    const pole = p.x < 1e-5;
    const count = pole ? 1 : radial;
    rings.push({ start: positions.length / 3, count });
    for (let j = 0; j < count; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      _tmp.set(p.x * c, p.y, p.x * s);
      if (pole) {
        normal.set(0, p.y >= inside.y ? 1 : -1, 0);
      } else {
        const a = profile[Math.max(0, i - 1)];
        const b = profile[Math.min(profile.length - 1, i + 1)];
        let nx = b.y - a.y;
        let ny = -(b.x - a.x);
        const l = Math.hypot(nx, ny) || 1;
        nx /= l;
        ny /= l;
        if (nx * p.x + ny * (p.y - inside.y) < 0) {
          nx = -nx;
          ny = -ny;
        }
        normal.set(nx * c, ny, nx * s);
      }
      if (options.deform) {
        options.deform(_tmp, { phi, t: p.t, part: p.part, normal, x: p.x, y: p.y, i });
      }
      positions.push(_tmp.x, _tmp.y, _tmp.z);
      if (uvMode === 'polar') {
        uvs.push(0.5 + 0.5 * p.t * c, 0.5 + 0.5 * p.t * s);
      } else {
        const bx = p.x * c;
        const bz = p.x * s;
        uvs.push(0.5 + bx / (2 * planarRadius), 0.5 - bz / (2 * planarRadius));
      }
      tAttr.push(p.t);
    }
  });

  const index = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    if (A.count === 1 && B.count === 1) continue;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      if (A.count === 1) {
        index.push(A.start, B.start + j1, B.start + j);
      } else if (B.count === 1) {
        index.push(A.start + j, A.start + j1, B.start);
      } else {
        const a = A.start + j;
        const b = A.start + j1;
        const c = B.start + j;
        const d = B.start + j1;
        index.push(a, b, d, a, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('profileT', new THREE.Float32BufferAttribute(tAttr, 1));
  geo.setIndex(index);
  orientOutwards(geo, inside);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Makes sure triangles face away from `inside` (majority vote), flipping the
 * winding of the whole index buffer otherwise.
 */
export function orientOutwards(geo, inside) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  let score = 0;
  const step = Math.max(3, Math.floor(idx.length / 3 / 400) * 3);
  for (let i = 0; i < idx.length; i += step) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2);
    const centroid = a.add(b).add(c).multiplyScalar(1 / 3);
    score += Math.sign(n.dot(centroid.sub(inside)));
  }
  if (score < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
}

/* --------------------------------------------------------- thick sheets */

/**
 * A closed, thick sheet (top face, bottom face and edge strip) built from a
 * mid-surface function. Used for melted cheese slices and onion petals.
 *
 * fn(u, v, out: Vector3) writes the mid-surface point for u, v in [0, 1].
 * thickness(u, v) returns the local thickness.
 */
export function thickSheet({ nu, nv, fn, thickness, uvScale = 1 }) {
  const W = nu + 1;
  const H = nv + 1;
  const mid = new Float32Array(W * H * 3);
  const p = new THREE.Vector3();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      fn(i / nu, j / nv, p);
      mid.set([p.x, p.y, p.z], (j * W + i) * 3);
    }
  }
  const get = (i, j, out) => {
    i = Math.min(nu, Math.max(0, i));
    j = Math.min(nv, Math.max(0, j));
    const k = (j * W + i) * 3;
    return out.set(mid[k], mid[k + 1], mid[k + 2]);
  };

  const positions = new Float32Array(W * H * 2 * 3);
  const uvs = new Float32Array(W * H * 2 * 2);
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();
  // global orientation: the mid-surface normal at the centre must point up
  const ci = Math.round(nu / 2);
  const cj = Math.round(nv / 2);
  du.subVectors(get(ci + 1, cj, a), get(ci - 1, cj, b));
  dv.subVectors(get(ci, cj + 1, a), get(ci, cj - 1, b));
  const orient = n.crossVectors(dv, du).y >= 0 ? 1 : -1;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      du.subVectors(get(i + 1, j, a), get(i - 1, j, b));
      dv.subVectors(get(i, j + 1, a), get(i, j - 1, b));
      n.crossVectors(dv, du).normalize().multiplyScalar(orient);
      const t = thickness(i / nu, j / nv) * 0.5;
      get(i, j, p);
      const k = j * W + i;
      positions.set([p.x + n.x * t, p.y + n.y * t, p.z + n.z * t], k * 3);
      positions.set([p.x - n.x * t, p.y - n.y * t, p.z - n.z * t], (W * H + k) * 3);
      const uu = (i / nu) * uvScale;
      const vv = (j / nv) * uvScale;
      uvs.set([uu, vv], k * 2);
      uvs.set([uu, vv], (W * H + k) * 2);
    }
  }

  const index = [];
  const top = (i, j) => j * W + i;
  const bot = (i, j) => W * H + j * W + i;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      index.push(top(i, j), top(i, j + 1), top(i + 1, j + 1), top(i, j), top(i + 1, j + 1), top(i + 1, j));
      index.push(bot(i, j), bot(i + 1, j + 1), bot(i, j + 1), bot(i, j), bot(i + 1, j), bot(i + 1, j + 1));
    }
  }
  // edge strip, walking the boundary
  const border = [];
  for (let i = 0; i < nu; i++) border.push([i, 0]);
  for (let j = 0; j < nv; j++) border.push([nu, j]);
  for (let i = nu; i > 0; i--) border.push([i, nv]);
  for (let j = nv; j > 0; j--) border.push([0, j]);
  for (let k = 0; k < border.length; k++) {
    const [i0, j0] = border[k];
    const [i1, j1] = border[(k + 1) % border.length];
    index.push(top(i0, j0), bot(i0, j0), bot(i1, j1), top(i0, j0), bot(i1, j1), top(i1, j1));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  // orient: top faces must point to +normal of the mid surface (up for sheets
  // lying flat). Use a point far below as "inside" reference for the top.
  fixSheetWinding(geo, W * H);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function fixSheetWinding(geo, topCount) {
  // Check first top triangle: its normal should point upward on average.
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let up = 0;
  for (let i = 0; i < idx.length; i += 3) {
    if (idx[i] >= topCount || idx[i + 1] >= topCount || idx[i + 2] >= topCount) continue;
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    up += b.sub(a).cross(c.sub(a)).y;
  }
  if (up < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
}
