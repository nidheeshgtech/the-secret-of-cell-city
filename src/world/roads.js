import * as T from "three";

export const ROAD_CELL = 0.65;
export const roadKey = (x, z) => `${Math.round(x / ROAD_CELL)},${Math.round(z / ROAD_CELL)}`;

// The main loop passes every stop in story order: gate, garden, post office, ER, workshop,
// power station, reservoir, recycling centre, then down the middle to the nucleus.
export const roadLines = [
  {
    width: 1.3,
    points: [
      [0, 33],
      [0, 24],
      [-8, 22],
      [-15, 19],
      [-17.5, 14.6],
      [-23.3, 12.4],
      [-24, 3],
      [-20, -0.4],
      [-14, -3],
      [-8, -7.9],
      [0, -10.4],
      [7.5, -10.4],
      [13.5, -9.6],
      [15.2, -6.4],
      [17.4, -3.5],
      [20, -2.9],
      [23, 3],
      [22.8, 9.5],
      [21.6, 13.8],
      [17.5, 14.6],
      [13, 20],
      [7.5, 19.6],
      [2.8, 14],
      [0, 8],
      [0, 2.3],
    ],
  },
  {
    width: 1.05,
    points: [
      [-20, -0.4],
      [-12, 2],
      [-6, 5],
      [0, 8],
      [9, 6],
      [12.6, 12.4],
      [17.5, 14.6],
    ],
  },
  // Short link that closes the main road into a ring for the delivery pods.
  {
    width: 1.05,
    points: [
      [7.5, 19.6],
      [3.8, 22.6],
      [0, 24],
    ],
  },
  {
    width: 0.85,
    points: [
      [-8, -7.9],
      [-5, -4],
      [-5, 3],
      [0, 8],
    ],
  },
];

export const roadCurve = (points) =>
  new T.CatmullRomCurve3(
    points.map(([x, z]) => new T.Vector3(x, 0, z)),
    false,
    "centripetal",
  );

// Walking cost per grid cell: 1 on the centre line rising to ~1.6 at the kerb. Cells not in the map are grass.
export function buildRoadMap(lines = roadLines) {
  const map = new Map();
  for (const { points, width } of lines) {
    const curve = roadCurve(points),
      samples = curve.getSpacedPoints(Math.ceil(curve.getLength() / 0.2)),
      reach = Math.ceil(width / ROAD_CELL);
    for (const p of samples) {
      const cx = Math.round(p.x / ROAD_CELL),
        cz = Math.round(p.z / ROAD_CELL);
      for (let x = cx - reach; x <= cx + reach; x++)
        for (let z = cz - reach; z <= cz + reach; z++) {
          const d = Math.hypot(x * ROAD_CELL - p.x, z * ROAD_CELL - p.z) / width;
          if (d > 1) continue;
          const cost = 1 + 0.6 * d * d,
            key = `${x},${z}`;
          if (!(map.get(key) <= cost)) map.set(key, cost);
        }
    }
  }
  return map;
}

// Closed loop the delivery pods drive: the main road from just inside the gate round to the
// recycling centre, then back along the link road. It never crosses the gate or enters the nucleus.
export function podLoop() {
  const main = roadLines[0].points,
    end = main.findIndex(([x, z]) => x === 7.5 && z === 19.6),
    points = [...main.slice(1, end + 1), [3.8, 22.6]];
  return new T.CatmullRomCurve3(
    points.map(([x, z]) => new T.Vector3(x, 0, z)),
    true,
    "centripetal",
  );
}
