"""
Procedural PBR texture generator for the burger scene.

Every map is generated from scratch (no third-party image) and calibrated on the
colours sampled from the reference photo. Run from the web/ folder:

    python3 tools/gen_textures.py

Outputs JPEGs into public/textures/:
  <name>_albedo.jpg   sRGB base colour
  <name>_normal.jpg   tangent-space normal (OpenGL convention, +Y up)
  <name>_orm.jpg      R = ambient occlusion, G = roughness, B = metalness (0)

UV layouts
----------
"polar" textures are unrolled with an azimuthal equidistant mapping: the texture
radius (0 at the centre of the image, 1 at the inscribed circle) is the
normalised arc length along the object's profile (see src/scene/geometry.js).
Each object documents its bands (e.g. patty: top 0-.42, rim .42-.58, bottom .58-1).
"""
import os
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates, gaussian_filter

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "textures")
os.makedirs(OUT, exist_ok=True)


# ----------------------------------------------------------------- noise tools
def fbm(n, beta=2.0, seed=0, lo=1.0, hi=None):
    """Tileable fractal noise by spectral synthesis, normalised to [0, 1]."""
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((n, n))
    F = np.fft.fft2(w)
    f = np.sqrt(np.fft.fftfreq(n)[None, :] ** 2 + np.fft.fftfreq(n)[:, None] ** 2) * n
    f[0, 0] = 1.0
    amp = 1.0 / f ** (beta / 2.0)
    amp[f < lo] = 0.0
    if hi is not None:
        amp *= np.exp(-((f / hi) ** 2))
    out = np.real(np.fft.ifft2(F * amp))
    return norm(out)


def norm(a):
    a = a - a.min()
    return a / (a.max() + 1e-9)


