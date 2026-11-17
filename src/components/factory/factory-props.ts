import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Procedural factory props (no downloaded models): every machine is built from a few primitives with
 * shared materials, which keeps the scene light enough for laptops and phones. Units are metres.
 */

const std = (color: number, roughness = 0.7, metalness = 0.05, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const MAT = {
  steel: std(0xc7ccd1, 0.32, 0.85),
  darkSteel: std(0x4b5563, 0.45, 0.7),
  yellow: std(0xf2b705, 0.55, 0.15),
  rack: std(0x2f6fb0, 0.6, 0.35),
  pallet: std(0xa47148, 0.85),
  sack: std(0xe9dfc8, 0.95),
  carton: std(0xb98a55, 0.9),
  pouch: std(0xd97706, 0.45, 0.1),
  oil: std(0xd9a514, 0.2, 0.1, { transparent: true, opacity: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.35 }),
  wall: std(0xe5e7eb, 0.9),
  wallDark: std(0x9ca3af, 0.9),
  belt: std(0x1f2937, 0.85),
  rubber: std(0x111827, 0.9),
  white: std(0xf8fafc, 0.6),
  bin: std(0xdc2626, 0.6),
  binLid: std(0x15803d, 0.6),
  spiral: std(0xc8873a, 0.75),
  screen: std(0x0f172a, 0.3, 0.2, { emissive: 0x1e3a8a, emissiveIntensity: 0.6 }),
  truckCab: std(0x1d4ed8, 0.4, 0.3),
  truckBox: std(0xf1f5f9, 0.6, 0.1),
  tyre: std(0x0b0b0b, 0.95),
};

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rounded = 0) {
  const geo = rounded ? new RoundedBoxGeometry(w, h, d, 2, rounded) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Four legs under a rectangular top. */
function legs(group: THREE.Group, w: number, d: number, h: number, mat = MAT.darkSteel) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box(0.12, h, 0.12, mat, (sx * w) / 2 - sx * 0.1, 0, (sz * d) / 2 - sz * 0.1));
}

export function pallet(x = 0, z = 0) {
  const g = new THREE.Group();
  g.add(box(1.2, 0.14, 1.0, MAT.pallet));
  g.position.set(x, 0, z);
  return g;
}

/** Instanced countable props (sacks, bins, boxes, cartons). `count` is set from live data. */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, slots: THREE.Vector3[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, slots.length);
  const m = new THREE.Matrix4();
  slots.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.count = 0;
  return mesh;
}

/** Storage rack: uprights + shelves. Returns shelf top positions for stocking it. */
export function rack(levels: number, bays: number, bayW = 1.4, depth = 1.1, levelH = 1.1) {
  const g = new THREE.Group();
  const width = bays * bayW;
  for (let b = 0; b <= bays; b++) for (const sz of [-1, 1]) g.add(box(0.08, levels * levelH + 0.2, 0.08, MAT.rack, -width / 2 + b * bayW, 0, (sz * depth) / 2));
  const shelves: THREE.Vector3[] = [];
  for (let l = 0; l < levels; l++) {
    const y = 0.15 + l * levelH;
    g.add(box(width, 0.06, depth, MAT.darkSteel, 0, y, 0));
    for (let b = 0; b < bays; b++) shelves.push(new THREE.Vector3(-width / 2 + bayW * (b + 0.5), y + 0.06, 0));
  }
  return { group: g, shelves };
}

/** A vertical level gauge (glass tube with a coloured fill). setLevel(0–1) and setColor(hex). */
export function levelGauge(height = 3, radius = 0.22) {
  const g = new THREE.Group();
  const tube = cyl(radius, radius, height, MAT.glass);
  tube.castShadow = false;
  g.add(tube);
  const fillMat = std(0x22c55e, 0.4, 0.1, { emissive: 0x22c55e, emissiveIntensity: 0.35 });
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 1, 16), fillMat);
  g.add(fill);
  g.add(cyl(radius * 1.25, radius * 1.25, 0.12, MAT.darkSteel, 0, height, 0));
  g.add(cyl(radius * 1.25, radius * 1.25, 0.12, MAT.darkSteel, 0, -0.06, 0));
  const setLevel = (r: number) => {
    const h = Math.max(0.02, Math.min(1, r)) * height;
    fill.scale.y = h;
    fill.position.y = h / 2;
    fill.visible = r > 0;
  };
  const setColor = (hex: number) => {
    fillMat.color.setHex(hex);
    fillMat.emissive.setHex(hex);
  };
  setLevel(0);
  return { group: g, setLevel, setColor };
}

