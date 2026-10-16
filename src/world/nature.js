import * as T from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// Living landscape of Cell City: an agar meadow inside a petri dish, ringed by a phospholipid bilayer
// membrane, with instanced trees, shrubs, grass, flowers, rocks, mushrooms and cytoplasm ponds.

const GROUND_Y = 0.33;
const DISH_Z = 0.86; // the dish is an ellipse: lathe space is scaled by this along z
const MEMBRANE_R = 32.4;

// Small deterministic value noise so every shape is organic but identical on every load.
function hash3(i, j, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy),
    w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
const fbm = (x, y, z) => noise3(x, y, z) * 0.57 + noise3(x * 2.03, y * 2.03, z * 2.03) * 0.29 + noise3(x * 4.1, y * 4.1, z * 4.1) * 0.14;

const col = (hex) => new T.Color(hex);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Strip uv/normals and weld seams so displaced shapes shade smoothly.
function solid(geo) {
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  const welded = mergeVertices(geo, 1e-4);
  geo.dispose();
  return welded;
}
function paint(geo, fn) {
  const p = new T.Vector3(),
    n = new T.Vector3(),
    c = new T.Color();
  const pos = geo.attributes.position,
    nor = geo.attributes.normal;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nor) n.fromBufferAttribute(nor, i);
    c.setRGB(1, 1, 1);
    fn(p, n, c, i);
    out.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new T.BufferAttribute(out, 3));
  return geo;
}
const merge = (list) => {
  if (list.some((g) => !g.index)) list = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  return g;
};

// Noise-displaced icosphere: the building block of canopies, shrubs and stones.
function blob(r, detail, amp, freq, seed, cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1) {
  const g = solid(new T.IcosahedronGeometry(1, detail));
  const pos = g.attributes.position,
    v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + amp * (fbm(v.x * freq + seed, v.y * freq + seed * 0.7, v.z * freq - seed) - 0.5) * 2;
    pos.setXYZ(i, cx + v.x * r * d * sx, cy + v.y * r * d * sy, cz + v.z * r * d * sz);
  }
  g.computeVertexNormals();
  return g;
}

// Tapered, gently bent limb from a to b with a flared root.
function limb(a, b, r0, r1, radial = 8, rings = 5, flare = 0) {
  const g = solid(new T.CylinderGeometry(1, 1, 1, radial, rings, true));
  const dir = new T.Vector3().subVectors(b, a),
    len = dir.length();
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  const pos = g.attributes.position,
    v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y + 0.5,
      r = (r0 + (r1 - r0) * t) * (1 + flare * (1 - t) ** 6);
    v.set(v.x * r + Math.sin(t * 2.4) * 0.05 * len * t, t * len, v.z * r)
      .applyQuaternion(q)
      .add(a);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function lathe(points, segments) {
  const g = solid(new T.LatheGeometry(points, segments));
  g.computeVertexNormals();
  return g;
}

// Height-based gradient (darker, cooler base; lighter, warmer crown) with soft mottling and fake occlusion.
function shadeFoliage(geo, base, top, { mottle = 0.08, occl = 0.22, seed = 0 } = {}) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox,
    a = col(base),
    b = col(top);
  return paint(geo, (p, n, c) => {
    const t = (p.y - min.y) / Math.max(0.001, max.y - min.y);
    c.copy(a).lerp(b, smooth(0, 1, t));
    const m = 1 + (noise3(p.x * 3.1 + seed, p.y * 3.1, p.z * 3.1) - 0.5) * 2 * mottle;
    const o = 1 - occl * Math.max(0, -n.y) - occl * 0.5 * (1 - t);
    c.multiplyScalar(m * o);
  });
}

