import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { dampAngle } from "./kit.js";

// The field-trip cast: Dr. Maya and four pupils. Each character is a light rig of groups ("bones")
// whose static parts are baked into a few vertex-coloured meshes per bone, so the five of them stay
// around 150 draw calls. Shapes are lofted (elliptical rings) and swept (tapered tubes) rather than
// stacked primitives, which keeps silhouettes soft and natural.

const NAMES = ["Dr. Maya", "Aria", "Ben", "Zoya", "Leo"];
const LOOKS = [
  {
    h: 1.72,
    skin: "#A8714F",
    hair: "#2A1D17",
    top: "#F1EEE6",
    inner: "#2F6F7A",
    legs: "#2B2F3A",
    shoes: "#3A2A22",
    sole: "#9C7A5B",
    iris: "#4A2C1C",
    style: "bun",
    outfit: "coat",
    lashes: true,
  },
  {
    h: 1.36,
    skin: "#E1B48E",
    hair: "#7A4A2A",
    top: "#E3A33B",
    legs: "#3C5A86",
    shoes: "#F2EEE4",
    sole: "#C69A6C",
    bag: "#C8463C",
    iris: "#5F6B34",
    style: "ponytail",
    outfit: "hoodie",
    lashes: true,
  },
  {
    h: 1.4,
    skin: "#6E4630",
    hair: "#1C1714",
    top: "#C8463C",
    legs: "#A88B5E",
    shoes: "#2E3440",
    sole: "#F4F1EA",
    bag: "#2F6F7A",
    iris: "#2E1A12",
    style: "curls",
    outfit: "tee",
  },
  {
    h: 1.33,
    skin: "#B98262",
    hair: "#241A16",
    top: "#6A4C93",
    inner: "#F1E7D8",
    legs: "#2E3A55",
    shoes: "#D9466F",
    sole: "#F4F1EA",
    bag: "#E3A33B",
    iris: "#4A2E1E",
    style: "long",
    outfit: "cardigan",
    lashes: true,
  },
  {
    h: 1.42,
    skin: "#D9A37E",
    hair: "#9B6A3C",
    top: "#3E8E6B",
    legs: "#5B6170",
    shoes: "#2B2F3A",
    sole: "#F4F1EA",
    bag: "#4B4FA8",
    iris: "#3D6E9C",
    style: "cap",
    outfit: "zip",
  },
];
// Personality: bounce (walk bob), swing (arm swing), glance (how much they look around), gest (gesture energy).
const MOODS = [
  { bounce: 0.7, swing: 0.75, glance: 0.35, gest: 1, tilt: 0.02, hand: -1 },
  { bounce: 1, swing: 1, glance: 1, gest: 1.1, tilt: 0.07, hand: -1 },
  { bounce: 1, swing: 1, glance: 0.45, gest: 1, tilt: -0.03, hand: -1 },
  { bounce: 0.6, swing: 0.7, glance: 0.3, gest: 0.65, tilt: 0.05, hand: 1 },
  { bounce: 1.7, swing: 1.25, glance: 0.6, gest: 1.4, tilt: -0.05, hand: -1 },
];
// Talking gestures for the gesturing arm (mirrored by side): shoulder x/y/z, elbow, wrist pitch and twist.
const GESTURES = [
  { x: -0.5, y: 0.3, z: 0.22, e: -1.3, wx: -0.25, wy: 0.9 }, // explaining, palm up
  { x: -0.95, y: 0.2, z: 0.12, e: -1.85, wx: 0.25, wy: 0.2 }, // raised hand, "listen"
  { x: -0.7, y: -0.15, z: 0.55, e: -0.55, wx: -0.3, wy: 0.6 }, // presenting to the side
  { x: -0.42, y: 0.95, z: 0.04, e: -1.9, wx: 0, wy: 0 }, // hand to chest
  { x: -0.25, y: 0.25, z: 0.18, e: -0.95, wx: -0.2, wy: 0.5 }, // small beat
  { x: -0.55, y: 0.15, z: 0.45, e: -1.2, wx: -0.35, wy: 1, both: true }, // open hands, "you see?"
];

const clamp = T.MathUtils.clamp,
  lerp = T.MathUtils.lerp,
  TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const col = (c) => (c instanceof T.Color ? c.clone() : new T.Color(c));
const mix = (a, b, k) => col(a).lerp(col(b), k);
const shade = (c, k) => mix(c, k > 0 ? "#ffffff" : "#000000", Math.abs(k));
const v3 = (x, y, z) => new T.Vector3(x, y, z);
const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));

// Seeded random so every character has its own, repeatable rhythm.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

let MATS = null;
// Shared materials: everything is vertex-coloured, so all five characters reuse the same handful.
function materials() {
  if (MATS) return MATS;
  const phys = (o) => new T.MeshPhysicalMaterial({ vertexColors: true, ...o });
  const fabric = { roughness: 0.86, sheen: 1, sheenRoughness: 0.8, sheenColor: new T.Color("#3c3c3c") };
  MATS = {
    cloth: phys(fabric),
    shell: phys({ ...fabric, side: T.DoubleSide }),
    skin: phys({ roughness: 0.55, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color("#6a3020") }),
    hair: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.58 }),
    gear: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
    eye: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.16 }),
    glint: new T.MeshBasicMaterial({ color: "#ffffff" }),
    mouth: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  };
  return MATS;
}

// ---------- geometry helpers ----------

const _p = new T.Vector3(),
  _q = new T.Quaternion(),
  _e = new T.Euler();
function mx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new T.Matrix4().compose(v3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), v3(sx, sy, sz));
}
// Transform a geometry and give it vertex colours (a colour or a function of the vertex position).
function prep(geo, color, m) {
  if (geo.attributes.uv) geo.deleteAttribute("uv");
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (m) geo.applyMatrix4(m);
  const pos = geo.attributes.position,
    arr = new Float32Array(pos.count * 3),
    fixed = typeof color === "function" ? null : col(color);
  for (let i = 0; i < pos.count; i++) {
    const c = fixed || color(_p.fromBufferAttribute(pos, i));
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new T.BufferAttribute(arr, 3));
  return geo;
}
function indexed(pos, idx) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Loft rows: [y, rx, zFront, zBack, zOffset, xOffset]; rings are elliptical with separate front/back depth.
const KEYS = ["y", "rx", "zf", "zb", "z", "x"];
const row = (r) => (Array.isArray(r) ? { y: r[0], rx: r[1], zf: r[2] ?? r[1], zb: r[3] ?? r[2] ?? r[1], z: r[4] ?? 0, x: r[5] ?? 0 } : r);
function sampleRows(rows, u) {
  const n = rows.length - 1,
    i = Math.min(Math.floor(u), n - 1),
    f = u - i,
    p0 = rows[Math.max(i - 1, 0)],
    p1 = rows[i],
    p2 = rows[i + 1],
    p3 = rows[Math.min(i + 2, n)],
    out = {};
  for (const k of KEYS) {
    const a = p0[k],
      b = p1[k],
      c = p2[k],
      d = p3[k];
    // Catmull-Rom between b and c.
    out[k] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }
  return out;
}
// Interpolated ring at height y (rows must be monotonic in y).
function rowAt(rows, y) {
  rows = rows.map(row);
  const up = rows[rows.length - 1].y > rows[0].y;
  let lo = 0,
    hi = rows.length - 1;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    if (sampleRows(rows, mid).y < y === up) lo = mid;
    else hi = mid;
  }
  return sampleRows(rows, (lo + hi) / 2);
}
// Surface point on the front (+z) or back (-z) of a loft at (x, y).
function surfaceZ(rows, x, y, back = false) {
  const r = rowAt(rows, y),
    k = Math.sqrt(Math.max(0, 1 - ((x - r.x) / r.rx) ** 2));
  return back ? r.z - r.zb * k : r.z + r.zf * k;
}
function loft(rows, { rings = 16, seg = 24, open = null } = {}) {
  rows = rows.map(row);
  const pos = [],
    idx = [],
    cols = open ? seg + 1 : seg;
  for (let i = 0; i <= rings; i++) {
    const r = sampleRows(rows, (i / rings) * (rows.length - 1)),
      [a0, a1] = open ? open(r) : [0, TAU];
    for (let j = 0; j < cols; j++) {
      const th = a0 + ((a1 - a0) * j) / seg,
        c = Math.cos(th);
      pos.push(r.x + r.rx * Math.sin(th), r.y, r.z + (c > 0 ? r.zf : r.zb) * c);
    }
  }
  const at = (i, j) => i * cols + (open ? j : j % seg);
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  if (!open) {
    // Close both ends with a fan around the ring centre.
    for (const [i, top] of [
      [0, false],
      [rings, true],
    ]) {
      const r = sampleRows(rows, (i / rings) * (rows.length - 1)),
        c = pos.length / 3;
      pos.push(r.x, r.y, r.z);
      for (let j = 0; j < seg; j++) idx.push(...(top ? [c, at(i, j), at(i, j + 1)] : [c, at(i, j + 1), at(i, j)]));
    }
  }
  if (rows[rows.length - 1].y < rows[0].y) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  return indexed(pos, idx);
}
// Swept tube with a radius profile r(u); `thin` gives the flat axis for straps, `flat` its thickness ratio.
function tube(points, r, { seg = 16, radial = 8, thin = null, flat = 1 } = {}) {
  const curve = new T.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(...p)))),
    P = curve.getSpacedPoints(seg),
    F = curve.computeFrenetFrames(seg, false),
    pos = [],
    idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg,
      rad = typeof r === "function" ? r(u) : r,
      t = F.tangents[i];
    let N = F.normals[i],
      B = F.binormals[i];
    if (thin) {
      const d = thin(P[i], u).clone();
      B = d.sub(t.clone().multiplyScalar(t.dot(d))).normalize();
      N = new T.Vector3().crossVectors(B, t);
    }
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU,
        cx = Math.cos(a) * rad,
        sy = Math.sin(a) * rad * flat;
      pos.push(P[i].x + N.x * cx + B.x * sy, P[i].y + N.y * cx + B.y * sy, P[i].z + N.z * cx + B.z * sy);
    }
  }
  const at = (i, j) => i * radial + (j % radial);
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  for (const [i, end] of [
    [0, false],
    [seg, true],
  ]) {
    const c = pos.length / 3;
    pos.push(P[i].x, P[i].y, P[i].z);
    for (let j = 0; j < radial; j++) idx.push(...(end ? [c, at(i, j), at(i, j + 1)] : [c, at(i, j + 1), at(i, j)]));
  }
  return indexed(pos, idx);
}
const ball = (r, w = 14, h = 10) => new T.SphereGeometry(r, w, h);
const taper =
  (a, b, round = 0.15) =>
  (u) =>
    lerp(a, b, u) * Math.sqrt(smooth(0, round, u) * smooth(1, 1 - round, u) * 0.92 + 0.08);

