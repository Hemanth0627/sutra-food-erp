import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import {
  DEPARTMENT_BY_ID,
  DEPARTMENT_IDS,
  STATUS_GLYPH,
  STATUS_HEX,
  STATUS_LABEL,
  type DepartmentId,
  type DeptStatus,
  type FactorySnapshot,
} from "@/lib/factory";
import {
  MAT,
  box,
  controlDesk,
  coolingConveyor,
  dockDoor,
  forklift,
  fryer,
  instanced,
  levelGauge,
  mixer,
  packingMachine,
  pallet,
  qcBench,
  rack,
  silo,
  steam,
  tank,
  truck,
} from "./factory-props";

/**
 * Interactive 3D digital twin of the Thenmalai Snacks factory, built procedurally with Three.js.
 *
 * Data flow: the React page polls /api/factory and calls `update(snapshot)`. Each department's
 * status (green / amber / red / grey) colours its floor outline and beacon and is written into its
 * HTML label as text; stock levels drive gauges and the number of sacks, bins, boxes and cartons;
 * machines only animate while a production run is actually IN_PROGRESS; the truck only appears while
 * invoices are waiting to be dispatched. Nothing is animated or counted without a database record.
 */

export interface FactoryScene {
  update(snapshot: FactorySnapshot): void;
  /** Landing-page mode: no live data, neutral outlines, illustrative stock. */
  showcase(): void;
  select(id: DepartmentId | null, fly?: boolean): void;
  focus(id: DepartmentId, seconds?: number): void;
  resetView(): void;
  setLighting(mode: "day" | "night"): void;
  setFreeCamera(on: boolean): void;
  resize(width: number, height: number): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

interface Zone {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Floor layer: 0 = hall, 1 = area inside the hall. */
  layer: number;
  label: [number, number, number];
}

/** Floor plan in metres (x → right, z → towards the viewer). Material flows left to right. */
const ZONES: Record<DepartmentId, Zone> = {
  flour: { x: -27.5, z: -11, w: 7, d: 12, layer: 1, label: [-27.5, 7.6, -11] },
  oil: { x: -19.5, z: -11, w: 7, d: 12, layer: 1, label: [-19.5, 5.2, -11] },
  spice: { x: -27.5, z: 2, w: 7, d: 8, layer: 1, label: [-27.5, 4.4, 2] },
  "packaging-store": { x: -19.5, z: 2, w: 7, d: 8, layer: 1, label: [-19.5, 6.2, 2] },
  "raw-warehouse": { x: -23.5, z: 12.4, w: 15, d: 9.6, layer: 1, label: [-23.5, 3.6, 12.4] },
  production: { x: 2, z: 0, w: 33, d: 35.4, layer: 0, label: [-4, 4.4, 8] },
  mixing: { x: -10, z: -10, w: 7, d: 9, layer: 1, label: [-10, 4.6, -10] },
  frying: { x: -2, z: -10, w: 8.6, d: 9, layer: 1, label: [-2, 7.2, -10] },
  cooling: { x: 6.1, z: -10, w: 7.4, d: 9, layer: 1, label: [6.1, 4.6, -10] },
  packing: { x: 14, z: -10, w: 7.6, d: 9, layer: 1, label: [14, 7.2, -10] },
  qc: { x: 12, z: 5, w: 8, d: 7, layer: 1, label: [12, 3.4, 5] },
  "fg-warehouse": { x: 26, z: -8, w: 11, d: 18, layer: 1, label: [26, 4.6, -8] },
  dispatch: { x: 26, z: 11, w: 11, d: 13, layer: 1, label: [26, 3.6, 11] },
};

const NEUTRAL = 0xa1a1aa;
const DEFAULT_TARGET = new THREE.Vector3(2, 0, 2);
/** Overview looks straight down the hall; department close-ups add a slight yaw for depth. */
const OVERVIEW_DIR = new THREE.Vector3(0, 0.84, 0.54).normalize();
/** On portrait screens the overview looks along the plant's long axis (stores at the top). */
const PORTRAIT_DIR = new THREE.Vector3(0.54, 0.84, 0).normalize();
const VIEW_DIR = new THREE.Vector3(0.18, 0.8, 0.58).normalize();

interface DeptRuntime {
  group: THREE.Group;
  border: THREE.MeshBasicMaterial;
  inner: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  lampMesh: THREE.Mesh;
  label: HTMLButtonElement;
  status: DeptStatus;
  running: boolean;
}

export function createFactoryScene(
  container: HTMLElement,
  opts: { reducedMotion: boolean; lowPower: boolean; onSelect: (id: DepartmentId | null) => void },
): FactoryScene {
  // ── Renderer, camera, controls ──
  const renderer = new THREE.WebGLRenderer({ antialias: !opts.lowPower, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !opts.lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.style.position = "absolute";
  labels.domElement.style.inset = "0";
  labels.domElement.style.pointerEvents = "none";
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  // A neutral studio environment so stainless-steel machines read as metal rather than flat grey.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.target.copy(DEFAULT_TARGET);
  let freeCamera = false;
  const applyLimits = () => {
    controls.minDistance = freeCamera ? 3 : 9;
    controls.maxDistance = freeCamera ? 220 : 170;
    controls.maxPolarAngle = freeCamera ? Math.PI / 2 - 0.04 : 1.18;
  };
  applyLimits();

  // ── Lighting ──
  const hemi = new THREE.HemisphereLight(0xf8fafc, 0x6b7280, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
  sun.position.set(-18, 40, 22);
  sun.castShadow = !opts.lowPower;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const nightLamps: THREE.PointLight[] = [];
  const lampPanelMat = new THREE.MeshStandardMaterial({ color: 0x52525b, emissive: 0xfff1d6, emissiveIntensity: 0 });
  for (const [x, z] of [[-24, -6], [-24, 10], [-6, -9], [8, -9], [2, 7], [26, -8], [26, 11]]) {
    const light = new THREE.PointLight(0xffe7c2, 0, 26, 1.6);
    light.position.set(x, 7, z);
    scene.add(light);
    nightLamps.push(light);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.5), lampPanelMat);
    panel.position.set(x, 7.6, z);
    scene.add(panel);
  }

  // ── Building shell ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 36), new THREE.MeshStandardMaterial({ color: 0x8d949b, roughness: 0.85, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(140, 100), new THREE.MeshStandardMaterial({ color: 0x5b6168, roughness: 1 }));
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = -0.02;
  yard.receiveShadow = true;
  scene.add(yard);
  const wallMat = MAT.wall;
  const wall = (x1: number, z1: number, x2: number, z2: number, h = 3.2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = box(len, h, 0.3, wallMat, 0, 0, 0);
    m.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    scene.add(m);
  };
  wall(-32, -18, 32, -18);
  wall(-32, -18, -32, 18);
  wall(-32, 18, -25.5, 18);
  wall(-21.5, 18, 32, 18);
  wall(32, -18, 32, 5.6);
  wall(32, 16.4, 32, 18);
  wall(-15.6, -18, -15.6, -4.5, 2.4);
  wall(-15.6, -0.5, -15.6, 18, 2.4);
  wall(19.4, -18, 19.4, -2, 2.4);
  wall(19.4, 2, 19.4, 18, 2.4);
  // Receiving door (raw materials) and dock doors (dispatch).
  const recvDoor = dockDoor(true);
  recvDoor.rotation.y = Math.PI / 2;
  recvDoor.position.set(-23.5, 0, 18);
  scene.add(recvDoor);
  // Walkway markings.
  const marking = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.006, z);
    scene.add(m);
  };
  marking(2, -3.2, 32, 0.18);
  marking(2, 0.4, 32, 0.18);
  marking(-23.5, 7.2, 15, 0.18);
  // Company sign on the back wall.
  {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#14532d";
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = "#fef3c7";
    g.font = "600 56px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("THENMALAI SNACKS · MURUKKU LINE 1", 512, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(2, 2.2, -17.8);
    scene.add(sign);
  }

