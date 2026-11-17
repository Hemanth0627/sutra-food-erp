import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Procedural 3D manufacturing story (no external models). Six stations sit along a conveyor:
 * raw ingredients → frying/production → packed pouches → warehouse cartons → sales orders → invoices
 * & reports. Scroll progress (0–1) drives the camera between stations: the scroll-to-camera technique
 * popularised by Fireship's three.js scroll demo, re-implemented here with eased interpolation.
 */
export interface StoryScene {
  setProgress(p: number): void;
  resize(width: number, height: number): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

const SPACING = 16;
const STATIONS = 6;

class SpiralCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private turns = 3.2, private inner = 0.25, private step = 0.42) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const theta = t * this.turns * Math.PI * 2;
    const r = this.inner + (this.step * theta) / (Math.PI * 2);
    return target.set(Math.cos(theta) * r, Math.sin(theta) * r, Math.sin(theta * 3) * 0.05);
  }
}

const std = (color: number, roughness = 0.6, metalness = 0.05, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function createStoryScene(canvas: HTMLCanvasElement, opts: { idleMotion: boolean }): StoryScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c0c0d, 16, 46);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x101012, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(8, 12, 10);
  scene.add(sun);
  const warm = new THREE.PointLight(0xf59e0b, 40, 22, 1.6);
  warm.position.set(0, 4, 4);
  scene.add(warm);

  const stations = Array.from({ length: STATIONS }, (_, i) => {
    const g = new THREE.Group();
    g.position.set(i * SPACING, 0, 0);
    scene.add(g);
    return g;
  });

  // Floor + conveyor running through every station.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SPACING * STATIONS + 40, 40), std(0x111113, 0.95));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(((STATIONS - 1) * SPACING) / 2, -1.6, 0);
  scene.add(floor);
  const grid = new THREE.GridHelper(SPACING * STATIONS + 40, 90, 0x2a2a2e, 0x1c1c1f);
  grid.position.set(((STATIONS - 1) * SPACING) / 2, -1.59, 0);
  scene.add(grid);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(SPACING * (STATIONS - 1) + 6, 0.12, 1.4), std(0x27272a, 0.4, 0.5));
  belt.position.set(((STATIONS - 1) * SPACING) / 2, -1.1, 2.6);
  scene.add(belt);

  // Station 0 – raw ingredients
  const s0 = stations[0];
  const sackGeo = new RoundedBoxGeometry(1.5, 1.9, 0.9, 4, 0.32);
  [[-2.2, 0, 0, 0.15], [-0.5, 0, -0.6, -0.1], [-1.4, 1.75, -0.3, 0.05]].forEach(([x, y, z, r]) => {
    const sack = new THREE.Mesh(sackGeo, std(0xe9dcc2, 0.95));
    sack.position.set(x, y - 0.6, z);
    sack.rotation.z = r;
    s0.add(sack);
  });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.1, 40), std(0xd97706, 0.35, 0.6));
  drum.position.set(1.6, -0.55, -0.3);
  s0.add(drum);
  for (const y of [-1.2, 0.1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.05, 8, 40), std(0x78350f, 0.4, 0.7));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(1.6, y, -0.3);
    s0.add(rim);
  }
  [0xb91c1c, 0xea580c, 0xca8a04].forEach((c, i) => {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 24), std(c, 0.5));
    jar.position.set(3 + i * 0.7, -1.05, 0.6);
    s0.add(jar);
  });
  const dustGeo = new THREE.BufferGeometry();
  const dust = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) {
    dust[i * 3] = (Math.random() - 0.5) * 9;
    dust[i * 3 + 1] = Math.random() * 5 - 1;
    dust[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xf5e6c8, size: 0.05, transparent: true, opacity: 0.7 }));
  s0.add(dustPts);

  // Station 1 – production: frying ring + golden murukku spiral
  const s1 = stations[1];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.22, 20, 120), std(0x3f3f46, 0.3, 0.85, { emissive: 0x7c2d12, emissiveIntensity: 0.35 }));
  s1.add(ring);
  const murukku = new THREE.Mesh(new THREE.TubeGeometry(new SpiralCurve(), 420, 0.2, 14, false), std(0xc98a2e, 0.55, 0.05, { emissive: 0x3b1d05, emissiveIntensity: 0.25 }));
  murukku.position.set(0, 0.4, 0);
  s1.add(murukku);
  const glow = new THREE.PointLight(0xff8a00, 25, 9, 1.8);
  glow.position.set(0, 0.5, 1.5);
  s1.add(glow);

  // Station 2 – packed pouches (five product colours)
  const s2 = stations[2];
  const pouchGeo = new RoundedBoxGeometry(1.15, 1.65, 0.32, 4, 0.12);
  const labelGeo = new THREE.BoxGeometry(0.95, 0.42, 0.34);
  const pouches: THREE.Group[] = [];
  [0xf59e0b, 0xdc2626, 0x16a34a, 0xeab308, 0xdb2777].forEach((c, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pouchGeo, std(c, 0.35, 0.2)));
    const label = new THREE.Mesh(labelGeo, std(0xfafafa, 0.8));
    label.position.y = 0.1;
    g.add(label);
    const angle = (i - 2) * 0.32;
    g.position.set(Math.sin(angle) * 4.2, 0, -Math.cos(angle) * 1.6 + 1.2);
    g.rotation.y = -angle;
    s2.add(g);
    pouches.push(g);
  });

  // Station 3 – inventory racks and cartons
  const s3 = stations[3];
  const metal = std(0x52525b, 0.35, 0.8);
  for (const x of [-3, 3]) for (const z of [-1.2, 1.2]) {
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.6, 0.12), metal);
    up.position.set(x, 0.7, z);
    s3.add(up);
  }
  const cartonGeo = new THREE.BoxGeometry(1.25, 0.9, 1.6);
  const kraft = std(0xb98c5a, 0.9);
  const cartons: THREE.Mesh[] = [];
  [-1.3, 0.55, 2.4].forEach((y, row) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.08, 2.6), metal);
    shelf.position.set(0, y - 0.5, 0);
    s3.add(shelf);
    for (let c = 0; c < 4; c++) {
      if (row === 2 && c > 1) continue;
      const box = new THREE.Mesh(cartonGeo, kraft);
      box.position.set(-2.2 + c * 1.45, y, 0);
      s3.add(box);
      cartons.push(box);
    }
  });

  // Station 4 – sales orders: phone + order cards
  const s4 = stations[4];
  const phone = new THREE.Mesh(new RoundedBoxGeometry(1.5, 3, 0.16, 4, 0.18), std(0x18181b, 0.3, 0.6));
  s4.add(phone);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, emissive: 0xf59e0b, emissiveIntensity: 0.18 }));
  screen.position.z = 0.09;
  phone.add(screen);
  const cards: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const card = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.85, 0.04, 2, 0.06), std(0xf4f4f5, 0.7));
    s4.add(card);
    cards.push(card);
  }

  // Station 5 – invoice + report bars
  const s5 = stations[5];
  const invoice = new THREE.Mesh(new RoundedBoxGeometry(2.4, 3.2, 0.04, 2, 0.05), std(0xfafafa, 0.8));
  invoice.position.set(-2.4, 0.5, 0);
  invoice.rotation.set(-0.1, 0.35, 0.05);
  s5.add(invoice);
  for (let i = 0; i < 6; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(i === 0 ? 1.4 : 1.9, 0.07, 0.06), std(i === 0 ? 0xb45309 : 0xa1a1aa, 0.8));
    line.position.set(i === 0 ? -0.25 : 0, 1.2 - i * 0.38, 0.04);
    invoice.add(line);
  }
  const barColors = [0x3987e5, 0xd95926, 0x199e70, 0x3987e5, 0xd95926];
  const barHeights = [1.4, 2.2, 1.8, 2.9, 3.5];
  const bars = barHeights.map((h, i) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1, 0.55), std(barColors[i], 0.4, 0.15));
    bar.position.set(0.6 + i * 0.85, -1.05, 0);
    bar.userData.h = h;
    s5.add(bar);
    return bar;
  });

  // Items flowing along the conveyor: colour changes from ingredient to product to carton.
  const flowGeo = new RoundedBoxGeometry(0.55, 0.45, 0.55, 2, 0.08);
  const flow = Array.from({ length: 14 }, (_, i) => {
    const m = new THREE.Mesh(flowGeo, std(0xe9dcc2, 0.6));
    m.userData.offset = i / 14;
    scene.add(m);
    return m;
  });
  const flowColors = [new THREE.Color(0xe9dcc2), new THREE.Color(0xc98a2e), new THREE.Color(0xf59e0b), new THREE.Color(0xb98c5a), new THREE.Color(0xf4f4f5), new THREE.Color(0x3987e5)];

  // Camera rig: one viewpoint per station, eased between them by scroll progress.
  const views = stations.map((_, i) => new THREE.Vector3(i * SPACING - 2.5, 2.4, 10.5));
  const targets = stations.map((_, i) => new THREE.Vector3(i * SPACING + 0.6, 0.4, 0));
  views[1].set(SPACING - 1.5, 1.6, 9.2);
  views[3].set(3 * SPACING - 4, 3.2, 10.5);
  const ease = (t: number) => t * t * (3 - 2 * t);
  let lookOffset = 3.2; // wide screens: keep the objects left of the step cards
  let target = 0;
  let shown = 0;
  let raf = 0;
  let running = false;
  const clock = new THREE.Clock();
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  const frame = () => {
    const t = clock.getElapsedTime();
    shown += (target - shown) * 0.085;
    const s = Math.min(STATIONS - 1, Math.max(0, shown * (STATIONS - 1)));
    const i = Math.min(STATIONS - 2, Math.floor(s));
    const f = ease(s - i);
    tmpPos.lerpVectors(views[i], views[i + 1], f);
    tmpLook.lerpVectors(targets[i], targets[i + 1], f);
    tmpLook.x += lookOffset;
    tmpPos.x += lookOffset * 0.6;
    if (opts.idleMotion) tmpPos.y += Math.sin(t * 0.6) * 0.12;
    camera.position.copy(tmpPos);
    camera.lookAt(tmpLook);
    warm.position.set(tmpLook.x + 2, 4, 4);

    const idle = opts.idleMotion ? 1 : 0;
    ring.rotation.set(Math.PI / 2.4, t * 0.25 * idle, t * 0.15 * idle);
    murukku.rotation.z = -t * 0.6 * idle;
    dustPts.rotation.y = t * 0.05 * idle;
    pouches.forEach((p, k) => {
      const near = Math.max(0, 1 - Math.abs(s - 2));
      p.scale.setScalar(0.55 + 0.45 * near);
      p.position.y = Math.sin(t * 1.2 + k) * 0.12 * idle;
    });
    cartons.forEach((c, k) => (c.scale.y = 0.7 + 0.3 * Math.max(0, Math.min(1, (s - 2.2) * 2 - k * 0.05))));
    cards.forEach((c, k) => {
      const a = t * 0.5 * idle + (k / cards.length) * Math.PI * 2;
      c.position.set(Math.cos(a) * 2.6, Math.sin(a * 1.3) * 0.9 + 0.2, Math.sin(a) * 1.6);
      c.lookAt(camera.position);
    });
    const growth = Math.max(0, Math.min(1, (s - 4) * 1.6));
    bars.forEach((b) => {
      const h = 0.05 + (b.userData.h as number) * growth;
      b.scale.y = h;
      b.position.y = -1.55 + h / 2;
    });
    const span = SPACING * (STATIONS - 1) + 4;
    flow.forEach((m) => {
      const u = ((m.userData.offset as number) + t * 0.025 * (idle || 0.0001)) % 1;
      const x = -2 + u * span;
      m.position.set(x, -0.82, 2.6);
      const stage = Math.min(STATIONS - 1, Math.max(0, x / SPACING));
      const a = Math.floor(stage);
      (m.material as THREE.MeshStandardMaterial).color.copy(flowColors[a]).lerp(flowColors[Math.min(STATIONS - 1, a + 1)], stage - a);
    });
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  };

  return {
    setProgress(p) {
      target = Math.min(1, Math.max(0, p));
      if (!running) frame();
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.fov = camera.aspect < 0.8 ? 52 : 38;
      lookOffset = camera.aspect < 1.2 ? 0 : 3.2;
      camera.updateProjectionMatrix();
      if (!running) frame();
    },
    start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