// Parts grouped by material, then merged into one mesh per material per bone.
class Parts {
  constructor() {
    this.lists = {};
  }
  add(mat, geo, color, m) {
    (this.lists[mat] ||= []).push(prep(geo, color, m));
    return this;
  }
  bake(bone, shadow = true) {
    const M = materials(),
      out = {};
    for (const [key, list] of Object.entries(this.lists)) {
      const mesh = new T.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], M[key]);
      mesh.castShadow = shadow && key !== "glint" && key !== "eye" && key !== "mouth";
      mesh.receiveShadow = true;
      bone.add(mesh);
      out[key] = mesh;
    }
    this.lists = {};
    return out;
  }
}

// ---------- proportions ----------

function measure(i, look) {
  const kid = i > 0,
    h = look.h,
    hr = kid ? 0.106 : 0.104,
    W = kid ? h / 1.36 : 1,
    pivotY = h - 1.81 * hr,
    shY = pivotY - (kid ? 0.1 : 0.125),
    hipY = h * (kid ? 0.45 : 0.5),
    ankleH = kid ? 0.062 : 0.074,
    leg = (hipY - ankleH) * 1.012;
  return {
    kid,
    h,
    hr,
    W,
    pivotY,
    shY,
    hipY,
    ankleH,
    Ht: shY - hipY,
    thigh: leg * 0.51,
    shin: leg * 0.49,
    upper: h * (kid ? 0.165 : 0.178),
    fore: h * (kid ? 0.136 : 0.146),
    handL: h * (kid ? 0.086 : 0.086),
    hipW: (kid ? 0.064 : 0.085) * W,
    foot: kid ? 0.84 * W : 1,
    // Head centre relative to the neck pivot, in hr units.
    C: v3(0, 0.68, 0.12),
  };
}

function torsoRows(d) {
  const t = d.kid
    ? [
        [-0.15, 0.172, 0.126, 0.116],
        [-0.05, 0.16, 0.108, 0.104],
        [0.06, 0.144, 0.088, 0.092],
        [0.3, 0.128, 0.08, 0.083],
        [0.58, 0.137, 0.086, 0.084],
        [0.8, 0.146, 0.082, 0.084],
        [0.95, 0.15, 0.072, 0.078],
        [1.04, 0.128, 0.058, 0.066],
        [1.1, 0.075, 0.048, 0.056],
        [1.14, 0.045, 0.04, 0.045],
      ]
    : [
        [-0.2, 0.152, 0.09, 0.102],
        [0.0, 0.146, 0.086, 0.096],
        [0.3, 0.124, 0.08, 0.084],
        [0.56, 0.142, 0.1, 0.088],
        [0.8, 0.16, 0.094, 0.088],
        [0.95, 0.168, 0.08, 0.082],
        [1.04, 0.148, 0.062, 0.07],
        [1.1, 0.085, 0.05, 0.06],
        [1.14, 0.05, 0.045, 0.05],
      ];
  return t.map(([y, rx, zf, zb]) => [y * d.Ht, rx * d.W, zf * d.W, zb * d.W]);
}

function headRows(d) {
  const k = d.kid;
  return [
    [1.13, 0.06, 0.06, 0.06, -0.1],
    [1.02, 0.48, 0.44, 0.56, -0.09],
    [0.78, 0.78, 0.74, 0.88, -0.07],
    [0.4, 0.9, 0.88, 0.98, -0.05],
    [0.0, 0.91, 0.92, 0.95, -0.03],
    [-0.35, k ? 0.88 : 0.86, 0.92, 0.84, -0.01],
    [-0.65, k ? 0.77 : 0.72, 0.88, 0.62, 0.02],
    [-0.9, k ? 0.55 : 0.5, k ? 0.77 : 0.75, 0.42, 0.06],
    [-1.06, k ? 0.3 : 0.27, k ? 0.6 : 0.57, 0.24, 0.12],
    [-1.15, 0.05, 0.12, 0.05, 0.2],
  ];
}

// ---------- character ----------