export function silo(x: number, z: number) {
  const g = new THREE.Group();
  g.add(cyl(1.2, 1.2, 4.2, MAT.steel, 0, 1.8, 0, 32));
  g.add(cyl(1.2, 0.25, 1.2, MAT.steel, 0, 0.6, 0, 32));
  g.add(cyl(0.05, 1.25, 0.6, MAT.steel, 0, 6.0, 0, 32));
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) g.add(box(0.12, 2.4, 0.12, MAT.darkSteel, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0));
  g.position.set(x, 0, z);
  return g;
}

export function tank(x: number, z: number, radius = 1.0, height = 3.2) {
  const g = new THREE.Group();
  g.add(cyl(radius, radius, height, MAT.steel, 0, 0.3, 0, 32));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.steel);
  dome.position.y = height + 0.3;
  dome.castShadow = true;
  g.add(dome);
  g.add(box(radius * 2.1, 0.3, radius * 2.1, MAT.darkSteel));
  // Outlet pipe heading towards the production hall.
  const pipe = cyl(0.08, 0.08, 2.0, MAT.darkSteel);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(radius + 0.9, 0.7, 0);
  g.add(pipe);
  g.position.set(x, 0, z);
  return g;
}

/** Dough mixer: stainless bowl on a frame with a motor head and a paddle that turns while running. */
export function mixer() {
  const g = new THREE.Group();
  legs(g, 2.2, 2.2, 1.0);
  g.add(box(2.4, 0.15, 2.4, MAT.darkSteel, 0, 1.0, 0));
  g.add(cyl(1.0, 0.8, 1.3, MAT.steel, 0, 1.15, 0, 32));
  g.add(box(0.5, 2.8, 0.5, MAT.darkSteel, -1.3, 0, 0));
  g.add(box(1.8, 0.6, 0.7, MAT.yellow, -0.5, 2.8, 0, 0.08));
  const paddle = new THREE.Group();
  paddle.add(cyl(0.06, 0.06, 1.4, MAT.steel, 0, -1.4, 0));
  paddle.add(box(1.1, 0.12, 0.12, MAT.steel, 0, -1.35, 0));
  paddle.position.set(0, 2.8, 0);
  g.add(paddle);
  return { group: g, paddle };
}

/** Continuous fryer: long oil bath under an extraction hood with a duct to the roof. */
export function fryer() {
  const g = new THREE.Group();
  legs(g, 5.6, 1.8, 0.9);
  g.add(box(5.8, 0.8, 2.0, MAT.steel, 0, 0.9, 0));
  const oilSurface = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.6), MAT.oil);
  oilSurface.rotation.x = -Math.PI / 2;
  oilSurface.position.set(0, 1.71, 0);
  g.add(oilSurface);
  g.add(box(6.0, 0.5, 2.4, MAT.steel, 0, 3.1, 0));
  g.add(box(6.0, 0.08, 2.4, MAT.darkSteel, 0, 3.05, 0));
  g.add(cyl(0.45, 0.45, 2.6, MAT.steel, 1.8, 3.6, 0));
  // Extruder head that presses the spirals at the input end.
  g.add(box(0.9, 1.4, 1.2, MAT.yellow, -3.2, 1.7, 0, 0.08));
  g.add(cyl(0.3, 0.2, 0.5, MAT.steel, -2.6, 2.5, 0));
  // Burner box (gas).
  g.add(box(1.0, 0.7, 0.6, MAT.darkSteel, 2.4, 0, 1.3));
  return { group: g };
}

/** Steam/vapour puffs above the fryer while a run is in progress. */
export function steam(count = 40) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 5;
    pos[i * 3 + 1] = Math.random() * 1.2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
    seeds[i] = Math.random();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.35, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.position.y = 1.8;
  const tick = (t: number) => {
    for (let i = 0; i < count; i++) {
      const p = (seeds[i] + t * 0.25) % 1;
      pos[i * 3 + 1] = p * 1.3;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { points, tick };
}

class SpiralCurve extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const theta = t * 3 * Math.PI * 2;
    const r = 0.04 + (0.05 * theta) / (Math.PI * 2);
    return target.set(Math.cos(theta) * r, Math.sin(theta) * r, 0);
  }
}

