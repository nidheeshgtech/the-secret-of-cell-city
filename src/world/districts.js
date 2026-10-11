import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The nine organelle districts. Each building borrows the shape of its organelle so the city teaches the cell:
// a bilayer gate, a bean-shaped greenhouse, stacked Golgi sacs, a folded ER ribbon, a two-lobed ribosome,
// a cut-away mitochondrion, a water-bubble vacuole, a chomping lysosome dome and a double-membrane nucleus.

const INK = "#1E2440",
  PAPER = "#FBF5EA",
  AMBER = "#E59B2E",
  PINK = "#D9466F";
const TAU = Math.PI * 2;

// ---------- geometry helpers ----------
const rbox = (w, h, d, r = 0.08, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
const ball = (r, w = 18, h = 12) => new T.SphereGeometry(r, w, h);
const pill = (r, len, rad = 12, cap = 4) => new T.CapsuleGeometry(r, len, cap, rad);
const ring = (r, tube, rad = 8, seg = 32, arc = TAU) => new T.TorusGeometry(r, tube, rad, seg, arc);
const curve = (pts, closed = false) =>
  new T.CatmullRomCurve3(
    pts.map((p) => new T.Vector3(...p)),
    closed,
    "centripetal",
  );
const tube = (pts, r, seg = 64, rad = 8, closed = false) => new T.TubeGeometry(curve(pts, closed), seg, r, rad, closed);
// Pillowy disc: a lathe with rounded top and bottom edges (planters, grana coins, plinths).
function softDisc(r, h, b = Math.min(h / 2, r) * 0.9, seg = 40, steps = 5) {
  const pts = [new T.Vector2(0, 0)];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new T.Vector2(r - b + Math.cos(a) * b, b + Math.sin(a) * b));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new T.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
  }
  pts.push(new T.Vector2(0, h));
  return new T.LatheGeometry(pts, seg);
}
// Profile of a capsule (radius R, straight length L) for LatheGeometry; returns [radius, height] pairs.
function capsuleProfile(R, L, steps = 10) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push([Math.max(0.0001, R * Math.cos(a)), -L / 2 + R * Math.sin(a)]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push([Math.max(0.0001, R * Math.cos(a)), L / 2 + R * Math.sin(a)]);
  }
  return pts;
}
// Crescent (kidney) outline in plan for a Golgi sac; concave side faces +z. Extruded upwards with a soft bevel.
function crescent(Ro, Ri, phi, zc, depth, bevel) {
  const s = new T.Shape(),
    Rm = (Ro + Ri) / 2,
    w = (Ro - Ri) / 2;
  s.absarc(0, -zc, Ro, Math.PI / 2 + phi, Math.PI / 2 - phi, true);
  s.absarc(Rm * Math.sin(phi), -zc + Rm * Math.cos(phi), w, Math.PI / 2 - phi, -Math.PI / 2 - phi, true);
  s.absarc(0, -zc, Ri, Math.PI / 2 - phi, Math.PI / 2 + phi, false);
  s.absarc(-Rm * Math.sin(phi), -zc + Rm * Math.cos(phi), w, (3 * Math.PI) / 2 + phi, Math.PI / 2 + phi, true);
  const g = new T.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 20,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function buildDistricts(kit, { cityLayer, locations, stops, sign, obstacles }) {
  let seed = 913;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  // ---------- materials (vertex-coloured so each district merges into a handful of draw calls) ----------
  const std = (o) => new T.MeshStandardMaterial({ vertexColors: true, ...o });
  const M = {
    clay: std({ roughness: 0.74 }),
    gloss: new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, clearcoat: 0.75, clearcoatRoughness: 0.25 }),
    metal: std({ roughness: 0.34, metalness: 0.55 }),
    glow: std({ roughness: 0.45, emissive: new T.Color("#FFB347"), emissiveIntensity: 0.65 }),
    glass: new T.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      roughness: 0.05,
      clearcoat: 1,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  };
  M.clayDS = M.clay.clone();
  M.clayDS.side = T.DoubleSide;
  M.glossDS = M.gloss.clone();
  M.glossDS.side = T.DoubleSide;
  const faceMat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.6 });

  // Collects transformed, vertex-painted pieces per material and merges them into one mesh each.
  const _m = new T.Matrix4(),
    _q = new T.Quaternion(),
    _e = new T.Euler(),
    _s = new T.Vector3(),
    _p = new T.Vector3(),
    _c0 = new T.Color(),
    _c1 = new T.Color();
  function builder() {
    const bins = new Map();
    function add(geo, color, x = 0, y = 0, z = 0, o = {}) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      const r = o.r || [0, 0, 0],
        s = o.s ?? 1;
      _e.set(r[0], r[1], r[2], o.order || "XYZ");
      _q.setFromEuler(_e);
      if (typeof s === "number") _s.setScalar(s);
      else _s.set(s[0], s[1], s[2]);
      g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s));
      // Soft vertical gradient: a touch darker at the foot of every piece, optional lighter top colour.
      const pos = g.attributes.position,
        col = new Float32Array(pos.count * 3);
      g.computeBoundingBox();
      const lo = g.boundingBox.min.y,
        span = Math.max(1e-4, g.boundingBox.max.y - lo),
        shade = o.shade ?? 0.16;
      _c1.set(o.top || color);
      _c0.set(color).multiplyScalar(1 - shade);
      for (let i = 0; i < pos.count; i++) {
        const f = (pos.getY(i) - lo) / span,
          k = f * f * (3 - 2 * f);
        col[i * 3] = _c0.r + (_c1.r - _c0.r) * k;
        col[i * 3 + 1] = _c0.g + (_c1.g - _c0.g) * k;
        col[i * 3 + 2] = _c0.b + (_c1.b - _c0.b) * k;
      }
      g.setAttribute("color", new T.BufferAttribute(col, 3));
      const mat = typeof o.m === "object" ? o.m : M[o.m || "clay"];
      if (!bins.has(mat)) bins.set(mat, []);
      bins.get(mat).push(g);
    }
    function flush(parent) {
      const out = [];
      for (const [mat, list] of bins) {
        const mesh = new T.Mesh(mergeGeometries(list), mat);
        list.forEach((g) => g.dispose());
        mesh.castShadow = !mat.transparent;
        mesh.receiveShadow = true;
        if (mat.transparent) mesh.renderOrder = 2;
        parent.add(mesh);
        out.push(mesh);
      }
      bins.clear();
      return out;
    }
    return { add, flush };
  }

  function district(i) {
    const g = new T.Group();
    g.position.set(locations[i].x, 0.36, locations[i].z);
    cityLayer.add(g);
    return g;
  }
  // Name board from scene.js with a glossy frame in the district colour and slim posts.
  function signboard(g, b, text, x, y, z, width, frame, posts = []) {
    const h = width / 6;
    sign(text, x, y, z, width, INK, g);
    b.add(rbox(width + 0.2, h + 0.2, 0.08, 0.06), frame, x, y, z - 0.07, { m: "gloss", shade: 0.12 });
    for (const [px, y0, pz = z - 0.1] of posts) {
      const len = y - h / 2 - y0 + 0.12;
      b.add(new T.CylinderGeometry(0.05, 0.065, len, 10), "#3A3F5C", px, y0 + len / 2, pz, { m: "metal" });
    }
  }
  // Friendly resident: glossy eyes (white, iris, sparkle), brows, blush cheeks, a smile and a talking mouth.
  function face(parent, x, y, z, s = 1, tilt = 0, cheek = "#F28BA0") {
    const f = new T.Group();
    f.position.set(x, y, z);
    f.rotation.x = -tilt;
    f.scale.setScalar(s);
    parent.add(f);
    const eyes = new T.Group();
    eyes.position.y = 0.07;
    f.add(eyes);
    const eb = builder(),
      sb = builder(),
      mb = builder();
    for (const side of [-1, 1]) {
      eb.add(ball(0.12, 18, 12), "#FFFFFF", side * 0.17, 0, 0, { s: [1, 1.2, 0.55], shade: 0.08, m: faceMat });
      eb.add(ball(0.074, 14, 10), INK, side * 0.17 + side * 0.008, -0.018, 0.045, { s: [1, 1.14, 0.62], shade: 0, m: faceMat });
      eb.add(ball(0.026, 8, 6), "#FFFFFF", side * 0.17 + 0.032, 0.03, 0.09, { shade: 0, m: faceMat });
      sb.add(pill(0.022, 0.1, 6, 2), "#2B2A44", side * 0.17, 0.27, 0.02, { r: [0, 0, side * (Math.PI / 2 - 0.22)], shade: 0, m: faceMat });
      sb.add(ball(0.07, 12, 8), cheek, side * 0.31, -0.08, 0.0, { s: [1.25, 0.72, 0.3], shade: 0, m: faceMat });
    }
    sb.add(ring(0.07, 0.017, 6, 18, Math.PI), "#3B1E2B", 0, -0.09, 0.035, { r: [0, 0, Math.PI], shade: 0, m: faceMat });
    eb.flush(eyes);
    sb.flush(f);
    const mouth = new T.Group();
    mouth.position.set(0, -0.14, 0.04);
    f.add(mouth);
    mb.add(ball(0.095, 16, 10), "#3B1E2B", 0, 0, 0, { s: [1.25, 1, 0.38], shade: 0, m: faceMat });
    mb.add(ball(0.05, 10, 8), "#E86A86", 0, -0.045, 0.02, { s: [1.3, 0.6, 0.4], shade: 0, m: faceMat });
    mb.flush(mouth);
    mouth.visible = false;
    return { group: f, eyes, mouth };
  }
  const faces = [];
  const dummy = new T.Object3D();
  function swarm(geo, material, n, colors, parent = cityLayer) {
    const m = new T.InstancedMesh(geo, material, n);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    if (colors) for (let i = 0; i < n; i++) m.setColorAt(i, new T.Color(colors[i % colors.length]));
    parent.add(m);
    return m;
  }
  function put(m, i, x, y, z, s = 1, rx = 0, ry = 0, rz = 0) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    if (typeof s === "number") dummy.scale.setScalar(s);
    else dummy.scale.set(s[0], s[1], s[2]);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  }

  // ================= 0 · Cell membrane gate =================
  // A phospholipid-bilayer arch on two channel-protein pillars, with a folding transport-protein door.
  let g = district(0),
    b = builder();
  const headGeo = ball(0.15, 10, 7),
    tailGeo = pill(0.028, 0.14, 5, 2);
  // One bilayer "brick": glossy head plus two pale fatty-acid tails pointing towards the membrane core.
  function lipid(x, y, z, nx, ny, nz = 0, color = PINK) {
    b.add(headGeo, color, x, y, z, { m: "gloss", top: "#F0809F", shade: 0.22 });
    const e = new T.Euler().setFromQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(nx, ny, nz)),
      "XYZ",
    );
    for (const d of [-0.05, 0.05]) {
      const ox = nz ? d : -ny * d,
        oy = nz ? 0 : nx * d;
      b.add(tailGeo, "#F6E3C4", x - nx * 0.22 + ox, y - ny * 0.22 + oy, z - nz * 0.22, { r: [e.x, e.y, e.z], shade: 0.05 });
    }
  }
  for (const sx of [-3, 3]) {
    b.add(rbox(1.08, 0.28, 1.5, 0.12), "#E9D9C6", sx, 0.14, 0, { top: "#F6EBDD" });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      b.add(pill(0.19, 2.75, 14), k % 2 ? "#6B63C9" : "#5A52B5", sx + Math.cos(a) * 0.3, 1.85, Math.sin(a) * 0.3, {
        m: "gloss",
        top: "#9C95E8",
      });
    }
    for (const y of [0.62, 1.85, 3.08]) b.add(ring(0.5, 0.07, 10, 36), AMBER, sx, y, 0, { r: [Math.PI / 2, 0, 0], m: "gloss", shade: 0.1 });
    b.add(softDisc(0.47, 0.16, 0.07, 32), "#F2A0B8", sx, 3.36, 0, { m: "gloss" });
    b.add(new T.CylinderGeometry(0.13, 0.13, 0.05, 20), "#4A1E35", sx, 3.53, 0, { shade: 0 });
  }
  // Arch: two leaflets of heads around an elliptical core, three heads deep.
  const archAt = (th) => [3 * Math.cos(th), 3.35 + 2.05 * Math.sin(th)];
  const archN = (th) => {
    const nx = Math.cos(th) / 3,
      ny = Math.sin(th) / 2.05,
      l = Math.hypot(nx, ny);
    return [nx / l, ny / l];
  };
  for (const off of [0.3, -0.3]) {
    const pts = [];
    for (let k = 0; k <= 240; k++) {
      const th = 0.06 + (k / 240) * (Math.PI - 0.12),
        [px, py] = archAt(th),
        [nx, ny] = archN(th);
      pts.push([px + nx * off, py + ny * off, nx, ny]);
    }
    const len = [0];
    for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const total = len.at(-1),
      n = Math.floor(total / 0.3);
    [-0.28, 0, 0.28].forEach((z, row) => {
      for (let h = 0; h < n; h++) {
        const target = ((h + (row === 1 ? 0.5 : 0) + 0.25) / n) * total;
        let k = len.findIndex((v) => v >= target);
        if (k < 0) k = pts.length - 1;
        const [x, y, nx, ny] = pts[k],
          s = Math.sign(off);
        lipid(x, y, z, nx * s, ny * s, 0, (h + row) % 7 === 0 ? "#E46A8D" : PINK);
      }
    });
  }
  // Short bilayer wings so the gate reads as a doorway in a membrane wall.
  for (const side of [-1, 1]) {
    b.add(rbox(1.7, 0.2, 0.8, 0.08), "#E9D9C6", side * 4.4, 0.1, 0);
    for (let c = 0; c < 6; c++) {
      const rows = c < 4 ? 3 : 2;
      for (let r = 0; r < rows; r++) {
        const x = side * (3.75 + c * 0.27),
          y = 0.38 + r * 0.3;
        lipid(x, y, 0.27, 0, 0, 1);
        lipid(x, y, -0.27, 0, 0, -1);
      }
    }
  }
  // Receptor medallion at the keystone carries the gatekeeper's face.
  b.add(ball(0.64, 32, 22), "#E0557F", 0, 5.72, 0.12, { s: [1, 1, 0.6], m: "gloss", top: "#F27C9C" });
  b.add(ring(0.64, 0.06, 10, 48), AMBER, 0, 5.72, 0.12, { m: "gloss", shade: 0.1 });
  signboard(g, b, "CELL CITY • WELCOME", 0, 4.25, 0.52, 4, PINK);
  for (const x of [-1.5, 1.5]) b.add(new T.CylinderGeometry(0.025, 0.025, 0.42, 6), "#3A3F5C", x, 4.75, 0.44, { m: "metal" });
  b.add(rbox(5.0, 0.06, 0.24, 0.03), "#D8C7B0", 0, 0.03, 0);
  b.flush(g);
  // Transport-protein door: concertina of glossy slats that fold into the pillars once the class is let in.
  const slats = swarm(pill(0.135, 2.0, 12), new T.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 0.7 }), 16, null, g);
  for (let i = 0; i < 16; i++) slats.setColorAt(i, new T.Color(i % 8 === 7 ? AMBER : i % 2 ? "#F4B9CB" : PINK));
  faces[0] = face(g, 0, 5.74, 0.52, 1.35);

  // ================= 1 · Chloroplast garden =================
  // A bean-shaped glass greenhouse holding grana (stacks of thylakoid coins) linked by lamellae.
  g = district(1);
  b = builder();
  b.add(softDisc(1, 0.32, 0.14, 56), "#E2CDA8", 0, 0, 0, { s: [3.15, 1, 2.3], top: "#F1E2C6" });
  b.add(softDisc(1, 0.06, 0.03, 56), "#6FAE4E", 0, 0.29, 0, { s: [2.95, 1, 2.12], top: "#8FC765", shade: 0 });
  b.add(ball(1, 56, 36), "#D7F0DE", 0, 1.15, 0, { s: [2.8, 1.5, 1.95], m: "glass", shade: 0 });
  // Green glazing bars along the bean and around its base.
  for (const x of [-2.15, -1.08, 0, 1.08, 2.15]) {
    const k = Math.sqrt(1 - (x / 2.8) ** 2),
      ry = 1.5 * k + 0.02,
      rz = 1.95 * k + 0.02,
      a0 = Math.asin(Math.max(-1, -0.83 / ry)),
      pts = [];
    for (let j = 0; j <= 24; j++) {
      const a = a0 + (j / 24) * (Math.PI - 2 * a0);
      pts.push([x, 1.15 + ry * Math.sin(a), rz * Math.cos(a)]);
    }
    b.add(tube(pts, 0.04, 48, 6), "#2E8B57", 0, 0, 0, { m: "gloss", shade: 0.05 });
  }
  {
    const spine = [],
      base = [];
    for (let j = 0; j <= 30; j++) {
      const x = -2.6 + (j / 30) * 5.2;
      spine.push([x, 1.15 + 1.52 * Math.sqrt(Math.max(0, 1 - (x / 2.8) ** 2)), 0]);
    }
    for (let j = 0; j < 48; j++) base.push([2.44 * Math.cos((j / 48) * TAU), 0.42, 1.7 * Math.sin((j / 48) * TAU)]);
    b.add(tube(spine, 0.045, 60, 6), "#2E8B57", 0, 0, 0, { m: "gloss", shade: 0.05 });
    b.add(tube(base, 0.06, 96, 8, true), "#246F45", 0, 0, 0, { m: "gloss", shade: 0.05 });
  }
  const granaSpots = [
    [-1.75, -0.2],
    [-0.9, 0.38],
    [0, -0.28],
    [0.9, 0.38],
    [1.75, -0.2],
  ];
  const coin = softDisc(0.3, 0.09, 0.04, 18, 2);
  granaSpots.forEach(([x, z], s) => {
    const top = 1.15 + 1.5 * Math.sqrt(Math.max(0, 1 - (x / 2.8) ** 2 - (z / 1.95) ** 2)) - 0.25;
    for (let y = 0.36, k = 0; y < top; y += 0.13, k++) b.add(coin, k % 2 ? "#3FA66A" : "#2E8B57", x, y, z, { top: "#62C08A", m: "gloss" });
    if (s < granaSpots.length - 1) {
      const [x2, z2] = granaSpots[s + 1];
      for (const y of [0.66 + (s % 2) * 0.13, 1.05]) {
        const len = Math.hypot(x2 - x, z2 - z);
        b.add(rbox(len, 0.035, 0.13, 0.015), "#93D3A4", (x + x2) / 2, y, (z + z2) / 2, {
          r: [0, -Math.atan2(z2 - z, x2 - x), 0],
          shade: 0,
        });
      }
    }
  });
  // Entrance porch and door.
  b.add(pill(0.62, 1.0, 28, 8), "#2E8B57", 0, 1.44, 1.85, { s: [1, 1, 0.6], m: "gloss", top: "#5BBF80" });
  b.add(ball(0.22, 16, 10), "#7FBF4F", 0.12, 2.6, 1.85, { s: [1, 0.35, 0.6], r: [0, 0, -0.5], m: "gloss" });
  b.add(rbox(0.62, 0.98, 0.12, 0.22), INK, 0, 0.82, 2.2, { shade: 0.05 });
  b.add(ball(0.05, 8, 6), AMBER, 0.18, 0.8, 2.27, { m: "gloss" });
  // Planters at the four corners and a ring of shrubs and flowers on the plinth.
  const leafy = ["#3E8E4F", "#5EA544", "#7FBF4F", "#2F7A45"];
  for (const [px, pz] of [
    [-2.78, 1.95],
    [2.78, 1.95],
    [-2.78, -1.95],
    [2.78, -1.95],
  ]) {
    b.add(softDisc(0.42, 0.36, 0.1, 28), "#C9774A", px, 0, pz, { top: "#E09469" });
    b.add(softDisc(0.36, 0.04, 0.02, 24), "#6B4A33", px, 0.34, pz, { shade: 0 });
    for (let k = 0; k < 3; k++)
      b.add(ball(0.2 - k * 0.03, 14, 10), leafy[k], px + (k - 1) * 0.15, 0.52 + k * 0.08, pz + (k % 2) * 0.08, { top: "#A6D36A" });
    b.add(ball(0.06, 8, 6), k2c(px), px + 0.18, 0.72, pz + 0.12, { m: "gloss", shade: 0 });
  }
  function k2c(v) {
    return v > 0 ? "#F2C94C" : "#F28BA0";
  }
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU + 0.17;
    if (Math.abs(Math.cos(a)) < 0.3 && Math.sin(a) > 0) continue;
    const x = 2.95 * Math.cos(a),
      z = 2.15 * Math.sin(a),
      r = 0.15 + rand() * 0.07;
    b.add(ball(r, 12, 8), leafy[k % 4], x, 0.32 + r * 0.8, z, { top: "#A6D36A" });
    if (k % 3 === 0)
      b.add(ball(0.055, 8, 6), ["#F28BA0", "#F2C94C", "#FFFFFF"][k % 3 === 0 ? (k / 3) % 3 : 0], x, 0.32 + r * 1.75, z, {
        m: "gloss",
        shade: 0,
      });
  }
  signboard(g, b, "PHOTOSYNTHESIS GARDEN", 0, 3.35, 2.1, 4.2, "#2E8B57", [
    [-2.25, 0],
    [2.25, 0],
  ]);
  b.flush(g);
  faces[1] = face(g, 0, 1.86, 2.25, 1.05);
  const solar = new T.Mesh(
    new T.ConeGeometry(2.6, 6.6, 40, 1, true),
    new T.MeshBasicMaterial({ color: "#FFF0A1", transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide }),
  );
  solar.position.set(locations[1].x, 0.36 + 5.5, locations[1].z);
  solar.scale.z = 0.72;
  solar.renderOrder = 3;
  cityLayer.add(solar);

  // ================= 2 · Golgi post office =================
  // Five curved, flattened sacs (cisternae) stacked cis → trans, vesicles budding off their rims.
  g = district(2);
  b = builder();
  const zc = 1.9;
  b.add(softDisc(1, 0.12, 0.06, 48), "#EAD7C3", 0, 0, -0.1, { s: [2.75, 1, 2.0] });
  for (let i = 0; i < 5; i++) {
    const Ro = 3.45 - 0.12 * i,
      Ri = 2.2 + 0.06 * i,
      phi = 0.7 - 0.04 * i,
      yb = 0.18 + i * 0.62,
      f = i / 4,
      c = new T.Color("#C9622B").lerp(new T.Color("#F4B183"), f);
    b.add(crescent(Ro, Ri, phi, zc, 0.14, 0.11), "#" + c.getHexString(), 0, yb + 0.11, 0, {
      m: "gloss",
      top: "#" + c.clone().lerp(new T.Color("#FFE2C6"), 0.35).getHexString(),
    });
    if (i < 4) {
      b.add(crescent(Ro - 0.3, Ri + 0.3, phi - 0.04, zc, 0.3, 0.03), "#F8E6D0", 0, yb + 0.28, 0, { shade: 0.08 });
      for (let th = -phi + 0.2; th <= phi - 0.18; th += 0.2) {
        const R = Ri + 0.3 - 0.04;
        b.add(rbox(0.16, 0.13, 0.05, 0.03), "#FFF1C9", R * Math.sin(th), yb + 0.44, zc - R * Math.cos(th), {
          r: [0, -th, 0],
          m: "glow",
          shade: 0,
        });
      }
    }
    // Vesicles pinching off both rims of the sac.
    const Rm = (Ro + Ri) / 2,
      w = (Ro - Ri) / 2;
    for (const sd of [-1, 1]) {
      const ex = sd * Rm * Math.sin(phi),
        ez = zc - Rm * Math.cos(phi),
        tx = sd * Math.cos(phi),
        tz = Math.sin(phi);
      b.add(ball(0.21 - i * 0.015, 16, 12), "#F29A62", ex + tx * (w + 0.12), yb + 0.16, ez + tz * (w + 0.12), {
        m: "gloss",
        top: "#FFC79E",
      });
      if (i % 2 === 0) b.add(ball(0.12, 12, 8), "#F7B98A", ex + tx * (w + 0.4), yb + 0.38, ez + tz * (w + 0.36), { m: "gloss" });
    }
  }
  for (const [x, z, r] of [
    [-0.7, -0.75, 0.2],
    [0.35, -0.95, 0.24],
    [1.0, -0.6, 0.15],
  ])
    b.add(ball(r, 16, 12), "#F7B98A", x, 3.02 + r * 0.7, z, { m: "gloss", top: "#FFD9B8" });
  // Medallion for the postmaster's face, and a little post box.
  b.add(ball(0.48, 32, 20), PAPER, 0, 1.75, -0.1, { s: [1, 1, 0.42], top: "#FFFFFF", shade: 0.1 });
  b.add(ring(0.48, 0.05, 8, 40), "#E07A3F", 0, 1.75, -0.1, { m: "gloss", shade: 0.05 });
  b.add(pill(0.17, 0.42, 14), "#D9466F", -1.95, 0.5, 1.15, { m: "gloss" });
  b.add(rbox(0.18, 0.04, 0.06, 0.015), INK, -1.95, 0.75, 1.32, { shade: 0 });
  // Curved conveyor across the courtyard.
  const belt = [];
  for (let k = 0; k <= 30; k++) {
    const th = -1.0 + (k / 30) * 2.0;
    belt.push([1.45 * Math.sin(th), 0, zc - 1.45 * Math.cos(th)]);
  }
  b.add(tube(belt, 0.14, 80, 10), "#4A5170", 0, 0.55, 0, { s: [1, 0.42, 1], top: "#5E6790" });
  for (const th of [-0.9, -0.3, 0.3, 0.9])
    b.add(new T.CylinderGeometry(0.04, 0.06, 0.5, 8), "#3A3F5C", 1.45 * Math.sin(th), 0.25, zc - 1.45 * Math.cos(th), { m: "metal" });
  b.add(ring(0.32, 0.06, 8, 28, Math.PI), AMBER, 1.45 * Math.sin(1.0), 0.6, zc - 1.45 * Math.cos(1.0), {
    r: [0, -1.0 + Math.PI / 2, 0],
    m: "gloss",
  });
  signboard(g, b, "CELL CITY POST OFFICE", 0, 3.62, -0.38, 4, "#E07A3F", [
    [-1.3, 2.95, -0.47],
    [1.3, 2.95, -0.47],
  ]);
  b.flush(g);
  faces[2] = face(g, 0, 1.75, 0.12, 1.05);
  const vesicles = swarm(
    ball(0.17, 16, 12),
    new T.MeshPhysicalMaterial({ transparent: true, opacity: 0.5, roughness: 0.08, clearcoat: 1, depthWrite: false }),
    6,
    ["#F7A46E", "#F4C08F", "#EF8D5A"],
  );
  vesicles.renderOrder = 2;
  const parcels = swarm(rbox(0.15, 0.13, 0.15, 0.025, 2), new T.MeshStandardMaterial({ roughness: 0.7 }), 6, ["#C98A4B", "#B97A3E"]);

  // ================= 3 · Endoplasmic reticulum =================
  // One continuous membrane ribbon folded back on itself three times; the rough side studded with ribosomes.
  g = district(3);
  b = builder();
  const erPts = [
    [-2.36, 0.06, 0],
    [-2.12, 0.28, 0],
  ];
  const env = (x) => Math.sin((Math.PI * (x + 1.75)) / 3.5);
  const wave = (x, k) => 0.13 * env(x) * Math.sin(x * 2.4 + k * 1.3);
  for (let x = -1.75; x <= 1.751; x += 0.25) erPts.push([x, 0.45 + wave(x, 0), 0]);
  for (let a = -Math.PI / 2 + 0.4; a < Math.PI / 2 - 0.2; a += 0.4) erPts.push([1.75 + 0.5 * Math.cos(a), 0.95 + 0.5 * Math.sin(a), 0]);
  for (let x = 1.75; x >= -1.751; x -= 0.25) erPts.push([x, 1.45 + wave(x, 1), 0]);
  for (let a = -Math.PI / 2 + 0.4; a < Math.PI / 2 - 0.2; a += 0.4) erPts.push([-1.75 - 0.5 * Math.cos(a), 1.95 + 0.5 * Math.sin(a), 0]);
  for (let x = -1.75; x <= 1.751; x += 0.25) erPts.push([x, 2.45 + wave(x, 2), 0]);
  erPts.push([2.0, 2.5, 0]);
  const erCurve = curve(erPts);
  b.add(new T.TubeGeometry(erCurve, 360, 0.22, 14), "#D9A21B", 0, 0, 0, { s: [1, 1, 3.6], m: "gloss", top: "#F2C64E", shade: 0.12 });
  for (const p of [erPts[0], erPts.at(-1)]) b.add(ball(0.22, 16, 12), "#E2AE2C", p[0], p[1], 0, { s: [1, 1, 3.6], m: "gloss" });
  for (let k = 0; k < 150; k++) {
    const u = 0.04 + rand() * 0.93,
      P = erCurve.getPointAt(u),
      Tg = erCurve.getTangentAt(u),
      side = rand() < 0.5 ? -1 : 1,
      a = (rand() - 0.5) * 2.4;
    b.add(
      ball(0.065, 8, 6),
      k % 5 ? "#8C5A3C" : "#A8704A",
      P.x - Tg.y * side * 0.235 * Math.cos(a),
      P.y + Tg.x * side * 0.235 * Math.cos(a),
      0.83 * Math.sin(a),
      {
        m: "gloss",
        shade: 0.1,
      },
    );
  }
  // Smooth ER: slim tubules looping off the top fold.
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const a = (j / 8) * TAU;
      pts.push([-2.0 + 0.27 * Math.cos(a), 0.95 + 0.2 * Math.sin(a) + k * 0.06, -0.5 + k * 0.45 + 0.1 * Math.sin(a * 2)]);
    }
    b.add(tube(pts, 0.05, 40, 6, true), "#E9C65C", 0, 0, 0, { m: "gloss", shade: 0.05 });
  }
  for (const x of [-1.2, 0.1, 1.3]) b.add(softDisc(0.22, 0.26, 0.08, 20), "#B7861A", x, 0, 0);
  b.add(ball(0.42, 30, 20), "#FFF3CF", 0, 1.95, 0.84, { s: [1, 1, 0.35], shade: 0.08 });
  b.add(ring(0.42, 0.05, 8, 40), "#B7861A", 0, 1.95, 0.84, { m: "gloss", shade: 0.05 });
  signboard(g, b, "ER TRANSPORT NETWORK", 0, 3.3, 0.35, 4.4, "#D9A21B", [
    [-1.7, 2.6, 0.25],
    [1.7, 2.6, 0.25],
  ]);
  b.flush(g);
  faces[3] = face(g, 0, 1.95, 1.0, 0.95);

  // ================= 4 · Ribosome workshop =================
  // Large and small subunits as two plump lobed buildings, mRNA tape threaded between them.
  g = district(4);
  b = builder();
  b.add(softDisc(1, 0.18, 0.08, 56), "#E8D6C0", 0, 0, -0.05, { s: [2.3, 1, 2.35] });
  b.add(ball(1, 48, 32), "#B5784A", 0, 1.3, -0.6, { s: [2.05, 1.3, 1.55], top: "#D9A06B" });
  b.add(ball(1, 32, 22), "#AD7146", -1.3, 0.95, -0.85, { s: [1.0, 0.85, 1.0], top: "#CF965F" });
  b.add(ball(1, 32, 22), "#AD7146", 1.3, 0.92, -0.8, { s: [0.98, 0.82, 1.0], top: "#CF965F" });
  b.add(rbox(4.0, 0.16, 2.9, 0.08), "#8C5A3C", 0, 0.24, -0.6, { top: "#A8704A" });
  b.add(ring(1, 0.05, 8, 64), "#8C5A3C", 0, 1.7, -0.6, { r: [Math.PI / 2, 0, 0], s: [1.98, 1.5, 1] });
  b.add(ball(1, 40, 28), "#F2D6AE", 0.15, 2.92, 0.15, { s: [1.5, 0.74, 0.98], m: "gloss", top: "#FFF0D6" });
  b.add(ring(1, 0.055, 8, 64), "#8C5A3C", 0.15, 2.92, 0.15, { r: [Math.PI / 2, 0, 0], s: [1.52, 1.0, 1], m: "gloss" });
  b.add(ball(0.09, 10, 8), "#8C5A3C", 0.15, 3.66, 0.15, { m: "gloss" });
  // mRNA tape with coloured codon chips.
  const tape = [];
  for (const [x, y, z] of [
    [-2.2, 0.42, 0.95],
    [-1.95, 1.2, 0.62],
    [-1.3, 1.95, 0.56],
    [-0.5, 2.13, 0.8],
    [0.4, 2.13, 0.8],
    [1.3, 1.95, 0.56],
    [1.95, 1.2, 0.62],
    [2.2, 0.42, 0.95],
  ])
    tape.push([x, y, z]);
  const tapeCurve = curve(tape);
  b.add(new T.TubeGeometry(tapeCurve, 80, 0.07, 8), "#F4E3B5", 0, 0, 0, { s: [1, 1.6, 1], shade: 0.05 });
  for (let k = 0; k < 18; k++) {
    const p = tapeCurve.getPointAt(0.03 + (k / 18) * 0.94);
    b.add(rbox(0.12, 0.09, 0.05, 0.02), ["#E59B2E", "#D9466F", "#2E8B57", "#3A8FC9"][k % 4], p.x, p.y, p.z + 0.1, { m: "gloss", shade: 0 });
  }
  // Door and porthole windows on the large subunit.
  b.add(rbox(0.62, 1.0, 0.3, 0.22), INK, 0, 0.82, 0.78, { r: [-0.25, 0, 0], shade: 0.05 });
  for (const [x, y] of [
    [-1.1, 1.55],
    [1.1, 1.55],
    [-0.6, 2.0],
    [0.65, 1.95],
  ]) {
    const zz = -0.6 + 1.55 * Math.sqrt(Math.max(0, 1 - (x / 1.95) ** 2 - ((y - 1.35) / 1.35) ** 2));
    b.add(ball(0.15, 16, 10), "#FFF1C9", x, y, zz, { s: [1, 1, 0.4], m: "glow", shade: 0 });
    b.add(ring(0.16, 0.04, 8, 24), PAPER, x, y, zz + 0.02, { r: [0, Math.atan2(x, 2.5), 0] });
  }
  // Assembly conveyor, amino-acid hopper and the basket of finished protein.
  b.add(rbox(4.2, 0.14, 0.5, 0.06), "#4A5170", 0, 0.62, 1.8, { top: "#5E6790" });
  b.add(rbox(4.2, 0.06, 0.06, 0.02), PAPER, 0, 0.71, 2.03);
  b.add(rbox(4.2, 0.06, 0.06, 0.02), PAPER, 0, 0.71, 1.57);
  for (const x of [-1.8, -0.6, 0.6, 1.8]) b.add(new T.CylinderGeometry(0.05, 0.07, 0.56, 8), "#3A3F5C", x, 0.28, 1.8, { m: "metal" });
  b.add(softDisc(0.3, 0.32, 0.08, 24), "#E9D1A4", -2.0, 0.7, 1.8, { top: "#F6E5C4" });
  b.add(softDisc(0.3, 0.3, 0.08, 24), "#C9774A", 2.0, 0.66, 1.8, { top: "#E09469" });
  const amino = ["#D9466F", "#2E8B57", "#4B4FA8", "#E59B2E", "#3A8FC9"];
  for (let k = 0; k < 9; k++) {
    b.add(ball(0.08, 10, 8), amino[k % 5], -2.0 + Math.cos(k * 2.1) * 0.15, 1.04 + (k % 3) * 0.03, 1.8 + Math.sin(k * 2.1) * 0.15, {
      m: "gloss",
      shade: 0,
    });
    b.add(
      ball(0.09, 10, 8),
      amino[(k + 2) % 5],
      2.0 + Math.cos(k * 1.7) * 0.14,
      1.0 + Math.sin(k * 0.9) * 0.1,
      1.8 + Math.sin(k * 1.7) * 0.14,
      { m: "gloss", shade: 0 },
    );
  }
  signboard(g, b, "RIBOSOME PROTEIN FARM", 0, 4.05, 1.3, 4.4, "#8C5A3C", [
    [-2.25, 0, 1.25],
    [2.25, 0, 1.25],
  ]);
  b.flush(g);
  faces[4] = face(g, 0.1, 3.0, 1.08, 1.0);
  const beads = swarm(ball(0.12, 14, 10), new T.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.8 }), 11, amino);

  // ================= 5 · Mitochondria power station =================
  // A capsule hall with a glazed cut-away showing the folded inner membrane (cristae) and glowing ATP.
  g = district(5);
  b = builder();
  const powerMat = std({ roughness: 0.5, emissive: new T.Color("#FF8A4C"), emissiveIntensity: 0.5 });
  const hall = (R, phiStart, phiLen, seg = 56) => {
    const geo = new T.LatheGeometry(
      capsuleProfile(R, 1.9).map(([r, h]) => new T.Vector2(r, h)),
      seg,
      phiStart,
      phiLen,
    );
    geo.rotateZ(-Math.PI / 2);
    return geo;
  };
  b.add(rbox(5.3, 0.2, 3.6, 0.1), "#E9D9C6", 0, 0.1, 0, { top: "#F6EBDD" });
  b.add(hall(1.7, -0.45, TAU - 0.8), "#C8492F", 0, 1.55, 0, { m: "glossDS", top: "#E8785A" });
  b.add(hall(1.5, -0.45, TAU - 0.8), "#F7B79B", 0, 1.55, 0, { m: "clayDS", top: "#FBD3BE" });
  b.add(hall(1.62, -1.25, 0.8, 24), "#FFE3D6", 0, 1.55, 0, { m: "glass", shade: 0 });
  for (const ph of [-0.45, -1.25]) {
    const pts = capsuleProfile(1.6, 1.9, 8).map(([r, h]) => [h, 1.55 - r * Math.sin(ph), r * Math.cos(ph)]);
    b.add(tube(pts, 0.11, 60, 8), "#F3C7A0", 0, 0, 0, { m: "gloss", shade: 0.08 });
  }
  for (let k = 0; k < 8; k++) {
    const x = -1.75 + k * 0.5,
      rx = Math.abs(x) > 0.95 ? Math.sqrt(1.5 ** 2 - (Math.abs(x) - 0.95) ** 2) : 1.5,
      sc = rx / 1.5;
    b.add(rbox(0.13, rx * 1.1, rx * 0.9, 0.06), "#F6A06E", x, 1.55 + (k % 2 ? 0.25 : -0.25) * sc, -0.35 * sc, {
      m: powerMat,
      top: "#FFD08A",
    });
  }
  // Chimneys with amber collars, lamps and a porch.
  for (const sx of [-1, 1]) {
    const chim = [
      [0.3, 0],
      [0.28, 1.4],
      [0.24, 1.8],
      [0.33, 1.86],
      [0.33, 2.0],
      [0.22, 2.02],
      [0.2, 1.9],
    ].map(([r, h]) => new T.Vector2(r, h));
    b.add(new T.LatheGeometry(chim, 28), "#F3E3D3", sx * 2.05, 2.0, -1.1, { top: "#FFF6EC" });
    for (const y of [2.75, 3.25]) b.add(ring(0.29, 0.055, 8, 28), "#D2553A", sx * 2.05, y, -1.1, { r: [Math.PI / 2, 0, 0], m: "gloss" });
    b.add(new T.CylinderGeometry(0.045, 0.06, 2.0, 8), "#3A3F5C", sx * 2.45, 1.1, 1.6, { m: "metal" });
    b.add(ball(0.16, 16, 12), "#FFE3A3", sx * 2.45, 2.18, 1.6, { m: powerMat, shade: 0 });
    b.add(new T.ConeGeometry(0.2, 0.14, 16), "#3A3F5C", sx * 2.45, 2.38, 1.6, { m: "metal" });
  }
  b.add(rbox(0.85, 1.25, 0.6, 0.18), "#F6D2C2", -1.45, 0.82, 1.35, { top: "#FFE6DA" });
  b.add(rbox(0.45, 0.8, 0.08, 0.16), INK, -1.45, 0.62, 1.66, { shade: 0.05 });
  b.add(rbox(1.05, 0.08, 0.72, 0.04), "#D2553A", -1.45, 1.47, 1.35, { m: "gloss" });
  // Lightning badge beside the face.
  const bolt = new T.Shape(
    [
      [0.06, 0.3],
      [-0.12, -0.02],
      [0.0, -0.02],
      [-0.06, -0.3],
      [0.12, 0.04],
      [0.0, 0.04],
    ].map(([x, y]) => new T.Vector2(x, y)),
  );
  b.add(softDisc(0.34, 0.08, 0.04, 28), PAPER, 1.45, 1.0, 1.42, { r: [Math.PI / 2 - 0.2, 0, 0] });
  b.add(
    new T.ExtrudeGeometry(bolt, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }),
    AMBER,
    1.45,
    1.0,
    1.5,
    {
      r: [-0.2, 0, 0],
      m: powerMat,
      shade: 0,
    },
  );
  signboard(g, b, "CELL CITY POWER STATION", 0, 4.08, -0.25, 3.6, "#D2553A", [
    [-1.45, 3.05, -0.32],
    [1.45, 3.05, -0.32],
  ]);
  b.flush(g);
  faces[5] = face(g, 0, 1.9, 1.72, 1.05, 0.2);
  const atp = swarm(ball(0.11, 14, 10), new T.MeshStandardMaterial({ color: "#FFD27A", emissive: "#FFB347", emissiveIntensity: 1.1 }), 7);
  atp.castShadow = false;
  const steam = swarm(
    ball(0.3, 14, 10),
    new T.MeshStandardMaterial({ color: "#FFFBEF", transparent: true, opacity: 0.34, depthWrite: false, roughness: 1 }),
    12,
  );
  steam.castShadow = false;

  // ================= 6 · Vacuole reservoir =================
  // A great water bubble (tonoplast) in an egg-cup stand, fed by a pipe that pours in from above.
  g = district(6);
  b = builder();
  b.add(softDisc(2.55, 0.28, 0.12, 64), "#DCE3EC", 0, 0, 0, { top: "#EEF2F7" });
  const cup = [
    [0.0, 0.28],
    [0.95, 0.28],
    [1.0, 0.36],
    [0.75, 0.55],
    [0.78, 0.72],
    [1.3, 0.98],
    [1.66, 1.22],
    [1.8, 1.34],
    [1.76, 1.42],
    [1.6, 1.36],
  ].map(([r, h]) => new T.Vector2(r, h));
  b.add(new T.LatheGeometry(cup, 64), PAPER, 0, 0, 0, { m: "glossDS", top: "#FFFFFF", shade: 0.1 });
  b.add(ring(1.77, 0.06, 8, 64), "#3A8FC9", 0, 1.38, 0, { r: [Math.PI / 2, 0, 0], m: "gloss" });
  b.add(ball(1, 56, 40), "#CFE8F7", 0, 2.85, 0, { s: [2.15, 2.35, 2.15], m: "glass", shade: 0 });
  b.add(ring(2.17, 0.09, 10, 72), PAPER, 0, 2.85, 0, { r: [Math.PI / 2, 0, 0], m: "gloss", shade: 0.05 });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    b.add(ball(0.05, 8, 6), AMBER, 2.24 * Math.sin(a), 2.85, 2.24 * Math.cos(a), { m: "gloss", shade: 0 });
  }
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const s = Math.sin(a),
      c = Math.cos(a);
    b.add(
      tube(
        [
          [1.74 * s, 1.36, 1.74 * c],
          [2.12 * s, 2.0, 2.12 * c],
          [2.2 * s, 2.82, 2.2 * c],
        ],
        0.055,
        20,
        6,
      ),
      "#9FB3C8",
      0,
      0,
      0,
      { m: "metal" },
    );
  }
  b.add(ring(0.3, 0.08, 10, 28), PAPER, 0, 5.18, 0, { r: [Math.PI / 2, 0, 0], m: "gloss" });
  // Intake pipe from the pump house round the back, over the top and down into the neck.
  const pipe = [
    [0, 0.5, -2.52],
    [0, 3.6, -2.52],
    [0, 5.5, -2.3],
    [0, 6.35, -1.35],
    [0, 6.55, -0.45],
    [0, 6.45, -0.08],
    [0, 6.28, 0.0],
  ];
  b.add(tube(pipe, 0.14, 70, 10), "#9FB3C8", 0, 0, 0, { m: "metal", top: "#C9D6E4" });
  for (const p of [pipe[1], pipe[2], pipe[3]])
    b.add(ring(0.18, 0.05, 8, 20), "#7C8FA8", p[0], p[1], p[2], { r: [Math.PI / 2, 0, 0], m: "metal" });
  b.add(rbox(0.7, 0.55, 0.42, 0.12), "#7FA6C9", 0, 0.42, -2.48, { top: "#A8C6E0" });
  b.add(ball(0.5, 32, 22), PAPER, 0, 2.6, 2.18, { s: [1, 1, 0.4], top: "#FFFFFF", shade: 0.08 });
  b.add(ring(0.5, 0.05, 8, 40), "#3A8FC9", 0, 2.6, 2.2, { m: "gloss", shade: 0.05 });
  signboard(g, b, "VACUOLE RESERVOIR", 0, 0.98, 2.5, 4, "#3A8FC9", [
    [-1.9, 0],
    [1.9, 0],
  ]);
  b.flush(g);
  faces[6] = face(g, 0, 2.62, 2.39, 1.0);
  const waterGeo = new T.SphereGeometry(1.98, 48, 32);
  waterGeo.translate(0, 1.98, 0);
  const water = new T.Mesh(
    waterGeo,
    new T.MeshPhysicalMaterial({ color: "#3A8FC9", transparent: true, opacity: 0.6, roughness: 0.12, clearcoat: 1, depthWrite: false }),
  );
  water.position.set(0, 0.62, 0);
  water.renderOrder = 1;
  g.add(water);
  const waterStream = new T.Mesh(
    new T.CylinderGeometry(0.07, 0.09, 1.05, 14, 1, true),
    new T.MeshPhysicalMaterial({ color: "#7CC0E8", transparent: true, opacity: 0.7, roughness: 0.1, clearcoat: 1 }),
  );
  waterStream.position.set(locations[6].x, 0.36 + 5.72, locations[6].z);
  cityLayer.add(waterStream);
  const bubbles = swarm(
    ball(0.08, 10, 8),
    new T.MeshPhysicalMaterial({ color: "#EAF6FF", transparent: true, opacity: 0.7, roughness: 0.05, clearcoat: 1 }),
    6,
    null,
    g,
  );
  bubbles.castShadow = false;
  bubbles.renderOrder = 1;

  // ================= 7 · Lysosome recycling =================
  // A glossy dome full of enzymes; two chomper enzymes on the conveyor break rubbish into ever smaller bits.
  g = district(7);
  b = builder();
  b.add(softDisc(1, 0.2, 0.09, 56), "#E6DCF0", 0, 0, 0, { s: [1.95, 1, 2.25], top: "#F2ECF8" });
  const dome = [
    [0.0001, 0.2],
    [1.7, 0.2],
    [1.78, 0.3],
    [1.78, 1.0],
  ];
  for (let k = 1; k <= 14; k++) {
    const a = (k / 14) * (Math.PI / 2);
    dome.push([Math.max(0.0001, 1.78 * Math.cos(a)), 1.0 + 1.75 * Math.sin(a)]);
  }
  b.add(
    new T.LatheGeometry(
      dome.map(([r, h]) => new T.Vector2(r, h)),
      64,
    ),
    "#7E4DA6",
    0,
    0,
    -0.35,
    { m: "gloss", top: "#B993DB" },
  );
  b.add(ring(1.8, 0.07, 8, 64), PAPER, 0, 1.0, -0.35, { r: [Math.PI / 2, 0, 0], m: "gloss" });
  for (let k = 0; k < 9; k++) {
    const th = (k / 9) * TAU + 0.35;
    b.add(ball(0.17, 16, 10), "#FFF1C9", 1.78 * Math.sin(th), 0.6, -0.35 + 1.78 * Math.cos(th), {
      r: [0, th, 0],
      s: [1, 1, 0.35],
      m: "glow",
      shade: 0,
    });
  }
  // Proton pumps studding the membrane keep the inside acidic.
  for (let k = 0; k < 11; k++) {
    const th = (k / 11) * TAU,
      e = k % 2 ? 0.95 : 0.55,
      n = new T.Vector3(Math.cos(e) * Math.sin(th), Math.sin(e), Math.cos(e) * Math.cos(th)),
      eu = new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), n), "XYZ");
    b.add(pill(0.075, 0.12, 10), AMBER, n.x * 1.78, 1.0 + n.y * 1.75, -0.35 + n.z * 1.78, {
      r: [eu.x, eu.y, eu.z],
      m: "gloss",
      shade: 0.1,
    });
  }
  b.add(softDisc(0.32, 0.14, 0.06, 24), "#E2D6EE", 0, 2.7, -0.35);
  b.add(ball(0.12, 14, 10), "#9BE07A", 0, 2.92, -0.35, { m: "gloss" });
  // Conveyor, rubbish hopper, recycling bin and chomper pedestals.
  b.add(rbox(3.55, 0.12, 0.42, 0.05), "#4A5170", -0.2, 0.52, 1.82, { top: "#5E6790" });
  for (const x of [-1.7, -0.2, 1.3]) b.add(new T.CylinderGeometry(0.045, 0.065, 0.46, 8), "#3A3F5C", x, 0.23, 1.82, { m: "metal" });
  b.add(
    new T.LatheGeometry(
      [
        [0.08, 0],
        [0.1, 0.05],
        [0.34, 0.42],
        [0.36, 0.48],
        [0.32, 0.47],
      ].map(([r, h]) => new T.Vector2(r, h)),
      28,
    ),
    "#B8A9C9",
    -1.64,
    0.95,
    1.82,
    { m: "glossDS" },
  );
  b.add(new T.CylinderGeometry(0.04, 0.04, 0.95, 8), "#3A3F5C", -1.86, 0.48, 2.02, { m: "metal" });
  b.add(softDisc(0.25, 0.5, 0.06, 28), "#2E8B57", 1.72, 0, 1.82, { top: "#4FAF75" });
  b.add(ring(0.23, 0.04, 8, 24), "#9BE07A", 1.72, 0.5, 1.82, { r: [Math.PI / 2, 0, 0], m: "gloss" });
  signboard(g, b, "LYSOSOME RECYCLING", 0, 3.2, 0.05, 3.7, "#8E5BB5", [
    [-1.4, 1.95, -0.02],
    [1.4, 1.95, -0.02],
  ]);
  b.flush(g);
  faces[7] = face(g, 0, 2.1, 1.1, 1.0, 0.66);
  // Chompers: Pac-Man enzymes with teeth and eyes; upper and lower jaws hinge around the centre.
  const chompers = [-0.72, 0.55].map((cx) => {
    const jaws = [1, -1].map((up) => {
      const jb = builder(),
        jaw = new T.Group();
      jaw.position.set(cx, 0.93, 1.82);
      g.add(jaw);
      jb.add(new T.SphereGeometry(0.34, 24, 10, 0, TAU, up > 0 ? 0 : Math.PI / 2, Math.PI / 2), "#D96FA8", 0, 0, 0, {
        m: "glossDS",
        top: "#F2A6CC",
        shade: 0.1,
      });
      jb.add(new T.CircleGeometry(0.33, 24), "#4A1E3A", 0, 0, 0, { r: [-Math.PI / 2, 0, 0], m: "clayDS", shade: 0 });
      for (let k = 0; k < 3; k++)
        jb.add(new T.ConeGeometry(0.045, 0.1, 8), PAPER, -0.27, -up * 0.05, (k - 1) * 0.15, {
          r: [0, 0, up > 0 ? Math.PI : 0],
          m: "gloss",
          shade: 0,
        });
      if (up > 0)
        for (const z of [-0.12, 0.12]) {
          jb.add(ball(0.065, 12, 8), "#FFFFFF", -0.22, 0.22, z, { m: "gloss", shade: 0 });
          jb.add(ball(0.035, 10, 6), INK, -0.27, 0.23, z, { m: "gloss", shade: 0 });
        }
      jb.flush(jaw);
      return jaw;
    });
    return { cx, jaws };
  });
  const debris = swarm(rbox(0.2, 0.18, 0.2, 0.05, 2), new T.MeshStandardMaterial({ roughness: 0.82 }), 8, [
    "#7C7468",
    "#9A8F7E",
    "#6E6A88",
    "#A07F5C",
  ]);

  // ================= 8 · Nucleus control centre =================
  // Double membrane (two walls with a gap) pierced by nuclear pores, a walk-in front, a domed roof and a DNA spire.
  g = district(8);
  b = builder();
  b.add(softDisc(3.95, 0.1, 0.05, 72), "#ECE6F4", 0, 0, 0, { top: "#F4F0FA", shade: 0.05 });
  b.add(ring(2.2, 0.05, 6, 72), "#C9C6EC", 0, 0.1, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.3], shade: 0 });
  // Control desk and screen bezels along the back wall.
  for (let k = -2; k <= 2; k++) {
    const th = Math.PI + k * 0.2;
    b.add(rbox(0.62, 0.75, 0.36, 0.08), "#4A5170", 3.05 * Math.sin(th), 0.47, 3.05 * Math.cos(th), { r: [0, th, 0], top: "#5C6488" });
    for (let j = -1; j <= 1; j++)
      b.add(
        ball(0.04, 8, 6),
        ["#9BE07A", "#F2C94C", "#F28BA0"][(j + k + 6) % 3],
        3.0 * Math.sin(th + j * 0.05),
        0.86,
        3.0 * Math.cos(th + j * 0.05),
        {
          m: "glow",
          shade: 0,
        },
      );
  }
  const screens = [];
  const deptNames = ["GARDEN", "DELIVERY", "PROTEINS", "ENERGY", "STORAGE", "RECYCLING"];
  const deptColors = ["#2E8B57", "#E07A3F", "#8C5A3C", "#D2553A", "#3A8FC9", "#8E5BB5"];
  for (let i = 0; i < 6; i++) {
    const x = ((i % 3) - 1) * 1.2,
      y = 1.25 + Math.floor(i / 3) * 0.9,
      th = Math.atan2(x, -Math.sqrt(3.3 ** 2 - x * x)),
      at = (r) => [r * Math.sin(th), r * Math.cos(th)];
    const [bx, bz] = at(3.32);
    b.add(rbox(1.06, 0.74, 0.1, 0.06), INK, bx, y, bz, { r: [0, th, 0], shade: 0.05 });
    const [sx, sz] = at(3.25);
    const screen = new T.Mesh(
      rbox(0.92, 0.6, 0.03, 0.015, 2),
      new T.MeshStandardMaterial({ color: deptColors[i], emissive: deptColors[i], emissiveIntensity: 0.3, roughness: 0.35 }),
    );
    screen.position.set(sx, y, sz);
    screen.rotation.y = th;
    screen.userData.base = new T.Color(deptColors[i]);
    g.add(screen);
    screens.push(screen);
    for (let j = 0; j < 3; j++) {
      const [cx, cz] = [sx - Math.cos(th) * (-0.25 + j * 0.24), sz + Math.sin(th) * (-0.25 + j * 0.24)];
      b.add(
        rbox(0.09, 0.1 + j * 0.08, 0.02, 0.008),
        "#E7F4D5",
        cx - Math.sin(th) * 0.03,
        y - 0.13 + (0.1 + j * 0.08) / 2,
        cz - Math.cos(th) * 0.03,
        {
          r: [0, th, 0],
          m: "glow",
          shade: 0,
        },
      );
    }
    const [lx, lz] = at(3.2);
    sign(deptNames[i], lx, y + 0.42, lz, 0.9, INK, g).rotation.y = th + Math.PI;
  }
  sign("DNA • CITY CONTROL", 0, 2.88, -3.27, 2.8, "#4B4FA8", g);
  // Nucleolus: a darker, knobbly sphere floating above the control room; the resident lives here.
  const nu = [-1.5, 2.95, -1.5];
  b.add(ball(0.62, 36, 26), "#2E2F6E", nu[0], nu[1], nu[2], { m: "gloss", top: "#4B4FA8" });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU,
      e = (k % 3) * 0.5 - 0.4;
    b.add(
      ball(0.26 + (k % 2) * 0.05, 16, 12),
      "#34357A",
      nu[0] + 0.5 * Math.cos(a) * Math.cos(e),
      nu[1] + 0.5 * Math.sin(e),
      nu[2] - 0.5 * Math.abs(Math.sin(a)) * Math.cos(e),
      {
        m: "gloss",
        top: "#5559B0",
      },
    );
  }
  // Outdoor sign on two posts at the entrance.
  signboard(g, b, "NUCLEUS • CONTROL CENTRE", 0, 4.35, 3.98, 5.6, "#4B4FA8", [
    [-2.95, 0, 3.9],
    [2.95, 0, 3.9],
  ]);
  b.flush(g);
  faces[8] = face(g, nu[0] + 0.16, nu[1], nu[2] + 0.6, 1.05, 0, "#8E7FD6");
  faces[8].group.rotation.y = 0.28;

  // Walls: own material so they can fade while the class is inside.
  const wallMat = std({ roughness: 0.6, side: T.DoubleSide, transparent: true, opacity: 1 });
  const wb = builder();
  const wallArc = (r) => Math.asin(2.62 / r);
  for (const [r, c, top] of [
    [3.85, "#6E72C4", "#8F93DA"],
    [3.5, "#C9C6EC", "#E2E0F6"],
  ]) {
    const a0 = wallArc(r);
    wb.add(new T.CylinderGeometry(r, r, 3.0, 72, 1, true, a0, TAU - 2 * a0), c, 0, 1.6, 0, { m: wallMat, top });
    const lip = [];
    for (let k = 0; k <= 60; k++) {
      const th = a0 + (k / 60) * (TAU - 2 * a0);
      lip.push([r * Math.sin(th), 3.1, r * Math.cos(th)]);
    }
    wb.add(tube(lip, 0.09, 120, 8), "#E2E0F6", 0, 0, 0, { m: wallMat, shade: 0 });
  }
  for (const sx of [-1, 1]) wb.add(pill(0.22, 2.6, 16), "#8F93DA", sx * 2.66, 1.6, 2.68, { m: wallMat, top: "#B9BCEB" });
  // Nuclear pores pass through both membranes.
  for (let k = 0; k < 14; k++) {
    const th = 1.05 + (k / 13) * (TAU - 2.1),
      y = k % 2 ? 2.25 : 1.15;
    for (const [r, flip, rim] of [
      [3.88, 0, "#B9BCEB"],
      [3.47, Math.PI, "#8F93DA"],
    ]) {
      wb.add(ring(0.2, 0.065, 8, 20), rim, r * Math.sin(th), y, r * Math.cos(th), { r: [0, th + flip, 0], m: wallMat, shade: 0 });
      wb.add(new T.CircleGeometry(0.15, 16), "#262855", (r - 0.01) * Math.sin(th), y, (r - 0.01) * Math.cos(th), {
        r: [0, th + flip, 0],
        m: wallMat,
        shade: 0,
      });
    }
  }
  // Chromatin threads draped along the inner membrane.
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let j = 0; j <= 40; j++) {
      const th = 1.25 + (j / 40) * (TAU - 2.5);
      pts.push([3.4 * Math.sin(th), 0.7 + k * 0.85 + 0.22 * Math.sin(th * 5 + k * 2), 3.4 * Math.cos(th)]);
    }
    wb.add(tube(pts, 0.04, 160, 6), ["#7B4FA8", "#9A6BC4", "#5E4A9E"][k], 0, 0, 0, { m: wallMat, shade: 0 });
  }
  wb.flush(g);
  // Roof (hidden when the class is near so we can look inside): dome, pores and the DNA spire.
  const roof = new T.Group();
  g.add(roof);
  const rb = builder();
  rb.add(new T.SphereGeometry(3.95, 72, 26, 0, TAU, 0, Math.PI / 2), "#4B4FA8", 0, 3.1, 0, { s: [1, 0.62, 1], m: "gloss", top: "#7478D4" });
  rb.add(ring(3.95, 0.12, 8, 96), PAPER, 0, 3.1, 0, { r: [Math.PI / 2, 0, 0], m: "gloss" });
  rb.add(ring(3.86, 0.05, 6, 96), AMBER, 0, 3.32, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.62], m: "gloss", shade: 0 });
  for (const [e, n] of [
    [0.45, 12],
    [0.95, 7],
  ]) {
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU + e,
        tilt = Math.atan2(Math.sin(e) / 2.45, Math.cos(e) / 3.95),
        px = 3.95 * Math.cos(e) * Math.sin(th),
        py = 3.1 + 2.45 * Math.sin(e),
        pz = 3.95 * Math.cos(e) * Math.cos(th);
      rb.add(ring(0.22, 0.07, 8, 20), "#9DA0E6", px, py, pz, { r: [-tilt, th, 0], order: "YXZ", m: "gloss", shade: 0 });
      rb.add(new T.CircleGeometry(0.16, 16), "#232552", px * 1.003, py, pz * 1.003, { r: [-tilt, th, 0], order: "YXZ", shade: 0 });
    }
  }
  rb.add(softDisc(0.55, 0.3, 0.12, 32), AMBER, 0, 5.45, 0, { m: "gloss" });
  rb.add(new T.CylinderGeometry(0.04, 0.04, 2.7, 8), PAPER, 0, 7.05, 0, { m: "metal" });
  for (const ph of [0, Math.PI]) {
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const a = (k / 60) * 2.5 * TAU + ph;
      pts.push([0.34 * Math.cos(a), 5.75 + (k / 60) * 2.6, 0.34 * Math.sin(a)]);
    }
    rb.add(tube(pts, 0.065, 160, 8), ph ? PINK : "#4B4FA8", 0, 0, 0, { m: "gloss", shade: 0.05, top: ph ? "#F27C9C" : "#7478D4" });
  }
  for (let k = 0; k < 13; k++) {
    const u = (k + 0.5) / 13.5,
      a = u * 2.5 * TAU;
    rb.add(pill(0.035, 0.52, 8, 2), ["#2E8B57", AMBER, "#3A8FC9", "#F28BA0"][k % 4], 0, 5.75 + u * 2.6, 0, {
      r: [0, -a, Math.PI / 2],
      order: "YXZ",
      m: "gloss",
      shade: 0,
    });
  }
  rb.add(ball(0.2, 18, 12), "#FFE3A3", 0, 8.55, 0, { m: "glow", shade: 0 });
  rb.flush(roof);

  // ---------- obstacles (unchanged footprint: route finding depends on them) ----------
  const dimensions = [
    [0, 0],
    [6.5, 4.8],
    [5.6, 4.3],
    [5.2, 2.1],
    [4.8, 4.9],
    [5.4, 4.1],
    [5.5, 5.5],
    [4, 4.6],
  ];
  locations.forEach((l, i) => {
    if (i > 0 && i < 8) obstacles.push({ x: l.x, z: l.z, w: dimensions[i][0], d: dimensions[i][1] });
  });
  obstacles.push(
    { x: -3, z: 27, w: 1.1, d: 1.6 },
    { x: 3, z: 27, w: 1.1, d: 1.6 },
    { x: -3.3, z: 0, w: 1.5, d: 7.4 },
    { x: 3.3, z: 0, w: 1.5, d: 7.4 },
    { x: 0, z: -3.4, w: 7, d: 1.5 },
  );

  const failRed = new T.Color("#B76B59"),
    failGlow = new T.Color("#A12815");
  let gateOpen = 0,
    solarBoost = 0;
  const L = locations;
  return {
    // state: { done, broken, reduced, story, active, speaker, mode, leaderPos }
    update(t, dt, { done, broken, reduced, story, active, speaker, mode, leaderPos }) {
      const k = 1 - Math.exp(-dt * 2.2);
      gateOpen += ((done > 0 ? 1 : 0) - gateOpen) * k;
      const fold = 1 - 0.94 * gateOpen;
      for (let s = 0; s < 2; s++)
        for (let j = 0; j < 8; j++) {
          const side = s ? 1 : -1;
          put(slats, s * 8 + j, side * (2.42 - j * 0.3 * fold), 1.42, 0, 1, 0, side * (j % 2 ? 0.5 : -0.5) * gateOpen);
        }
      slats.instanceMatrix.needsUpdate = true;

      roof.visible = Math.hypot(leaderPos.x, leaderPos.z) > 9 && mode !== "reveal";
      wallMat.opacity = active === 8 && story ? 0.6 : 1;

      // Golgi: parcel-carrying vesicles glide round the courtyard conveyor.
      vesicles.visible = parcels.visible = !broken.has(2);
      for (let i = 0; i < 6; i++) {
        const u = (t * 0.07 + i / 6) % 1,
          th = -1.0 + u * 2.0,
          x = L[2].x + 1.45 * Math.sin(th),
          z = L[2].z + 1.9 - 1.45 * Math.cos(th),
          y = 0.36 + 0.8 + (reduced ? 0 : Math.sin(t * 2 + i) * 0.03);
        put(vesicles, i, x, y, z, 1);
        put(parcels, i, x, y - 0.01, z, 1, 0, th + t * 0.3);
      }
      vesicles.instanceMatrix.needsUpdate = parcels.instanceMatrix.needsUpdate = true;

      // Ribosome: loose amino acids ride in, then link up into a tight chain that folds into the basket.
      beads.visible = !broken.has(4);
      for (let i = 0; i < 11; i++) {
        const u = (t * 0.06 + i / 11) % 1;
        let x,
          y,
          s = 1;
        if (u < 0.3) (x = -1.85 + (u / 0.3) * 1.85), (y = 0.9);
        else {
          const v = (u - 0.3) / 0.7;
          x = v * 1.85;
          y = 0.9 + 0.08 * Math.sin(v * 14);
          if (v > 0.9) s = (1 - v) / 0.1;
        }
        put(beads, i, L[4].x + x, 0.36 + y, L[4].z + 1.8, Math.max(0.01, s));
      }
      beads.instanceMatrix.needsUpdate = true;

      // Mitochondria: ATP orbs drift through the cristae; steam rises from the chimneys.
      const power = !broken.has(5);
      powerMat.emissiveIntensity = power ? (reduced ? 0.5 : 0.48 + 0.08 * Math.sin(t * 2)) : 0.03;
      atp.visible = steam.visible = power;
      for (let i = 0; i < 7; i++) {
        const u = (t * 0.05 + i / 7) % 1;
        put(
          atp,
          i,
          L[5].x - 1.8 + u * 3.6,
          0.36 + 2.32 + 0.12 * Math.sin(t * 2 + i * 1.7),
          L[5].z + 0.72,
          0.85 + 0.15 * Math.sin(t * 3 + i),
        );
      }
      atp.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 12; i++) {
        const phase = (t * (reduced ? 0.2 : 0.42) + i * 0.5) % 3,
          s = (0.45 + phase * 0.35) * (phase > 2.3 ? (3 - phase) / 0.7 : 1);
        put(
          steam,
          i,
          L[5].x + (i % 2 ? 2.05 : -2.05) + Math.sin(phase * 2 + i) * 0.15,
          0.36 + 4.15 + phase * 0.9,
          L[5].z - 1.1,
          Math.max(0.01, s),
        );
      }
      steam.instanceMatrix.needsUpdate = true;

      // Vacuole: little bubbles rise through the sap.
      const top = 0.62 + 3.6 * water.scale.y;
      for (let i = 0; i < 6; i++) {
        const u = reduced ? (i + 0.5) / 6 : (t * 0.12 + i / 6) % 1;
        put(bubbles, i, Math.cos(i * 2.3) * 0.8 + Math.sin(t + i) * 0.05, 0.9 + u * (top - 1.1), Math.sin(i * 2.3) * 0.7, 0.6 + u * 0.6);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      waterStream.scale.set(reduced ? 1 : 1 + Math.sin(t * 7) * 0.06, reduced ? 1 : 1 + Math.sin(t * 2) * 0.03, 1);

      // Lysosome: chompers bite while rubbish shrinks on its way to the bin.
      const recycling = !broken.has(7);
      debris.visible = recycling;
      chompers.forEach((c, j) => {
        const open = recycling ? 0.5 * (0.5 + 0.5 * Math.sin(t * (reduced ? 2 : 6) + j * 1.7)) : 0.04;
        c.jaws[0].rotation.z = -open;
        c.jaws[1].rotation.z = open * 0.6;
      });
      for (let i = 0; i < 8; i++) {
        const u = (t * 0.08 + i / 8) % 1,
          x = -1.75 + u * 3.47;
        let y = 0.68,
          s = x < -0.72 ? 1 : x < 0.55 ? 0.62 : 0.36;
        if (Math.abs(x + 0.72) < 0.14 || Math.abs(x - 0.55) < 0.14) s = 0.01;
        if (x > 1.5) y -= (x - 1.5) * 2.2;
        put(debris, i, L[7].x + x, 0.36 + y, L[7].z + 1.82, s, t + i, t * 0.7 + i, 0);
      }
      debris.instanceMatrix.needsUpdate = true;

      // Nucleus: department screens turn red and pulse while their district is broken.
      screens.forEach((p, i) => {
        const failed = broken.has([1, 2, 4, 5, 6, 7][i]);
        p.material.color.copy(failed ? failRed : p.userData.base);
        p.material.emissive.copy(failed ? failGlow : p.userData.base);
        p.material.emissiveIntensity = failed ? (reduced ? 0.45 : 0.4 + 0.3 * Math.sin(t * 5)) : 0.3;
      });

      solarBoost = Math.max(0, solarBoost - dt / 3);
      solar.visible = !broken.has(1);
      solar.material.opacity = (reduced ? 0.09 : 0.09 + Math.sin(t) * 0.025) + solarBoost * 0.14;

      faces.forEach((f, i) => {
        const talking = story && speaker === 5 && active === i;
        f.mouth.visible = talking;
        if (talking) f.mouth.scale.y = 0.35 + Math.abs(Math.sin(t * (reduced ? 5 : 9))) * 0.85;
        f.eyes.scale.y = (t + i * 1.37) % 4.1 < 0.13 ? 0.12 : 1;
      });
    },
    demonstrate(i, part = 0) {
      if (i === 6) water.scale.y = Math.min(1.1, 0.7 + part * 0.15);
      if (i === 1) solarBoost = 1;
    },
  };
}
