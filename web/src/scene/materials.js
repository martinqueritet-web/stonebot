import * as THREE from 'three';

/**
 * PBR texture sets produced by tools/gen_textures.py:
 *   <name>_albedo.jpg, <name>_normal.jpg, <name>_orm.jpg (AO, roughness, metalness)
 */
const TEXTURE_ROOT = `${import.meta.env.BASE_URL}textures/`;

export class MaterialLibrary {
  constructor(renderer, manager) {
    this.loader = new THREE.TextureLoader(manager);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.cache = new Map();
  }

  texture(file, { srgb = false, repeat = 1 } = {}) {
    const key = `${file}|${repeat}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const tex = this.loader.load(TEXTURE_ROOT + file);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = this.anisotropy;
    if (repeat !== 1) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
    this.cache.set(key, tex);
    return tex;
  }

  /** Albedo + normal + ORM maps wired into a MeshPhysicalMaterial. */
  pbr(name, params = {}, { repeat = 1, ao = true, normalScale = 1 } = {}) {
    const orm = this.texture(`${name}_orm.jpg`, { repeat });
    const mat = new THREE.MeshPhysicalMaterial({
      map: this.texture(`${name}_albedo.jpg`, { srgb: true, repeat }),
      normalMap: this.texture(`${name}_normal.jpg`, { repeat }),
      roughnessMap: orm,
      aoMap: ao ? orm : null,
      aoMapIntensity: 1,
      roughness: 1,
      metalness: 0,
      ...params,
    });
    mat.normalScale.set(normalScale, normalScale);
    return mat;
  }

  build() {
    return {
      bunTopCrust: this.pbr(
        'bun_top',
        { clearcoat: 0.6, clearcoatRoughness: 0.18, sheen: 0.08, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffb870') },
        { ao: false, normalScale: 0.7 },
      ),
      bunBottomCrust: this.pbr(
        'bun_bottom',
        { clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.08, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffc27a') },
        { ao: false, normalScale: 0.7 },
      ),
      crumb: this.pbr('crumb', { sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color('#f5c98a') }, { normalScale: 1.1 }),
      patty: this.pbr(
        'patty',
        { clearcoat: 0.22, clearcoatRoughness: 0.4, specularIntensity: 0.9 },
        { normalScale: 0.75 },
      ),
      cheese: this.pbr(
        'cheese',
        {
          clearcoat: 0.45,
          clearcoatRoughness: 0.22,
          sheen: 0.5,
          sheenRoughness: 0.45,
          sheenColor: new THREE.Color('#ffc53d'),
          // fakes the light that bleeds through thin melted cheese
          emissive: new THREE.Color('#7a3d00'),
          emissiveIntensity: 0.07,
        },
        { ao: false, normalScale: 0.5 },
      ),
      sauce: this.pbr(
        'sauce',
        { clearcoat: 1, clearcoatRoughness: 0.06, specularIntensity: 1, emissive: new THREE.Color('#5a2a00'), emissiveIntensity: 0.04 },
        { ao: false, normalScale: 0.6 },
      ),
      pickle: this.pbr(
        'pickle',
        { clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color('#c9d27a'), emissive: new THREE.Color('#1d2305'), emissiveIntensity: 0.12 },
        { ao: false, normalScale: 0.8 },
      ),
      onion: this.pbr(
        'onion',
        {
          color: new THREE.Color('#e9d3ae'),
          clearcoat: 0.55,
          clearcoatRoughness: 0.2,
          sheen: 0.35,
          sheenRoughness: 0.5,
          sheenColor: new THREE.Color('#f3d9a8'),
          emissive: new THREE.Color('#6b4a22'),
          emissiveIntensity: 0.08,
        },
        { ao: false, normalScale: 0.7 },
      ),
      sesame: this.pbr('sesame', { sheen: 0.3, sheenColor: new THREE.Color('#fff4dc') }, { ao: false, normalScale: 0.5 }),
      board: new THREE.MeshStandardMaterial({
        map: this.texture('board_albedo.jpg', { srgb: true, repeat: 7 }),
        normalMap: this.texture('board_normal.jpg', { repeat: 7 }),
        roughnessMap: this.texture('board_orm.jpg', { repeat: 7 }),
        roughness: 1,
        normalScale: new THREE.Vector2(0.4, 0.4),
      }),
      wall: new THREE.MeshStandardMaterial({
        map: this.texture('wall_albedo.jpg', { srgb: true, repeat: 3 }),
        roughness: 0.95,
        fog: false,
      }),
    };
  }
}