export function createPerson(kit, scene, i) {
  const look = LOOKS[i],
    d = measure(i, look),
    mood = MOODS[i],
    hr = d.hr,
    kid = d.kid,
    skin = col(look.skin),
    root = new T.Group();
  root.name = NAMES[i];
  scene.add(root);
  const bone = (parent, x, y, z, order) => {
    const g = new T.Group();
    g.position.set(x, y, z);
    if (order) g.rotation.order = order;
    parent.add(g);
    return g;
  };
  const pelvis = bone(root, 0, d.hipY, 0),
    spine = bone(pelvis, 0, 0, 0),
    head = bone(spine, 0, d.pivotY - d.hipY, -0.005);
  const P = new Parts();
  const torso = torsoRows(d),
    Ht = d.Ht,
    W = d.W;
  const topColor = look.outfit === "coat" ? look.inner : look.outfit === "cardigan" ? look.inner : look.top;

  // --- Pelvis: trousers / shorts ---
  const pelvisRows = [
    [-0.135, 0.05, 0.04, 0.04],
    [-0.105, 0.118, 0.078, 0.084],
    [-0.04, 0.154, 0.09, 0.106],
    [0.04, 0.152, 0.088, 0.1],
    [0.11, 0.136, 0.084, 0.088],
    [0.14, 0.1, 0.07, 0.07],
  ].map(([y, rx, zf, zb]) => [y * W, rx * W * (kid ? 0.8 : 1), zf * W * (kid ? 0.86 : 1), zb * W * (kid ? 0.86 : 1)]);
  P.add("cloth", loft(pelvisRows, { rings: 12, seg: 24 }), look.legs);
  P.bake(pelvis);

  // --- Legs: hip > knee > ankle ---
  const legs = [1, -1].map((s) => {
    const hip = bone(pelvis, s * d.hipW, 0, 0, "ZXY"),
      knee = bone(hip, 0, -d.thigh, 0),
      ankle = bone(knee, 0, -d.shin, 0);
    const T0 = d.thigh,
      S0 = d.shin,
      w = W * (kid ? 0.98 : 1.06);
    const thighRows = [
      [0.02, 0.03 * w],
      [-0.01, 0.07 * w, 0.07 * w, 0.076 * w],
      [-0.07, 0.078 * w, 0.076 * w, 0.083 * w],
      [-T0 * 0.5, 0.068 * w, 0.066 * w, 0.07 * w],
      [-T0 * 0.88, 0.054 * w],
      [-T0 - 0.02, 0.05 * w],
      [-T0 - 0.05, 0.02 * w],
    ];
    const shinRows = [
      [0.035, 0.03 * w],
      [0.0, 0.05 * w, 0.052 * w, 0.05 * w],
      [-S0 * 0.22, 0.051 * w, 0.05 * w, 0.062 * w],
      [-S0 * 0.6, 0.04 * w, 0.04 * w, 0.044 * w],
      [-S0 * 0.92, 0.031 * w],
      [-S0 - 0.03, 0.02 * w],
    ];
    const shorts = look.outfit === "tee";
    P.add(shorts ? "skin" : "cloth", loft(thighRows, { rings: 12, seg: 18 }), shorts ? skin : look.legs);
    if (shorts) {
      // Khaki shorts: a slightly flared shell over the upper thigh with a turned hem.
      const sh = [
        [-0.05, 0.05 * w],
        [-0.085, 0.084 * w, 0.07 * w, 0.09 * w],
        [-T0 * 0.3, 0.09 * w, 0.088 * w, 0.094 * w],
        [-T0 * 0.6, 0.086 * w],
        [-T0 * 0.62, 0.078 * w],
      ];
      P.add("cloth", loft(sh, { rings: 8, seg: 18 }), look.legs);
      P.add("cloth", new T.TorusGeometry(0.083 * w, 0.006, 6, 20), shade(look.legs, -0.06), mx(0, -T0 * 0.6, 0, Math.PI / 2));
    }
    P.bake(hip);
    if (shorts) {
      P.add("skin", loft(shinRows, { rings: 12, seg: 16 }), skin);
      // Crew socks with a ribbed top.
      P.add(
        "cloth",
        loft(
          [
            [-S0 + 0.07, 0.036 * w],
            [-S0 + 0.06, 0.037 * w],
            [-S0 - 0.03, 0.035 * w],
          ],
          { rings: 4, seg: 14 },
        ),
        "#F2EFE8",
      );
    } else {
      const flare = look.outfit === "coat" ? 1.18 : 1.06;
      const trouser = [
        [0.035, 0.032 * w],
        [0.0, 0.056 * w, 0.056 * w, 0.056 * w],
        [-S0 * 0.3, 0.054 * w, 0.054 * w, 0.06 * w],
        [-S0 * 0.75, 0.045 * w * flare],
        [-S0 + 0.012, 0.046 * w * flare],
        [-S0 + 0.004, 0.036 * w],
      ];
      P.add("cloth", loft(trouser, { rings: 12, seg: 16 }), look.legs);
      if (look.outfit === "hoodie")
        P.add("cloth", new T.TorusGeometry(0.046 * w, 0.009, 6, 18), shade(look.legs, 0.18), mx(0, -S0 + 0.02, 0, Math.PI / 2));
    }
    P.bake(knee);
    shoe(P, s);
    P.bake(ankle);
    return { hip, knee, ankle, s };
  });

  // Lab coat skirt: two halves that follow the thighs, opening at the back vent and the front.
  let skirts = null;
  if (look.outfit === "coat") {
    const sk = [
        [0.06, 0.178, 0.114, 0.122],
        [-0.06, 0.186, 0.128, 0.132],
        [-0.2, 0.194, 0.146, 0.142],
        [-0.32, 0.2, 0.158, 0.152],
        [-0.42, 0.205, 0.166, 0.158],
      ],
      g = (y) => lerp(0.42, 0.85, smooth(0, -0.42, y));
    skirts = [1, -1].map((s) => {
      const b = bone(pelvis, s * d.hipW, 0, 0);
      P.add(
        "shell",
        loft(sk, { rings: 14, seg: 16, open: (r) => (s > 0 ? [g(r.y), Math.PI] : [Math.PI, TAU - g(r.y)]) }),
        (p) => (p.y < -0.4 ? shade(look.top, -0.05) : col(look.top)),
        mx(-s * d.hipW, 0, 0),
      );
      const y = -0.2,
        r = rowAt(sk, y),
        x = s * 0.115,
        z = r.zf * Math.sqrt(1 - (x / r.rx) ** 2);
      P.add("shell", new T.BoxGeometry(0.075, 0.085, 0.004), "#E9E6DD", mx(x - s * d.hipW, y, z + 0.004, 0, Math.asin(x / r.rx) * 0.9, 0));
      P.bake(b);
      return b;
    });
  }

  // Sneakers / loafers built along the foot, with a lighter sole.
  function shoe(P, s) {
    const f = d.foot,
      v = d.ankleH / 0.074,
      upper = [
        [-0.074, 0.014, 0.02, 0.02, 0.035],
        [-0.068, 0.033, 0.035, 0.042, 0.035],
        [-0.045, 0.042, 0.036, 0.058, 0.036],
        [0.0, 0.044, 0.032, 0.054, 0.04],
        [0.05, 0.047, 0.027, 0.04, 0.045],
        [0.11, 0.049, 0.024, 0.03, 0.048],
        [0.16, 0.044, 0.022, 0.023, 0.05],
        [0.19, 0.027, 0.017, 0.016, 0.052],
        [0.2, 0.006, 0.01, 0.008, 0.053],
      ].map(([a, rx, dn, up, c]) => [a * f, rx * f, dn * v, up * v, c * v, -s * 0.004]);
    // Rotate the loft so its axis runs heel-to-toe (+z) and the "front" depth points down.
    const toFoot = mx(0, 0, 0, Math.PI / 2);
    const isLoafer = !kid;
    P.add(
      "gear",
      loft(upper, { rings: 18, seg: 20 }),
      (p) => (p.y > 0.0 && p.z < -0.02 * f ? shade(look.shoes, -0.08) : col(look.shoes)),
      toFoot,
    );
    const solo = upper.map(([a, rx]) => [a + (a < 0 ? -0.003 : 0.003), rx + 0.004, 0.011 * v, 0.008 * v, d.ankleH - 0.011 * v, -s * 0.004]);
    solo[0][1] = 0.016;
    solo[solo.length - 1][1] = 0.008;
    P.add("gear", loft(solo, { rings: 18, seg: 20 }), look.sole, toFoot);
    if (!isLoafer) {
      // Laces across the instep.
      for (let k = 0; k < 3; k++) {
        const z = (0.005 + k * 0.03) * f,
          r = rowAt(upper, z),
          y = -r.z + r.zb - 0.001,
          lace = tube(
            [
              [-0.026 * f, y - 0.006, z],
              [0, y + 0.002, z + 0.004],
              [0.026 * f, y - 0.006, z],
            ],
            0.0045,
            { seg: 6, radial: 6 },
          );
        P.add("gear", lace, look.shoes === "#F2EEE4" ? "#E07A5F" : "#F4F1EA");
      }
    } else P.add("gear", ball(0.012, 8, 6), shade(look.shoes, 0.25), mx(0, -d.ankleH + 0.088 * v, 0.08 * f, 0, 0, 0, 1.6, 0.4, 0.8));
  }

  // --- Torso (inner top) ---
  const hemY = look.outfit === "coat" ? -0.1 * Ht : -0.15 * Ht;
  const torsoPaint = (p) => {
    const c = col(topColor);
    if (look.outfit === "hoodie" || look.outfit === "zip") return p.y < hemY + 0.035 ? shade(c, -0.1) : c;
    return c;
  };
  P.add("cloth", loft(torso, { rings: 18, seg: 26 }), torsoPaint);
  // Neck.
  const neckR = (kid ? 0.037 : 0.04) * W,
    neckTop = d.pivotY - d.hipY + 0.03;
  P.add(
    "skin",
    loft(
      [
        [Ht * 0.98, neckR * 1.3, neckR * 1.1, neckR * 1.2, -0.01],
        [Ht * 1.08, neckR, neckR, neckR, -0.005],
        [neckTop, neckR * 0.98, neckR, neckR, 0.0],
        [neckTop + 0.02, neckR * 0.6, neckR * 0.6, neckR * 0.6, 0],
      ],
      { rings: 6, seg: 16 },
    ),
    shade(skin, -0.06),
  );
  const front = (x, y) => surfaceZ(torso, x, y),
    backZ = (x, y) => surfaceZ(torso, x, y, true);
  const onChest = (x, y, off = 0) => v3(x, y, front(x, y) + off);
  const collarY = Ht * 1.06;

  if (look.outfit === "coat" || look.outfit === "cardigan") {
    const coat = look.outfit === "coat",
      gap = coat ? (y) => lerp(0.42, 0.95, smooth(0.5 * Ht, 1.1 * Ht, y)) : (y) => lerp(0.3, 0.75, smooth(0.45 * Ht, 1.08 * Ht, y));
    const shellRows = torso
      .filter(([y]) => y <= Ht * 1.1)
      .map(([y, rx, zf, zb]) => [y, rx + 0.012, zf + 0.014, zb + 0.012])
      .map((r, k) => (k === 0 ? [coat ? -0.12 * Ht : -0.2 * Ht, r[1] + 0.012, r[2] + 0.014, r[3] + 0.008] : r));
    const shellColor = (p) => (!coat && p.y < shellRows[0][0] + 0.04 ? shade(look.top, -0.12) : col(look.top));
    P.add("shell", loft(shellRows, { rings: 20, seg: 30, open: (r) => [gap(r.y), TAU - gap(r.y)] }), shellColor);
    if (coat) {
      // Lapels folding open from the chest up to a soft collar behind the neck.
      const lap = (y) => 0.42 * smooth(0.48 * Ht, 0.92 * Ht, y) * (1 - 0.45 * smooth(0.98 * Ht, 1.1 * Ht, y));
      const lapRows = shellRows.filter(([y]) => y >= 0.45 * Ht).map(([y, rx, zf, zb]) => [y, rx + 0.004, zf + 0.006, zb + 0.004]);
      for (const side of [1, -1])
        P.add(
          "shell",
          loft(lapRows, {
            rings: 12,
            seg: 6,
            open: (r) => (side > 0 ? [gap(r.y), gap(r.y) + lap(r.y)] : [TAU - gap(r.y) - lap(r.y), TAU - gap(r.y)]),
          }),
          "#FBFAF6",
        );
      P.add(
        "shell",
        loft(
          [
            [Ht * 1.02, 0.1, 0.075, 0.095, -0.01],
            [Ht * 1.1, 0.07, 0.06, 0.075, -0.012],
            [Ht * 1.16, 0.064, 0.058, 0.07, -0.015],
          ],
          { rings: 6, seg: 20, open: () => [1.0, TAU - 1.0] },
        ),
        "#FBFAF6",
      );
      // Breast pocket with a pen on her left.
      const px = 0.085,
        py = 0.66 * Ht,
        pz = front(px, py) + 0.016;
      P.add("shell", new T.BoxGeometry(0.062, 0.058, 0.004), "#E9E6DD", mx(px, py, pz, 0.08, 0.5, 0));
      P.add("gear", new T.CylinderGeometry(0.0045, 0.0045, 0.075, 8), "#2D5DA8", mx(px - 0.012, py + 0.02, pz + 0.002, 0.08, 0, 0.05));
      P.add("gear", new T.BoxGeometry(0.003, 0.03, 0.004), "#C9CCD2", mx(px - 0.012, py + 0.035, pz + 0.007, 0.08, 0, 0.05));
    } else {
      // Cardigan buttons and a ribbed V edge.
      for (let k = 0; k < 4; k++) {
        const y = lerp(0.05, 0.5, k / 3) * Ht,
          g = gap(y),
          r = rowAt(shellRows, y),
          x = -Math.sin(g) * r.rx,
          z = r.z + r.zf * Math.cos(g) + 0.004;
        P.add("gear", ball(0.008, 8, 6), "#F1E7D8", mx(x, y, z, 0, 0, 0, 1, 1, 0.5));
      }
    }
  } else if (look.outfit === "hoodie") {
    // Hood resting on the shoulders, drawstrings and a kangaroo pocket.
    const hy = collarY,
      hood = tube(
        [
          [-0.065 * W, hy - 0.01, 0.03],
          [-0.085 * W, hy + 0.0, -0.035],
          [-0.05 * W, hy + 0.012, -0.085],
          [0, hy + 0.012, -0.095],
          [0.05 * W, hy + 0.012, -0.085],
          [0.085 * W, hy + 0.0, -0.035],
          [0.065 * W, hy - 0.01, 0.03],
        ],
        (u) => 0.02 * W * (0.75 + 0.4 * Math.sin(Math.PI * u)),
        { seg: 24, radial: 10 },
      );
    P.add("cloth", hood, shade(look.top, -0.05));
    P.add(
      "cloth",
      ball(0.09 * W, 16, 10),
      shade(look.top, -0.04),
      mx(0, 0.88 * Ht, backZ(0, 0.88 * Ht) + 0.004, -0.25, 0, 0, 1.0, 0.8, 0.3),
    );
    for (const x of [-0.028, 0.028]) {
      const y0 = Ht * 1.0,
        y1 = Ht * 0.7;
      P.add(
        "cloth",
        tube([onChest(x, y0, 0.006), onChest(x * 1.1, (y0 + y1) / 2, 0.008), onChest(x * 1.25, y1, 0.008)], 0.0032, { seg: 8, radial: 5 }),
        "#F5ECD7",
      );
      P.add("gear", new T.CylinderGeometry(0.0045, 0.0045, 0.018, 6), "#F5ECD7", mx(x * 1.25, y1 - 0.008, front(x * 1.25, y1) + 0.008));
    }
    const pk = shade(look.top, -0.07);
    P.add(
      "cloth",
      loft(
        torso
          .filter(([y]) => y >= -0.05 * Ht && y <= 0.42 * Ht)
          .map(([y, rx, zf, zb]) => [y, rx + 0.006, zf + 0.008 + (y < 0.1 * Ht ? 0.002 : 0), zb]),
        { rings: 8, seg: 10, open: (r) => [-0.75 + 0.25 * smooth(0, 0.4 * Ht, r.y), 0.75 - 0.25 * smooth(0, 0.4 * Ht, r.y)] },
      ),
      pk,
    );
  } else if (look.outfit === "tee") {
    // Ribbed crew neck.
    P.add(
      "cloth",
      new T.TorusGeometry(neckR * 1.32, 0.008, 6, 24),
      shade(look.top, -0.2),
      mx(0, Ht * 1.1, 0.0, Math.PI / 2 + 0.38, 0, 0, 1.05, 1, 1),
    );
  } else if (look.outfit === "zip") {
    // Stand collar, zip line and pull.
    P.add(
      "cloth",
      loft(
        [
          [collarY - 0.02, 0.062 * W, 0.058, 0.064],
          [collarY + 0.025, 0.056 * W, 0.054, 0.058],
          [collarY + 0.03, 0.05 * W, 0.048, 0.052],
        ],
        { rings: 4, seg: 22, open: () => [0.25, TAU - 0.25] },
      ),
      shade(look.top, -0.06),
    );
    const zip = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(hemY + 0.005, collarY + 0.02, k / 8);
      zip.push(onChest(0, y, 0.004));
    }
    P.add("cloth", tube(zip, 0.0035, { seg: 24, radial: 5 }), "#E4E8E0");
    P.add("gear", new T.BoxGeometry(0.01, 0.024, 0.004), "#C9CCD2", mx(0.004, 0.84 * Ht, front(0, 0.84 * Ht) + 0.008));
    P.add("cloth", new T.BoxGeometry(0.06, 0.018, 0.004), "#ffffff", mx(0.075, 0.78 * Ht, front(0.075, 0.78 * Ht) + 0.004, 0, 0.45, 0));
  }

  // --- Backpack with straps (pupils only) ---
  if (kid) {
    const by = 0.55 * Ht,
      bz = backZ(0, by) - 0.05 * W,
      bw = 0.118 * W,
      bag = col(look.bag);
    const packRows = [
      [-0.2 * Ht, 0.07 * W, 0.03, 0.03],
      [-0.17 * Ht, bw * 0.98, 0.038, 0.05],
      [0.1 * Ht, bw, 0.04, 0.06],
      [0.27 * Ht, bw * 0.92, 0.036, 0.052],
      [0.33 * Ht, bw * 0.55, 0.03, 0.035],
      [0.345 * Ht, 0.03, 0.02, 0.02],
    ].map(([y, rx, zf, zb]) => [by + y, rx, zf, zb, bz]);
    P.add("gear", loft(packRows, { rings: 10, seg: 18 }), (p) => (p.y < by - 0.16 * Ht ? shade(bag, -0.25) : bag));
    const pocketZ = bz - 0.058;
    P.add(
      "gear",
      loft(
        [
          [by - 0.17 * Ht, 0.05 * W, 0.02, 0.02, pocketZ],
          [by - 0.15 * Ht, bw * 0.78, 0.02, 0.032, pocketZ],
          [by + 0.02 * Ht, bw * 0.72, 0.02, 0.03, pocketZ],
          [by + 0.06 * Ht, 0.04 * W, 0.015, 0.015, pocketZ],
        ],
        { rings: 8, seg: 18 },
      ),
      shade(bag, -0.12),
    );
    P.add(
      "gear",
      tube(
        [
          [-bw * 0.6, by + 0.005, pocketZ - 0.029],
          [0, by + 0.012, pocketZ - 0.032],
          [bw * 0.6, by + 0.005, pocketZ - 0.029],
        ],
        0.0035,
        { seg: 10, radial: 5 },
      ),
      "#E8E4DA",
    );
    P.add(
      "gear",
      tube(
        [
          [-0.025, by + 0.33 * Ht, bz - 0.01],
          [0, by + 0.37 * Ht, bz - 0.012],
          [0.025, by + 0.33 * Ht, bz - 0.01],
        ],
        0.006,
        { seg: 8, radial: 6 },
      ),
      shade(bag, -0.3),
    );
    // Shoulder straps: over the shoulder, down the chest and back under the arm.
    const strap = shade(bag, -0.35);
    for (const s of [1, -1]) {
      const x = s * 0.07 * W,
        pts = [
          v3(x * 0.9, by + 0.3 * Ht, bz + 0.02),
          v3(x * 1.05, Ht * 1.02, backZ(x, Ht * 1.0) - 0.004),
          v3(x * 1.15, Ht * 1.08, 0.0),
          onChest(x * 1.2, Ht * 0.95, 0.006),
          onChest(x * 1.35, Ht * 0.72, 0.007),
          onChest(x * 1.55, Ht * 0.48, 0.006),
          v3(s * 0.135 * W, Ht * 0.3, 0.0),
          v3(s * 0.1 * W, by - 0.16 * Ht, bz + 0.03),
        ];
      P.add(
        "gear",
        tube(pts, 0.017 * W, {
          seg: 26,
          radial: 6,
          flat: 0.28,
          thin: (p) => v3(p.x * 2.5, p.y > Ht * 0.98 ? 1.5 : 0, p.z).normalize(),
        }),
        strap,
      );
    }
  }
  const spineMesh = P.bake(spine);

  // --- Arms: shoulder > elbow > wrist ---
  const sleeve = look.outfit === "coat" ? look.top : look.outfit === "cardigan" ? look.top : look.top;
  const arms = [1, -1].map((s) => {
    const r0 = rowAt(torso, Ht * 0.95),
      sh = bone(spine, s * (r0.rx - 0.024 * W), Ht - 0.025, -0.006),
      elbow = bone(sh, 0, -d.upper, 0),
      wrist = bone(elbow, 0, -d.fore, 0);
    const a = W * (kid ? 0.96 : 1.02),
      U = d.upper,
      F = d.fore;
    const upperRows = [
      [0.055, 0.02 * a],
      [0.035, 0.045 * a],
      [0.0, 0.052 * a, 0.05 * a, 0.052 * a],
      [-U * 0.35, 0.046 * a],
      [-U * 0.75, 0.04 * a],
      [-U, 0.037 * a],
      [-U - 0.03, 0.02 * a],
    ];
    const tee = look.outfit === "tee";
    P.add(tee ? "skin" : "cloth", loft(upperRows, { rings: 12, seg: 16 }), tee ? skin : sleeve);
    if (tee) {
      P.add(
        "cloth",
        loft(
          [
            [0.07, 0.03 * a],
            [0.05, 0.06 * a],
            [0.0, 0.066 * a],
            [-U * 0.42, 0.062 * a],
            [-U * 0.44, 0.058 * a],
          ],
          { rings: 8, seg: 16 },
        ),
        look.top,
      );
      P.add("cloth", new T.TorusGeometry(0.06 * a, 0.006, 6, 18), shade(look.top, -0.2), mx(0, -U * 0.43, 0, Math.PI / 2));
    }
    if (look.outfit === "zip")
      P.add(
        "cloth",
        tube(
          [
            [s * 0.05 * a, 0.02, 0],
            [s * 0.047 * a, -U * 0.5, 0],
            [s * 0.038 * a, -U - 0.01, 0],
          ],
          0.005,
          { seg: 10, radial: 5, flat: 0.5, thin: () => v3(1, 0, 0) },
        ),
        "#F4F1EA",
      );
    P.bake(sh);
    const foreRows = [
      [0.035, 0.022 * a],
      [0.0, 0.038 * a],
      [-F * 0.28, 0.037 * a, 0.036 * a, 0.037 * a],
      [-F * 0.78, 0.031 * a],
      [-F, 0.028 * a],
      [-F - 0.012, 0.016 * a],
    ];
    P.add(tee ? "skin" : "cloth", loft(foreRows, { rings: 12, seg: 16 }), tee ? skin : sleeve);
    if (!tee) {
      const cuff = look.outfit === "coat" ? "#E6E3DA" : shade(sleeve, -0.12);
      P.add(
        "cloth",
        loft(
          [
            [-F + 0.035, 0.033 * a],
            [-F + 0.03, 0.034 * a],
            [-F + 0.004, 0.033 * a],
            [-F - 0.004, 0.026 * a],
          ],
          { rings: 4, seg: 16 },
        ),
        cuff,
      );
      if (look.outfit === "zip")
        P.add(
          "cloth",
          tube(
            [
              [s * 0.039 * a, 0.02, 0],
              [s * 0.034 * a, -F + 0.03, 0],
            ],
            0.005,
            { seg: 6, radial: 5, flat: 0.5, thin: () => v3(1, 0, 0) },
          ),
          "#F4F1EA",
        );
    }
    if (!kid && s > 0) clipboard(P, F);
    P.bake(elbow);
    hand(P, s, a);
    P.bake(wrist);
    return { sh, elbow, wrist, s };
  });

  // Soft mitten hand with a thumb; fingers curl gently towards the palm.
  function hand(P, s, a) {
    const L = d.handL * (kid ? 1 : 0.98),
      rows = [
        [0.05, 0.06, 0.09],
        [0.0, 0.11, 0.15],
        [-0.3, 0.14, 0.26],
        [-0.55, 0.135, 0.27],
        [-0.8, 0.11, 0.235],
        [-0.95, 0.075, 0.16],
        [-1.0, 0.02, 0.04],
      ].map(([y, t, w]) => [y * L, t * L * a * 1.1, w * L * a * 1.1, w * L * a * 1.1]),
      g = loft(rows, { rings: 14, seg: 16 }),
      pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k) / L;
      if (y < 0) pos.setX(k, pos.getX(k) - s * 0.3 * L * y * y);
    }
    g.computeVertexNormals();
    const palm = mix(skin, "#F2C7A8", 0.12);
    P.add("skin", g, (p) => (p.x * -s > 0.004 ? palm : skin));
    P.add(
      "skin",
      tube(
        [
          [-s * 0.05 * L, -0.12 * L, 0.15 * L * a],
          [-s * 0.11 * L, -0.38 * L, 0.28 * L * a],
          [-s * 0.13 * L, -0.56 * L, 0.27 * L * a],
        ],
        taper(0.09 * L, 0.075 * L, 0.25),
        { seg: 8, radial: 8 },
      ),
      skin,
    );
  }

  // Clipboard cradled along Dr. Maya's left forearm.
  function clipboard(P, F) {
    P.add("gear", new T.BoxGeometry(0.012, 0.29, 0.22), "#A87A4C", mx(-0.038, -F * 0.52, 0.075, 0, 0, 0));
    P.add("gear", new T.BoxGeometry(0.004, 0.24, 0.19), "#FBF6EC", mx(-0.046, -F * 0.5, 0.075));
    for (let k = 0; k < 4; k++)
      P.add("gear", new T.BoxGeometry(0.001, 0.15, 0.003), "#9DB4C4", mx(-0.0485, -F * 0.42 - k * 0.04, 0.06 + (k % 2) * 0.01));
    P.add("gear", new T.BoxGeometry(0.02, 0.06, 0.03), "#B9BEC6", mx(-0.04, -F * 0.52, 0.18));
  }

  // --- Head ---
  const C = d.C.clone().multiplyScalar(hr),
    rowsH = headRows(d),
    rowsW = rowsH.map(([y, rx, zf, zb, z]) => [C.y + y * hr, rx * hr, zf * hr, zb * hr, C.z + z * hr]),
    // Face coordinates in hr units relative to the head centre.
    faceZ = (x, y) => surfaceZ(rowsH, x, y),
    F = (x, y, off = 0) => v3(x * hr, C.y + y * hr, C.z + (faceZ(x, y) + off) * hr);
  const eyeY = kid ? -0.1 : -0.05,
    eyeX = kid ? 0.36 : 0.35,
    re = (kid ? 0.19 : 0.168) * hr,
    eyeC = F(eyeX, eyeY, -(re / hr) * 0.6);
  const blushC = mix(skin, i === 2 ? "#9E4A3E" : "#E57B68", 1);
  const cheeks = [F(0.5, -0.42), F(-0.5, -0.42)];
  const facePaint = (p) => {
    const c = skin.clone();
    for (const k of cheeks) {
      const g = Math.exp(-p.distanceToSquared(k) / (2 * (0.2 * hr) ** 2));
      c.lerp(blushC, g * (kid ? 0.32 : 0.22));
    }
    const y = (p.y - C.y) / hr;
    if (y < -0.95) c.lerp(new T.Color(0, 0, 0), 0.1 * smooth(-0.95, -1.12, y));
    return c;
  };
  P.add("skin", loft(rowsW, { rings: 26, seg: 32 }), facePaint);
  // Nose: a small soft wedge from bridge to tip, with gentle wings.
  const nY = kid ? -0.42 : -0.4,
    tipR = (kid ? 0.085 : 0.1) * hr;
  P.add(
    "skin",
    tube(
      [F(0, eyeY - 0.1, -0.07), F(0, nY + 0.12, -0.01), F(0, nY, 0.03)],
      (u) => tipR * lerp(0.4, 0.92, u) * Math.sqrt(smooth(0, 0.25, u) * 0.9 + 0.1),
      {
        seg: 10,
        radial: 10,
      },
    ),
    facePaint,
  );
  P.add("skin", ball(tipR, 12, 8), facePaint, mx(0, C.y + (nY - 0.02) * hr, C.z + (faceZ(0, nY) + 0.02) * hr, 0, 0, 0, 1.05, 0.85, 0.85));
  for (const s of [1, -1])
    P.add(
      "skin",
      ball(tipR * 0.62, 10, 6),
      facePaint,
      mx(s * 0.12 * hr, C.y + (nY - 0.06) * hr, C.z + (faceZ(0.12, nY - 0.06) - 0.02) * hr, 0, 0, 0, 1, 0.8, 0.8),
    );
  // Ears with a darker inner bowl.
  for (const s of [1, -1]) {
    const ex = s * 0.9 * hr,
      ey = C.y - 0.12 * hr,
      ez = C.z - 0.06 * hr;
    P.add("skin", ball(0.22 * hr, 12, 10), skin, mx(ex, ey, ez, 0, s * 0.35, s * -0.1, 0.38, 1, 0.68));
    P.add("skin", ball(0.13 * hr, 10, 8), shade(skin, -0.18), mx(ex + s * 0.03 * hr, ey, ez + 0.02 * hr, 0, s * 0.35, 0, 0.25, 0.75, 0.5));
  }
  // Closed-mouth smile drawn as a soft lip line.
  const mY = kid ? -0.72 : -0.74,
    mW = i === 4 ? 0.26 : 0.21,
    smile = [];
  for (let k = 0; k <= 6; k++) {
    const x = lerp(-mW, mW, k / 6);
    smile.push(F(x, mY + 0.07 * (x / mW) ** 2, 0.0));
  }
  P.add(
    "skin",
    tube(smile, (u) => hr * (0.01 + 0.015 * Math.sin(Math.PI * u)), { seg: 14, radial: 6 }),
    mix(skin, "#4A1C1A", 0.45),
  );
  P.add(
    "skin",
    ball(0.1 * hr, 10, 6),
    mix(skin, "#B8645A", 0.12),
    mx(0, C.y + (mY - 0.1) * hr, C.z + (faceZ(0, mY - 0.1) - 0.04) * hr, 0, 0, 0, 1.4, 0.45, 0.45),
  );

  // Hair shell: an inflated copy of the head whose face and nape vertices sink back under the skin,
  // which draws a soft natural hairline without any open edges.
  const hairC = col(look.hair),
    hairHi = mix(hairC, "#B07A4E", 0.35);
  const hairPaint = (p) => {
    const y = (p.y - C.y) / hr,
      z = (p.z - C.z) / hr;
    const c = hairC.clone();
    c.lerp(hairHi, 0.3 * Math.exp(-((y - 0.75) ** 2) / 0.08) * smooth(-0.6, 0.6, z));
    return c.lerp(new T.Color(0, 0, 0), 0.15 * smooth(-0.2, -1.2, y));
  };
  const style = {
    bun: { e: 0.075, hl: (x) => 0.6 + 0.18 * x * x, fmax: 1.2, nape: -0.75, ear: 0.08 },
    ponytail: { e: 0.075, hl: (x) => 0.48 + 0.2 * x * x, fmax: 1.18, nape: -0.75, ear: 0.08 },
    curls: { e: 0.12, hl: (x) => 0.55 + 0.12 * x * x, fmax: 1.25, nape: -0.6, ear: 0.12 },
    long: { e: 0.085, hl: (x) => 0.55 + 0.1 * x * x, fmax: 1.02, nape: -1.4, ear: -0.98, straight: true },
    cap: { e: 0.08, hl: (x) => 0.36 + 0.12 * x * x, fmax: 1.22, nape: -0.65, ear: 0.0 },
  }[look.style];
  const e = style.e;
  // Hair surface rows (hr units) before the hairline is carved; locks and ribbons hug this surface.
  let shellH = rowsH.map(([y, rx, zf, zb, z]) => [y + (y > 0.9 ? e * 0.9 : 0), rx * (1 + e), zf * (1 + e * 0.8), zb * (1 + e), z]);
  if (style.straight)
    shellH = shellH.map(([y, rx, zf, zb, z], k) =>
      y < 0.2 && k < rowsH.length - 1
        ? [y - (y < -0.8 ? 0.15 : 0), Math.max(rx, 1.0), Math.max(zf, 0.85), Math.max(zb, 1.02), z]
        : [y, rx, zf, zb, z],
    );
  {
    const g = loft(
        shellH.map(([y, rx, zf, zb, z]) => [C.y + y * hr, rx * hr, zf * hr, zb * hr, C.z + z * hr]),
        { rings: 36, seg: 48 },
      ),
      pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k) / hr,
        y = (pos.getY(k) - C.y) / hr,
        z = (pos.getZ(k) - C.z) / hr,
        phi = Math.atan2(Math.abs(x), z),
        faceM = (1 - smooth(style.fmax - 0.22, style.fmax + 0.22, phi)) * (1 - smooth(style.hl(x) - 0.14, style.hl(x) + 0.14, y)),
        napeY = lerp(style.ear, style.nape, smooth(1.35, 2.7, phi)),
        napeM = 1 - smooth(napeY - 0.15, napeY + 0.15, y),
        m = Math.max(faceM, napeM);
      let sc = 1 - 0.18 * m;
      if (look.style === "curls") sc *= 1 + 0.035 * (1 - m) * Math.sin(x * 19) * Math.sin(y * 17 + 1) * Math.sin(z * 15 + 2);
      pos.setXYZ(k, x * hr * sc, C.y + y * hr * sc, C.z + z * hr * sc);
    }
    g.computeVertexNormals();
    P.add("hair", g, hairPaint);
  }
  // Point on the hair surface along a direction from the head centre (binary search), pushed out by `off`.
  const onShell = (dir, off = 0) => {
    dir.normalize();
    let lo = 0,
      hi = 2;
    for (let k = 0; k < 24; k++) {
      const t = (lo + hi) / 2,
        p = dir.clone().multiplyScalar(t),
        r = rowAt(shellH, p.y),
        dz = p.z - r.z,
        inside = (p.x / r.rx) ** 2 + (dz / (dz > 0 ? r.zf : r.zb)) ** 2 <= 1 && p.y < shellH[0][0];
      if (inside) lo = t;
      else hi = t;
    }
    return dir
      .multiplyScalar(lo + off)
      .multiplyScalar(hr)
      .add(C);
  };
  // A flat lock of hair lying on the hair surface: points are [x, y, back?] in hr units.
  const ribbon = (pts, r0, r1, k = 0, flat = 0.32, off = 0.025) =>
    P.add(
      "hair",
      tube(
        pts.map(([x, y, back = 0]) => v3(x * hr, C.y + y * hr, C.z + (surfaceZ(shellH, x, y, !!back) + (back ? -off : off)) * hr)),
        (u) => hr * lerp(r0, r1, u) * Math.sqrt(smooth(0, 0.12, u) * 0.85 + 0.15),
        { seg: 16, radial: 8, flat, thin: (p) => p.clone().sub(C).normalize() },
      ),
      (p) => shade(hairPaint(p), k),
    );
  // A free lock with explicit points (x, y, z in hr units).
  const lock = (pts, r0, r1, flat = 0.75, shadeK = 0) =>
    P.add(
      "hair",
      tube(
        pts.map(([x, y, z]) => v3(x * hr, C.y + y * hr, C.z + z * hr)),
        (u) => hr * lerp(r0, r1, u) * Math.sqrt(smooth(0, 0.12, u)) + hr * 0.01,
        { seg: 14, radial: 8, flat },
      ),
      (p) => shade(hairPaint(p), shadeK),
    );
  let ponytail = null,
    hairBack = null;
  if (look.style === "bun") {
    // Neat bun with a twist; soft swept sections from a side parting give the hair direction.
    const b = v3(0, C.y + 0.5 * hr, C.z - 1.02 * hr);
    P.add("hair", ball(0.42 * hr, 18, 12), hairPaint, mx(b.x, b.y, b.z, 0.3, 0, 0, 1.05, 0.95, 0.85));
    P.add(
      "hair",
      new T.TorusGeometry(0.3 * hr, 0.1 * hr, 8, 24),
      (p) => shade(hairPaint(p), 0.06),
      mx(b.x, b.y - 0.02 * hr, b.z + 0.1 * hr, 0.3 + Math.PI / 2.3, 0, 0),
    );
    ribbon(
      [
        [0.4, 1.08],
        [0.05, 0.98],
        [-0.45, 0.8],
        [-0.8, 0.5],
        [-0.86, 0.25],
      ],
      0.34,
      0.12,
      0.03,
      0.22,
      0.0,
    );
    ribbon(
      [
        [0.42, 1.08],
        [0.7, 0.85],
        [0.86, 0.5],
        [0.88, 0.28],
      ],
      0.26,
      0.1,
      -0.02,
      0.22,
      0.0,
    );
    // Thin-rim glasses.
    const rim = "#3A2A22";
    for (const s of [1, -1]) {
      const c = F(s * eyeX, eyeY - 0.02, 0.1);
      P.add("hair", new T.TorusGeometry(0.25 * hr, 0.018 * hr, 6, 28), rim, mx(c.x, c.y, c.z, 0, s * 0.12, 0, 1.18, 0.86, 1));
      P.add(
        "hair",
        tube(
          [
            v3(s * 0.62 * hr, c.y + 0.03 * hr, c.z - 0.1 * hr),
            v3(s * 0.93 * hr, c.y + 0.02 * hr, C.z - 0.1 * hr),
            v3(s * 0.9 * hr, C.y - 0.2 * hr, C.z - 0.35 * hr),
          ],
          0.016 * hr,
          {
            seg: 8,
            radial: 5,
          },
        ),
        rim,
      );
      // Small gold studs.
      P.add("hair", ball(0.035 * hr, 8, 6), "#D8B25A", mx(s * 0.93 * hr, C.y - 0.32 * hr, C.z - 0.04 * hr));
    }
    P.add(
      "hair",
      tube([F(0.09, eyeY + 0.02, 0.1), F(0, eyeY + 0.07, 0.12), F(-0.09, eyeY + 0.02, 0.1)], 0.018 * hr, { seg: 6, radial: 5 }),
      rim,
    );
  } else if (look.style === "ponytail") {
    // Side-swept fringe falling from a parting on her left.
    for (const [pts, r0, k] of [
      [
        [
          [0.45, 1.04],
          [0.18, 0.92],
          [-0.22, 0.74],
          [-0.55, 0.54],
          [-0.74, 0.34],
        ],
        0.22,
        0.04,
      ],
      [
        [
          [0.32, 1.06],
          [0.05, 0.9],
          [-0.3, 0.64],
          [-0.48, 0.44],
        ],
        0.18,
        -0.04,
      ],
      [
        [
          [0.52, 1.0],
          [0.36, 0.84],
          [0.08, 0.62],
          [-0.12, 0.5],
        ],
        0.16,
        0.08,
      ],
      [
        [
          [0.58, 0.96],
          [0.66, 0.72],
          [0.74, 0.46],
        ],
        0.15,
        0,
      ],
    ])
      ribbon(pts, r0, 0.03, k, 0.32, 0.02);
    ponytail = bone(head, 0, C.y + 0.55 * hr, C.z - 1.04 * hr);
    const PT = new Parts();
    PT.add("gear", new T.TorusGeometry(0.17 * hr, 0.075 * hr, 8, 18), look.bag, mx(0, 0, 0, 0.5, 0, 0));
    const tail = (dx, r0, ok) =>
      tube(
        [
          [dx * hr, 0.04 * hr, 0],
          [dx * hr, -0.22 * hr, -0.24 * hr],
          [dx * 1.2 * hr, -0.8 * hr, -0.26 * hr],
          [dx * 0.8 * hr, -1.3 * hr, -0.1 * hr],
          [(dx * 0.4 + 0.1) * hr, -1.55 * hr, 0.04 * hr],
        ],
        (u) => hr * r0 * (0.75 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.4))) * (1 - 0.85 * u ** 1.6),
        { seg: 18, radial: 10, flat: ok },
      );
    PT.add("hair", tail(0, 0.21, 0.85), hairPaint);
    PT.add("hair", tail(0.09, 0.13, 0.8), (p) => shade(hairPaint(p), 0.08));
    PT.add("hair", tail(-0.08, 0.13, 0.8), (p) => shade(hairPaint(p), -0.05));
    PT.bake(ponytail);
  } else if (look.style === "curls") {
    // Tight coils clustered over the top and sides.
    const R = rng(77);
    for (let k = 0; k < 46; k++) {
      const a = R() * TAU,
        up = 0.15 + R() * 1.25,
        dir = v3(Math.sin(a) * Math.cos(up), Math.sin(up), Math.cos(a) * Math.cos(up));
      if (dir.y < 0.2 && dir.z > 0.2) continue;
      if (dir.z > 0.55 && dir.y < 0.62) continue;
      const p = dir.multiplyScalar(1.02 * hr).add(C);
      p.y += 0.05 * hr;
      const tint = (R() - 0.5) * 0.12;
      P.add("hair", ball((0.13 + R() * 0.06) * hr, 7, 5), (q) => shade(hairPaint(q), tint), mx(p.x, p.y, p.z));
    }
  } else if (look.style === "long") {
    // Hair framing the face and a pink headband; the long back falls on its own swinging bone.
    for (const s of [1, -1])
      lock(
        [
          [s * 0.55, 0.85, 0.65],
          [s * 0.86, 0.35, 0.52],
          [s * 0.92, -0.35, 0.34],
          [s * 0.88, -1.0, 0.2],
          [s * 0.8, -1.3, 0.14],
        ],
        0.24,
        0.12,
        0.5,
        0.03,
      );
    const band = [];
    for (let k = 0; k <= 12; k++) {
      const a = lerp(-1.5, 1.5, k / 12);
      band.push(onShell(v3(Math.sin(a), Math.cos(a), 0.45 - 0.1 * Math.cos(a)), 0.035));
    }
    P.add(
      "hair",
      tube(band, 0.07 * hr, { seg: 24, radial: 8, flat: 0.45, thin: (p) => v3(p.x, (p.y - C.y) * 0.4, p.z - C.z).normalize() }),
      "#D9466F",
    );
    hairBack = bone(spine, 0, d.pivotY - d.hipY, -0.005);
    const backRows = [
      [C.y + 0.75 * hr, 0.5 * hr, 0.2 * hr, 0.25 * hr, C.z - 0.6 * hr],
      [C.y + 0.2 * hr, 0.92 * hr, 0.28 * hr, 0.3 * hr, C.z - 0.82 * hr],
      [C.y - 0.6 * hr, 0.95 * hr, 0.2 * hr, 0.25 * hr, C.z - 0.82 * hr],
      [C.y - 1.4 * hr, 0.9 * hr, 0.14 * hr, 0.2 * hr, C.z - 0.88 * hr],
      [C.y - 2.1 * hr, 0.72 * hr, 0.1 * hr, 0.14 * hr, C.z - 0.9 * hr],
      [C.y - 2.35 * hr, 0.3 * hr, 0.05 * hr, 0.06 * hr, C.z - 0.86 * hr],
    ];
    new Parts().add("hair", loft(backRows, { rings: 16, seg: 22 }), hairPaint).bake(hairBack);
  } else if (look.style === "cap") {
    // Backwards cap with the strap gap over the forehead and tufts poking out.
    const cap = "#1E2440",
      capRows = [
        [0.32, 1.0, 0.96, 1.06, -0.04],
        [0.62, 1.0, 0.95, 1.06, -0.05],
        [1.0, 0.76, 0.72, 0.84, -0.07],
        [1.22, 0.36, 0.34, 0.4, -0.08],
        [1.3, 0.04, 0.04, 0.04, -0.08],
      ].map(([y, rx, zf, zb, z]) => [C.y + y * hr, rx * hr, zf * hr, zb * hr, C.z + z * hr]);
    P.add("gear", loft(capRows, { rings: 14, seg: 32 }), (p) => ((p.y - C.y) / hr < 0.38 ? shade(cap, 0.12) : col(cap)));
    P.add("gear", ball(0.07 * hr, 8, 6), cap, mx(0, C.y + 1.3 * hr, C.z - 0.08 * hr));
    P.add(
      "gear",
      new T.CylinderGeometry(0.62 * hr, 0.62 * hr, 0.05 * hr, 20, 1, false, Math.PI / 2, Math.PI),
      shade(cap, 0.08),
      mx(0, C.y + 0.36 * hr, C.z - 0.98 * hr, -0.14, 0, 0, 1.15, 1, 1),
    );
    for (let k = 0; k < 9; k++) {
      const x = -0.64 + k * 0.16,
        len = 0.14 + ((k * 7) % 4) * 0.04;
      ribbon(
        [
          [x * 0.9, 0.58],
          [x, 0.44],
          [x - 0.07 - 0.04 * (k % 2), 0.44 - len],
        ],
        0.17,
        0.035,
        k % 2 ? 0.05 : -0.03,
        0.3,
        0.02,
      );
    }
    for (const s of [1, -1])
      ribbon(
        [
          [s * 0.8, 0.5],
          [s * 0.88, 0.25],
          [s * 0.9, 0.0],
        ],
        0.17,
        0.04,
        0,
        0.4,
        0.01,
      );
  }
  const headMesh = P.bake(head);

  // Eyes: one lofted ball each so pupil, iris and limbal ring have crisp, round edges.
  const iris = col(look.iris),
    pupilA = kid ? 0.24 : 0.22,
    irisA = kid ? 0.64 : 0.58,
    eyeAngles = [
      0,
      0.1,
      pupilA - 0.01,
      pupilA + 0.01,
      (pupilA + irisA) / 2,
      irisA - 0.06,
      irisA - 0.01,
      irisA + 0.02,
      0.7,
      0.95,
      1.2,
      1.45,
      1.7,
      2.0,
      2.4,
      2.8,
      Math.PI,
    ];
  const eyeGeo = () =>
    prep(
      loft(
        eyeAngles.map((a) => [Math.cos(a) * re, Math.max(Math.sin(a), 0.002) * re]),
        { rings: eyeAngles.length - 1, seg: 20 },
      ),
      (p) => {
        const a = Math.acos(clamp(p.z / re, -1, 1));
        if (a < pupilA) return new T.Color("#0D0907");
        if (a < irisA) return a > irisA - 0.05 ? shade(iris, -0.45) : mix(iris, "#ffffff", 0.18 * (1 - smooth(pupilA, irisA, a)));
        return mix("#F6F1E8", "#D9CFC4", smooth(1.0, 2.0, a));
      },
      mx(0, 0, 0, Math.PI / 2),
    );
  const eyes = [1, -1].map((s) => {
    const eye = new T.Mesh(eyeGeo(), materials().eye);
    eye.position.set(s * eyeC.x, eyeC.y, eyeC.z);
    eye.rotation.y = s * 0.06;
    head.add(eye);
    return eye;
  });
  // Specular glints, upper eyelids (with lash line) and brows sit on the shared eye line.
  const lids = bone(head, 0, eyeC.y, eyeC.z),
    lidR = re * 1.06;
  const glintBone = bone(head, 0, 0, 0);
  for (const s of [1, -1])
    P.add("glint", ball(re * 0.11, 8, 6), "#ffffff", mx(s * eyeC.x + re * 0.3, eyeC.y + re * 0.24, eyeC.z + re * 0.92));
  const glints = P.bake(glintBone, false).glint;
  for (const s of [1, -1]) {
    P.add("skin", new T.SphereGeometry(lidR, 22, 8, 0, TAU, 0, Math.PI / 2), shade(skin, -0.1), mx(s * eyeC.x, 0, 0));
    const lash = [];
    for (let k = 0; k <= 10; k++) {
      const a = lerp(-1.45, 1.45, k / 10) * s;
      lash.push(v3(s * eyeC.x + Math.sin(a) * lidR, 0, Math.cos(a) * lidR));
    }
    if (look.lashes) lash.push(v3(s * eyeC.x + s * (lidR + re * 0.38) * Math.sin(1.5), re * 0.22, Math.cos(1.5) * lidR));
    P.add(
      "mouth",
      tube(lash, (u) => re * (0.06 + (look.lashes ? 0.06 * u * u : 0)), { seg: 20, radial: 5 }),
      "#1A1210",
    );
  }
  P.bake(lids, false);
  const brows = bone(head, 0, 0, 0);
  for (const s of [1, -1]) {
    const by = eyeY + (kid ? 0.42 : 0.4),
      pts = [F(s * (eyeX - 0.16), by - 0.02, 0.025), F(s * (eyeX + 0.02), by + 0.05, 0.025), F(s * (eyeX + 0.21), by - 0.02, 0.02)];
    P.add(
      "hair",
      tube(pts, (u) => hr * (0.052 - 0.034 * u) * Math.sqrt(smooth(0, 0.15, u) * smooth(1, 0.8, u) * 0.9 + 0.1), {
        seg: 10,
        radial: 6,
        flat: 0.55,
      }),
      shade(hairC, -0.1),
    );
  }
  P.bake(brows, false);
  // Open mouth: dark interior with teeth and tongue, scaled open while talking.
  const mouth = bone(head, 0, C.y + (mY - 0.04) * hr, C.z + (faceZ(0, mY) - 0.05) * hr);
  P.add("mouth", ball(0.19 * hr, 14, 10), "#4A1C1E", mx(0, 0, 0, 0, 0, 0, 1.1, 0.75, 0.45));
  P.add("mouth", ball(0.14 * hr, 12, 6), "#F5F0E6", mx(0, 0.09 * hr, 0.012 * hr, 0, 0, 0, 1.05, 0.25, 0.5));
  P.add("mouth", ball(0.12 * hr, 10, 6), "#C45A5A", mx(0, -0.08 * hr, 0.0, 0, 0, 0, 1, 0.35, 0.55));
  P.bake(mouth, false);
  mouth.visible = false;

  root.position.set(0, 0.42, 32 + i * 0.6);
  root.rotation.y = Math.PI;
  const R = rng(1013 + i * 7919);
  const actor = {
    root,
    pelvis,
    spine,
    head,
    legs,
    arms,
    eyes,
    lids,
    glints,
    brows,
    mouth,
    ponytail,
    hairBack,
    skirts,
    dims: d,
    mood,
    idx: i,
    rand: R,
    h: d.h,
    name: NAMES[i],
    walk: 0,
    speed: 0,
    stride: R(),
    vel: new T.Vector2(),
    trunkYaw: 0,
    trunkPitch: 0,
    headYaw: 0,
    headYawVel: 0,
    blink: { next: 1 + R() * 3, t: -1 },
    lidOpen: kid ? -0.62 : -0.5,
    look: { glance: 0, target: 0, next: 0, sacc: 0, saccNext: 0 },
    talk: { w: 0, open: 0, brow: 0, g: 0, next: 0, pose: null, both: 0 },
    springs: { x: 0, vx: 0, z: 0, vz: 0 },
    idle: { phase: R() * 10 },
    feet: [
      [0.04, 0],
      [-0.03, 0],
    ].map(([z]) => z * (R() > 0.5 ? 1 : -1)),
    _meshes: { spineMesh, headMesh },
  };
  return actor;
}

