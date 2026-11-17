import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The Sutra mark (see BrandMark in components/app/brand.tsx) rebuilt in 3D for the sign-in page:
 * a glossy rounded tile, the two threads as raised tubes that weave over each other, the amber knot,
 * and slow orbiting rings. SVG coordinates (32 × 32, y down) map 1:1 to scene units around the centre.
 */
export interface BrandScene {
  resize(width: number, height: number): void;
  pointer(x: number, y: number): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

const AMBER = 0xf59e0b;

/** SVG point → scene point (centred, y up). */
const P = (x: number, y: number, z = 0) => new THREE.Vector3(x - 16, 16 - y, z);

/** A thread: cubic bezier then a straight run, lifted off the tile; `weave` arcs it over the other thread. */
class ThreadCurve extends THREE.Curve<THREE.Vector3> {
  private readonly bezier: THREE.CubicBezierCurve3;
  private readonly line: THREE.LineCurve3;
  constructor(from: [number, number], c1: [number, number], c2: [number, number], to: [number, number], end: [number, number], private readonly z: number, private readonly weave: number) {
    super();
    this.bezier = new THREE.CubicBezierCurve3(P(...from), P(...c1), P(...c2), P(...to));
    this.line = new THREE.LineCurve3(P(...to), P(...end));
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    // 10 of the 16 path units are the bezier, 6 the straight run (proportional split keeps speed even).
    const split = 0.66;
    if (t <= split) {
      const u = t / split;
      this.bezier.getPoint(u, target);
      target.z = this.z + this.weave * Math.sin(Math.PI * u);
    } else {
      this.line.getPoint((t - split) / (1 - split), target);
      target.z = this.z;
    }
    return target;
  }
}

function roundedRect(size: number, r: number) {
  const s = new THREE.Shape();
  const h = size / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

export function createBrandScene(canvas: HTMLCanvasElement, opts: { animate: boolean; lowPower: boolean }): BrandScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
  camera.position.set(0, 0, 120);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-30, 40, 60);
  scene.add(key);
  const rim = new THREE.PointLight(AMBER, 900, 120, 1.6);
  rim.position.set(30, -20, -25);
  scene.add(rim);

  // ── The mark ──
  const mark = new THREE.Group();
  const tileDepth = 3;
  const tile = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(32, 8), { depth: tileDepth, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 6, curveSegments: 24 }),
    new THREE.MeshPhysicalMaterial({ color: 0x1c1c1f, roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
  );
  tile.position.z = -tileDepth / 2;
  mark.add(tile);
  const front = tileDepth / 2 + 0.8;

  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f5, roughness: 0.28, clearcoat: 0.8 });
  const amber = new THREE.MeshPhysicalMaterial({ color: AMBER, roughness: 0.25, metalness: 0.15, clearcoat: 1, emissive: 0xb45309, emissiveIntensity: 0.35 });
  const thread = (curve: ThreadCurve, mat: THREE.Material, ends: THREE.Vector3[]) => {
    mark.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 1.2, 20, false), mat));
    for (const e of ends) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14), mat);
      cap.position.copy(e);
      mark.add(cap);
    }
  };
  // "M8 11 c5 0 5 10 10 10 h6" (white) and "M8 21 c5 0 5-10 10-10 h6" (amber, weaving over the white one).
  const zW = front + 1.3;
  const zA = front + 1.3;
  thread(new ThreadCurve([8, 11], [13, 11], [13, 21], [18, 21], [24, 21], zW, -0.6), white, [P(8, 11, zW), P(24, 21, zW)]);
  thread(new ThreadCurve([8, 21], [13, 21], [13, 11], [18, 11], [24, 11], zA, 1.4), amber, [P(8, 21, zA), P(24, 11, zA)]);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 24), new THREE.MeshPhysicalMaterial({ color: AMBER, roughness: 0.2, clearcoat: 1, emissive: AMBER, emissiveIntensity: 0.55 }));
  knot.position.copy(P(24, 16, front + 1.6));
  mark.add(knot);
  const glow = new THREE.PointLight(AMBER, 120, 30, 2);
  glow.position.copy(P(24, 16, front + 6));
  mark.add(glow);
  scene.add(mark);

  // ── Orbiting rings and drifting specks ──
  const rings: THREE.Mesh[] = [];
  [
    { r: 30, tilt: [1.15, 0.2], opacity: 0.45 },
    { r: 38, tilt: [1.35, -0.5], opacity: 0.28 },
    { r: 47, tilt: [0.95, 0.75], opacity: 0.16 },
  ].forEach(({ r, tilt, opacity }) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 8, 160), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity }));
    ring.rotation.set(tilt[0], tilt[1], 0);
    rings.push(ring);
    scene.add(ring);
  });
  const SPECKS = opts.lowPower ? 60 : 160;
  const speckPos = new Float32Array(SPECKS * 3);
  for (let i = 0; i < SPECKS; i++) {
    const r = 28 + Math.random() * 40;
    const a = Math.random() * Math.PI * 2;
    speckPos[i * 3] = Math.cos(a) * r;
    speckPos[i * 3 + 1] = (Math.random() - 0.5) * 70;
    speckPos[i * 3 + 2] = Math.sin(a) * r - 10;
  }
  const specksGeo = new THREE.BufferGeometry();
  specksGeo.setAttribute("position", new THREE.BufferAttribute(speckPos, 3));
  const specks = new THREE.Points(specksGeo, new THREE.PointsMaterial({ color: 0xfbbf24, size: 0.55, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(specks);

  // ── Pose, pointer tilt and framing ──
  const base = { x: -0.32, y: 0.5 };
  const target = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  mark.rotation.set(base.x, base.y, 0.06);

  const clock = new THREE.Clock();
  let running = false;
  const frame = () => {
    const t = clock.getElapsedTime();
    if (opts.animate) {
      tilt.x += (target.x - tilt.x) * 0.06;
      tilt.y += (target.y - tilt.y) * 0.06;
      mark.rotation.x = base.x + Math.sin(t * 0.5) * 0.08 + tilt.x;
      mark.rotation.y = base.y + Math.sin(t * 0.35) * 0.35 + tilt.y;
      mark.position.y = Math.sin(t * 0.8) * 1.2;
      rings[0].rotation.z = t * 0.12;
      rings[1].rotation.z = -t * 0.08;
      rings[2].rotation.z = t * 0.05;
      specks.rotation.y = t * 0.03;
      (knot.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.15;
    }
    renderer.render(scene, camera);
  };

  return {
    resize(width, height) {
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the mark ~55% of the panel's smaller side and place it upper-right of the copy.
      const fit = (40 / 0.55) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.z = camera.aspect < 1 ? fit / camera.aspect : fit;
      camera.position.x = -camera.aspect * 9;
      camera.position.y = -6;
      camera.lookAt(camera.position.x, camera.position.y, 0);
      camera.updateProjectionMatrix();
      if (!running) frame();
    },
    pointer(x, y) {
      // x, y in −1…1 across the panel.
      target.y = x * 0.45;
      target.x = -y * 0.3;
    },
    start() {
      if (running || !opts.animate) {
        frame();
        return;
      }
      running = true;
      renderer.setAnimationLoop(frame);
    },
    stop() {
      running = false;
      renderer.setAnimationLoop(null);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) mat.dispose();
      });
      env.dispose();
      renderer.dispose();
    },
  };
}
