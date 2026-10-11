import * as T from "three";

export const dampAngle = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

// Shared modelling helpers: cached materials, primitive builders and a seeded random source.
export function createKit(root) {
  const materials = new Map();
  function mat(c, opts = {}) {
    const key = c + JSON.stringify(opts);
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color: c, roughness: 0.75, ...opts }));
    return materials.get(key);
  }
  function mesh(geo, c, x, y, z, parent = root, opts = {}) {
    const m = new T.Mesh(geo, mat(c, opts));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(w, h, d, c, x, y, z, p = root) {
    return mesh(new T.BoxGeometry(w, h, d), c, x, y, z, p);
  }
  function sphere(r, c, x, y, z, p = root) {
    return mesh(new T.SphereGeometry(r, 16, 12), c, x, y, z, p);
  }
  function cyl(r1, r2, h, c, x, y, z, p = root, n = 32) {
    return mesh(new T.CylinderGeometry(r1, r2, h, n), c, x, y, z, p);
  }
  function torus(r, t, c, x, y, z, p = root) {
    const m = mesh(new T.TorusGeometry(r, t, 8, 48), c, x, y, z, p);
    m.rotation.x = Math.PI / 2;
    return m;
  }
  let seed = 42;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  return { T, mat, mesh, box, sphere, cyl, torus, rnd };
}