/** A murukku spiral: the product being made, used on the cooling belt and in the packing hopper. */
export const spiralGeometry = new THREE.TubeGeometry(new SpiralCurve(), 90, 0.035, 6, false).rotateX(-Math.PI / 2);

/** Cooling conveyor with overhead fans; spirals travel along it only while a run is in progress. */
export function coolingConveyor(length = 6.6) {
  const g = new THREE.Group();
  legs(g, length, 1.2, 0.9);
  g.add(box(length, 0.18, 1.3, MAT.belt, 0, 0.9, 0));
  g.add(box(length, 0.1, 0.08, MAT.steel, 0, 1.08, 0.65));
  g.add(box(length, 0.1, 0.08, MAT.steel, 0, 1.08, -0.65));
  const fans: THREE.Group[] = [];
  for (const x of [-2.2, 0, 2.2]) {
    g.add(box(0.1, 1.6, 0.1, MAT.darkSteel, x, 1.08, 0.75));
    const fan = new THREE.Group();
    fan.add(cyl(0.55, 0.55, 0.12, MAT.darkSteel, 0, -0.06, 0, 24));
    for (let b = 0; b < 4; b++) {
      const blade = box(0.9, 0.02, 0.18, MAT.white, 0, -0.01, 0);
      blade.rotation.y = (b * Math.PI) / 4;
      fan.add(blade);
    }
    fan.position.set(x, 2.9, 0);
    g.add(fan);
    fans.push(fan);
  }
  const spirals = new THREE.InstancedMesh(spiralGeometry, MAT.spiral, 18);
  spirals.castShadow = true;
  g.add(spirals);
  const m = new THREE.Matrix4();
  const tick = (t: number, running: boolean) => {
    for (const f of fans) if (running) f.rotation.y = t * 6;
    spirals.count = running ? 18 : 0;
    if (!running) return;
    for (let i = 0; i < 18; i++) {
      const row = i % 2;
      const x = (((i / 18) * length + t * 0.6) % length) - length / 2;
      spirals.setMatrixAt(i, m.makeTranslation(x, 1.13, row ? 0.3 : -0.3));
    }
    spirals.instanceMatrix.needsUpdate = true;
  };
  return { group: g, tick };
}

/** Vertical form-fill-seal packing machine with a hopper, plus a carton-packing table. */
export function packingMachine() {
  const g = new THREE.Group();
  g.add(box(2.0, 2.6, 1.8, MAT.white, 0, 0, 0, 0.1));
  g.add(box(2.02, 0.5, 1.82, MAT.yellow, 0, 2.0, 0));
  g.add(cyl(0.9, 0.25, 1.1, MAT.steel, 0, 2.6, 0, 24));
  g.add(box(0.7, 0.5, 0.06, MAT.screen, 0.4, 1.4, 0.92));
  // Discharge chute and take-away belt.
  g.add(box(2.6, 0.12, 0.8, MAT.belt, 2.0, 0.8, 0));
  g.add(box(2.6, 0.8, 0.1, MAT.darkSteel, 2.0, 0, 0.35));
  const pouches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.4, 0.08), MAT.pouch, 6);
  pouches.castShadow = true;
  g.add(pouches);
  // Carton table.
  const table = new THREE.Group();
  legs(table, 1.8, 1.2, 0.85);
  table.add(box(1.9, 0.08, 1.3, MAT.steel, 0, 0.85, 0));
  table.add(box(0.7, 0.55, 0.5, MAT.carton, -0.3, 0.93, 0));
  table.position.set(4.2, 0, 0);
  g.add(table);
  const m = new THREE.Matrix4();
  const tick = (t: number, running: boolean) => {
    pouches.count = running ? 6 : 0;
    if (!running) return;
    for (let i = 0; i < 6; i++) {
      const x = 0.9 + ((i / 6) * 2.4 + t * 0.5) % 2.4;
      pouches.setMatrixAt(i, m.makeTranslation(x, 1.12, 0));
    }
    pouches.instanceMatrix.needsUpdate = true;
  };
  return { group: g, tick };
}