export function buildNature(kit, { scenery, cityLayer, locations, roads, obstacles }) {
  const { rnd } = kit;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wind = { value: 0 };
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (list) => list[Math.floor(rnd() * list.length)];

  // Gentle wind: vertices bend with the square of their height above the template base.
  function sway(material, base, amount) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWind;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 swayO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 swayO = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float swayH = max(position.y - ${base.toFixed(3)}, 0.0);
        float swayP = uWind * 1.25 + swayO.x * 0.23 + swayO.z * 0.19;
        transformed.xz += vec2(sin(swayP) + 0.35 * sin(swayP * 2.7 + position.y * 1.7), cos(swayP * 0.8) * 0.6) * ${amount.toFixed(4)} * swayH * swayH;`,
      );
    };
    material.customProgramCacheKey = () => `sway-${base}-${amount}`;
    return material;
  }
  const foliageMat = sway(
    new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 0.5, sheenRoughness: 0.6, sheenColor: col("#E4F5B8") }),
    0.9,
    0.0055,
  );
  const foliageDepth = sway(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), 0.9, 0.0055);
  const barkMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const grassMat = sway(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: T.DoubleSide }), 0, 0.55);
  const flowerMat = sway(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: T.DoubleSide }), 0, 0.45);
  const stoneMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  const softMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

  const dummy = new T.Object3D();
  function instanced(geo, material, items, { cast = true, receive = true, parent = cityLayer, depth = null } = {}) {
    if (!items.length) return null;
    const m = new T.InstancedMesh(geo, material, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y ?? GROUND_Y, it.z);
      dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
      const s = it.s ?? 1;
      dummy.scale.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (it.color) m.setColorAt(i, it.color);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = cast;
    m.receiveShadow = receive;
    if (depth) m.customDepthMaterial = depth;
    m.computeBoundingSphere();
    parent.add(m);
    return m;
  }

  // ---------- Placement rules ----------
  const roadAt = (x, z) => roads.has(`${Math.round(x / 0.65)},${Math.round(z / 0.65)}`);
  function nearRoad(x, z, r) {
    const steps = Math.ceil(r / 0.65);
    for (let i = -steps; i <= steps; i++)
      for (let j = -steps; j <= steps; j++) if (Math.hypot(i, j) * 0.65 <= r + 0.33 && roadAt(x + i * 0.65, z + j * 0.65)) return true;
    return false;
  }
  const nearBuilding = (x, z, pad = 0) =>
    locations.some((l) => Math.hypot(x - l.x, z - l.z) < 6 + pad || (Math.abs(x - l.x) < 3.5 + pad && z - l.z > 0 && z - l.z < 7.5 + pad));
  const ellipse = (x, z) => (x / 31) ** 2 + (z / 26.5) ** 2;
  const inEntrance = (x, z, pad = 0) => Math.abs(x) < 4.5 + pad && z > 19 - pad;
  const ponds = [];
  const inPond = (x, z, pad = 0) => ponds.some((p) => Math.hypot(x - p.x, (z - p.z) / p.k) < p.r + pad);
  const solids = []; // trunks, rocks and shrubs, for spacing and ground shading
  const crowded = (x, z, r) => solids.some((s) => Math.hypot(x - s.x, z - s.z) < (r + s.r) * 0.85);
  const clear = (x, z, { building = 0, road = 1.2, r = 0.5 } = {}) =>
    ellipse(x, z) < 0.97 &&
    !nearBuilding(x, z, building) &&
    !inEntrance(x, z) &&
    !nearRoad(x, z, road) &&
    !inPond(x, z, 0.6) &&
    !crowded(x, z, r);

  // ---------- Ponds: pools of cytoplasm in quiet clearings ----------
  for (let tries = 0; tries < 400 && ponds.length < 3; tries++) {
    const a = rnd() * Math.PI * 2,
      k = Math.sqrt(R(0.15, 0.78));
    const x = Math.sin(a) * 31 * k,
      z = Math.cos(a) * 26.5 * k,
      r = R(1.3, 2.0);
    if (nearBuilding(x, z, r + 0.6) || inEntrance(x, z, r) || nearRoad(x, z, r + 0.9) || ellipse(x, z) > 0.75) continue;
    if (ponds.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
    ponds.push({ x, z, r, k: R(0.7, 0.9), rot: rnd() * Math.PI, seed: rnd() * 50 });
  }

  // ---------- Tree templates ----------
  function broadleaf(H, Rc, lobesN, seed) {
    const lobes = [[0, H, 0, Rc, 0.86]];
    for (let i = 0; i < lobesN; i++) {
      const a = (i / lobesN) * Math.PI * 2 + R(-0.3, 0.3),
        d = Rc * R(0.62, 0.8);
      lobes.push([Math.cos(a) * d, H - Rc * R(0.05, 0.35), Math.sin(a) * d, Rc * R(0.58, 0.74), 0.9]);
    }
    lobes.push([R(-0.2, 0.2) * Rc, H + Rc * 0.55, R(-0.2, 0.2) * Rc, Rc * 0.62, 0.95]);
    const crown = merge(lobes.map(([x, y, z, r, sy], i) => blob(r, i ? 2 : 3, 0.2, 1.9, seed + i * 3.7, x, y, z, 1, sy, 1)));
    // Luminance gradient only: the instance colour supplies the species hue.
    shadeFoliage(crown, "#9AA593", "#FFF6D8", { seed });
    const trunk = merge([
      limb(new T.Vector3(0, 0, 0), new T.Vector3(0.05, H - 0.2, 0), 0.19, 0.1, 9, 6, 0.9),
      limb(new T.Vector3(0.02, H * 0.55, 0), new T.Vector3(lobes[1][0] * 0.8, lobes[1][1], lobes[1][2] * 0.8), 0.08, 0.035, 6, 3),
      limb(new T.Vector3(0.02, H * 0.62, 0), new T.Vector3(lobes[3][0] * 0.8, lobes[3][1], lobes[3][2] * 0.8), 0.07, 0.03, 6, 3),
    ]);
    paint(trunk, (p, n, c) => {
      c.copy(col("#4E3726")).lerp(col("#8C6748"), smooth(0, 1.4, p.y));
      c.multiplyScalar(0.85 + noise3(p.x * 9, p.y * 1.4, p.z * 9) * 0.3);
    });
    return { crown, trunk };
  }
  function birch(seed) {
    const lobes = [
      [0.1, 2.9, 0, 0.62],
      [-0.45, 2.5, 0.2, 0.5],
      [0.4, 2.4, -0.25, 0.48],
      [0.05, 3.35, 0.1, 0.42],
      [-0.1, 2.3, -0.45, 0.42],
    ];
    const crown = merge(lobes.map(([x, y, z, r], i) => blob(r, 2, 0.24, 2.3, seed + i * 5.1, x, y, z, 1, 1.15, 1)));
    shadeFoliage(crown, "#9AA593", "#FFF8DC", { seed, mottle: 0.12 });
    const trunk = merge([
      limb(new T.Vector3(0, 0, 0), new T.Vector3(0.08, 3.1, 0.02), 0.11, 0.05, 8, 10, 0.5),
      limb(new T.Vector3(0.04, 1.7, 0), new T.Vector3(-0.42, 2.5, 0.18), 0.04, 0.02, 5, 2),
    ]);
    paint(trunk, (p, n, c) => {
      const mark = noise3(Math.atan2(p.z, p.x) * 1.2 + 4, p.y * 6, seed) > 0.72 || (p.y < 0.25 && noise3(p.x * 9, p.y * 9, p.z * 9) > 0.45);
      c.copy(mark ? col("#3B3631") : col("#EFEAE0").lerp(col("#FBF5EA"), smooth(0, 2, p.y)));
    });
    return { crown, trunk };
  }
  function cypress(seed, H) {
    const crown = blob(1, 3, 0.1, 2.6, seed, 0, 0, 0, 0.62, 1, 0.62);
    const pos = crown.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i),
        t = (y + 1) / 2,
        taper = 1 - 0.42 * t ** 1.6 + 0.08 * Math.sin(y * 9 + seed);
      pos.setXYZ(i, pos.getX(i) * taper, 0.75 + t * H, pos.getZ(i) * taper);
    }
    crown.computeVertexNormals();
    shadeFoliage(crown, "#8E9C88", "#F6F3D2", { seed, mottle: 0.1 });
    const trunk = limb(new T.Vector3(0, 0, 0), new T.Vector3(0, 1.4, 0), 0.12, 0.06, 7, 3, 0.8);
    paint(trunk, (p, n, c) => c.copy(col("#4E3726")).lerp(col("#7A5638"), p.y));
    return { crown, trunk };
  }
  function pine(seed) {
    const tiers = [];
    for (let i = 0; i < 4; i++) {
      const bottom = 0.75 + i * 0.72,
        top = bottom + 1.25 - i * 0.08,
        r = 1.15 - i * 0.24;
      const tier = lathe(
        [
          new T.Vector2(0.06, bottom + 0.1),
          new T.Vector2(r * 0.92, bottom - 0.02),
          new T.Vector2(r, bottom + 0.06),
          new T.Vector2(r * 0.62, bottom + (top - bottom) * 0.38),
          new T.Vector2(r * 0.28, bottom + (top - bottom) * 0.72),
          new T.Vector2(0.001, top),
        ],
        18,
      );
      const pos = tier.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j),
          z = pos.getZ(j),
          a = Math.atan2(z, x),
          rr = Math.hypot(x, z) / r;
        const wob = 1 + (noise3(Math.cos(a) * 2 + seed + i, Math.sin(a) * 2, i) - 0.5) * 0.35 * rr;
        pos.setXYZ(j, x * wob, pos.getY(j) - (wob - 1) * 0.25, z * wob);
      }
      tier.computeVertexNormals();
      tiers.push(tier);
    }
    const crown = merge(tiers);
    crown.computeBoundingBox();
    const top = crown.boundingBox.max.y;
    paint(crown, (p, n, c) => {
      const t = p.y / top,
        outer = smooth(0.2, 1, Math.hypot(p.x, p.z) / (1.2 - t * 0.9));
      c.copy(col("#1F4A35")).lerp(col("#5E9E5A"), smooth(0, 1, t * 0.6 + outer * 0.4 + Math.max(0, n.y) * 0.25));
      if (n.y < -0.2) c.multiplyScalar(0.6);
    });
    const trunk = limb(new T.Vector3(0, 0, 0), new T.Vector3(0, 1.5, 0), 0.13, 0.07, 7, 3, 0.7);
    paint(trunk, (p, n, c) => c.copy(col("#4A3324")).lerp(col("#6E4E36"), p.y));
    return { crown, trunk };
  }
  function shrub(seed, blossoms) {
    const lobes = [
      [0, 0.38, 0, 0.55],
      [0.45, 0.3, 0.15, 0.42],
      [-0.4, 0.3, -0.1, 0.44],
      [0.05, 0.3, -0.42, 0.38],
    ];
    const leaves = merge(lobes.map(([x, y, z, r], i) => blob(r, 2, 0.22, 2.4, seed + i * 2.3, x, y, z, 1, 0.85, 1)));
    shadeFoliage(leaves, "#24502F", "#7FAE4A", { seed, mottle: 0.14 });
    const parts = [leaves];
    for (let i = 0; i < 22; i++) {
      const [x, y, z, r] = lobes[i % lobes.length];
      const v = new T.Vector3(R(-1, 1), R(0.05, 1), R(-1, 1)).normalize();
      const f = blob(0.08, 0, 0.1, 3, seed + i, x + v.x * r * 0.95, y + v.y * r * 0.85, z + v.z * r * 0.95, 1, 0.7, 1);
      const c0 = col(pick(blossoms)),
        c1 = col("#FBF5EA");
      paint(f, (p, n, c) => c.copy(c0).lerp(c1, Math.max(0, n.y) * 0.35));
      parts.push(f);
    }
    return merge(parts);
  }

  const kinds = {
    oakA: broadleaf(2.45, 1.0, 5, 1.3),
    oakB: broadleaf(2.15, 1.15, 6, 7.9),
    oakC: broadleaf(2.8, 0.85, 4, 13.1),
    birch: birch(21.4),
    cypress: cypress(5.5, 3.3),
    pine: pine(3.3),
  };
  const kindInfo = {
    oakA: { r: 1.4, trunk: 0.55, hues: ["#3F7D4A", "#5E9E3F", "#4E8F45", "#2E8B57"] },
    oakB: { r: 1.6, trunk: 0.6, hues: ["#5E9E3F", "#8DBB4A", "#3F7D4A"] },
    oakC: { r: 1.2, trunk: 0.5, hues: ["#2E8B57", "#3F7D4A", "#5E9E3F"] },
    birch: { r: 1.0, trunk: 0.36, hues: ["#8DBB4A", "#9CCB4A", "#A9C94E"] },
    cypress: { r: 0.8, trunk: 0.4, hues: ["#2E6B45", "#2E8B57", "#3F7D4A"] },
    pine: { r: 1.2, trunk: 0.42, hues: ["#FFFFFF", "#F1F6E8", "#E8EFE0"] },
  };
  const autumn = ["#C9702E", "#E09A3B", "#D98A3A"];
  const trees = Object.fromEntries(Object.keys(kinds).map((k) => [k, []]));

  function plantTree(x, z, kind, s) {
    const info = kindInfo[kind];
    const fall = kind !== "pine" && kind !== "cypress" && rnd() < 0.12;
    const hue = col(fall ? pick(autumn) : pick(info.hues)).offsetHSL(R(-0.012, 0.012), R(-0.05, 0.05), R(-0.03, 0.03));
    trees[kind].push({ x, z, s, ry: rnd() * Math.PI * 2, color: hue });
    solids.push({ x, z, r: info.r * s, shade: 1 });
    obstacles.push({ x, z, w: info.trunk * s, d: info.trunk * s });
  }
  const chooseKind = (edge) => {
    const r = rnd();
    if (r < 0.2) return "oakA";
    if (r < 0.36) return "oakB";
    if (r < 0.5) return "oakC";
    if (r < 0.65) return "birch";
    if (r < 0.82) return edge ? "pine" : "cypress";
    return edge ? "cypress" : "pine";
  };

  // Edge woodland in groves, with gaps so the membrane stays visible.
  for (let a = 0.18; a < Math.PI * 2 - 0.18; a += R(0.07, 0.13)) {
    if (fbm(Math.cos(a) * 2.2 + 3, Math.sin(a) * 2.2, 1.7) < 0.42) continue;
    for (let row = 0; row < 2; row++) {
      const k = row ? R(0.78, 0.86) : R(0.88, 0.95);
      if (row && rnd() < 0.55) continue;
      const x = Math.sin(a) * 31 * k + R(-0.4, 0.4),
        z = Math.cos(a) * 26.5 * k + R(-0.4, 0.4);
      const kind = chooseKind(true),
        s = R(0.85, 1.3);
      if (clear(x, z, { building: kindInfo[kind].r * s * 0.8, road: 1.4, r: kindInfo[kind].r * s })) plantTree(x, z, kind, s);
    }
  }
  // Interior groves follow a low-frequency noise field so trees gather instead of spreading evenly.
  let interior = 0;
  for (let tries = 0; tries < 1400 && interior < 34; tries++) {
    const x = R(-28, 28),
      z = R(-24, 22);
    if (ellipse(x, z) > 0.8 || fbm(x * 0.09 + 11, z * 0.09, 2) < 0.5) continue;
    const kind = chooseKind(false),
      s = R(0.75, 1.15);
    if (!clear(x, z, { building: kindInfo[kind].r * s * 0.8, road: 1.5, r: kindInfo[kind].r * s })) continue;
    plantTree(x, z, kind, s);
    interior++;
  }

  // ---------- Shrubs, rocks, mushrooms ----------
  const shrubs = { pink: [], amber: [] };
  for (let tries = 0; tries < 900 && shrubs.pink.length + shrubs.amber.length < 34; tries++) {
    const t = solids[Math.floor(rnd() * solids.length)],
      a = rnd() * Math.PI * 2,
      d = R(1.6, 3.2);
    const x = t ? t.x + Math.cos(a) * d : R(-25, 25),
      z = t ? t.z + Math.sin(a) * d : R(-20, 20),
      s = R(0.7, 1.15);
    if (!clear(x, z, { road: 1.25, r: 0.7 * s })) continue;
    (rnd() < 0.55 ? shrubs.pink : shrubs.amber).push({ x, z, s, ry: rnd() * 6.3, color: col("#FFFFFF").offsetHSL(0, 0, R(-0.06, 0)) });
    solids.push({ x, z, r: 0.75 * s, shade: 0.6 });
    obstacles.push({ x, z, w: 0.9 * s, d: 0.9 * s });
  }

  const stone = (i, detail) => {
    const g = blob(1, detail, 0.32, 1.3, 40 + i * 9, 0, 0, 0, [1.1, 1.3, 0.9][i], [0.62, 0.42, 0.8][i], 1);
    return paint(g, (p, n, c) => {
      const m = noise3(p.x * 2.5 + i, p.y * 2.5, p.z * 2.5);
      c.copy(col("#8E877C")).lerp(col("#D4CBBB"), smooth(-0.5, 0.6, p.y) * 0.8 + m * 0.2);
      if (n.y > 0.55 && fbm(p.x * 1.8, p.y * 1.8 + i, p.z * 1.8) > 0.5) c.lerp(col("#6E9A45"), smooth(0.55, 0.85, n.y) * 0.85);
    });
  };
  const rockGeos = [0, 1, 2].map((i) => stone(i, 3));
  const rocks = [[], [], []],
    pebbles = [];
  for (let tries = 0; tries < 600 && rocks.flat().length < 20; tries++) {
    const x = R(-29, 29),
      z = R(-25, 23),
      s = R(0.35, 0.95);
    if (!clear(x, z, { road: 1.25, r: s })) continue;
    rocks[Math.floor(rnd() * 3)].push({
      x,
      z,
      y: GROUND_Y - 0.1 * s,
      s,
      ry: rnd() * 6.3,
      color: col("#FFFFFF").offsetHSL(0, 0, R(-0.08, 0.02)),
    });
    solids.push({ x, z, r: s, shade: 0.5 });
    if (s > 0.45) obstacles.push({ x, z, w: 1.6 * s, d: 1.6 * s });
  }
  // Pebbles: clustered beside rocks, along pond banks and the entrance path; too small to block anyone.
  const pebble = (x, z, s) => pebbles.push({ x, z, y: GROUND_Y - 0.05 * s, s, ry: rnd() * 6.3 });
  for (const r of solids.filter((s) => s.shade === 0.5))
    for (let i = 0; i < 4; i++) {
      const a = rnd() * 6.3,
        d = r.r * R(1.2, 1.9),
        x = r.x + Math.cos(a) * d,
        z = r.z + Math.sin(a) * d;
      if (!roadAt(x, z) && !nearBuilding(x, z) && !inPond(x, z)) pebble(x, z, R(0.1, 0.22));
    }
  for (const p of ponds)
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 6.3,
        d = p.r * R(1.02, 1.18);
      const x = p.x + Math.cos(a) * d,
        z = p.z + Math.sin(a) * d * p.k;
      if (!roadAt(x, z)) pebble(x, z, R(0.12, 0.3));
    }
  for (let z = 23.4; z < 35.5; z += R(0.5, 0.9)) for (const side of [-1, 1]) if (rnd() < 0.8) pebble(side * R(2.2, 2.4), z, R(0.1, 0.17));

  const shroomGeo = (() => {
    const parts = [];
    [
      [0, 0, 0.3, 0.2],
      [0.2, 0.12, 0.2, 0.14],
      [-0.12, 0.17, 0.15, 0.1],
    ].forEach(([x, z, h, cr], i) => {
      const stem = lathe(
        [new T.Vector2(0.001, 0), new T.Vector2(cr * 0.38, 0.01), new T.Vector2(cr * 0.28, h * 0.6), new T.Vector2(cr * 0.24, h)],
        10,
      );
      paint(stem, (p, n, c) => c.copy(col("#E9DCC4")).lerp(col("#FBF5EA"), p.y / h));
      const cap = lathe(
        [
          new T.Vector2(0.001, h + cr * 0.62),
          new T.Vector2(cr * 0.55, h + cr * 0.52),
          new T.Vector2(cr * 0.9, h + cr * 0.25),
          new T.Vector2(cr, h),
          new T.Vector2(cr * 0.6, h - 0.015),
          new T.Vector2(cr * 0.2, h),
        ],
        16,
      );
      paint(cap, (p, n, c) => {
        if (n.y < 0) return c.copy(col("#EFD9BE"));
        c.copy(col("#B8325A")).lerp(col("#E5577E"), smooth(h, h + cr * 0.6, p.y));
        if (noise3(p.x * 40 + i * 7, p.y * 40, p.z * 40) > 0.72) c.copy(col("#FBF5EA"));
      });
      const m = new T.Matrix4().makeRotationZ(R(-0.15, 0.15)).setPosition(x, 0, z);
      parts.push(stem.applyMatrix4(m), cap.applyMatrix4(m));
    });
    return merge(parts);
  })();
  const shrooms = [];
  for (const t of solids.filter((s) => s.shade === 1))
    if (rnd() < 0.3) {
      const a = rnd() * 6.3,
        x = t.x + Math.cos(a) * R(0.6, 0.9),
        z = t.z + Math.sin(a) * R(0.6, 0.9);
      if (!roadAt(x, z) && !nearBuilding(x, z)) shrooms.push({ x, z, s: R(0.8, 1.3), ry: rnd() * 6.3 });
    }

  // ---------- Grass tufts and wildflowers ----------
  function tuft(blades, hMin, hMax, spread) {
    const pos = [],
      colr = [],
      nor = [],
      idx = [];
    const base = col("#2F5A2C"),
      tip = col("#B5D466");
    for (let b = 0; b < blades; b++) {
      const a = rnd() * Math.PI * 2,
        r = rnd() * spread,
        h = R(hMin, hMax),
        w = R(0.03, 0.05);
      const bx = Math.cos(a) * r,
        bz = Math.sin(a) * r,
        lean = R(0.3, 0.9) * h,
        face = rnd() * Math.PI;
      const dx = Math.cos(a + R(-0.6, 0.6)),
        dz = Math.sin(a + R(-0.6, 0.6)),
        px = Math.cos(face),
        pz = Math.sin(face);
      const tipTint = tip.clone().offsetHSL(R(-0.02, 0.03), 0, R(-0.08, 0.05));
      const start = pos.length / 3;
      for (let s = 0; s <= 3; s++) {
        const t = s / 3,
          cx = bx + dx * lean * t * t,
          cz = bz + dz * lean * t * t,
          y = h * t * (1 - 0.15 * t),
          hw = w * (1 - t * 0.85);
        const c = base.clone().lerp(tipTint, t ** 0.8);
        for (const side of [-1, 1]) {
          pos.push(cx + px * hw * side, y, cz + pz * hw * side);
          colr.push(c.r, c.g, c.b);
          nor.push(dx * 0.25, 1, dz * 0.25);
        }
      }
      for (let s = 0; s < 3; s++) {
        const i = start + s * 2;
        idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.normalizeNormals();
    return g;
  }
  function flowerCluster(palette, count) {
    const parts = [];
    for (let f = 0; f < count; f++) {
      const a = rnd() * 6.3,
        r = R(0.04, 0.32),
        h = R(0.16, 0.4),
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      const petal = col(pick(palette)),
        centre = col(petal.getHexString() === "fbf5ea" ? "#E59B2E" : "#FBE7A8");
      const stem = solid(new T.CylinderGeometry(0.008, 0.012, h, 3, 1, true));
      stem.translate(x, h / 2, z);
      stem.computeVertexNormals();
      paint(stem, (p, n, c) => c.copy(col("#3F7D4A")));
      // Five scalloped petals around a raised centre: a fan with smooth upward normals.
      const pr = R(0.05, 0.085),
        verts = [x, h + 0.018, z],
        cols = [centre.r, centre.g, centre.b],
        idx = [];
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2,
          rr = pr * (0.4 + 0.6 * Math.abs(Math.cos(t * 2.5)) ** 0.6);
        verts.push(x + Math.cos(t) * rr, h + 0.012 + rr * 0.25, z + Math.sin(t) * rr);
        const c = petal.clone().multiplyScalar(0.92 + 0.08 * (rr / pr));
        cols.push(c.r, c.g, c.b);
        idx.push(0, 1 + i, 1 + ((i + 1) % 20));
      }
      const head = new T.BufferGeometry();
      head.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
      head.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
      head.setIndex(idx);
      head.computeVertexNormals();
      parts.push(stem, head);
    }
    return merge(parts);
  }

  const grassGeos = [tuft(7, 0.16, 0.3, 0.12), tuft(5, 0.28, 0.5, 0.08)];
  const flowerGeos = [
    flowerCluster(["#D9466F", "#F07C9C", "#FBF5EA"], 7),
    flowerCluster(["#F2B544", "#E59B2E", "#FBF5EA"], 7),
    flowerCluster(["#FBF5EA", "#FBF5EA", "#F07C9C", "#C9A2E0"], 8),
  ];
  const grass = [[], []],
    flowers = [[], [], []];
  for (let i = 0; i < 3600; i++) {
    const x = R(-31, 31),
      z = R(-26.5, 26.5);
    const e = ellipse(x, z);
    if (e > 0.995 || roadAt(x, z) || nearBuilding(x, z) || inPond(x, z, 0.1) || (Math.abs(x) < 2.3 && z > 22)) continue;
    // Denser toward the woodland edge, around trees and in noisy meadow patches.
    const density = 0.5 + 0.45 * smooth(0.55, 0.95, e) + 0.45 * fbm(x * 0.18, z * 0.18, 5) + (nearRoad(x, z, 0.7) ? 0.2 : 0);
    if (rnd() > density) continue;
    const big = rnd() < 0.35;
    grass[big ? 1 : 0].push({ x, z, s: R(0.75, 1.3), ry: rnd() * 6.3, color: col("#FFFFFF").offsetHSL(R(-0.03, 0.03), 0, R(-0.12, 0.04)) });
  }
  for (let i = 0; i < 420 && flowers.flat().length < 110; i++) {
    const x = R(-30, 30),
      z = R(-26, 26);
    if (ellipse(x, z) > 0.97 || nearRoad(x, z, 0.4) || nearBuilding(x, z) || inPond(x, z, 0.3) || inEntrance(x, z, -2)) continue;
    if (fbm(x * 0.14 + 4, z * 0.14, 9) < 0.45) continue;
    flowers[Math.floor(rnd() * 3)].push({ x, z, s: R(0.85, 1.25), ry: rnd() * 6.3 });
  }

  // ---------- Build the instanced vegetation ----------
  const treeMeshes = [];
  for (const [kind, list] of Object.entries(trees)) {
    if (!list.length) continue;
    treeMeshes.push(instanced(kinds[kind].crown, foliageMat, list, { depth: foliageDepth }));
    instanced(
      kinds[kind].trunk,
      barkMat,
      list.map((t) => ({ ...t, color: undefined })),
    );
  }
  instanced(shrub(31, ["#F07C9C", "#D9466F", "#FBD3DF"]), foliageMat, shrubs.pink, { depth: foliageDepth });
  instanced(shrub(37, ["#F2B544", "#E59B2E", "#FBE7A8"]), foliageMat, shrubs.amber, { depth: foliageDepth });
  rockGeos.forEach((g, i) => instanced(g, stoneMat, rocks[i]));
  instanced(stone(0, 1), stoneMat, pebbles);
  instanced(shroomGeo, softMat, shrooms);
  grassGeos.forEach((g, i) => instanced(g, grassMat, grass[i], { cast: false }));
  flowerGeos.forEach((g, i) => instanced(g, flowerMat, flowers[i], { cast: false }));

  // ---------- Ponds ----------
  if (ponds.length) {
    const water = [],
      banks = [],
      pads = [];
    for (const p of ponds) {
      const outline = (grow) => {
        const s = new T.Shape();
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2,
            rr = (p.r + grow) * (0.85 + 0.3 * noise3(Math.cos(a) * 1.4 + p.seed, Math.sin(a) * 1.4, 0));
          const x = Math.cos(a + p.rot) * rr,
            y = Math.sin(a + p.rot) * rr * p.k;
          i ? s.lineTo(x, y) : s.moveTo(x, y);
        }
        return s;
      };
      const w = new T.ShapeGeometry(outline(0), 6).rotateX(-Math.PI / 2).translate(p.x, GROUND_Y + 0.022, p.z);
      const b = new T.ShapeGeometry(outline(0.28), 6).rotateX(-Math.PI / 2).translate(p.x, GROUND_Y + 0.012, p.z);
      w.deleteAttribute("uv");
      b.deleteAttribute("uv");
      paint(w, (q, n, c) => c.copy(col("#6FB8AE")).lerp(col("#B9E3D6"), smooth(0, p.r, Math.hypot(q.x - p.x, q.z - p.z))));
      paint(b, (q, n, c) => c.copy(col("#4F6E3A")));
      water.push(w);
      banks.push(b);
      for (let i = 0; i < 4; i++) {
        const a = rnd() * 6.3,
          d = R(0.2, 0.6) * p.r;
        pads.push({ x: p.x + Math.cos(a) * d, y: GROUND_Y + 0.03, z: p.z + Math.sin(a) * d * p.k, s: R(0.8, 1.2), ry: rnd() * 6.3 });
      }
    }
    const waterMesh = new T.Mesh(
      merge(water),
      new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.88 }),
    );
    waterMesh.receiveShadow = true;
    const bankMesh = new T.Mesh(merge(banks), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    bankMesh.receiveShadow = true;
    cityLayer.add(bankMesh, waterMesh);
    const pad = new T.CircleGeometry(0.2, 16, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
    pad.deleteAttribute("uv");
    paint(pad, (q, n, c) => c.copy(col("#3F7D4A")).lerp(col("#8DBB4A"), Math.hypot(q.x, q.z) / 0.2));
    instanced(pad, softMat, pads, { cast: false });
  }

  // ---------- Agar meadow, dish and entrance ----------
  const profile = [];
  for (let r = 0; r < 34; r += 0.75) profile.push(new T.Vector2(r, GROUND_Y));
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    profile.push(new T.Vector2(34 + Math.sin(a) * 0.55, GROUND_Y - 0.55 + Math.cos(a) * 0.55));
  }
  profile.push(new T.Vector2(34.6, -0.6), new T.Vector2(34.65, -1.19));
  // Lathe faces point up only when the profile runs from the rim inward.
  const groundGeo = solid(new T.LatheGeometry(profile.reverse(), 160));
  groundGeo.scale(1, 1, DISH_Z);
  groundGeo.computeVertexNormals();
  const shade = solids.filter((s) => s.shade);
  paint(groundGeo, (p, n, c) => {
    if (p.y < GROUND_Y - 0.02) {
      // Translucent-looking agar side, with a mossy lip.
      c.copy(col("#E9D3A6")).lerp(col("#5E8A3E"), smooth(-0.2, GROUND_Y, p.y));
      return;
    }
    const m = fbm(p.x * 0.07, p.z * 0.07, 3),
      fine = noise3(p.x * 0.6, p.z * 0.6, 7);
    c.copy(col("#6E9F46")).lerp(col("#93BE55"), smooth(0.3, 0.7, m));
    if (m > 0.62) c.lerp(col("#A9B65C"), smooth(0.62, 0.75, m) * 0.6);
    c.multiplyScalar(0.94 + fine * 0.12);
    let occ = 0;
    for (const s of shade) {
      const d = Math.hypot(p.x - s.x, p.z - s.z) / (s.r * 1.25);
      if (d < 1) occ += (1 - d * d) * 0.32 * s.shade;
    }
    const e = (p.x / 34) ** 2 + (p.z / (34 * DISH_Z)) ** 2;
    c.multiplyScalar(1 - Math.min(0.42, occ) - smooth(0.9, 1, e) * 0.18);
  });
  const ground = new T.Mesh(groundGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
  ground.receiveShadow = true;
  cityLayer.add(ground);

  // Entrance: a rounded timber bridge over the dish lip with a sandy path on top.
  const slab = (w, len, depth, bevel, z0, top, c0, c1) => {
    const s = new T.Shape(),
      r = Math.min(0.5, w / 4),
      x0 = -w / 2,
      y0 = -z0 - len;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + len - r);
    s.quadraticCurveTo(x0 + w, y0 + len, x0 + w - r, y0 + len);
    s.lineTo(x0 + r, y0 + len);
    s.quadraticCurveTo(x0, y0 + len, x0, y0 + len - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new T.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 6,
    });
    g.rotateX(-Math.PI / 2).translate(0, top - depth - bevel, 0);
    g.deleteAttribute("uv");
    return paint(g, (p, n, c) => {
      c.copy(col(c0)).lerp(col(c1), smooth(top - depth, top, p.y));
      c.multiplyScalar(0.95 + noise3(p.x * 3, 0, p.z * 0.6) * 0.1);
    });
  };
  const legs = [];
  for (const z of [32.6, 35.2])
    for (const x of [-1.9, 1.9]) {
      const leg = solid(new T.CylinderGeometry(0.16, 0.22, 1.4, 12, 1, true)).translate(x, -0.55, z);
      leg.computeVertexNormals();
      legs.push(paint(leg, (p, n, c) => c.copy(col("#B89668")).lerp(col("#D9B98A"), smooth(-1.2, 0, p.y))));
    }
  const bridge = new T.Mesh(merge([slab(5, 12, 0.3, 0.06, 24, GROUND_Y - 0.005, "#B89668", "#E2CBA4"), ...legs]), softMat);
  bridge.castShadow = bridge.receiveShadow = true;
  const path = new T.Mesh(slab(3.8, 12.6, 0.02, 0.025, 23, 0.375, "#D9BE90", "#EAD3AA"), softMat);
  path.receiveShadow = true;
  cityLayer.add(bridge, path);

  // ---------- The cell membrane: a phospholipid bilayer ----------
  const N = 236,
    step = (Math.PI * 2) / N,
    channelAngles = [];
  const gapAt = (a) => Math.cos(a) > 0 && Math.abs(Math.sin(a) * MEMBRANE_R) < 3.9;
  for (let i = 0; i < 11; i++) channelAngles.push(0.55 + (i / 10) * (Math.PI * 2 - 1.1) + R(-0.08, 0.08));
  const inChannel = (a) => channelAngles.some((c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < step * 1.6);
  const ellPoint = (a, r) => [Math.sin(a) * r, Math.cos(a) * r * DISH_Z];
  const headGeo = paint(solid(new T.SphereGeometry(0.4, 12, 8)), (p, n, c) => c.setScalar(0.78 + 0.32 * smooth(-0.4, 0.4, p.y)));
  headGeo.computeVertexNormals();
  const tailGeo = (() => {
    const parts = [];
    for (const [dz, kink] of [
      [-0.11, 0],
      [0.11, 1],
    ]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6,
          bend = kink && t > 0.45 ? (t - 0.45) * 0.55 : 0;
        pts.push(new T.Vector3(0.2 + t * 0.66, Math.sin(t * 9 + dz * 20) * 0.03, dz + Math.sin(t * 7) * 0.035 + bend));
      }
      const g = solid(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 6, 0.052, 4, false));
      g.computeVertexNormals();
      parts.push(paint(g, (p, n, c) => c.copy(col("#F3DFC2")).lerp(col("#FBF5EA"), (p.x - 0.2) / 0.66)));
    }
    return merge(parts);
  })();
  const heads = [],
    tails = [],
    glyco = [];
  const pinks = ["#D9466F", "#E0577D", "#CF3F66", "#E46A8C"];
  for (let i = 0; i < N; i++) {
    const a = i * step;
    if (gapAt(a) || inChannel(a)) continue;
    for (const side of [1, -1]) {
      const [x, z] = ellPoint(a, MEMBRANE_R + side * 1.0);
      const [mx, mz] = ellPoint(a, MEMBRANE_R);
      const y = 0.74 + Math.sin(a * 7 + side) * 0.03;
      heads.push({ x, y, z, color: col(pick(pinks)).offsetHSL(0, 0, R(-0.03, 0.03)) });
      tails.push({ x, y, z, ry: Math.atan2(-(mz - z), mx - x) + R(-0.12, 0.12) });
    }
  }
  const membraneMat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  instanced(headGeo, membraneMat, heads);
  instanced(tailGeo, softMat, tails, { cast: false });

  // Channel proteins: barrels of helices spanning the bilayer, each topped with a sugar-chain antenna.
  const channelGeo = (() => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const g = solid(new T.CapsuleGeometry(0.21, 1.15, 3, 8));
      g.rotateZ(Math.cos(a) * 0.12).rotateX(Math.sin(a) * 0.12);
      g.translate(Math.cos(a) * 0.5, 0.95, Math.sin(a) * 0.5);
      g.computeVertexNormals();
      parts.push(paint(g, (p, n, c) => c.copy(col("#C9702E")).lerp(col("#F2B544"), smooth(0.2, 1.8, p.y))));
    }
    return merge(parts);
  })();
  const glycoGeo = (() => {
    const beads = [
      [0, 0, 0, 0.1],
      [0.05, 0.2, 0.02, 0.09],
      [0.13, 0.38, 0, 0.085],
      [0.05, 0.56, 0.06, 0.08],
      [0.28, 0.5, -0.05, 0.075],
      [0.12, 0.72, 0.02, 0.07],
    ];
    return merge(
      beads.map(([x, y, z, r], i) =>
        paint(blob(r, 1, 0, 1, 0, x, y, z), (p, n, c) => c.copy(col(i % 2 ? "#FBF5EA" : "#E59B2E")).multiplyScalar(0.85 + 0.15 * n.y)),
      ),
    );
  })();
  const channels = channelAngles.map((a) => {
    const [x, z] = ellPoint(a, MEMBRANE_R);
    return { x, y: 0, z, ry: rnd() * 6.3, color: col("#FFFFFF").offsetHSL(0, 0, R(-0.08, 0.02)) };
  });
  instanced(channelGeo, softMat, channels);
  for (const a of channelAngles) {
    const [x, z] = ellPoint(a, MEMBRANE_R);
    glyco.push({ x, y: 2.05, z, ry: rnd() * 6.3, s: R(0.9, 1.2) });
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    if (gapAt(a) || inChannel(a)) continue;
    const [x, z] = ellPoint(a, MEMBRANE_R + 1.0);
    glyco.push({ x, y: 1.05, z, ry: rnd() * 6.3, s: R(0.8, 1.1) });
  }
  instanced(glycoGeo, softMat, glyco);

  // Glass petri dish: a faint wall and bright lip, open at the entrance bridge.
  const arc = (r, y) =>
    new T.CatmullRomCurve3(
      Array.from({ length: 121 }, (_, i) => {
        const a = 0.11 + (i / 120) * (Math.PI * 2 - 0.22);
        return new T.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * DISH_Z);
      }),
    );
  const glass = new T.MeshPhysicalMaterial({
    color: "#DDF1F4",
    roughness: 0.06,
    transparent: true,
    opacity: 0.13,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const wallGeo = new T.CylinderGeometry(35.3, 35.3, 3.6, 160, 1, true, 0.11, Math.PI * 2 - 0.22).scale(1, 1, DISH_Z).translate(0, 0.6, 0);
  const wall = new T.Mesh(wallGeo, glass);
  const rimMat = new T.MeshPhysicalMaterial({ color: "#F2FAFB", roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false });
  const rims = new T.Mesh(
    merge([new T.TubeGeometry(arc(35.3, 2.4), 200, 0.09, 6), new T.TubeGeometry(arc(35.4, -1.12), 200, 0.12, 6)]),
    rimMat,
  );
  cityLayer.add(wall, rims);

  // ---------- Outside the city: the fluid and nearby cells of a tiny tissue ----------
  // This lies below the dish, so it adds context in map view without changing the walkable city.
  const fluid = new T.PlaneGeometry(280, 280, 64, 64).rotateX(-Math.PI / 2).translate(0, -1.2, 0);
  fluid.deleteAttribute("uv");
  const nearFluid = col("#ABD7D0"),
    farFluid = col("#5E9EAE");
  paint(fluid, (p, n, c) => {
    const e = Math.sqrt((p.x / 35.5) ** 2 + (p.z / (35.5 * DISH_Z)) ** 2),
      flow = fbm(p.x * 0.055, p.z * 0.055, 14),
      ripple = Math.sin(p.x * 0.22 + flow * 8) * Math.sin(p.z * 0.19 - flow * 5);
    c.copy(nearFluid).lerp(farFluid, smooth(0.75, 1.9, e) * 0.8);
    c.multiplyScalar(0.94 + flow * 0.12 + ripple * 0.025);
    c.multiplyScalar(1 - (1 - smooth(1, 1.35, e)) * 0.13);
  });
  const fluidMesh = new T.Mesh(fluid, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }));
  fluidMesh.receiveShadow = true;
  scenery.add(fluidMesh);

  // Flattened cell silhouettes suggest the rest of the tissue. Their rings and nuclei make
  // them legible from the aerial map, while muted colours keep Cell City as the focal point.
  const neighbours = new T.Group();
  neighbours.name = "extracellular-space";
  scenery.add(neighbours);
  const cells = [];
  for (const [count, radius, offset] of [[8, 48, 0.12], [11, 69, 0.38]]) {
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2,
        r = radius + R(-3, 3),
        x = Math.sin(a) * r,
        z = Math.cos(a) * r * DISH_Z;
      if (Math.abs(x) < 9 && z > 33) continue; // keep the entrance bridge clear
      cells.push({ x, z, rx: R(2.3, 3.7), rz: R(2.1, 3.2), a });
    }
  }
  const cellGeo = new T.SphereGeometry(1, 10, 6),
    bodyGeo = new T.SphereGeometry(1, 14, 8),
    edgeGeo = new T.TorusGeometry(1, 0.055, 4, 20),
    membrane = [],
    bodies = [],
    nuclei = [];
  for (const [i, cell] of cells.entries()) {
    const tint = col(["#6DAEAA", "#8199BA", "#AE8EB8", "#79B59A"][i % 4]);
    bodies.push({ x: cell.x, y: -1.02, z: cell.z, sx: cell.rx, sy: 0.19, sz: cell.rz, color: tint });
    membrane.push({ x: cell.x, y: -0.99, z: cell.z, rx: Math.PI / 2, sx: cell.rx, sz: cell.rz, color: col("#4C8F9D") });
    nuclei.push({ x: cell.x + Math.cos(cell.a) * cell.rx * 0.22, y: -0.81, z: cell.z + Math.sin(cell.a) * cell.rz * 0.2,
      sx: cell.rx * 0.26, sy: 0.09, sz: cell.rz * 0.3, color: col("#727DA8") });
  }
  const cellMat = new T.MeshStandardMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.82, roughness: 0.45, depthWrite: false });
  instanced(bodyGeo, cellMat, bodies, { cast: false, receive: false, parent: neighbours });
  instanced(edgeGeo, new T.MeshStandardMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.62, depthWrite: false }), membrane,
    { cast: false, receive: false, parent: neighbours });
  instanced(cellGeo, new T.MeshStandardMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.72, depthWrite: false }), nuclei,
    { cast: false, receive: false, parent: neighbours });

  // Close-up reward: tiny coloured structures inside each neighbouring cell.
  const innerBodies = [];
  for (const [i, cell] of cells.entries()) {
    for (let j = 0; j < 4; j++) {
      const a = i * 1.3 + j * 2.4,
        d = R(0.42, 0.67);
      innerBodies.push({
        x: cell.x + Math.cos(a) * cell.rx * d,
        y: -0.75,
        z: cell.z + Math.sin(a) * cell.rz * d,
        s: R(0.13, 0.25),
        color: col(j % 2 ? "#E5BA79" : "#7C9FC5"),
      });
    }
  }
  const smallSphere = new T.SphereGeometry(1, 5, 3);
  instanced(smallSphere, new T.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.45 }), innerBodies,
    { cast: false, receive: false, parent: neighbours });

  // Short protein chains and their bonds float in the extracellular fluid.
  const proteins = [],
    bonds = [];
  for (let i = 0; i < 9; i++) {
    const a = ((i + 0.47) / 9) * Math.PI * 2,
      r = R(52, 77),
      cx = Math.sin(a) * r,
      cz = Math.cos(a) * r * DISH_Z;
    let previous;
    for (let j = 0; j < 4; j++) {
      const p = {
        x: cx + Math.cos(a) * (j - 1.5) * 0.56 + Math.sin(j * 2.2 + i) * 0.12,
        y: -0.65 + Math.sin(j * 1.7 + i) * 0.08,
        z: cz - Math.sin(a) * (j - 1.5) * 0.56 + Math.cos(j * 2.2 + i) * 0.12,
      };
      proteins.push({ ...p, s: j % 2 ? 0.3 : 0.25, color: col(j % 2 ? "#E4B26F" : "#D789A9") });
      if (previous) bonds.push(previous.x, previous.y, previous.z, p.x, p.y, p.z);
      previous = p;
    }
  }
  instanced(smallSphere, new T.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.35 }), proteins,
    { cast: false, receive: false, parent: neighbours });
  const bondGeometry = new T.BufferGeometry();
  bondGeometry.setAttribute("position", new T.Float32BufferAttribute(bonds, 3));
  neighbours.add(new T.LineSegments(bondGeometry,
    new T.LineBasicMaterial({ color: "#8C7895", transparent: true, opacity: 0.72 })));

  // Sparse free-floating vesicles provide a second scale without filling the empty space with clutter.
  const vesicles = [];
  for (let i = 0; i < 45; i++) {
    const a = rnd() * Math.PI * 2,
      r = R(40, 95),
      x = Math.sin(a) * r,
      z = Math.cos(a) * r * DISH_Z;
    if (Math.abs(x) < 6 && z > 31) continue;
    vesicles.push({ x, y: R(-0.86, -0.63), z, s: R(0.09, 0.23), color: col(i % 4 ? "#EDF8EA" : "#E7D4B7") });
  }
  const driftingVesicles = instanced(new T.SphereGeometry(1, 6, 4),
    new T.MeshStandardMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85, roughness: 0.28, depthWrite: false }),
    vesicles, { cast: false, receive: false, parent: neighbours });

  return {
    update(t) {
      if (!reduced) wind.value = t;
      if (!reduced && driftingVesicles) driftingVesicles.rotation.y = Math.sin(t * 0.12) * 0.08;
    },
  };
}
