/**
 * Scroll choreography. `p` is the scroll progress through the pinned hero
 * section (0 = assembled burger, 1 = exploded view held on screen).
 *
 * Every layer follows a monotone cubic spline through its keys, so velocity is
 * continuous (no stop-and-go "slide show" steps) and nothing overshoots.
 * Offsets are vertical displacements in centimetres from the assembled pose.
 */

/** Fritsch–Carlson monotone cubic interpolation through [x, y] keys. */
export function monotoneSpline(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  // first and last keys are holds: zero slope for a soft start / landing
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]
      + (t3 - 2 * t2 + t) * h * m[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1]
      + (t3 - t2) * h * m[i + 1]
    );
  };
}

/**
 * Layer timings. `lift` keys: [progress, vertical offset].
 * `yaw` / `tilt`: small rotations (radians) reached when fully separated, to
 * reveal each ingredient's sides — kept tiny on purpose.
 * `label`: progress window where the caption fades in, and its side.
 */
export const LAYERS = {
  bun_top: {
    lift: [[0.04, 0], [0.24, 5.2], [0.5, 12.0], [0.76, 17.8]],
    yaw: 0.12, tilt: -0.1,
    label: { from: 0.1, to: 0.2, side: 'right' },
  },
  pickles: {
    lift: [[0.12, 0], [0.3, 3.3], [0.52, 9.2], [0.76, 15.0]],
    yaw: -0.18, tilt: 0,
    label: { from: 0.18, to: 0.28, side: 'left' },
  },
  sauce: {
    lift: [[0.15, 0], [0.34, 2.3], [0.54, 7.6], [0.77, 13.2]],
    yaw: 0.1, tilt: 0,
    label: { from: 0.24, to: 0.34, side: 'right' },
  },
  cheese_top: {
    lift: [[0.18, 0], [0.35, 1.4], [0.56, 5.6], [0.78, 11.4]],
    yaw: -0.08, tilt: 0,
    label: { from: 0.3, to: 0.4, side: 'left' },
  },
  // lifts with the cheese, then settles back down a little: the patty visibly
  // "drops" away from the upper layers before taking its final place
  patty_top: {
    lift: [[0.22, 0], [0.35, 0.8], [0.46, 0.45], [0.6, 2.8], [0.8, 8.6]],
    yaw: 0.14, tilt: 0,
    label: { from: 0.38, to: 0.48, side: 'right' },
  },
  cheese_bottom: {
    lift: [[0.4, 0], [0.56, 1.0], [0.82, 6.6]],
    yaw: -0.1, tilt: 0,
    label: { from: 0.5, to: 0.6, side: 'left' },
  },
  patty_bottom: {
    lift: [[0.46, 0], [0.84, 3.6]],
    yaw: 0.06, tilt: 0,
    label: { from: 0.58, to: 0.68, side: 'right' },
  },
  onions: {
    lift: [[0.52, 0], [0.86, 1.6]],
    yaw: -0.05, tilt: 0,
    label: { from: 0.66, to: 0.76, side: 'left' },
  },
  bun_bottom: {
    lift: [[0, 0], [1, 0]],
    yaw: 0, tilt: 0,
    label: { from: 0.74, to: 0.84, side: 'right' },
  },
};

/**
 * Camera path (spherical coordinates around a moving target).
 * az/el in degrees, `fit` = multiplier of the distance needed to frame the
 * current stack height.
 */
export const CAMERA_KEYS = {
  az: [[0, 0], [0.3, -10], [0.62, -20], [0.9, -24], [1, -24]],
  el: [[0, 5], [0.25, 11], [0.6, 15], [1, 13]],
  fit: [[0, 1.0], [0.3, 0.97], [0.7, 0.92], [1, 0.92]],
  // framing margin around the current stack height (the stack itself is
  // measured every frame, so the camera always frames what is on screen)
  margin: [[0, 1.3], [0.3, 1.18], [1, 1.12]],
  fov: [[0, 24], [1, 27]],
  // depth-of-field strength (0 = everything sharp)
  dof: [[0, 0.6], [0.35, 1], [0.8, 0.45], [1, 0.35]],
};
