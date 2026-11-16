// Вариант 2: 3D-сцены из металла (three.js лежит на самом сайте, без чужих серверов).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = { steel: 0x808a96, copper: 0xc9773f, brass: 0xd6ae52, alu: 0xdfe3e8 };
const ROUGH = { steel: 0.38, copper: 0.2, brass: 0.26, alu: 0.42 };
const mats = {};
const mat = (k) => (mats[k] ??= new THREE.MeshStandardMaterial({ color: COLORS[k], metalness: 1, roughness: ROUGH[k] }));

// Простой генератор случайных чисел с зерном: сцена каждый раз одинаковая
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/* ---------- Детали ---------- */
function gearGeo(teeth, pitch, depth, hole) {
  const s = new THREE.Shape();
  const a = (Math.PI * 2) / teeth, ro = pitch + 0.09, rr = pitch - 0.1;
  for (let i = 0; i < teeth; i++) {
    const t = i * a;
    [[rr, 0], [ro, 0.18], [ro, 0.42], [rr, 0.6]].forEach(([r, k], j) => {
      const x = Math.cos(t + k * a) * r, y = Math.sin(t + k * a) * r;
      i === 0 && j === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
    });
  }
  s.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 28 }).center();
}
function beamGeo(len) {
  const w = 0.5, h = 0.62, f = 0.14, web = 0.07;
  const pts = [[-w, -h], [w, -h], [w, -h + f], [web, -h + f], [web, h - f], [w, h - f], [w, h], [-w, h], [-w, h - f], [-web, h - f], [-web, -h + f], [-w, -h + f]];
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }).center();
}
function coilGeo(turns, R, H) {
  const pts = [];
  for (let i = 0; i <= turns * 40; i++) {
    const t = i / (turns * 40), an = t * Math.PI * 2 * turns;
    pts.push(new THREE.Vector3(Math.cos(an) * R, (t - 0.5) * H, Math.sin(an) * R));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 90, 0.085, 14);
}
function ringGeo(ro, ri, depth, sides = 40) {
  const s = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const an = (i / sides) * Math.PI * 2;
    i ? s.lineTo(Math.cos(an) * ro, Math.sin(an) * ro) : s.moveTo(ro, 0);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, ri, 0, Math.PI * 2, true);
  s.holes.push(h);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 20 }).center();
}

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // Синий контровой свет — фирменный цвет в отражениях
  const blue = new THREE.DirectionalLight(0x3f7df0, 5);
  blue.position.set(-4, 2, -3);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 6);
  scene.add(blue, key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  camera.position.set(0, 0, 10);
  return { renderer, scene, camera };
}

// Рисуем только пока блок на экране
function loop(el, renderer, frame) {
  let visible = false, raf = 0, last = performance.now(), time = 0;
  const tick = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; time += dt;
    frame(time, dt);
    if (visible && !calm) raf = requestAnimationFrame(tick);
  };
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }).observe(el);
  if (calm) { time = 3; frame(time, 0); } // один неподвижный кадр
  return () => frame(time, 0);
}

