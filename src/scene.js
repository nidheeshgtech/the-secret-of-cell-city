import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { findRoute, moveWithCollision, smoothRoute } from "./navigation.js";
import { createKit, dampAngle } from "./world/kit.js";
import { roadLines, roadCurve, buildRoadMap, podLoop } from "./world/roads.js";
import { buildNature } from "./world/nature.js";
import { buildDistricts } from "./world/districts.js";
import { createPerson, animatePerson, posePerson } from "./world/people.js";
export function createCity(host, labels, stops, events = {}) {
  const scene = new T.Scene();
  // Warm hazy sky: deep blue overhead fading to a sunlit horizon.
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const skyPaint = sky.getContext("2d"),
    skyFade = skyPaint.createLinearGradient(0, 0, 0, 256);
  skyFade.addColorStop(0, "#6FAED3");
  skyFade.addColorStop(0.55, "#B9D9E6");
  skyFade.addColorStop(1, "#F3E6D3");
  skyPaint.fillStyle = skyFade;
  skyPaint.fillRect(0, 0, 4, 256);
  scene.background = new T.CanvasTexture(sky);
  scene.background.colorSpace = T.SRGBColorSpace;
  scene.fog = new T.Fog("#EFE2CE", 55, 120);
  const camera = new T.PerspectiveCamera(57, 1, 0.12, 180);
  camera.position.set(0, 5.8, 40);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true });
  } catch {
    host.innerHTML = '<div class="webgl-fallback">3D needs WebGL. You can still follow the story and complete every challenge.</div>';
    return {
      available: false,
      setProgress() {},
      travel(i) {
        events.arrive?.(i);
      },
      setPaused() {},
      setStory() {},
      setSpeaker() {},
      overview() {},
      follow() {},
      faceNorth() {},
      toggleTilt() {},
      heading() {
        return 0;
      },
      zoom() {},
      celebrate() {},
      reveal() {},
      setEmergency() {},
      repair() {},
      reset() {},
      interact() {},
      demonstrate() {},
      setInput() {},
      getPosition() {
        return { x: 0, z: 32 };
      },
    };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 0.98;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Animated Cell City field trip following the teacher and students.");
  renderer.domElement.tabIndex = 0;
  // Soft studio reflections so rounded and glossy surfaces read well.
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();
  scene.add(new T.HemisphereLight("#FFF4E0", "#6B5E4C", 1.25));
  const sun = new T.DirectionalLight("#FFE2B8", 3.3);
  sun.position.set(-24, 45, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 110 });
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  const kit = createKit(scene);
  const { mesh, box, sphere, cyl, torus, rnd } = kit;
  const scenery = new T.Group();
  scene.add(scenery);
  const cityLayer = new T.Group();
  scene.add(cityLayer);

  const locations = stops.map((s, i) => ({ x: s.x * 2.5, z: i === 0 ? 27 : s.z * 2.5 }));
  const destinations = locations.map((s, i) => ({ x: s.x, z: s.z + (i === 0 ? 3.6 : i === 8 ? 1.7 : 4.6) }));
  const obstacles = [];
  const roads = buildRoadMap();
  function road({ points, width }, color = "#E9CFA3") {
    const curve = roadCurve(points),
      segments = Math.max(50, points.length * 20),
      m = mesh(new T.TubeGeometry(curve, segments, width, 10, false), color, 0, 0.39, 0, cityLayer);
    m.scale.y = 0.075;
    // A darker kerb peeking out from under the path gives it a crisp edge.
    const kerb = mesh(new T.TubeGeometry(curve, segments, width * 1.16, 10, false), "#C99B6D", 0, 0.375, 0, cityLayer);
    kerb.scale.y = 0.06;
    kerb.castShadow = m.castShadow = false;
    return curve;
  }
  const [route] = roadLines.map((line) => road(line));
  const nature = buildNature(kit, { scenery, cityLayer, locations, roads, obstacles });
  // Painted signboards; repainted once the bundled fonts finish loading.
  const signPainters = [];
  function sign(text, x, y, z, width = 3.2, color = "#1E2440", parent = cityLayer) {
    const cv = document.createElement("canvas");
    cv.width = 768;
    cv.height = 128;
    const ctx = cv.getContext("2d"),
      tx = new T.CanvasTexture(cv);
    tx.colorSpace = T.SRGBColorSpace;
    const paint = () => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 768, 128);
      ctx.strokeStyle = "#E59B2E";
      ctx.lineWidth = 7;
      ctx.strokeRect(7, 7, 754, 114);
      ctx.fillStyle = "#FBF5EA";
      ctx.font = "700 40px 'Atkinson Hyperlegible', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text.toUpperCase(), 384, 67, 728);
      tx.needsUpdate = true;
    };
    paint();
    signPainters.push(paint);
    const board = new T.Mesh(new T.PlaneGeometry(width, width / 6), new T.MeshBasicMaterial({ map: tx, side: T.DoubleSide }));
    board.position.set(x, y, z);
    parent.add(board);
    return board;
  }
  document.fonts?.load("700 40px 'Atkinson Hyperlegible'").then(
    () => signPainters.forEach((paint) => paint()),
    () => {},
  );
  const districts = buildDistricts(kit, { cityLayer, locations, stops, sign, obstacles });
  // Street lamps grown like plant stems, each holding a glowing seed-pod lantern.
  const lampStem = new T.TubeGeometry(
      new T.CatmullRomCurve3([
        new T.Vector3(0, 0, 0),
        new T.Vector3(0.06, 1.3, 0),
        new T.Vector3(-0.08, 2.45, 0),
        new T.Vector3(-0.55, 2.95, 0),
      ]),
      28,
      0.055,
      10,
    ),
    lampCap = new T.SphereGeometry(0.21, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    lampLeaf = new T.SphereGeometry(0.18, 14, 8),
    slat = new RoundedBoxGeometry(1.5, 0.07, 0.16, 2, 0.03),
    benchLeg = new T.TorusGeometry(0.2, 0.035, 8, 16, Math.PI);
  const lamps = [];
  for (let i = 0; i < 15; i++) {
    const p = route.getPointAt((i + 0.3) / 15),
      lamp = new T.Group();
    lamp.position.set(p.x + 2, 0.36, p.z);
    cityLayer.add(lamp);
    mesh(lampStem, "#2F5D46", 0, 0, 0, lamp);
    for (const [y, side] of [
      [0.7, 1],
      [1.25, -1],
    ]) {
      const leaf = mesh(lampLeaf, "#5E9E3F", side * 0.16, y, 0, lamp);
      leaf.scale.set(1, 0.22, 0.5);
      leaf.rotation.z = side * 0.5;
    }
    mesh(lampCap, "#2F5D46", -0.55, 2.84, 0, lamp);
    const bulb = mesh(new T.SphereGeometry(0.19, 20, 14), "#FFE7B0", -0.55, 2.74, 0, lamp);
    bulb.scale.y = 1.2;
    bulb.castShadow = false;
    bulb.material = new T.MeshStandardMaterial({ color: "#FFE7B0", emissive: "#F9C86A", emissiveIntensity: 1.4, roughness: 0.4 });
    lamps.push(bulb);
    if (i % 3 === 1) {
      // Slatted park bench.
      const bench = new T.Group();
      bench.position.set(p.x + 3, 0.36, p.z);
      cityLayer.add(bench);
      for (let k = 0; k < 3; k++) mesh(slat, "#C98A4B", 0, 0.48, -0.17 + k * 0.17, bench);
      for (let k = 0; k < 2; k++) mesh(slat, "#B97A3E", 0, 0.68 + k * 0.17, -0.3, bench).rotation.x = -0.2;
      for (const x of [-0.6, 0.6]) {
        const leg = mesh(benchLeg, "#1E2440", x, 0.26, 0, bench);
        leg.rotation.y = Math.PI / 2;
        leg.scale.set(1, 1.15, 1);
      }
    }
  }
  // Delivery pods: little vesicles carrying cargo along the main road.
  const couriers = [];
  const podBase = new RoundedBoxGeometry(0.7, 0.22, 0.95, 3, 0.09),
    podShell = new T.SphereGeometry(0.4, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62),
    podCargo = new RoundedBoxGeometry(0.34, 0.3, 0.34, 2, 0.06),
    podWheel = new T.SphereGeometry(0.09, 12, 8);
  for (let i = 0; i < 4; i++) {
    const cart = new T.Group(),
      tint = ["#E07A3F", "#3A8FC9", "#D9A21B", "#8E5BB5"][i];
    mesh(podBase, tint, 0, 0.24, 0, cart);
    mesh(podCargo, ["#F2B285", "#BFD9EA", "#FBE7A8", "#E2D6EE"][i], 0, 0.5, 0, cart).rotation.y = 0.4;
    const shell = mesh(podShell, "#E8F4F6", 0, 0.3, 0, cart, {
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
    });
    shell.castShadow = false;
    for (const x of [-0.28, 0.28]) for (const z of [-0.34, 0.34]) mesh(podWheel, "#1E2440", x, 0.1, z, cart);
    cityLayer.add(cart);
    couriers.push(cart);
  }

  // Pods keep to the right lane, steer round people when another lane is clear, otherwise slow and wait;
  // they also keep their distance from the pod in front.
  const loop = podLoop(),
    loopLength = loop.getLength(),
    LANES = [0.55, -0.55, 1.1, -1.1],
    POD_SPEED = 1.5,
    loopPoint = new T.Vector3(),
    loopTangent = new T.Vector3();
  couriers.forEach((cart, i) => (cart.userData.drive = { s: (i * loopLength) / couriers.length, v: POD_SPEED, lane: LANES[0] }));
  function onLoop(s, lane, out) {
    const u = (((s % loopLength) + loopLength) % loopLength) / loopLength;
    loop.getPointAt(u, loopPoint);
    loop.getTangentAt(u, loopTangent);
    return out.set(loopPoint.x - loopTangent.z * lane, 0.42, loopPoint.z + loopTangent.x * lane);
  }
  const probe = new T.Vector3();
  function laneClear(s, lane) {
    for (let k = 0; k < 7; k++) {
      onLoop(s + 0.6 + k * 0.5, lane, probe);
      if (people.some((p) => p.root.visible && Math.hypot(p.root.position.x - probe.x, p.root.position.z - probe.z) < 1.05)) return false;
    }
    return true;
  }
  // Pods are solid for walkers: obstacles plus a small box per visible pod.
  const podBoxes = couriers.map(() => ({ x: 0, z: 0, w: 0.85, d: 0.85 }));
  function withPods() {
    couriers.forEach((c, i) => {
      podBoxes[i].x = c.visible ? c.position.x : 1e4;
      podBoxes[i].z = c.position.z;
    });
    return obstacles.concat(podBoxes);
  }
  function driveCouriers(dt) {
    if (!dt) return;
    couriers.forEach((cart) => {
      const d = cart.userData.drive,
        queued = couriers.some((other) => {
          if (other === cart) return false;
          const o = other.userData.drive,
            gap = (((o.s - d.s) % loopLength) + loopLength) % loopLength;
          return gap > 0 && gap < 2.4 && Math.abs(o.lane - d.lane) < 0.8;
        });
      // People close by in any direction: pull over to the far roadside and creep, or wait.
      onLoop(d.s, 0, probe);
      const nearby = people.filter((p) => p.root.visible && Math.hypot(p.root.position.x - probe.x, p.root.position.z - probe.z) < 3.4);
      let lane, speed;
      if (nearby.length) {
        // Pick the side away from the people once, and keep it until they have passed.
        if (!d.pullSide) {
          const side = nearby.reduce(
            (sum, p) => sum + (p.root.position.x - probe.x) * -loopTangent.z + (p.root.position.z - probe.z) * loopTangent.x,
            0,
          );
          d.pullSide = side > 0.3 ? -1 : side < -0.3 ? 1 : Math.sign(d.lane) || 1;
        }
        d.clearFor = 0;
        lane = d.pullSide * 1.9;
        speed = laneClear(d.s, lane) && Math.abs(d.lane - lane) < 0.3 ? 0.45 : 0;
      } else {
        d.clearFor = (d.clearFor || 0) + dt;
        if (d.clearFor > 1) d.pullSide = 0;
        lane = laneClear(d.s, LANES[0]) ? LANES[0] : LANES.find((l) => laneClear(d.s, l));
        speed = lane === undefined ? 0 : POD_SPEED;
        if (lane === undefined) lane = d.lane;
      }
      if (queued) speed = 0;
      d.lane = T.MathUtils.lerp(d.lane, lane, 1 - Math.exp(-dt * 2.2));
      d.v = T.MathUtils.lerp(d.v, speed, 1 - Math.exp(-dt * (speed > d.v ? 1.5 : 6)));
      d.s += d.v * dt;
      onLoop(d.s, d.lane, cart.position);
      cart.position.y = 0.45;
      onLoop(d.s + 0.4, d.lane, probe);
      cart.lookAt(probe.x, 0.45, probe.z);
    });
  }
  couriers.forEach((cart) => {
    onLoop(cart.userData.drive.s, LANES[0], cart.position);
    cart.position.y = 0.45;
  });

  const molecule = sphere(0.28, "#9edee1", 0, 1.3, 29, cityLayer);
  molecule.material = molecule.material.clone();
  molecule.visible = false;
  let moleculeTime = 0,
    moleculeAllowed = true;

  const people = [0, 1, 2, 3, 4].map((i) => createPerson(kit, scene, i));
  const leader = people[0].root;
  const marker = torus(0.95, 0.065, "#D9466F", 0, 0.49, 30.6, cityLayer);
  const beacon = mesh(new T.CylinderGeometry(0.05, 0.5, 6, 12, 1, true), "#F7A8BF", 0, 3.3, 30.6, cityLayer, {
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
  });
  const labelEls = stops.map((s, i) => {
    const el = document.createElement("button");
    el.className = "city-label";
    el.innerHTML = `<span>${String(i + 1).padStart(2, "0")}</span>${s.place}`;
    el.onclick = () => events.select?.(i);
    labels.appendChild(el);
    return el;
  });
  const actorLabel = document.createElement("div");
  actorLabel.className = "actor-label";
  labels.appendChild(actorLabel);
  // Cell diagram replaces the city at the story's final reveal.
  const diagramLabels = [];
  const diagram = new T.Group();
  diagram.visible = false;
  scene.add(diagram);
  const cell = sphere(1, "#F6E3EA", 0, 0.5, 0, diagram);
  cell.scale.set(30, 0.9, 24);
  cell.material = new T.MeshStandardMaterial({ color: "#F6E3EA", transparent: true, opacity: 0.86 });
  const cellRim = torus(29, 0.35, "#D9466F", 0, 0.7, 0, diagram);
  cellRim.scale.y = 0.81;
  const vac = sphere(1, "#9CC6E8", 6, 1.4, 0, diagram);
  vac.scale.set(13, 0.75, 14);
  const nuc = sphere(4, "#4B4FA8", -9, 2, 0, diagram);
  nuc.scale.y = 0.35;
  sphere(1.4, "#2C2F7A", -9, 3, 0, diagram);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const org = sphere(1, i % 2 ? "#D2553A" : "#2E8B57", Math.cos(a) * 23, 1.6, Math.sin(a) * 18, diagram);
    org.scale.set(i % 2 ? 2.3 : 2.6, 0.6, 1.2);
    org.rotation.y = a;
    for (let j = 0; j < 3; j++) {
      const fold = torus(0.65, 0.09, i % 2 ? "#8E2F1F" : "#9CCB4A", 0, 0.4, (j - 1) * 0.45, org);
      fold.scale.x = 0.45;
    }
  }
  // Folded ER, Golgi sacs and small particles complete the labelled biology model.
  for (let i = 0; i < 4; i++) {
    const fold = torus(5 + i * 0.7, 0.18, "#D9A21B", -9, 1.6, 0, diagram);
    fold.scale.y = 0.7;
  }
  for (let i = 0; i < 4; i++) {
    const sac = sphere(1, "#E07A3F", -16 + i * 0.25, 1.6, 9 + i * 0.65, diagram);
    sac.scale.set(2.7, 0.25, 0.45);
  }
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2,
      r = 6 + rnd() * 3;
    sphere(0.18, "#8C5A3C", -9 + Math.cos(a) * r, 2, Math.sin(a) * r, diagram);
  }
  sphere(1.15, "#8E5BB5", -20, 1.7, -8, diagram);
  const modelLabels = [
    ["Cell membrane", -22, -13],
    ["Chloroplast", -23, 1],
    ["Golgi apparatus", -15, 14],
    ["Endoplasmic reticulum", -10, -8],
    ["Ribosomes", -18, -3],
    ["Mitochondrion", 17, -14],
    ["Vacuole", 7, 2],
    ["Lysosome / lytic vacuole", -21, -9],
    ["Nucleus", -9, 1],
  ];
  modelLabels.forEach(([name, x, z]) => {
    const el = document.createElement("div");
    el.className = "diagram-label";
    el.textContent = name;
    el.hidden = true;
    labels.appendChild(el);
    diagramLabels.push({ el, x, z });
  });
  sign("A CELL • MANY PARTS, ONE LIVING SYSTEM", 0, 2, 27, 17, "#1E2440", diagram).rotation.x = -Math.PI / 2;
  let burst = 0;
  const sparks = Array.from({ length: 18 }, (_, i) => {
    const m = sphere(0.065, ["#E59B2E", "#D9466F", "#3A8FC9"][i % 3], 0, 0, 0);
    m.visible = false;
    return m;
  });
  let mode = "follow",
    paused = true,
    story = false,
    done = 0,
    active = 0,
    travelPath = [],
    travelIndex = -1,
    near = -1,
    arrived = -1,
    camHeading = Math.PI,
    yaw = 0,
    pitch = 0.42,
    distance = 8.2,
    drag = null,
    emergency = false,
    broken = new Set(),
    speaker = 0,
    revealTime = 0;
  let freeLookUntil = 0,
    moveHeading = Math.PI,
    userYaw = 0,
    camReach = 20;
  const leaderVel = new T.Vector2();
  const WALK_SPEED = 2.2;
  const history = [leader.position.clone()];
  let worldTime = 0,
    lastStatus = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clearDrag() {
    drag = null;
    pointers.clear();
  }
  // Google-Maps-style 3D exploring. Left-drag grabs the ground under the cursor; right/middle/Ctrl/Alt/Shift-drag
  // orbits around the grabbed point (sideways turns, up/down tilts); wheel and double-click zoom at the cursor;
  // touch: one finger pans, two fingers pinch, twist and slide vertically to tilt. Release keeps a little momentum.
  const pointers = new Map(),
    ndc = new T.Vector2(),
    groundPlane = new T.Plane(new T.Vector3(0, 1, 0), -0.4),
    exteriorPlane = new T.Plane(new T.Vector3(0, 1, 0), 1.2),
    groundHit = new T.Vector3(),
    grab = new T.Vector3(),
    pivot = new T.Vector3();
  const explore = { target: new T.Vector3(0, 0.4, 20), goal: new T.Vector3(0, 0.4, 20), dist: 16, distGoal: 16, yaw: 0, pitch: 0.75 };
  const panVelocity = new T.Vector2();
  let lastPanTime = 0,
    grabbing = false;
  const MIN_PITCH = 0.06,
    MAX_PITCH = 1.5;
  const exploring = () => mode === "explore" || mode === "map";
  function explorePose(target, dist, out) {
    const flat = dist * Math.cos(explore.pitch);
    out.set(target.x + Math.sin(explore.yaw) * flat, target.y + Math.sin(explore.pitch) * dist, target.z + Math.cos(explore.yaw) * flat);
    out.y = Math.max(out.y, 0.95);
    return out;
  }
  // While a finger or mouse is down the camera follows exactly, so the grabbed point stays under the cursor.
  function snapExplore() {
    explore.target.copy(explore.goal);
    explore.dist = explore.distGoal;
    explorePose(explore.target, explore.dist, camera.position);
    temp.copy(explore.target);
    camera.lookAt(temp);
    camera.updateMatrixWorld();
  }
  function groundAt(clientX, clientY, out) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = Infinity;
    let hit = raycaster.ray.intersectPlane(groundPlane, out);
    // Outside the membrane the fluid is lower than the city floor. Aim at its real surface
    // so zooming toward a neighbouring cell keeps that cell under the cursor.
    if (hit && (out.x / 35.3) ** 2 + (out.z / 30.4) ** 2 > 1) hit = raycaster.ray.intersectPlane(exteriorPlane, out);
    // Ignore hits near the horizon: they jump wildly with tiny mouse moves.
    return hit && hit.distanceTo(camera.position) < Math.max(60, explore.dist * 6) ? hit : null;
  }
  function enterExplore() {
    if (exploring() || mode === "reveal") return;
    const offset = camera.position.clone().sub(temp),
      length = Math.max(3, offset.length());
    explore.goal.set(temp.x, 0.4, temp.z);
    explore.target.copy(explore.goal);
    explore.dist = explore.distGoal = length;
    explore.yaw = Math.atan2(offset.x, offset.z);
    explore.pitch = T.MathUtils.clamp(Math.asin(T.MathUtils.clamp(offset.y / length, -1, 1)), MIN_PITCH, MAX_PITCH);
    mode = "explore";
    events.mode?.("explore");
  }
  function moveGoal(dx, dz) {
    explore.goal.x += dx;
    explore.goal.z += dz;
  }
  // Screen-space fallback when the cursor is above the horizon.
  function panBy(dx, dy) {
    const perPixel = (2 * explore.dist * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, host.clientHeight),
      forward = perPixel / Math.max(0.4, Math.sin(explore.pitch)),
      sin = Math.sin(explore.yaw),
      cos = Math.cos(explore.yaw);
    moveGoal(-cos * dx * perPixel - sin * dy * forward, sin * dx * perPixel - cos * dy * forward);
  }
  function orbit(angle, around) {
    const x = explore.goal.x - around.x,
      z = explore.goal.z - around.z,
      c = Math.cos(angle),
      s = Math.sin(angle);
    explore.goal.x = around.x + x * c + z * s;
    explore.goal.z = around.z - x * s + z * c;
    explore.yaw += angle;
  }
  function tilt(amount) {
    explore.pitch = T.MathUtils.clamp(explore.pitch + amount, MIN_PITCH, MAX_PITCH);
  }
  function zoomAt(factor, clientX, clientY) {
    const before = explore.distGoal;
    explore.distGoal = T.MathUtils.clamp(explore.distGoal * factor, 2.5, 90);
    // Zoom in toward the selected detail. Zooming out keeps the current focus instead of
    // flinging the camera away from the cursor and into the map boundary.
    if (clientX === undefined || explore.distGoal >= before || !groundAt(clientX, clientY, groundHit)) return;
    explore.goal.lerp(groundHit.setY(0.4), 1 - explore.distGoal / before);
  }
  window.addEventListener("blur", clearDrag);
  document.addEventListener("visibilitychange", clearDrag);
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (mode === "reveal") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = {
      x: e.clientX,
      y: e.clientY,
      moved: 0,
      turn: e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey,
      started: false,
    };
    panVelocity.set(0, 0);
    grabbing = false;
    if (e.button === 1) e.preventDefault();
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    const last = pointers.get(e.pointerId);
    if (!drag || !last || mode === "reveal") return;
    const dx = e.clientX - last.x,
      dy = e.clientY - last.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 5 && !drag.started) return;
    if (!drag.started) {
      drag.started = true;
      enterExplore();
      snapExplore();
      // Grab/pivot on the ground point where the drag began.
      grabbing = !!groundAt(drag.x, drag.y, grab);
      pivot.copy(grabbing ? grab : explore.goal);
    }
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()],
        other = a.x === e.clientX && a.y === e.clientY ? b : a,
        before = Math.hypot(last.x - other.x, last.y - other.y),
        after = Math.hypot(e.clientX - other.x, e.clientY - other.y),
        twist = Math.atan2(e.clientY - other.y, e.clientX - other.x) - Math.atan2(last.y - other.y, last.x - other.x);
      if (before > 10 && after > 10) zoomAt(before / after);
      orbit(-Math.atan2(Math.sin(twist), Math.cos(twist)), explore.goal.clone());
      tilt(dy * 0.0025);
      grabbing = false;
    } else if (drag.turn) {
      orbit(-dx * 0.006, pivot);
      tilt(dy * 0.004);
    } else {
      snapExplore();
      const before = explore.goal.clone();
      if (grabbing && groundAt(e.clientX, e.clientY, groundHit)) {
        const shift = grab.clone().sub(groundHit).setY(0),
          limit = explore.dist * 0.6;
        if (shift.length() > limit) shift.setLength(limit);
        moveGoal(shift.x, shift.z);
      } else panBy(dx, dy);
      const now = performance.now(),
        gap = Math.max(8, now - lastPanTime) / 1000;
      panVelocity.set((explore.goal.x - before.x) / gap, (explore.goal.z - before.z) / gap).clampLength(0, 40);
      lastPanTime = now;
    }
    snapExplore();
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (performance.now() - lastPanTime > 90) panVelocity.set(0, 0);
    if (!pointers.size) drag = null;
    else if (drag) {
      // Lifting one of two fingers: carry on panning from the remaining one without a jump.
      const [rest] = pointers.values();
      drag = { x: rest.x, y: rest.y, moved: 99, turn: false, started: false };
    }
  };
  renderer.domElement.addEventListener("pointerup", release);
  renderer.domElement.addEventListener("pointercancel", release);
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (mode === "reveal") return;
      enterExplore();
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      zoomAt(T.MathUtils.clamp(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)), 0.74, 1.35), e.clientX, e.clientY);
    },
    { passive: false },
  );
  renderer.domElement.addEventListener("dblclick", (e) => {
    if (mode === "reveal") return;
    enterExplore();
    zoomAt(e.shiftKey ? 2 : 0.5, e.clientX, e.clientY);
  });
  function interact() {
    if (!paused && !story && near >= 0 && near <= done) events.arrive?.(near);
  }
  function toggleMap() {
    if (mode === "reveal") return;
    if (mode === "map") {
      mode = "follow";
      return events.mode?.(mode);
    }
    // Start the city map high above, then let the player drag around it.
    enterExplore();
    explore.goal.set(0, 0.4, 2);
    explore.distGoal = 62;
    explore.pitch = 1.05;
    explore.yaw = 0.35;
    mode = "map";
    events.mode?.(mode);
  }
  function travel(i) {
    active = i;
    if (mode === "map") {
      mode = "follow";
      events.mode?.(mode);
    }
    story = false;
    clearDrag();
    arrived = -1;
    travelIndex = i;
    const d = destinations[i];
    marker.position.set(d.x, 0.49, d.z);
    beacon.position.set(d.x, 3.3, d.z);
    const start = { x: leader.position.x, z: leader.position.z },
      raw = findRoute(start, d, obstacles, done > 0, roads);
    travelPath = raw.length ? smoothRoute([start, ...raw], obstacles, done > 0, 5, roads).slice(1) : [];
    if (!travelPath.length && Math.hypot(leader.position.x - d.x, leader.position.z - d.z) > 1.2) {
      events.blocked?.();
      return false;
    }
    events.mode?.(exploring() ? mode : "guided");
    return true;
  }

  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  const temp = new T.Vector3(),
    look = new T.Vector3(),
    camGoal = new T.Vector3();
  const clock = new T.Clock();
  const raycaster = new T.Raycaster();
  const cameraWalls = obstacles
    .filter((o) => o.w > 1)
    .map((o) => {
      const b = new T.Mesh(new T.BoxGeometry(o.w, 4.5, o.d));
      b.position.set(o.x, 2.3, o.z);
      b.updateMatrixWorld();
      return b;
    });
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!paused) worldTime += dt;
    const t = worldTime;
    const old = leader.position.clone();
    let wantX = 0,
      wantZ = 0;
    if (!paused && !story && mode !== "reveal" && travelPath.length) {
      while (travelPath.length > 1 && Math.hypot(travelPath[0].x - leader.position.x, travelPath[0].z - leader.position.z) < 0.55)
        travelPath.shift();
      const p = travelPath[0],
        len = Math.hypot(p.x - leader.position.x, p.z - leader.position.z);
      if (travelPath.length === 1 && len < 0.06) travelPath.shift();
      else {
        // Ease out over the final metres instead of stopping dead.
        const want = WALK_SPEED * (travelPath.length === 1 ? Math.min(1, 0.25 + len / 1.6) : 1);
        wantX = ((p.x - leader.position.x) / len) * want;
        wantZ = ((p.z - leader.position.z) / len) * want;
      }
    }
    // Crosswalk manners: wait while a delivery pod is right ahead in the walking line.
    if (wantX || wantZ) {
      const len = Math.hypot(wantX, wantZ),
        fx = wantX / len,
        fz = wantZ / len;
      const podAhead = couriers.some((c) => {
        if (!c.visible) return false;
        const rx = c.position.x - leader.position.x,
          rz = c.position.z - leader.position.z,
          ahead = rx * fx + rz * fz,
          across = Math.abs(rx * fz - rz * fx);
        return ahead > -0.2 && ahead < 2 && across < 1.1;
      });
      if (podAhead) wantX = wantZ = 0;
    }
    if (paused || story || mode === "reveal") leaderVel.set(0, 0);
    else {
      const ease = 1 - Math.exp(-dt * (wantX || wantZ ? 3.2 : 6));
      leaderVel.x += (wantX - leaderVel.x) * ease;
      leaderVel.y += (wantZ - leaderVel.y) * ease;
      moveWithCollision(leader.position, leaderVel.x * dt, leaderVel.y * dt, withPods(), done > 0);
    }
    leader.position.y = 0.42;
    const movedX = leader.position.x - old.x,
      movedZ = leader.position.z - old.z;
    animatePerson(people[0], movedX, movedZ, dt, t, 0, reduced);
    if (Math.hypot(leaderVel.x, leaderVel.y) > 0.4) moveHeading = Math.atan2(leaderVel.x, leaderVel.y);
    if (Math.hypot(movedX, movedZ) > 0.001 && history[0].distanceTo(leader.position) > 0.1) {
      history.unshift(leader.position.clone());
      if (history.length > 180) history.pop();
    }
    const loc = locations[active];
    // Pupils walk in two pairs behind the teacher, then gather in an arc facing the stop.
    people.slice(1).forEach((actor, j) => {
      const before = actor.root.position.clone(),
        target = new T.Vector3();
      if (story) {
        let ax = leader.position.x - loc.x,
          az = leader.position.z - loc.z;
        const al = Math.hypot(ax, az) || 1;
        ax /= al;
        az /= al;
        const across = [-1.5, -0.7, 0.7, 1.5][j],
          back = [0.3, 0.95, 0.95, 0.3][j];
        target.set(leader.position.x + az * across + ax * back, 0.42, leader.position.z - ax * across + az * back);
      } else {
        const [back, side] = [
            [1.3, -0.38],
            [1.3, 0.38],
            [2.4, -0.38],
            [2.4, 0.38],
          ][j],
          k = Math.min(history.length - 1, Math.round(back / 0.1)),
          a = history[k],
          b = history[Math.max(0, k - 2)];
        let fx = b.x - a.x,
          fz = b.z - a.z;
        const fl = Math.hypot(fx, fz);
        if (fl > 0.01) {
          fx /= fl;
          fz /= fl;
        } else {
          fx = Math.sin(leader.rotation.y);
          fz = Math.cos(leader.rotation.y);
        }
        target.set(a.x + fz * side, 0.42, a.z - fx * side);
      }
      if (!paused) {
        const tx = target.x - actor.root.position.x,
          tz = target.z - actor.root.position.z,
          len = Math.hypot(tx, tz),
          sp = len < 0.08 ? 0 : Math.min(WALK_SPEED * 1.35, len * 3),
          ease = 1 - Math.exp(-dt * 5);
        actor.vel.x += ((len ? tx / len : 0) * sp - actor.vel.x) * ease;
        actor.vel.y += ((len ? tz / len : 0) * sp - actor.vel.y) * ease;
        moveWithCollision(actor.root.position, actor.vel.x * dt, actor.vel.y * dt, withPods(), done > 0, 0.23);
      } else actor.vel.set(0, 0);
      animatePerson(actor, actor.root.position.x - before.x, actor.root.position.z - before.z, dt, t + j * 0.2, j + 1, reduced);
    });
    // At a stop everyone faces the building; the teacher turns to the class when she speaks.
    const classX = people.slice(1).reduce((sum, p) => sum + p.root.position.x, 0) / 4,
      classZ = people.slice(1).reduce((sum, p) => sum + p.root.position.z, 0) / 4;
    people.forEach((actor, k) => {
      if (story && actor.walk < 0.3) {
        const fx = k === 0 && speaker === 0 ? classX : loc.x,
          fz = k === 0 && speaker === 0 ? classZ : loc.z;
        actor.root.rotation.y = dampAngle(
          actor.root.rotation.y,
          Math.atan2(fx - actor.root.position.x, fz - actor.root.position.z),
          1 - Math.exp(-dt * 4),
        );
      }
      let lookYaw = 0,
        nod = 0;
      if (story) {
        const focus = speaker >= 0 && speaker < 5 && speaker !== k ? people[speaker].root.position : loc,
          angle = Math.atan2(focus.x - actor.root.position.x, focus.z - actor.root.position.z) - actor.root.rotation.y;
        lookYaw = T.MathUtils.clamp(Math.atan2(Math.sin(angle), Math.cos(angle)), -0.9, 0.9);
        if (speaker === k && !reduced) nod = Math.sin(t * 5) * 0.06;
      } else if (actor.walk < 0.2 && !reduced) lookYaw = Math.sin(t * 0.35 + k * 1.7) * 0.35;
      posePerson(actor, { lookYaw, nod, talking: story && speaker === k && !reduced, t, dt });
    });
    let best = -1,
      bestDist = 3;
    destinations.forEach((p, i) => {
      const d = Math.hypot(leader.position.x - p.x, leader.position.z - p.z);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    near = best;
    if (!paused && !story && travelIndex >= 0 && !travelPath.length && near === travelIndex && arrived !== travelIndex) {
      arrived = travelIndex;
      travelIndex = -1;
      events.arrive?.(arrived);
    }
    if (!paused && !story && mode !== "reveal" && near === done && near !== arrived && bestDist < 1.5) {
      arrived = near;
      travelIndex = -1;
      travelPath = [];
      events.arrive?.(near);
    }
    if (moleculeTime > 0) {
      moleculeTime -= dt;
      molecule.visible = true;
      molecule.position.set(-1, 1.4 + Math.sin(t * 4) * 0.1, 29 - (1.8 - moleculeTime) * (moleculeAllowed ? 2.4 : -1.2));
    } else molecule.visible = false;

    driveCouriers(paused ? 0 : dt);
    couriers.forEach((cart) => (cart.visible = !broken.has(2)));
    districts.update(t, dt, { done, broken, reduced, story, active, speaker, mode, leaderPos: leader.position });
    nature.update(t, dt);
    if (burst > 0) burst -= dt;
    sparks.forEach((p, i) => {
      p.visible = burst > 0;
      if (p.visible) {
        const a = (i / 18) * Math.PI * 2,
          r = (2 - burst) * 1.8;
        p.position.set(leader.position.x + Math.cos(a) * r, 1 + (2 - burst) * 1.8, leader.position.z + Math.sin(a) * r);
        p.scale.setScalar(Math.max(0.1, burst));
      }
    });
    lamps.forEach((p, i) => (p.material.emissiveIntensity = broken.has(5) ? 0.05 : done > 5 ? 1.7 + 0.2 * Math.sin(t + i) : 0.65));

    marker.visible = mode !== "reveal" && !story;
    beacon.visible = marker.visible;
    marker.rotation.z = t * 0.5;
    if (emergency && !reduced) sun.intensity = 2.2 + Math.sin(t * 4) * 0.4;
    else sun.intensity = 3.3;
    if (exploring()) {
      if (!pointers.size && panVelocity.lengthSq() > 0.0001) {
        moveGoal(panVelocity.x * dt, panVelocity.y * dt);
        panVelocity.multiplyScalar(Math.exp(-dt * 4.5));
      }
      // Keep the view within the detailed tissue, including the cells outside the membrane.
      const reach = Math.hypot(explore.goal.x / 96, explore.goal.z / 84);
      if (reach > 1) explore.goal.set(explore.goal.x / reach, 0.4, explore.goal.z / reach);
      const ease = 1 - Math.exp(-dt * 10);
      explore.target.lerp(explore.goal, ease);
      explore.dist = T.MathUtils.lerp(explore.dist, explore.distGoal, ease);
      look.copy(explore.target);
      explorePose(explore.target, explore.dist, camGoal);
    } else if (mode === "reveal") {
      revealTime += dt;
      camGoal.set(0, 68, 24);
      look.set(0, 0, 0);
      if (revealTime > 2.2) {
        cityLayer.visible = false;
        diagram.visible = true;
        people.forEach((p) => (p.root.visible = false));
      }
    } else {
      if (story) {
        // Three-quarter shot that frames the class and the building they are visiting.
        const classX = people.reduce((sum, p) => sum + p.root.position.x, 0) / 5,
          classZ = people.reduce((sum, p) => sum + p.root.position.z, 0) / 5,
          stop = locations[active];
        let ax = classX - stop.x,
          az = classZ - stop.z;
        const al = Math.hypot(ax, az) || 1;
        ax /= al;
        az /= al;
        const back = (active === 8 ? 5.2 : 6.6) * (camera.aspect < 1 ? 1.4 : 1);
        camGoal.set(classX + ax * back + az * 2.6, 3.4, classZ + az * back - ax * 2.6);
        look.set(classX * 0.55 + stop.x * 0.45, 1.5, classZ * 0.55 + stop.z * 0.45);
      } else {
        // Trail behind the class along its smoothed walking direction; a manual look-around drifts back.
        if (!drag && worldTime >= freeLookUntil) userYaw = dampAngle(userYaw, 0, 1 - Math.exp(-dt * 1.2));
        camHeading = dampAngle(camHeading, moveHeading, reduced ? 1 : 1 - Math.exp(-dt * 1.6));
        yaw = camHeading + Math.PI + userYaw;
        look.set(leader.position.x + Math.sin(camHeading) * 1.4, 1.35, leader.position.z + Math.cos(camHeading) * 1.4);
        const flat = distance * Math.cos(pitch) * (camera.aspect < 1 ? 1.25 : 1);
        camGoal.set(
          look.x + Math.sin(yaw) * flat + Math.cos(yaw) * 1.1,
          1.95 + Math.sin(pitch) * distance,
          look.z + Math.cos(yaw) * flat - Math.sin(yaw) * 1.1,
        );
      }
      // Rise over the membrane gate arch instead of flying through its sign.
      const archZone = Math.max(0, 1 - Math.abs(camGoal.z - 27.5) / 5) * Math.max(0, 1 - Math.abs(camGoal.x) / 7);
      if (archZone > 0) camGoal.y = T.MathUtils.lerp(camGoal.y, Math.max(camGoal.y, 9), Math.min(1, archZone * 1.6));
      const direction = camGoal.clone().sub(look),
        len = direction.length();
      direction.normalize();
      raycaster.set(look, direction);
      raycaster.far = len;
      const hit = raycaster.intersectObjects(cameraWalls, false)[0],
        allowed = hit && hit.distance > 1 ? Math.max(1.5, hit.distance - 0.4) : len;
      // Pull in quickly when a building blocks the view, ease back out slowly.
      camReach = T.MathUtils.lerp(camReach, allowed, 1 - Math.exp(-dt * (allowed < camReach ? 10 : 1.5)));
      camGoal.copy(look).addScaledVector(direction, Math.min(len, camReach));
    }
    const camRate = exploring() ? (pointers.size ? 1000 : 14) : mode === "reveal" ? 2.2 : story ? 1.6 : 3;
    camera.position.lerp(camGoal, reduced ? 1 : 1 - Math.exp(-dt * camRate));
    temp.lerp(look, reduced ? 1 : 1 - Math.exp(-dt * camRate * 1.4));
    camera.lookAt(temp);
    diagramLabels.forEach(({ el, x, z }) => {
      el.hidden = !diagram.visible;
      const v = new T.Vector3(x, 3, z).project(camera);
      el.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * host.clientWidth}px,${(-v.y * 0.5 + 0.5) * host.clientHeight}px)`;
    });
    labelEls.forEach((el, i) => {
      const l = locations[i],
        d = Math.hypot(leader.position.x - l.x, leader.position.z - l.z),
        v = new T.Vector3(l.x, i === 8 ? 10 : 6, l.z).project(camera);
      el.hidden = mode === "reveal" || (!exploring() && (d > 15 || story)) || v.z < 0 || v.z > 1;
      el.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * host.clientWidth}px,${(-v.y * 0.5 + 0.5) * host.clientHeight}px)`;
    });
    const who = people[Math.max(0, Math.min(4, speaker))],
      v = who.root.position
        .clone()
        .add(new T.Vector3(0, who.h + 0.35, 0))
        .project(camera);
    actorLabel.hidden = mode === "map" || mode === "reveal" || !story || speaker === 5 || v.z < 0 || v.z > 1;
    actorLabel.textContent = who.name;
    actorLabel.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * host.clientWidth}px,${(-v.y * 0.5 + 0.5) * host.clientHeight}px)`;
    if (t - lastStatus > 0.15) {
      lastStatus = t;
      host.dataset.x = leader.position.x.toFixed(2);
      host.dataset.z = leader.position.z.toFixed(2);
      host.dataset.cameraX = camera.position.x.toFixed(2);
      host.dataset.cameraZ = camera.position.z.toFixed(2);
      host.dataset.mode = mode;
      host.dataset.travel = String(travelIndex);
      // Closest any delivery pod gets to a person (read by browser checks).
      host.dataset.podGap = Math.min(
        ...couriers.flatMap((c) => people.map((p) => Math.hypot(c.position.x - p.root.position.x, c.position.z - p.root.position.z))),
      ).toFixed(2);
      events.status?.({
        x: leader.position.x,
        z: leader.position.z,
        near,
        mode,
        guided: travelPath.length > 0,
        heading: exploring() ? explore.yaw : Math.atan2(camera.position.x - temp.x, camera.position.z - temp.z),
        distance: Math.hypot(leader.position.x - destinations[active].x, leader.position.z - destinations[active].z),
      });
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return {
    available: true,
    setProgress(n, a) {
      done = n;
      active = a;
      labelEls.forEach((el, i) => {
        el.classList.toggle("locked", i > done);
        el.classList.toggle("visited", i < done);
        el.classList.toggle("current", i === active);
        el.disabled = i > done;
      });
    },
    travel,
    interact,
    setPaused(value) {
      paused = value;
      clearDrag();
    },
    setStory(value) {
      story = value;
      clearDrag();
      if (value) {
        travelPath = [];
        travelIndex = -1;
      }
    },
    setSpeaker(name) {
      speaker = ["teacher", "aria", "ben", "zoya", "leo", "organelle"].indexOf(name);
    },
    overview: toggleMap,
    follow() {
      mode = "follow";
      panVelocity.set(0, 0);
      userYaw = 0;
    },
    faceNorth() {
      enterExplore();
      orbit(Math.atan2(Math.sin(-explore.yaw), Math.cos(-explore.yaw)), explore.goal.clone());
    },
    toggleTilt() {
      enterExplore();
      explore.pitch = explore.pitch < 1.2 ? 1.45 : 0.55;
      return explore.pitch > 1.2 ? "2d" : "3d";
    },
    heading() {
      return exploring() ? explore.yaw : camera.rotation.y;
    },
    zoom(f) {
      if (exploring()) return zoomAt(f);
      distance = T.MathUtils.clamp(distance * f, 4, 13);
    },
    celebrate() {
      burst = 2;
    },
    setEmergency(value) {
      emergency = value;
      broken = value ? new Set([5, 2, 4, 0, 7, 1]) : new Set();
    },
    repair(i) {
      broken.delete(i);
    },
    demonstrate(i, part = 0) {
      if (i === 0) {
        moleculeTime = 1.8;
        moleculeAllowed = part !== 2;
        molecule.material.color.set(moleculeAllowed ? "#87d9df" : "#bd7867");
      }
      districts.demonstrate(i, part);
    },
    reveal() {
      clearDrag();
      travelPath = [];
      mode = "reveal";
      story = true;
      emergency = false;
      broken.clear();
      revealTime = 0;
    },
    reset() {
      done = 0;
      active = 0;
      mode = "follow";
      paused = false;
      story = false;
      travelIndex = -1;
      travelPath = [];
      arrived = -1;
      leader.position.set(0, 0.42, 32);
      people.forEach((p, i) => {
        p.root.visible = true;
        p.root.position.set(0, 0.42, 32 + i * 0.6);
      });
      history.splice(0, history.length, leader.position.clone());
      cityLayer.visible = true;
      diagram.visible = false;
      emergency = false;
      broken.clear();
      yaw = 0;
      camHeading = Math.PI;
      moveHeading = Math.PI;
      userYaw = 0;
      leaderVel.set(0, 0);
      people.forEach((p) => {
        p.root.rotation.y = Math.PI;
        p.vel.set(0, 0);
      });
    },
    getPosition() {
      return { x: leader.position.x, z: leader.position.z };
    },
  };
}
