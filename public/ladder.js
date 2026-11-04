// Pathwise climbing scene: a student climbing the academic ladder toward the logo's mint dot.
// Three.js is fetched only when a sign-in screen mounts this, so signed-in pages never pay for it.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
let threeP;
export const preloadThree = () => (threeP ||= import(THREE_URL));

const RUNG = 0.42;           // rung spacing in world units
const PERIOD = RUNG * 8;     // one milestone plaque every 8 rungs; the ladder offset repeats with this period
const SPEED = 0.55;          // climb speed, units per second

export async function mountLadder(el, { dark = false, labels = ['9th grade', '10th grade', '11th grade', '12th grade', 'College'] } = {}) {
  let THREE;
  try { THREE = await preloadThree(); } catch { return null; }   // offline or CDN blocked: the page keeps its static fallback
  if (!el.isConnected) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  el.appendChild(renderer.domElement);
  el.classList.add('has-scene');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(dark ? 0x0b1713 : 0xe6f0ec, 10, 22);
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x12382b : 0xb9e5d2, dark ? 1.2 : 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.8 : 2.4); sun.position.set(4, 8, 6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x58d6a4, dark ? 2.2 : 1.3); rim.position.set(-5, 3, -4); scene.add(rim);

  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
  const M = {
    rail: mat(dark ? 0xd9ebe3 : 0xffffff, { roughness: 0.3 }),
    rung: mat(0x1f7a5a, { roughness: 0.4 }),
    hoodie: mat(0x58d6a4, { roughness: 0.7 }),
    pants: mat(0x163a2e, { roughness: 0.8 }),
    skin: mat(0xc99273, { roughness: 0.6 }),
    pack: mat(0xf2f7f5, { roughness: 0.45 }),
    cap: mat(0x10241c, { roughness: 0.5 }),
    shoe: mat(0xffffff, { roughness: 0.5 }),
  };

  // Ladder: two long rails and enough rungs to fill the view; the whole group slides down by (climb mod PERIOD).
  const ladder = new THREE.Group(); scene.add(ladder);
  const railGeo = new THREE.BoxGeometry(0.09, 26, 0.12);
  for (const x of [-0.55, 0.55]) { const r = new THREE.Mesh(railGeo, M.rail); r.position.x = x; ladder.add(r); }
  const rungGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 12); rungGeo.rotateZ(Math.PI / 2);
  for (let y = -12; y <= 12; y += RUNG) { const r = new THREE.Mesh(rungGeo, M.rung); r.position.y = y; ladder.add(r); }

  // Milestone plaques: frosted glass tags drawn on a canvas, relabelled each time the ladder wraps.
  const plaques = [];
  const drawPlaque = (p, text) => {
    const c = p.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = dark ? 'rgba(22,40,33,.72)' : 'rgba(255,255,255,.78)';
    g.strokeStyle = dark ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,1)';
    g.lineWidth = 4;
    g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 28); g.fill(); g.stroke();
    g.fillStyle = '#58d6a4'; g.beginPath(); g.arc(52, c.height / 2, 13, 0, 7); g.fill();
    g.fillStyle = dark ? '#eaf4ef' : '#0f2a20';
    g.font = '600 50px "Schibsted Grotesk", system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, 86, c.height / 2 + 2);
    p.material.map.needsUpdate = true;
  };
  const plaqueGeo = new THREE.PlaneGeometry(1.5, 0.45);
  for (let i = -2; i <= 3; i++) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 480, height: 144 });
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const p = new THREE.Mesh(plaqueGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const side = i % 2 ? 1 : -1;
    p.position.set(side * 1.45, i * PERIOD + 0.2, 0.05);
    p.rotation.y = side > 0 ? -0.18 : 0.32;
    p.userData = { canvas, i };
    ladder.add(p); plaques.push(p);
  }
  let cycle = -1;
  const relabel = () => plaques.forEach(p => drawPlaque(p, labels[(((p.userData.i + cycle) % labels.length) + labels.length) % labels.length]));
  document.fonts?.ready.then(() => relabel());

  // Goal: the mint dot from the Pathwise logo, waiting above the ladder.
  const goal = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0x58d6a4, fog: false }));
  goal.position.set(0.2, 3.3, -2.5); scene.add(goal);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.31, 48), new THREE.MeshBasicMaterial({ color: 0x58d6a4, transparent: true, opacity: 0.45, fog: false }));
  halo.position.copy(goal.position); scene.add(halo);

  // Student, built facing +z, then turned to face the ladder. Limbs hang from pivot groups.
  const capsule = (r, len, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
  const limb = (r, len, m) => { const pivot = new THREE.Group(), seg = capsule(r, len, m); seg.position.y = -len / 2 - r * 0.4; pivot.add(seg); return pivot; };
  const student = new THREE.Group(), body = new THREE.Group(); student.add(body);
  const torso = capsule(0.17, 0.32, M.hoodie); torso.position.y = 0.55; body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), M.skin); head.position.y = 0.98; body.add(head);
  const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.36), M.cap); capTop.position.set(0, 1.13, 0); capTop.rotation.y = 0.785; body.add(capTop);
  const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 16), M.cap); capBase.position.y = 1.09; body.add(capBase);
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), M.hoodie); tassel.position.set(0.15, 1.06, 0.06); body.add(tassel);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), M.pack); pack.position.set(0, 0.6, -0.2); body.add(pack);
  const armL = limb(0.055, 0.42, M.hoodie), armR = limb(0.055, 0.42, M.hoodie);
  armL.position.set(-0.23, 0.78, 0); armR.position.set(0.23, 0.78, 0); body.add(armL, armR);
  const mkLeg = x => {
    const hip = limb(0.07, 0.26, M.pants); hip.position.set(x, 0.3, 0);
    const knee = limb(0.06, 0.26, M.pants); knee.position.y = -0.36; hip.add(knee);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), M.shoe); shoe.position.set(0, -0.36, 0.04); knee.add(shoe);
    body.add(hip); return { hip, knee };
  };
  const legL = mkLeg(-0.1), legR = mkLeg(0.1);
  student.rotation.y = Math.PI;
  student.position.set(0, -0.95, 0.42); student.scale.setScalar(1.2);
  scene.add(student);

  const size = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    // Narrow panels pull the camera back so the climber and a plaque both stay in frame.
    cam.position.set(2.6, 1.3, w / h < 0.8 ? 10.5 : 8.6); cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size); ro.observe(el); size();

  const clock = new THREE.Clock();
  let climb = 0;
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (!reduce) climb += dt * SPEED;
    const wraps = Math.floor(climb / PERIOD);
    if (wraps !== cycle) { cycle = wraps; relabel(); }
    ladder.position.y = -(climb % PERIOD);
    // One full limb cycle per two rungs: each hand reaches for every other rung.
    const ph = (climb / (RUNG * 2)) * Math.PI * 2, s = Math.sin(ph);
    armL.rotation.x = -2.55 - 0.45 * s; armR.rotation.x = -2.55 + 0.45 * s;
    armL.rotation.z = -0.12; armR.rotation.z = 0.12;
    legL.hip.rotation.x = -0.75 - 0.5 * Math.max(0, -s); legL.knee.rotation.x = 1.1 + 0.5 * Math.max(0, -s);
    legR.hip.rotation.x = -0.75 - 0.5 * Math.max(0, s); legR.knee.rotation.x = 1.1 + 0.5 * Math.max(0, s);
    body.position.y = 0.035 * Math.abs(Math.sin(ph));
    body.rotation.z = 0.04 * s;
    const pulse = reduce ? 1 : 1 + 0.08 * Math.sin(t * 2.2);
    halo.scale.setScalar(pulse * 1.15); goal.scale.setScalar(pulse);
    halo.lookAt(cam.position);
    cam.position.x = 2.6 + (reduce ? 0 : Math.sin(t * 0.18) * 0.6);
    cam.lookAt(-0.75, -0.1, 0);
    renderer.render(scene, cam);
  };

  let running = false;
  const play = () => { const on = !document.hidden && !reduce; if (on === running) return; running = on; renderer.setAnimationLoop(on ? frame : null); if (on) clock.getDelta(); };
  document.addEventListener('visibilitychange', play);
  play(); frame();   // reduced motion: one still frame, no loop

  return {
    destroy() {
      document.removeEventListener('visibilitychange', play);
      renderer.setAnimationLoop(null); ro.disconnect();
      scene.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      el.classList.remove('has-scene');
    },
  };
}