  // ── Departments: floor pad, outline, beacon, label, props ──
  const depts = {} as Record<DepartmentId, DeptRuntime>;
  const pickables: THREE.Object3D[] = [];
  for (const id of DEPARTMENT_IDS) {
    const z = ZONES[id];
    const group = new THREE.Group();
    group.position.set(z.x, 0, z.z);
    scene.add(group);
    const yBase = 0.01 + z.layer * 0.03;
    const border = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.95 });
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), border);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = yBase;
    group.add(outer);
    const inner = new THREE.MeshStandardMaterial({ color: z.layer ? 0xa3aab1 : 0x949ba2, roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0 });
    const innerMesh = new THREE.Mesh(new THREE.PlaneGeometry(z.w - (z.layer ? 0.36 : 0.5), z.d - (z.layer ? 0.36 : 0.5)), inner);
    innerMesh.rotation.x = -Math.PI / 2;
    innerMesh.position.y = yBase + 0.012;
    innerMesh.receiveShadow = true;
    group.add(innerMesh);
    // Beacon: a pole with a lamp in the status colour.
    const lamp = new THREE.MeshStandardMaterial({ color: NEUTRAL, emissive: NEUTRAL, emissiveIntensity: 0.9, roughness: 0.3 });
    const bx = id === "production" ? -4 - z.x + 3.2 : -z.w / 2 + 0.45;
    const bz = id === "production" ? 8 - z.z - 0.6 : -z.d / 2 + 0.45;
    group.add(box(0.1, 2.9, 0.1, MAT.darkSteel, bx, 0, bz));
    const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), lamp);
    lampMesh.position.set(bx, 3.05, bz);
    group.add(lampMesh);
    // HTML label: a real button, so it is keyboard-focusable and the status is spelled out in text.
    const label = document.createElement("button");
    label.type = "button";
    label.className = "twin-label";
    label.dataset.status = "idle";
    label.innerHTML = `<span class="twin-dot" aria-hidden="true"></span><span class="twin-name"></span><span class="twin-state"></span>`;
    (label.querySelector(".twin-name") as HTMLElement).textContent = DEPARTMENT_BY_ID[id].short;
    label.title = DEPARTMENT_BY_ID[id].name;
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      api.select(id, true);
    });
    const obj = new CSS2DObject(label);
    obj.position.set(z.label[0] - z.x, z.label[1], z.label[2] - z.z);
    obj.center.set(0.5, 1);
    group.add(obj);
    depts[id] = { group, border, inner, lamp, lampMesh, label, status: "idle", running: false };
  }

  const at = (id: DepartmentId) => depts[id].group;

  // Flour: a silo plus pallets of sacks (1 sack = 10 kg of live stock).
  at("flour").add(silo(-1.6, -3.4));
  const flourSlots: THREE.Vector3[] = [];
  for (const [px, pz] of [[-1.8, 2.2], [0.2, 2.2], [2.0, 2.2], [0.2, -0.2], [2.0, -0.2], [2.0, -2.6]]) {
    at("flour").add(pallet(px, pz));
    for (let layer = 0; layer < 3; layer++) for (const [dx, dz] of [[-0.3, -0.22], [0.3, -0.22]]) flourSlots.push(new THREE.Vector3(px + dx, 0.3 + layer * 0.31, pz + dz + (layer % 2) * 0.44));
  }
  const flourSacks = instanced(new THREE.BoxGeometry(0.55, 0.3, 0.42), MAT.sack, flourSlots);
  at("flour").add(flourSacks);
  const flourGauge = levelGauge(3.4);
  flourGauge.group.position.set(-3.0, 0.3, 0.6);
  at("flour").add(flourGauge.group);

  // Oil: one tank + sight gauge per oil item.
  const oilTanks = [
    { tankObj: tank(-1.6, -2.4, 1.1, 3.4), gauge: levelGauge(3.2) },
    { tankObj: tank(-1.6, 2.6, 1.1, 3.4), gauge: levelGauge(3.2) },
  ];
  oilTanks.forEach((t, i) => {
    at("oil").add(t.tankObj);
    t.gauge.group.position.set(-0.65, 0.3, (i ? 2.6 : -2.4) + 1.0);
    at("oil").add(t.gauge.group);
  });

  // Spice: a rack of bins (1 bin = 2 kg).
  const spiceRack = rack(3, 3, 1.5, 1.0, 1.0);
  spiceRack.group.position.set(0, 0, -2);
  at("spice").add(spiceRack.group);
  const spiceSlots = spiceRack.shelves.flatMap((s) => [-0.45, 0, 0.45].map((dx) => new THREE.Vector3(s.x + dx, s.y + 0.18, s.z - 2)));
  const spiceBins = instanced(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 12), MAT.bin, spiceSlots);
  at("spice").add(spiceBins);
  const spiceGauge = levelGauge(2.6);
  spiceGauge.group.position.set(-2.6, 0.3, 2);
  at("spice").add(spiceGauge.group);

  // Packaging store: racks of pouch boxes (1 box = 50 pouches) and flat cartons.
  const pkRack = rack(3, 3, 1.5, 1.0, 1.0);
  pkRack.group.position.set(0.4, 0, -2);
  at("packaging-store").add(pkRack.group);
  const pkSlots = pkRack.shelves.flatMap((s) => [-0.4, 0.05, 0.5].map((dx) => new THREE.Vector3(s.x + 0.4 + dx, s.y + 0.18, s.z - 2)));
  const pouchBoxes = instanced(new THREE.BoxGeometry(0.4, 0.36, 0.6), MAT.pouch, pkSlots);
  at("packaging-store").add(pouchBoxes);
  const pkGauges = [levelGauge(2.6), levelGauge(2.6)];
  pkGauges.forEach((g, i) => {
    g.group.position.set(-2.6 + i * 0.7, 0.3, 2.4);
    at("packaging-store").add(g.group);
  });
  const flatCartons = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.0).translate(0, 0.3, 0), MAT.carton);
  flatCartons.position.set(1.6, 0.14, 2.2);
  flatCartons.castShadow = true;
  at("packaging-store").add(pallet(1.6, 2.2), flatCartons);

  // Raw-material warehouse: receiving bay (pallets = open purchase orders), general store racks, forklift.
  const rwRack = rack(3, 4, 1.5, 1.0, 1.0);
  rwRack.group.position.set(-3.5, 0, -2.6);
  at("raw-warehouse").add(rwRack.group);
  for (const s of rwRack.shelves) at("raw-warehouse").add(box(1.1, 0.5, 0.7, MAT.sack, s.x - 3.5, s.y, s.z - 2.6));
  const rwGauges = Array.from({ length: 6 }, () => levelGauge(2.2, 0.18));
  rwGauges.forEach((g, i) => {
    g.group.position.set(-6.6 + i * 0.5, 0.3, 2.4);
    at("raw-warehouse").add(g.group);
  });
  const recvSlots: THREE.Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const px = 1.6 + (i % 4) * 1.5;
    const pz = -1.6 + Math.floor(i / 4) * 1.5;
    recvSlots.push(new THREE.Vector3(px, 0.14, pz));
  }
  const recvPallets = instanced(new THREE.BoxGeometry(1.1, 0.9, 0.9).translate(0, 0.45, 0), MAT.carton, recvSlots);
  at("raw-warehouse").add(recvPallets);
  const lift = forklift();
  lift.position.set(4.5, 0, 3.0);
  lift.rotation.y = -Math.PI / 2;
  at("raw-warehouse").add(lift);

  // Production line.
  const mix = mixer();
  at("mixing").add(mix.group);
  const fry = fryer();
  at("frying").add(fry.group);
  const vapour = steam();
  at("frying").add(vapour.points);
  const cool = coolingConveyor(6.4);
  at("cooling").add(cool.group);
  const pack = packingMachine();
  pack.group.position.set(-2.0, 0, 0);
  at("packing").add(pack.group);
  // Transfer conveyors between stations.
  for (const [x1, x2] of [[-8.7, -6.2], [1.1, 2.8], [9.4, 10.9]]) {
    scene.add(box(x2 - x1 + 0.6, 0.12, 0.9, MAT.belt, (x1 + x2) / 2, 1.0, -10));
  }
  at("qc").add(qcBench().group);
  const desk = controlDesk();
  desk.group.position.set(-4 - ZONES.production.x, 0, 8 - ZONES.production.z + 1.4);
  at("production").add(desk.group);

  // Finished-goods warehouse: two racks along z, 2 cartons per bay (1 carton = 20 packets).
  const fgSlots: THREE.Vector3[] = [];
  for (const rx of [-2.6, 2.6]) {
    const r = rack(3, 5, 1.5, 1.2, 1.2);
    r.group.rotation.y = Math.PI / 2;
    r.group.position.set(rx, 0, 0);
    at("fg-warehouse").add(r.group);
    for (const s of r.shelves) for (const dz of [-0.36, 0.36]) fgSlots.push(new THREE.Vector3(rx + s.z, s.y + 0.25, s.x + dz));
  }
  const fgCartons = instanced(new THREE.BoxGeometry(0.9, 0.5, 0.62), MAT.carton, fgSlots);
  at("fg-warehouse").add(fgCartons);

  // Dispatch: dock doors, staged cartons and (when invoices await dispatch) a truck at the dock.
  for (const dz of [-3.5, 2.8]) {
    const d = dockDoor(true);
    d.position.set(6, 0, dz);
    at("dispatch").add(d);
  }
  const stageSlots: THREE.Vector3[] = [];
  for (let i = 0; i < 24; i++) stageSlots.push(new THREE.Vector3(-3.4 + (i % 4) * 0.8, 0.14 + Math.floor(i / 8) * 0.52, -4.2 + (Math.floor(i / 4) % 2) * 0.8));
  for (const [px, pz] of [[-2.2, -3.8]]) at("dispatch").add(pallet(px, pz));
  const staged = instanced(new THREE.BoxGeometry(0.72, 0.5, 0.72).translate(0, 0.25, 0), MAT.carton, stageSlots);
  at("dispatch").add(staged);
  const lorry = truck();
  lorry.rotation.y = Math.PI;
  lorry.position.set(13.8, 0, -3.5);
  lorry.visible = false;
  at("dispatch").add(lorry);

  // Everything inside a department group is clickable and maps back to the department.
  for (const id of DEPARTMENT_IDS) {
    depts[id].group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) {
        o.userData.dept = id;
        pickables.push(o);
      }
    });
  }

  // ── Status & data binding ──
  /** Set whenever the picture changes; the render loop draws a frame only when needed. */
  let dirty = true;
  controls.addEventListener("change", () => (dirty = true));
  let selected: DepartmentId | null = null;
  let hovered: DepartmentId | null = null;
  const paint = (id: DepartmentId) => {
    const d = depts[id];
    const isSel = selected === id;
    d.inner.emissiveIntensity = isSel ? 0.16 : hovered === id ? 0.08 : 0;
    d.border.opacity = isSel ? 1 : 0.9;
    d.label.classList.toggle("is-selected", isSel);
    d.label.setAttribute("aria-pressed", isSel ? "true" : "false");
    dirty = true;
  };
  const setStatus = (id: DepartmentId, status: DeptStatus | null, stateText: string) => {
    const d = depts[id];
    const hex = status ? STATUS_HEX[status] : NEUTRAL;
    d.status = status ?? "idle";
    d.border.color.setHex(hex);
    d.lamp.color.setHex(hex);
    d.lamp.emissive.setHex(hex);
    d.label.dataset.status = status ?? "neutral";
    (d.label.querySelector(".twin-dot") as HTMLElement).textContent = status ? STATUS_GLYPH[status] : "";
    (d.label.querySelector(".twin-state") as HTMLElement).textContent = stateText;
    d.label.setAttribute("aria-label", `${DEPARTMENT_BY_ID[id].name}${stateText ? `: ${stateText}` : ""}`);
  };
  const setCount = (mesh: THREE.InstancedMesh, n: number) => {
    mesh.count = Math.max(0, Math.min(n, mesh.instanceMatrix.count));
  };
  const gaugeColor = (s: DeptStatus) => STATUS_HEX[s];

  const update = (snap: FactorySnapshot) => {
    for (const id of DEPARTMENT_IDS) {
      const d = snap.departments[id];
      setStatus(id, d.status, d.activity === "running" && d.status !== "critical" ? `${STATUS_LABEL[d.status]} · running` : STATUS_LABEL[d.status]);
      depts[id].running = d.activity === "running";
    }
    const D = snap.departments;
    setCount(flourSacks, D.flour.visual.units ?? 0);
    const fg0 = D.flour.visual.gauges?.[0];
    flourGauge.setLevel(fg0 ? Math.max(...(D.flour.visual.gauges ?? []).map((g) => g.ratio)) : 0);
    flourGauge.setColor(gaugeColor(D.flour.status === "idle" ? "idle" : D.flour.status));
    oilTanks.forEach((t, i) => {
      const g = D.oil.visual.gauges?.[i];
      t.tankObj.visible = !!g || i === 0;
      t.gauge.group.visible = !!g;
      t.gauge.setLevel(g?.ratio ?? 0);
      t.gauge.setColor(gaugeColor(g?.status ?? "idle"));
    });
    setCount(spiceBins, D.spice.visual.units ?? 0);
    const sg = D.spice.visual.gauges ?? [];
    spiceGauge.setLevel(sg.length ? Math.min(...sg.map((g) => g.ratio)) : 0);
    spiceGauge.setColor(gaugeColor(D.spice.status));
    setCount(pouchBoxes, D["packaging-store"].visual.units ?? 0);
    pkGauges.forEach((g, i) => {
      const v = D["packaging-store"].visual.gauges?.[i];
      g.group.visible = !!v;
      g.setLevel(v?.ratio ?? 0);
      g.setColor(gaugeColor(v?.status ?? "idle"));
    });
    const cartonGauge = D["packaging-store"].visual.gauges?.find((g) => /carton/i.test(g.label));
    flatCartons.scale.y = cartonGauge ? Math.max(0.05, cartonGauge.ratio) : 0.05;
    rwGauges.forEach((g, i) => {
      const v = D["raw-warehouse"].visual.gauges?.[i];
      g.group.visible = !!v;
      g.setLevel(v?.ratio ?? 0);
      g.setColor(gaugeColor(v?.status ?? "idle"));
    });
    setCount(recvPallets, D["raw-warehouse"].visual.units ?? 0);
    setCount(fgCartons, D["fg-warehouse"].visual.units ?? 0);
    setCount(staged, D.dispatch.visual.units ?? 0);
    lorry.visible = !!D.dispatch.visual.vehicle;
    vapour.points.visible = depts.frying.running;
    for (const id of DEPARTMENT_IDS) paint(id);
    dirty = true;
  };

  const showcase = () => {
    for (const id of DEPARTMENT_IDS) {
      setStatus(id, null, "");
      depts[id].running = false;
    }
    setCount(flourSacks, 24);
    flourGauge.setLevel(0.6);
    flourGauge.setColor(NEUTRAL);
    oilTanks.forEach((t) => {
      t.gauge.setLevel(0.6);
      t.gauge.setColor(NEUTRAL);
    });
    setCount(spiceBins, 18);
    spiceGauge.setLevel(0.6);
    spiceGauge.setColor(NEUTRAL);
    setCount(pouchBoxes, 18);
    pkGauges.forEach((g) => {
      g.setLevel(0.6);
      g.setColor(NEUTRAL);
    });
    rwGauges.forEach((g) => {
      g.setLevel(0.6);
      g.setColor(NEUTRAL);
    });
    setCount(recvPallets, 4);
    setCount(fgCartons, 30);
    setCount(staged, 8);
    lorry.visible = true;
    vapour.points.visible = false;
    for (const id of DEPARTMENT_IDS) paint(id);
  };

  // ── Camera framing ──
  let width = 1;
  let height = 1;
  /** Distance that fits a w×d footprint in view for the current aspect ratio. */
  const fitDistance = (w: number, d: number) => {
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    return Math.max(w / 2 / Math.tan(hfov / 2), (d * 0.85) / 2 / Math.tan(vfov / 2)) * 1.12;
  };
  let tween: gsap.core.Tween | null = null;
  const flyTo = (target: THREE.Vector3, distance: number, seconds: number, dir = VIEW_DIR) => {
    const pos = target.clone().addScaledVector(dir, distance);
    tween?.kill();
    if (opts.reducedMotion || seconds <= 0) {
      controls.target.copy(target);
      camera.position.copy(pos);
      controls.update();
      return;
    }
    const from = { tx: controls.target.x, ty: controls.target.y, tz: controls.target.z, px: camera.position.x, py: camera.position.y, pz: camera.position.z };
    tween = gsap.to(from, {
      tx: target.x, ty: target.y, tz: target.z, px: pos.x, py: pos.y, pz: pos.z,
      duration: seconds,
      ease: "power2.inOut",
      onUpdate: () => {
        controls.target.set(from.tx, from.ty, from.tz);
        camera.position.set(from.px, from.py, from.pz);
        dirty = true;
      },
    });
  };
  const portrait = () => camera.aspect < 0.9;
  const resetView = (seconds = 0.9) =>
    portrait() ? flyTo(DEFAULT_TARGET, fitDistance(34, 66) * 0.98, seconds, PORTRAIT_DIR) : flyTo(DEFAULT_TARGET, fitDistance(64, 34) * 0.98, seconds, OVERVIEW_DIR);
  const focus = (id: DepartmentId, seconds = 0.9) => {
    const z = ZONES[id];
    flyTo(new THREE.Vector3(z.x, 0.6, z.z), Math.max(14, fitDistance(z.w + 6, z.d + 6)), seconds);
  };

  // ── Picking ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (clientX: number, clientY: number): DepartmentId | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    // Prefer an area inside the hall over the hall floor itself.
    const hit = hits.find((h) => h.object.userData.dept !== "production") ?? hits[0];
    return (hit?.object.userData.dept as DepartmentId | undefined) ?? null;
  };
  let downAt: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    downAt = null;
    api.select(pick(e.clientX, e.clientY), true);
  };
  let hoverQueued: PointerEvent | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    hoverQueued = e;
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  // Free-camera keyboard flying (WASD / arrows to move, Q/E to rotate, +/- to zoom).
  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    if (!freeCamera || (e.target as HTMLElement)?.tagName === "BUTTON") return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "+", "=", "-"].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("keyup", onKeyUp);
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const flyKeys = (dt: number) => {
    if (!keys.size) return;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    const speed = 18 * dt;
    const move = new THREE.Vector3();
    if (keys.has("w") || keys.has("arrowup")) move.add(fwd);
    if (keys.has("s") || keys.has("arrowdown")) move.sub(fwd);
    if (keys.has("d") || keys.has("arrowright")) move.add(right);
    if (keys.has("a") || keys.has("arrowleft")) move.sub(right);
    if (move.lengthSq()) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
    }
    const offset = camera.position.clone().sub(controls.target);
    if (keys.has("q") || keys.has("e")) offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, (keys.has("q") ? 1 : -1) * dt * 1.2);
    if (keys.has("+") || keys.has("=")) offset.multiplyScalar(1 - dt * 1.2);
    if (keys.has("-")) offset.multiplyScalar(1 + dt * 1.2);
    camera.position.copy(controls.target).add(offset);
  };

  // ── Render loop ──
  const clock = new THREE.Clock();
  let running = false;
  let isCompact = false;
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    if (hoverQueued) {
      const id = pick(hoverQueued.clientX, hoverQueued.clientY);
      hoverQueued = null;
      if (id !== hovered) {
        const prev = hovered;
        hovered = id;
        if (prev) paint(prev);
        if (id) paint(id);
        renderer.domElement.style.cursor = id ? "pointer" : "grab";
      }
    }
    flyKeys(dt);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -40, 46);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -26, 26);
    const moved = controls.update();
    // Render on demand: only when the camera moved, something changed, or a run is animating.
    // An idle factory therefore costs (almost) no GPU time.
    const animating = !opts.reducedMotion && (depts.production.running || depts.cooling.running || depts.packing.running || vapour.points.visible);
    if (!moved && !dirty && !animating && !keys.size) return;
    dirty = false;
    if (animating) {
      if (depts.production.running) mix.paddle.rotation.y = t * 3;
      if (vapour.points.visible) vapour.tick(t);
    }
    cool.tick(animating ? t : 0, depts.cooling.running);
    pack.tick(animating ? t : 0, depts.packing.running);
    // Zoomed out: compact labels (short name + status glyph) so neighbouring areas do not collide.
    const compact = camera.position.distanceTo(controls.target) > 48;
    if (compact !== isCompact) {
      isCompact = compact;
      labels.domElement.classList.toggle("twin-compact", compact);
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };

  const setLighting = (mode: "day" | "night") => {
    const night = mode === "night";
    scene.background = new THREE.Color(night ? 0x07090c : 0xd7dde3);
    hemi.intensity = night ? 0.18 : 1.5;
    scene.environmentIntensity = night ? 0.12 : 0.55;
    sun.intensity = night ? 0.12 : 2.3;
    for (const l of nightLamps) l.intensity = night ? 60 : 0;
    lampPanelMat.emissiveIntensity = night ? 1.6 : 0;
    renderer.toneMappingExposure = night ? 1.25 : 1.05;
    dirty = true;
  };
  setLighting("day");

  const api: FactoryScene = {
    update,
    showcase,
    select(id, fly = false) {
      const prev = selected;
      selected = id;
      if (prev) paint(prev);
      if (id) {
        paint(id);
        if (fly) focus(id);
      }
      opts.onSelect(id);
    },
    focus,
    resetView: () => resetView(),
    setLighting,
    setFreeCamera(on) {
      freeCamera = on;
      applyLimits();
      if (on) container.focus();
    },
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      labels.setSize(width, height);
      const wasPortrait = portrait();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dirty = true;
      // Re-frame the overview when a phone rotates (unless the user is looking at a department).
      if (wasPortrait !== portrait() && !selected) resetView(0);
    },
    start() {
      if (running) return;
      running = true;
      clock.getDelta();
      renderer.setAnimationLoop(loop);
    },
    stop() {
      running = false;
      renderer.setAnimationLoop(null);
    },
    dispose() {
      api.stop();
      tween?.kill();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("keyup", onKeyUp);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      envMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
  // Initial framing once the container has a size.
  const r = container.getBoundingClientRect();
  api.resize(r.width, r.height);
  resetView(0);
  return api;
}