// ---------- animation ----------

const _hip = new T.Vector3(),
  _tgt = new T.Vector3(),
  _qi = new T.Quaternion(),
  _eu = new T.Euler();

// Two-bone leg IK in the pelvis frame: places the ankle at `target` (root space) with foot pitch `phi` (toes up > 0).
function solveLeg(actor, leg, target, phi, toeOut) {
  const d = actor.dims,
    p = actor.pelvis;
  _hip
    .set(leg.s * d.hipW, 0, 0)
    .applyQuaternion(p.quaternion)
    .add(p.position);
  _qi.copy(p.quaternion).invert();
  const v = _tgt.copy(target).sub(_hip).applyQuaternion(_qi),
    roll = Math.atan2(v.x, -v.y),
    down = Math.hypot(v.x, v.y),
    Tl = d.thigh,
    Sl = d.shin,
    D = clamp(Math.hypot(down, v.z), 0.05, (Tl + Sl) * 0.9995),
    bend = Math.PI - Math.acos(clamp((Tl * Tl + Sl * Sl - D * D) / (2 * Tl * Sl), -1, 1)),
    beta = Math.acos(clamp((Tl * Tl + D * D - Sl * Sl) / (2 * Tl * D), -1, 1)),
    alpha = Math.atan2(v.z, down),
    yaw = _eu.setFromQuaternion(p.quaternion, "YXZ").y;
  leg.hip.rotation.set(-(alpha + beta), toeOut - yaw, roll);
  leg.knee.rotation.x = bend;
  leg.ankle.rotation.set(alpha + beta - bend - phi, 0, -roll);
}