/* ---------- Первый экран: балка, медная спираль, латунная шестерня и россыпь лома ---------- */
function hero(canvas) {
  const section = canvas.closest('section');
  const { renderer, scene, camera } = makeRenderer(canvas);
  const group = new THREE.Group();
  scene.add(group);
  const items = [];
  const add = (geo, m, pos, rot, metal, spin = 0.15) => {
    const mesh = new THREE.Mesh(geo, mat(m));
    mesh.rotation.set(...rot);
    group.add(mesh);
    const home = new THREE.Vector3(...pos);
    items.push({ mesh, home, from: home.clone().multiplyScalar(3.2).add(new THREE.Vector3(rnd() * 6 - 3, rnd() * 8 + 2, rnd() * 4 - 8)), metal, spin: spin * (rnd() > 0.5 ? 1 : -1), axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), scale: 1, delay: rnd() * 0.5 });
    return mesh;
  };
  add(beamGeo(4.2), 'steel', [0, -0.55, 0], [0.5, 0.7, 0.35], 'steel', 0.05);
  add(coilGeo(7, 0.62, 1.7), 'copper', [-1.55, 1.05, 0.7], [0.3, 0, 0.5], 'copper', 0.35);
  add(gearGeo(14, 0.95, 0.34, 0.3), 'brass', [1.55, 1.0, 0.5], [0.5, -0.5, 0], 'brass', 0.4);
  const kinds = [
    () => [ringGeo(0.2, 0.11, 0.16, 6), 'steel'],          // гайка
    () => [ringGeo(0.2, 0.11, 0.16, 6), 'brass'],
    () => [ringGeo(0.17, 0.13, 0.7 + rnd() * 0.5), 'copper'], // медная трубка
    () => [ringGeo(0.24, 0.2, 0.9), 'alu'],                // алюминиевая труба
    () => [new THREE.BoxGeometry(0.75, 0.05, 0.5), 'alu'],   // лист
    () => [new THREE.BoxGeometry(0.12, 0.12, 1.3), 'steel'], // пруток
    () => [gearGeo(9, 0.3, 0.14, 0.1), 'steel'],
  ];
  for (let i = 0; i < 22; i++) {
    const [geo, m] = kinds[i % kinds.length]();
    const an = rnd() * Math.PI * 2, el = (rnd() - 0.5) * 1.6, r = 2.3 + rnd() * 1.1;
    add(geo, m, [Math.cos(an) * Math.cos(el) * r, Math.sin(el) * r * 0.8, Math.sin(an) * Math.cos(el) * r], [rnd() * 6, rnd() * 6, rnd() * 6], null, 0.3 + rnd() * 0.5);
  }

  let px = 0, py = 0, tx = 0, ty = 0, hot = null, base = 1;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; });
  section.querySelectorAll('[data-metal]').forEach((el) => {
    el.addEventListener('pointerenter', () => (hot = el.dataset.metal));
    el.addEventListener('pointerleave', () => (hot = null));
  });
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    if (camera.aspect > 1.25) { base = Math.min(0.74, halfW / 6.5); group.position.set(halfW * 0.56, 0.4, 0); }
    else { base = 0.34; group.position.set(0.25, halfH - 0.85, 0); } // телефон: сцена справа вверху
  };
  const v = new THREE.Vector3();
  const redraw = loop(section, renderer, (t, dt) => {
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    const scroll = Math.min(Math.max(scrollY / (section.offsetHeight || 1), 0), 1);
    group.rotation.y = t * 0.1 + px * 0.5 + scroll * 1.4;
    group.rotation.x = py * 0.25 + scroll * 0.5;
    group.scale.setScalar(base);
    for (const it of items) {
      const p = Math.min(Math.max((t - it.delay) / 1.7, 0), 1), e = 1 - Math.pow(1 - p, 4); // детали слетаются
      v.copy(it.home).multiplyScalar(1 + scroll * (it.metal ? 0.5 : 1.3));
      it.mesh.position.lerpVectors(it.from, v, e);
      it.mesh.rotateOnAxis(it.axis, it.spin * dt * (hot && it.metal === hot ? 5 : 1));
      const s = hot && it.metal === hot ? 1.28 : hot && it.metal ? 0.86 : 1;
      it.scale += (s - it.scale) * 0.1;
      it.mesh.scale.setScalar(it.scale);
    }
    renderer.render(scene, camera);
  });
  new ResizeObserver(() => { fit(); redraw(); }).observe(canvas);
  fit();
}

/* ---------- Блок со звонком: две шестерни в зацеплении ---------- */
function gears(holder) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cta__canvas';
  holder.append(canvas);
  const { renderer, scene, camera } = makeRenderer(canvas);
  const group = new THREE.Group();
  scene.add(group);
  const A = { teeth: 18, pitch: 1.9 }, B = { teeth: 11, pitch: (1.9 * 11) / 18 };
  const a = new THREE.Mesh(gearGeo(A.teeth, A.pitch, 0.4, 0.5), mat('steel'));
  const b = new THREE.Mesh(gearGeo(B.teeth, B.pitch, 0.4, 0.32), mat('brass'));
  b.position.x = A.pitch + B.pitch;
  group.add(a, b);
  group.rotation.set(-0.5, -0.45, 0.1);
  const a0 = -0.3 * ((Math.PI * 2) / A.teeth), b0 = Math.PI - 0.8 * ((Math.PI * 2) / B.teeth);
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
    group.position.set(camera.aspect > 1.25 ? -halfW * 0.15 : -0.6, camera.aspect > 1.25 ? -1.3 : -2.2, 0);
    group.scale.setScalar(camera.aspect > 1.25 ? 1 : 0.6);
  };
  const redraw = loop(holder, renderer, (t) => {
    a.rotation.z = a0 + t * 0.25;
    b.rotation.z = b0 - (t * 0.25 * A.teeth) / B.teeth;
    renderer.render(scene, camera);
  });
  new ResizeObserver(() => { fit(); redraw(); }).observe(canvas);
  fit();
}

try {
  const c = document.querySelector('[data-3d="hero"]');
  if (c) hero(c);
  const cta = document.querySelector('.v2 .cta__media');
  if (cta) gears(cta);
  document.documentElement.classList.add('has-3d');
} catch (e) {
  // Нет WebGL — остаётся обычный стальной фон
  document.querySelectorAll('.hero2__canvas, .cta__canvas').forEach((el) => el.remove());
}

/* Карточки услуг наклоняются за курсором */
if (!calm && matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('.v2 .service').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg) translateZ(6px)`;
      card.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => (card.style.transform = ''));
  });
}