def worley(n, cells, seed=0, k=2):
    """Tileable Worley noise. Returns (F1, F2) distances in cell units."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cells, 2))
    tree = cKDTree(pts, boxsize=1.0)
    g = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(g, g)
    q = np.stack([X.ravel(), Y.ravel()], 1)
    d, idx = tree.query(q, k=k, workers=-1)
    scale = np.sqrt(cells)
    d = d * scale
    return d[:, 0].reshape(n, n), d[:, 1].reshape(n, n), idx[:, 0].reshape(n, n)


def specks(n, count, radius, seed=0, soft=0.6):
    """Random small dots mask (0..1)."""
    rng = np.random.default_rng(seed)
    m = np.zeros((n, n), np.float32)
    xs = rng.integers(0, n, count)
    ys = rng.integers(0, n, count)
    m[ys, xs] = 1.0
    m = gaussian_filter(m, radius, mode="wrap")
    return np.clip(m / (m.max() * soft + 1e-9), 0, 1)


def polar_grid(n):
    g = (np.arange(n) + 0.5) / n * 2 - 1
    X, Y = np.meshgrid(g, -g)
    r = np.sqrt(X ** 2 + Y ** 2)
    th = np.arctan2(Y, X)
    return r, th


def sample_wrapped(tex, u, v):
    """Bilinear sample of a tileable texture at u,v (in texture repeats)."""
    n = tex.shape[0]
    return map_coordinates(tex, [(v * n) % n, (u * n) % n], order=1, mode="grid-wrap")


def polar_noise(tex, r, th, rep_theta, rep_r):
    """Sample tileable noise in (theta, r) space -> streaks around the circumference."""
    return sample_wrapped(tex, (th / (2 * np.pi)) * rep_theta, r * rep_r)


def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return a + (b - a) * t


def ramp(t, stops):
    """Colour ramp. stops: list of (pos, (r,g,b))."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    pos = [s[0] for s in stops]
    cols = [np.array(s[1], np.float32) for s in stops]
    for c in range(3):
        out[..., c] = np.interp(t, pos, [col[c] for col in cols])
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nrm = np.dstack([-dx, dy, np.ones_like(h)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    return nrm * 0.5 + 0.5


def save_rgb(name, arr, q=90):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    img.save(os.path.join(OUT, name), quality=q, optimize=True, subsampling=0 if "normal" in name else 2)
    print("wrote", name, img.size)


def save_set(name, albedo, height, strength, rough, ao=None):
    n = height.shape[0]
    save_rgb(f"{name}_albedo.jpg", albedo)
    save_rgb(f"{name}_normal.jpg", normal_from_height(height, strength) * 255, q=92)
    if ao is None:
        ao = np.ones((n, n))
    orm = np.dstack([ao, rough, np.zeros_like(rough)]) * 255
    save_rgb(f"{name}_orm.jpg", orm)


def jitter(col, amount, seed):
    """Per-pixel low-frequency hue/value variation."""
    n = col.shape[0]
    a = fbm(n, 2.4, seed, lo=2, hi=60)[..., None] - 0.5
    b = fbm(n, 2.4, seed + 1, lo=2, hi=60)[..., None] - 0.5
    return col * (1 + a * amount) + np.concatenate([b * 10, b * 4, -b * 6], 2) * amount * 2


# ------------------------------------------------------------------ patty
def patty(n=2048):
    """Polar: top 0-.42 | rim .42-.58 | bottom .58-1."""
    r, th = polar_grid(n)
    # ground-beef granules (worley bumps) at two scales
    f1, f2, _ = worley(n, 16000, seed=11)
    gran = 1 - smooth(0.0, 0.75, f1)
    g1, g2, _ = worley(n, 4000, seed=12)
    lumps = 1 - smooth(0.0, 0.9, g1)
    cracks = smooth(0.0, 0.12, g2 - g1)  # dark valleys between lumps
    big = fbm(n, 2.6, 13, lo=2, hi=90)
    fine = fbm(n, 1.6, 14, lo=40)
    height = gran * 0.5 + lumps * 0.3 + big * 0.6 + fine * 0.1 - (1 - cracks) * 0.12

    # sear map: crust intensity. raised areas touched the griddle.
    rim = np.exp(-((r - 0.5) / 0.07) ** 2)
    sear = np.clip(0.35 + height * 0.55 + fbm(n, 2.2, 15, lo=3, hi=120) * 0.45 - 0.25 + rim * 0.45, 0, 1)
    col = ramp(sear, [
        (0.00, (168, 100, 62)),  # exposed meat
        (0.30, (138, 74, 42)),
        (0.55, (104, 52, 28)),   # seared brown
        (0.78, (72, 36, 19)),
        (1.00, (40, 22, 13)),    # char
    ])
    col *= (0.86 + 0.14 * cracks)[..., None]
    col = jitter(col, 0.25, 16)
    # black pepper and coarse salt
    pep = specks(n, 9000, 1.1, seed=17)
    col = lerp(col, np.array([18, 12, 8], np.float32), pep * 0.9)
    salt = specks(n, 1200, 0.8, seed=18)
    col = lerp(col, np.array([200, 175, 150], np.float32), salt * 0.35)
    # glossy rendered fat
    fat = smooth(0.62, 0.9, fbm(n, 1.8, 19, lo=12)) * (1 - sear * 0.5)
    rough = np.clip(0.62 - fat * 0.4 + sear * 0.12 - gran * 0.08, 0.18, 0.9)
    ao = np.clip(0.72 + 0.28 * cracks * (0.6 + 0.4 * gran), 0, 1)
    save_set("patty", col, height, 5.0, rough, ao)


# ------------------------------------------------------------------ top bun
def bun_top(n=2048):
    """Polar: 0 = crown, 1 = rim of the dome (lower edge of the crust)."""
    r, th = polar_grid(n)
    t = np.clip(r, 0, 1)
    low = fbm(n, 2.8, 21, lo=2, hi=40)
    mid = fbm(n, 2.0, 22, lo=10, hi=200)
    col = ramp(t + (low - 0.5) * 0.18, [
        (0.00, (138, 52, 10)),
        (0.35, (158, 64, 12)),
        (0.62, (188, 88, 20)),
        (0.80, (214, 122, 36)),
        (0.90, (226, 150, 62)),   # oven-spring "break" band, paler
        (0.97, (196, 100, 30)),
        (1.00, (170, 76, 18)),
    ])
    col *= (0.9 + 0.2 * mid)[..., None]
    col = jitter(col, 0.18, 23)
    # fine crust pores and micro blisters
    f1, _, _ = worley(n, 30000, seed=24)
    pores = smooth(0.0, 0.35, f1)
    streak = polar_noise(fbm(1024, 2.0, 25, lo=4), r, th, 3, 0.6)
    height = mid * 0.5 + pores * 0.25 + low * 0.6 + streak * smooth(0.75, 0.95, t) * 0.5
    col *= (0.93 + 0.07 * pores)[..., None]
    rough = np.clip(0.32 + (1 - pores) * 0.1 + mid * 0.1 + smooth(0.85, 1.0, t) * 0.15, 0.2, 0.7)
    save_set("bun_top", col, height, 3.0, rough)


# ------------------------------------------------------------------ bottom bun
def bun_bottom(n=2048):
    """Polar: bottom face 0-.35 | side .35-1 (1 = top cut edge)."""
    r, th = polar_grid(n)
    t = np.clip(r, 0, 1)
    wr = polar_noise(fbm(1024, 2.2, 31, lo=3), r, th, 5, 0.9)  # horizontal wrinkles on the side
    low = fbm(n, 2.6, 32, lo=2, hi=50)
    col = ramp(t + (low - 0.5) * 0.08, [
        (0.00, (170, 96, 40)),
        (0.30, (160, 80, 26)),
        (0.36, (140, 58, 12)),    # dark seared lower edge
        (0.50, (186, 88, 16)),
        (0.70, (222, 128, 24)),
        (0.88, (232, 148, 34)),
        (0.96, (238, 178, 90)),   # pale cut edge
        (1.00, (232, 190, 124)),
    ])
    col *= (0.88 + 0.24 * low)[..., None]
    col = jitter(col, 0.16, 33)
    f1, _, _ = worley(n, 26000, seed=34)
    pores = smooth(0.0, 0.35, f1)
    side = smooth(0.35, 0.45, t)
    height = low * 0.5 + pores * 0.2 + wr * side * 0.8
    col *= (0.92 + 0.08 * pores)[..., None] * (0.9 + 0.1 * wr[..., None])
    rough = np.clip(0.36 + (1 - side) * 0.3 + (1 - pores) * 0.1, 0.25, 0.8)
    save_set("bun_bottom", col, height, 3.5, rough)


# ------------------------------------------------------------------ toasted crumb
def crumb(n=1024):
    """Planar: cut face of the buns, griddle-toasted."""
    f1, f2, _ = worley(n, 5000, seed=41)
    holes = smooth(0.0, 0.5, f1)            # open crumb cells
    g1, _, _ = worley(n, 900, seed=42)
    big_holes = smooth(0.1, 0.6, g1)
    toast = fbm(n, 2.4, 43, lo=2, hi=40)
    r, _ = polar_grid(n)
    toast = np.clip(toast * 0.9 + (1 - smooth(0.4, 1.0, r)) * 0.25, 0, 1)  # centre toasts more
    toast = gaussian_filter(toast, 6, mode="wrap")
    col = ramp(toast, [
        (0.0, (236, 190, 118)),
        (0.4, (226, 164, 84)),
        (0.7, (204, 128, 56)),
        (1.0, (168, 94, 36)),
    ])
    col *= (0.8 + 0.2 * holes * big_holes)[..., None]
    col = jitter(col, 0.12, 44)
    height = holes * 0.5 + big_holes * 0.5 + fbm(n, 1.8, 45, lo=30) * 0.2
    rough = np.clip(0.7 - toast * 0.15, 0.4, 0.9)
    ao = 0.6 + 0.4 * holes * big_holes
    save_set("crumb", col, height, 6.0, rough, ao)


# ------------------------------------------------------------------ cheese
def cheese(n=1024):
    base = fbm(n, 3.0, 51, lo=1, hi=20)
    col = ramp(base, [(0.0, (246, 192, 48)), (0.6, (240, 176, 36)), (1.0, (230, 152, 26))])
    col = jitter(col, 0.06, 52)
    speck = specks(n, 600, 1.5, seed=53)
    col = lerp(col, np.array([250, 205, 90], np.float32), speck * 0.3)
    ripple = fbm(n, 2.2, 54, lo=4, hi=50)
    bubbles = 1 - smooth(0.0, 0.3, worley(n, 400, seed=55)[0])
    height = ripple * 0.6 + bubbles * 0.15
    rough = np.clip(0.26 + fbm(n, 2.0, 56, lo=3) * 0.18, 0.18, 0.5)
    save_set("cheese", col, height, 2.0, rough)


# ------------------------------------------------------------------ sauce
def sauce(n=1024):
    base = fbm(n, 2.6, 61, lo=1, hi=40)
    col = ramp(base, [(0.0, (236, 150, 36)), (0.5, (226, 130, 28)), (1.0, (204, 104, 22))])
    col = jitter(col, 0.08, 62)
    pep = specks(n, 3500, 0.9, seed=63)
    col = lerp(col, np.array([60, 32, 18], np.float32), pep * 0.85)
    pap = specks(n, 900, 2.2, seed=64, soft=0.9)
    col = lerp(col, np.array([180, 70, 30], np.float32), pap * 0.35)
    relish = specks(n, 250, 3.0, seed=65, soft=0.9)
    col = lerp(col, np.array([120, 110, 40], np.float32), relish * 0.45)
    height = fbm(n, 3.0, 66, lo=2, hi=30) + relish * 0.3
    rough = np.clip(0.14 + pep * 0.2 + relish * 0.2, 0.1, 0.5)
    save_set("sauce", col, height, 3.0, rough)


# ------------------------------------------------------------------ pickle
def pickle(n=1024):
    """Polar: top face 0-.44 | skin .44-.56 | bottom face .56-1."""
    r, th = polar_grid(n)
    t = np.clip(r, 0, 1)
    # face radius (0 centre .. 1 skin) for both faces
    fr = np.where(t < 0.5, t / 0.44, (1 - t) / 0.44)
    fr = np.clip(fr, 0, 1.2)
    skin = smooth(0.9, 0.97, fr)
    flesh = ramp(fr, [
        (0.0, (150, 150, 70)),
        (0.45, (132, 135, 58)),
        (0.75, (112, 120, 46)),
        (0.9, (78, 92, 30)),
        (1.0, (46, 60, 18)),
    ])
    # seed ring: pale elliptic seeds oriented radially
    rng = np.random.default_rng(71)
    seeds = np.zeros_like(t)
    for face_c in (0.0, 1.0):
        for k in range(11):
            a = k / 11 * 2 * np.pi + rng.uniform(-0.12, 0.12)
            rad = rng.uniform(0.42, 0.55)
            # position in face-radius space mapped back to texture radius
            tr = rad * 0.44 if face_c == 0 else 1 - rad * 0.44
            cx, cy = np.cos(a) * tr, np.sin(a) * tr
            g = (np.arange(n) + 0.5) / n * 2 - 1
            X, Y = np.meshgrid(g, -g)
            dx, dy = X - cx, Y - cy
            ca, sa = np.cos(a), np.sin(a)
            u = dx * ca + dy * sa
            v = -dx * sa + dy * ca
            seeds = np.maximum(seeds, 1 - smooth(0.6, 1.0, (u / 0.03) ** 2 + (v / 0.017) ** 2))
    gel = np.exp(-((fr - 0.48) / 0.14) ** 2)
    flesh = lerp(flesh, np.array([170, 168, 96], np.float32), gel * 0.35)
    flesh = lerp(flesh, np.array([206, 200, 140], np.float32), seeds * 0.85)
    skin_col = ramp(fbm(n, 2.0, 72, lo=6), [(0, (34, 48, 14)), (1, (62, 78, 24))])
    col = lerp(flesh, skin_col, skin)
    col = jitter(col, 0.12, 73)
    bumps = 1 - smooth(0.0, 0.5, worley(n, 3000, seed=74)[0])
    fib = polar_noise(fbm(1024, 1.8, 75, lo=6), r, th, 6, 2.0)
    height = bumps * skin * 0.6 + fib * (1 - skin) * 0.3 + seeds * 0.25
    rough = np.clip(0.2 + skin * 0.15 + seeds * 0.1, 0.12, 0.5)
    save_set("pickle", col, height, 3.0, rough)


# ------------------------------------------------------------------ onion
def onion(n=512):
    fib = fbm(n, 1.4, 81, lo=3)
    streak = sample_wrapped(fbm(n, 2.0, 82, lo=2), np.tile(np.linspace(0, 1, n), (n, 1)) * 0.1,
                            np.tile(np.linspace(0, 1, n)[:, None], (1, n)) * 3)
    t = fbm(n, 2.5, 83, lo=2, hi=20)
    col = ramp(t, [(0.0, (226, 206, 170)), (0.5, (214, 186, 140)), (0.85, (204, 160, 98)), (1.0, (184, 128, 66))])
    col *= (0.94 + 0.06 * streak)[..., None]
    height = streak * 0.6 + fib * 0.15
    rough = np.clip(0.18 + fib * 0.15, 0.12, 0.4)
    save_set("onion", col, height, 2.0, rough)


# ------------------------------------------------------------------ board
def board(n=2048):
    g = np.linspace(0, 1, n, endpoint=False)
    X, Y = np.meshgrid(g, g)
    warp = fbm(1024, 3.0, 91, lo=1, hi=8)
    w2 = sample_wrapped(warp, X, Y)
    rings = np.sin((Y * 34 + w2 * 3.5) * 2 * np.pi) * 0.5 + 0.5
    fibres = sample_wrapped(fbm(1024, 1.2, 92, lo=4), X * 0.25, Y * 6)
    t = rings ** 4 * 0.22 + fibres * 0.78
    col = ramp(t, [(0.0, (238, 198, 156)), (0.5, (228, 184, 138)), (1.0, (206, 156, 110))])
    col *= (0.93 + 0.14 * fbm(n, 2.6, 93, lo=1, hi=10))[..., None]
    col = jitter(col, 0.08, 94)
    # knife marks
    rng = np.random.default_rng(95)
    cuts = np.zeros((n, n), np.float32)
    for _ in range(90):
        x0, y0 = rng.random(2) * n
        a = rng.uniform(0, np.pi)
        L = rng.uniform(40, 260)
        s = np.linspace(0, 1, int(L))
        xs = ((x0 + np.cos(a) * L * s) % n).astype(int)
        ys = ((y0 + np.sin(a) * L * s) % n).astype(int)
        cuts[ys, xs] = rng.uniform(0.4, 1)
    cuts = gaussian_filter(cuts, 0.7, mode="wrap")
    cuts = np.clip(cuts / cuts.max() * 2.2, 0, 1)
    col *= (1 - cuts * 0.12)[..., None]
    height = fibres * 0.5 + rings * 0.2 - cuts * 0.8
    rough = np.clip(0.62 + fibres * 0.15 - rings * 0.08, 0.4, 0.9)
    save_set("board", col, height, 3.0, rough)


# ------------------------------------------------------------------ backdrop wall
def wall(n=1024):
    m = fbm(n, 2.8, 101, lo=1, hi=60)
    col = ramp(m, [(0.0, (160, 80, 48)), (0.5, (172, 90, 56)), (1.0, (182, 100, 64))])
    col *= (0.96 + 0.08 * fbm(n, 1.5, 102, lo=40))[..., None]
    save_rgb("wall_albedo.jpg", col, q=85)


# ------------------------------------------------------------------ sesame
def sesame(n=256):
    g = np.linspace(-1, 1, n)
    X, Y = np.meshgrid(g, g)
    t = fbm(n, 2.0, 111, lo=2)
    col = ramp(t, [(0.0, (244, 232, 204)), (0.6, (232, 212, 172)), (1.0, (214, 184, 132))])
    ridge = np.exp(-(X / 0.06) ** 2) * 0.4
    height = t * 0.3 + ridge
    rough = np.clip(0.45 + t * 0.2, 0.3, 0.7)
    save_set("sesame", col, height, 2.0, rough)


if __name__ == "__main__":
    import sys
    jobs = dict(patty=patty, bun_top=bun_top, bun_bottom=bun_bottom, crumb=crumb, cheese=cheese,
                sauce=sauce, pickle=pickle, onion=onion, board=board, wall=wall, sesame=sesame)
    for name in (sys.argv[1:] or jobs):
        jobs[name]()