// Stride-matched walk with heel-strike / toe-off, hip sway and counter-rotating shoulders; idle breathing,
// weight shifts and blinks. `reduced` keeps only the essentials (legs still step so nobody slides).
export function animatePerson(actor, dx, dz, dt, t, idx, reduced) {
  const d = actor.dims,
    m = actor.mood,
    dist = Math.hypot(dx, dz),
    speed = dist / Math.max(dt, 0.001);
  dt = Math.min(dt, 0.1);
  actor.walk = lerp(actor.walk, Math.min(speed / 1.8, 1), 1 - Math.exp(-dt * 8));
  actor.speed = lerp(actor.speed, speed, 1 - Math.exp(-dt * 6));
  if (speed > 0.15) actor.root.rotation.y = dampAngle(actor.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
  const w = actor.walk,
    idle = 1 - w,
    motion = reduced ? 0 : 1,
    legLen = d.thigh + d.shin,
    L = legLen * 1.4 * clamp(0.62 + (0.38 * actor.speed) / 1.8, 0.62, 1.3);
  actor.stride = (actor.stride + dist / L) % 1;
  const ph = actor.stride * TAU,
    mid = (ph - 0.29 * TAU) * 2;
  // Pelvis: lower and bob while walking, sway over the stance leg, gentle weight shift at rest.
  const ip = actor.idle.phase,
    shift = Math.sin(t * 0.42 + ip) * Math.sin(t * 0.17 + ip * 2),
    bounce = idx === 4 ? Math.max(0, Math.sin(t * 4.4)) ** 2 * smooth(0.4, 0.9, Math.sin(t * 0.5 + ip)) * 0.014 : 0,
    breath = Math.sin(t * 1.55 + ip);
  const yaw = -0.11 * m.swing * w * Math.cos(ph) * motion,
    roll = (0.045 * w * Math.cos(ph - 0.29 * TAU) + 0.03 * idle * shift) * motion,
    lat = (0.02 * w * Math.cos(ph - 0.29 * TAU) + 0.022 * idle * shift) * motion * d.W;
  actor.pelvis.position.set(
    lat,
    d.hipY - legLen * 0.045 * w + legLen * 0.018 * m.bounce * w * Math.cos(mid) * motion - bounce * idle * motion,
    0,
  );
  actor.pelvis.rotation.set(0, yaw, roll, "YXZ");
  actor.pelvis.updateMatrix();
  // Feet: stance slides back under the body, swing arcs forward with a toe-up landing.
  const SF = 0.6,
    A = Math.min(L * SF * 0.5, legLen * 0.44),
    hb = 0.074 * d.foot,
    tb = 0.19 * d.foot;
  actor.legs.forEach((leg, k) => {
    const p = (actor.stride + k * 0.5) % 1;
    let fz, fy, phi;
    if (p < SF) {
      const s = p / SF;
      fz = A * (1 - 2 * s);
      phi = s < 0.14 ? 0.32 * (1 - s / 0.14) ** 2 : s > 0.62 ? -0.6 * ((s - 0.62) / 0.38) ** 1.5 : 0;
      fy = 0;
    } else {
      const s = (p - SF) / (1 - SF);
      fz = -A + 2 * A * (0.5 - 0.5 * Math.cos(Math.PI * s));
      fy = legLen * 0.085 * Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 1.3;
      phi = lerp(-0.6, 0.32, smooth(0.05, 0.9, s));
    }
    const restZ = actor.feet[k] * motion,
      z = lerp(restZ, fz, w),
      ph2 = phi * w,
      lift = ph2 > 0 ? hb * Math.sin(ph2) + d.ankleH * (Math.cos(ph2) - 1) : -tb * Math.sin(ph2) + d.ankleH * (Math.cos(ph2) - 1);
    const y = d.ankleH + Math.max(0, lift) + fy * w,
      x = leg.s * (d.hipW + lerp(0.018, 0.0, w));
    solveLeg(actor, leg, _tgt.set(x, y, z), ph2, leg.s * 0.07);
  });
  if (actor.skirts)
    actor.skirts.forEach((b, k) => {
      const a = actor.legs[k].hip.rotation.x;
      b.rotation.set(clamp(a * (a < 0 ? 0.9 : 0.7), -0.55, 0.4), 0, 0);
    });
  // Spine counter-rotates so the shoulders swing against the hips; a light forward lean when walking.
  const lean = 0.07 * w * motion + 0.012 * breath * idle * motion;
  actor.spine.rotation.set(lean, -yaw * 1.7, -roll * 0.7);
  actor.trunkYaw = yaw * -0.7;
  actor.trunkPitch = lean;
  // Arms: relaxed swing with elbow bend, opposite to the legs.
  actor.arms.forEach((arm) => {
    const s = arm.s,
      f = -s * Math.cos(ph - 0.25),
      A2 = 0.38 * m.swing * w * (reduced ? 0.5 : 1);
    arm.sh.position.y = actor.dims.Ht - 0.025 + 0.0025 * breath * idle * motion;
    arm.sh.rotation.set(-A2 * f - 0.04, -s * 0.12, s * (0.1 + 0.025 * idle + 0.04 * w), "XYZ");
    arm.elbow.rotation.set(-(0.2 + w * (0.15 + 0.35 * Math.max(0, f))), 0, 0);
    arm.wrist.rotation.set(-0.06 - 0.12 * w * Math.max(0, f), 0, s * 0.05);
  });
  if (idx === 0) {
    // Clipboard held against the body on the left arm.
    const a = actor.arms[0];
    a.sh.rotation.set(-0.3 + 0.03 * w * Math.sin(ph) * motion, -0.62, 0.16);
    a.elbow.rotation.set(-1.62, 0, 0);
    a.wrist.rotation.set(0.1, 0, -0.15);
  }
  if (idx === 2) {
    // Ben hooks his thumbs under the backpack straps when standing, with the odd tug.
    const tug = Math.max(0, Math.sin(t * 0.9 + ip)) ** 8;
    actor.arms.forEach((a, k) => {
      const tg = (k ? tug : Math.max(0, Math.sin(t * 0.9 + ip + 2.2)) ** 8) * motion;
      const b = idle;
      a.sh.rotation.x = lerp(a.sh.rotation.x, -0.28 - 0.08 * tg, b);
      a.sh.rotation.y = lerp(a.sh.rotation.y, -a.s * 0.3, b);
      a.sh.rotation.z = lerp(a.sh.rotation.z, a.s * 0.12, b);
      a.elbow.rotation.x = lerp(a.elbow.rotation.x, -2.0 + 0.15 * tg, b);
      a.wrist.rotation.x = lerp(a.wrist.rotation.x, -0.25, b);
    });
  }
  // Blink every 2-6 s, sometimes twice.
  const bl = actor.blink;
  bl.next -= dt;
  if (bl.next <= 0) {
    bl.t = 0;
    bl.next = actor.rand() < 0.15 ? 0.32 : 2 + actor.rand() * 4;
  }
  let close = 0;
  if (bl.t >= 0) {
    bl.t += dt;
    close = bl.t < 0.06 ? bl.t / 0.06 : 1 - smooth(0.06, 0.18, bl.t);
    if (bl.t > 0.18) bl.t = -1;
  }
  actor.lids.rotation.x = lerp(actor.lidOpen + 0.05 * w, 1.42, close);
  if (actor.glints) actor.glints.visible = close < 0.5;
}

// Head turns (stabilised against the swaying trunk), glances, eye saccades, talking mouth, brows and
// hand gestures, applied after the walk cycle.
export function posePerson(actor, { lookYaw = 0, nod = 0, talking = false, t = 0, dt = 0.016 }) {
  dt = Math.min(Math.max(dt, 0), 0.1);
  const m = actor.mood,
    R = actor.rand,
    lk = actor.look,
    tk = actor.talk,
    w = actor.walk;
  tk.w = damp(tk.w, talking ? 1 : 0, 4, dt);
  // Idle glances: Aria looks around the most, Zoya the least.
  if (t >= lk.next || lk.next - t > 10) {
    lk.target = R() < 0.45 ? 0 : (R() * 2 - 1) * 0.55 * m.glance;
    lk.next = t + 1.5 + R() * 3;
  }
  lk.glance = damp(lk.glance, lk.target * (1 - 0.7 * tk.w), 3, dt);
  const target = clamp(lookYaw + lk.glance, -1.15, 1.15),
    prev = actor.headYaw;
  actor.headYaw = dampAngle(actor.headYaw, target, 1 - Math.exp(-dt * 5));
  actor.headYawVel = dt > 0 ? (actor.headYaw - prev) / dt : 0;
  const talkNod = tk.w * (Math.sin(t * 3.1) * 0.025 + Math.max(0, Math.sin(t * 1.3)) ** 6 * 0.06);
  actor.head.rotation.set(
    nod + talkNod - actor.trunkPitch * 0.9 - 0.03,
    actor.headYaw - actor.trunkYaw,
    m.tilt * (1 - tk.w) + Math.sin(t * 0.7) * 0.025 * tk.w,
  );
  // Eyes lead the head and make small saccades.
  if (t >= lk.saccNext || lk.saccNext - t > 10) {
    lk.sacc = (R() * 2 - 1) * 0.12;
    lk.saccNext = t + 0.4 + R() * 1.6;
  }
  const eyeYaw = clamp((target - actor.headYaw) * 0.8 + lk.sacc, -0.45, 0.45);
  for (const e of actor.eyes) e.rotation.set(0.04 - nod * 0.5, e.position.x > 0 ? 0.06 + eyeYaw : -0.06 + eyeYaw, 0);
  // Mouth: syllable-like opening with natural pauses.
  const syll =
    Math.max(0, Math.sin(t * 10.5) * 0.6 + Math.sin(t * 6.3 + 1) * 0.4) *
    (0.55 + 0.45 * Math.sin(t * 2.1)) *
    smooth(-0.6, -0.2, Math.sin(t * 0.9));
  tk.open = damp(tk.open, talking ? syll : 0, 18, dt);
  actor.mouth.visible = tk.open > 0.04;
  actor.mouth.scale.set(1 - 0.18 * tk.open, 0.15 + 0.85 * tk.open, 1);
  tk.brow = damp(tk.brow, talking ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + actor.idx)) ** 2 : 0, 6, dt);
  actor.brows.position.y = tk.brow * actor.dims.hr * 0.07;
  // Gestures: pick a new one every second or two and ease into it; the clipboard arm stays put.
  if (tk.w > 0.001) {
    if (t >= tk.next || tk.next - t > 10 || !tk.pose) {
      let g = Math.floor(R() * GESTURES.length);
      if (g === tk.g) g = (g + 1) % GESTURES.length;
      if (actor.idx === 0 && GESTURES[g].both) g = 0;
      tk.g = g;
      tk.next = t + (0.9 + R() * 1.4) / (actor.idx === 4 ? 1.3 : 1);
      tk.pose ||= { x: -0.2, y: 0.1, z: 0.12, e: -0.6, wx: 0, wy: 0 };
    }
    const G = GESTURES[tk.g],
      e = m.gest;
    for (const k of Object.keys(tk.pose)) tk.pose[k] = damp(tk.pose[k], G[k] * (k === "e" || k === "x" ? 0.6 + 0.4 * e : 1), 5, dt);
    tk.both = damp(tk.both, G.both && actor.idx !== 0 && actor.idx !== 2 ? 1 : 0, 5, dt);
    const beat = Math.sin(t * 6.8) * 0.07 * e;
    actor.arms.forEach((arm) => {
      const main = arm.s === m.hand,
        k = tk.w * (main ? 1 : tk.both) * (1 - 0.5 * w);
      if (k <= 0.001) return;
      const s = arm.s,
        p = tk.pose;
      arm.sh.rotation.x = lerp(arm.sh.rotation.x, p.x + beat * 0.5, k);
      arm.sh.rotation.y = lerp(arm.sh.rotation.y, -s * p.y, k);
      arm.sh.rotation.z = lerp(arm.sh.rotation.z, s * p.z, k);
      arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, p.e + beat, k);
      arm.wrist.rotation.x = lerp(arm.wrist.rotation.x, p.wx, k);
      arm.wrist.rotation.y = lerp(arm.wrist.rotation.y, -s * p.wy, k);
    });
  }
  // Hair follows through: Aria's ponytail swings, Zoya's long hair trails her head turns.
  const sp = actor.springs,
    sway = Math.sin(actor.stride * TAU) * w;
  const tz = clamp(-actor.headYawVel * 0.22, -0.7, 0.7) + sway * 0.25,
    tx = 0.12 + 0.3 * w + Math.cos(actor.stride * TAU * 2) * 0.08 * w;
  sp.vz += (60 * (tz - sp.z) - 6 * sp.vz) * dt;
  sp.vx += (60 * (tx - sp.x) - 6 * sp.vx) * dt;
  sp.z += sp.vz * dt;
  sp.x += sp.vx * dt;
  if (actor.ponytail) actor.ponytail.rotation.set(sp.x - actor.head.rotation.x, 0, sp.z);
  if (actor.hairBack)
    actor.hairBack.rotation.set(
      actor.head.rotation.x * 0.6 + (sp.x - 0.12) * 0.25,
      actor.head.rotation.y * 0.75,
      actor.head.rotation.z + sp.z * 0.15,
    );
}