/** Quality-control bench: weighing scale, sample trays and a monitor. */
export function qcBench() {
  const g = new THREE.Group();
  legs(g, 3.2, 1.2, 0.9);
  g.add(box(3.4, 0.08, 1.3, MAT.white, 0, 0.9, 0));
  g.add(box(0.6, 0.12, 0.5, MAT.darkSteel, -1.0, 0.98, 0));
  g.add(box(0.5, 0.04, 0.4, MAT.steel, -1.0, 1.1, 0));
  for (const x of [0, 0.6]) g.add(box(0.45, 0.06, 0.35, MAT.steel, x, 0.98, -0.2));
  for (const x of [0.05, 0.6]) {
    const s = new THREE.Mesh(spiralGeometry, MAT.spiral);
    s.position.set(x, 1.06, -0.2);
    g.add(s);
  }
  g.add(box(0.08, 0.5, 0.08, MAT.darkSteel, 1.2, 0.98, 0.3));
  g.add(box(0.9, 0.55, 0.05, MAT.screen, 1.2, 1.35, 0.3));
  return { group: g };
}

/** Production control desk with monitors (anchor for the "Production hall" department). */
export function controlDesk() {
  const g = new THREE.Group();
  g.add(box(4.0, 0.9, 1.0, MAT.darkSteel, 0, 0, 0, 0.05));
  for (const x of [-1.2, 0, 1.2]) {
    g.add(box(0.06, 0.4, 0.06, MAT.darkSteel, x, 0.9, 0.1));
    g.add(box(1.0, 0.6, 0.05, MAT.screen, x, 1.25, 0.1));
  }
  // Wall display board behind the desk.
  g.add(box(5.0, 2.0, 0.12, MAT.screen, 0, 1.6, -1.6));
  g.add(box(0.12, 1.6, 0.12, MAT.darkSteel, -2.2, 0, -1.6));
  g.add(box(0.12, 1.6, 0.12, MAT.darkSteel, 2.2, 0, -1.6));
  return { group: g };
}

export function forklift() {
  const g = new THREE.Group();
  g.add(box(1.1, 0.7, 1.8, MAT.yellow, 0, 0.25, 0, 0.08));
  g.add(box(1.0, 0.08, 0.08, MAT.darkSteel, 0, 1.9, -0.2));
  for (const sx of [-0.45, 0.45]) g.add(box(0.06, 1.7, 0.06, MAT.darkSteel, sx, 0.25, 0.4));
  for (const sx of [-0.45, 0.45]) g.add(box(0.06, 1.7, 0.06, MAT.darkSteel, sx, 0.25, -0.5));
  g.add(box(0.08, 2.2, 0.08, MAT.darkSteel, -0.3, 0.25, 1.0));
  g.add(box(0.08, 2.2, 0.08, MAT.darkSteel, 0.3, 0.25, 1.0));
  for (const sx of [-0.25, 0.25]) g.add(box(0.12, 0.05, 1.0, MAT.darkSteel, sx, 0.15, 1.6));
  for (const [x, z] of [[-0.55, -0.6], [0.55, -0.6], [-0.55, 0.6], [0.55, 0.6]]) {
    const w = cyl(0.25, 0.25, 0.2, MAT.tyre, x, 0, z, 16);
    w.rotation.z = Math.PI / 2;
    w.position.y = 0.25;
    g.add(w);
  }
  return g;
}

/** Delivery truck backed up to a dock door; only shown when invoices are waiting to be loaded. */
export function truck() {
  const g = new THREE.Group();
  g.add(box(2.4, 1.8, 2.3, MAT.truckCab, 0, 0.6, 0, 0.12));
  g.add(box(1.0, 0.8, 2.1, MAT.glass, -0.75, 1.5, 0));
  g.add(box(6.0, 2.8, 2.5, MAT.truckBox, 4.3, 0.6, 0, 0.06));
  g.add(box(9.0, 0.3, 1.6, MAT.darkSteel, 3.2, 0.35, 0));
  for (const x of [0, 3.4, 5.6]) {
    for (const z of [-1.1, 1.1]) {
      const w = cyl(0.5, 0.5, 0.35, MAT.tyre, x, 0, z, 18);
      w.rotation.x = Math.PI / 2;
      w.position.y = 0.5;
      g.add(w);
    }
  }
  return g;
}

/** Dock leveller platform and roll-up door frame. */
export function dockDoor(open: boolean) {
  const g = new THREE.Group();
  g.add(box(0.25, 4.2, 0.25, MAT.darkSteel, 0, 0, -1.7));
  g.add(box(0.25, 4.2, 0.25, MAT.darkSteel, 0, 0, 1.7));
  g.add(box(0.3, 0.6, 3.7, MAT.darkSteel, 0, 3.6, 0));
  g.add(box(0.12, open ? 0.6 : 3.6, 3.2, MAT.wallDark, 0, open ? 3.0 : 0, 0));
  return g;
}
