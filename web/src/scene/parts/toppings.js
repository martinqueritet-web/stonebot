import * as THREE from 'three';
import {
  createNoise, fbm3, circleNoise, makeProfile, curve, revolve, smoothstep, thickSheet, mulberry32,
} from '../geometry.js';

/* ------------------------------------------------------------------ sauce */

/**
 * Creamy burger sauce spread on the top cheese: a lobed, glossy puddle that
 * follows the surface below it (`surfaceAt(x, z)`).
 */
export function buildSauce(mat, surfaceAt, { seed = 91, radius = 4.1, offset = [0.3, 0.6] } = {}) {
  const noise = createNoise(seed);
  const Tc = 0.2;
  const top = curve((s) => [s * radius * 0.82, Tc * (1 - 0.35 * s * s)], 20);
  const edge = curve((s) => {
    const a = Math.PI / 2 - s * (Math.PI / 2);
    return [radius * 0.82 + radius * 0.18 * Math.cos(a), Tc * 0.65 * Math.sin(a)];
  }, 10);
  const bottom = curve((s) => [(1 - s) * radius, -0.02 * s], 8);
  const profile = makeProfile([
    { name: 'top', band: [0, 0.8], points: [...top, ...edge.slice(1)] },
    { name: 'bottom', band: [0.8, 1], points: bottom },
  ]);
  const geo = revolve(profile, {
    radial: 180,
    uv: 'planar',
    planarRadius: radius * 1.3,
    inside: new THREE.Vector3(0, 0.05, 0),
    deform(pos, { phi, part }) {
      const k = 1 + 0.2 * circleNoise(noise, phi, 1.2, 0.5) + 0.07 * circleNoise(noise, phi, 3.6, 2.5);
      pos.x *= k;
      pos.z *= k;
      if (part === 'top') pos.y += 0.035 * fbm3(noise, pos.x * 0.5, 0, pos.z * 0.5, 3);
      pos.x += offset[0];
      pos.z += offset[1];
      pos.y += surfaceAt(pos.x, pos.z);
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, meshes: [mesh] };
}

/* ---------------------------------------------------------------- pickles */

export function buildPickles(mat, surfaceAt, { seed = 51, slices } = {}) {
  const group = new THREE.Group();
  const meshes = [];
  const rand = mulberry32(seed);
  slices.forEach((cfg, idx) => {
    const noise = createNoise(seed + idx * 13);
    const R = cfg.radius;
    const T = 0.28;
    const topFace = curve((s) => [s * (R - 0.08), T], 12);
    const skin = curve((s) => {
      const a = Math.PI / 2 - s * Math.PI;
      return [R - 0.08 + 0.08 * Math.cos(a), T / 2 + (T / 2) * Math.sin(a)];
    }, 10);
    const botFace = curve((s) => [(1 - s) * (R - 0.08), 0], 12);
    const profile = makeProfile([
      { name: 'top', band: [0, 0.44], points: topFace },
      { name: 'skin', band: [0.44, 0.56], points: skin },
      { name: 'bottom', band: [0.56, 1], points: botFace },
    ]);
    const geo = revolve(profile, {
      radial: 96,
      inside: new THREE.Vector3(0, T / 2, 0),
      deform(pos, { phi, normal, part }) {
        const k = 1 + 0.04 * circleNoise(noise, phi, 1.1, 0.2) + (part === 'skin' ? 0.015 * Math.sin(phi * 18) : 0);
        pos.x *= k * (1 + (cfg.oval ?? 0.06));
        pos.z *= k;
        pos.addScaledVector(normal, 0.015 * fbm3(noise, pos.x * 3, pos.y * 3, pos.z * 3, 2));
        // slices curl a little
        pos.y += 0.05 * (pos.x * pos.x + pos.z * pos.z) / (R * R);
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const [x, z] = cfg.at;
    // rest on the surface: follow its slope
    const e = 0.4;
    const y0 = surfaceAt(x, z);
    const dx = (surfaceAt(x + e, z) - surfaceAt(x - e, z)) / (2 * e);
    const dz = (surfaceAt(x, z + e) - surfaceAt(x, z - e)) / (2 * e);
    mesh.position.set(x, y0 + 0.02, z);
    const n = new THREE.Vector3(-dx, 1, -dz).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2));
    if (cfg.tilt) mesh.rotateX(cfg.tilt);
    group.add(mesh);
    meshes.push(mesh);
  });
  return { group, meshes };
}

/* ----------------------------------------------------------------- onions */

/**
 * Soft griddled white onions: a thin melted base plus a pile of translucent
 * curved petals (instanced).
 */
export function buildOnions(mat, { seed = 23, radius = 5.6, count = 150 } = {}) {
  const noise = createNoise(seed);
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const meshes = [];

  // melted base layer
  const baseR = radius * 0.95;
  const top = curve((s) => [s * baseR, 0.22 * (1 - Math.pow(s, 3))], 20);
  const bottom = curve((s) => [(1 - s) * baseR, 0], 10);
  const baseGeo = revolve(
    makeProfile([
      { name: 'top', band: [0, 0.8], points: top },
      { name: 'bottom', band: [0.8, 1], points: bottom },
    ]),
    {
      radial: 160,
      uv: 'planar',
      planarRadius: baseR / 3,
      inside: new THREE.Vector3(0, 0.05, 0),
      deform(pos, { phi, part }) {
        const k = 1 + 0.12 * circleNoise(noise, phi, 1.4, 0.4) + 0.05 * circleNoise(noise, phi, 4, 3);
        pos.x *= k;
        pos.z *= k;
        if (part === 'top') pos.y += 0.09 * fbm3(noise, pos.x * 0.8, 1, pos.z * 0.8, 3);
      },
    },
  );
  const base = new THREE.Mesh(baseGeo, mat);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  meshes.push(base);

  // petal variants: curved slivers of onion layer
  const variants = [];
  for (let v = 0; v < 6; v++) {
    const pn = createNoise(seed + 100 + v);
    const len = 1.2 + rand() * 0.9;
    const wid = 0.75 + rand() * 0.45;
    const curl = 0.25 + rand() * 0.35;
    const twist = (rand() - 0.5) * 0.4;
    const geo = thickSheet({
      nu: 18,
      nv: 10,
      uvScale: 0.5,
      fn: (u, w, out) => {
        const x = (u - 0.5) * len;
        let z = (w - 0.5) * wid;
        // irregular torn outline
        const taper = 1 - 0.35 * Math.pow(Math.abs(u - 0.5) * 2, 2) + 0.12 * pn.noise(u * 4, 0.3);
        z *= taper;
        const y = -curl * (z * z) / wid + twist * x * z + 0.04 * pn.noise(u * 3, w * 3);
        const sag = -0.12 * Math.pow((u - 0.5) * 2, 2);
        out.set(x, y + sag, z);
      },
      thickness: (u, w) => {
        const e = Math.min(u, w, 1 - u, 1 - w);
        return 0.17 * (0.45 + 0.55 * smoothstep(0, 0.3, e));
      },
    });
    variants.push(geo);
  }

  const perVariant = Math.ceil(count / variants.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  variants.forEach((geo) => {
    const inst = new THREE.InstancedMesh(geo, mat, perVariant);
    for (let i = 0; i < perVariant; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius * (0.95 + 0.1 * rand());
      const mound = 0.5 * (1 - Math.pow(r / (radius * 1.05), 2));
      p.set(Math.cos(a) * r, 0.16 + mound * rand() + 0.08 * rand(), Math.sin(a) * r);
      // pieces near the rim droop outwards
      const edgeT = smoothstep(0.7, 1.05, r / radius);
      e.set((rand() - 0.5) * 0.45, rand() * Math.PI * 2, (rand() - 0.5) * 0.45 - edgeT * 0.35);
      q.setFromEuler(e);
      const sc = 0.8 + rand() * 0.5;
      s.set(sc, 1, sc);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
    meshes.push(inst);
  });

  return { group, meshes, height: 0.6 };
}
