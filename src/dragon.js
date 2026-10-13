// Dragon procédural : corps skinné (cou + queue ondulent), ailes à membrane reconstruites à chaque image.
// Repère : avant = +z, haut = +y. Le cavalier s'assoit sur `seat` (base du cou).
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

const TAU = Math.PI * 2;
// profil du corps le long de z : [z, y du centre, rayon]
const PROFILE = [[-15.5, 0.6, 0.05], [-13, 0.3, 0.22], [-9, -0.1, 0.45], [-5.5, -0.15, 0.85], [-3, 0, 1.3], [-0.5, 0, 1.7], [1.6, 0.15, 1.45], [3, 0.55, 0.8], [4.6, 1.3, 0.62], [6.2, 2.1, 0.55], [7.6, 2.7, 0.52], [8.7, 2.95, 0.5]];
function profileAt(z) {
  for (let i = 1; i < PROFILE.length; i++) if (z <= PROFILE[i][0]) {
    const a = PROFILE[i - 1], b = PROFILE[i], t = (z - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t);
    return [lerp(a[1], b[1], s), lerp(a[2], b[2], s)];
  }
  const l = PROFILE[PROFILE.length - 1]; return [l[1], l[2]];
}
// os : [nom, z au repos]
const SPINE = [['t5', -13], ['t4', -11], ['t3', -9], ['t2', -7], ['t1', -5], ['t0', -3], ['root', 0], ['n0', 2.5], ['n1', 4.2], ['n2', 5.8], ['n3', 7.2], ['head', 8.6]];

export function createDragon(tex) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const skinMat = new THREE.MeshStandardMaterial({ map: tex.scales, normalMap: tex.scalesN, normalScale: new THREE.Vector2(1.2, 1.2), color: 0x8a2416, roughness: 0.55, metalness: 0.15, vertexColors: true });
  const partMat = new THREE.MeshStandardMaterial({ map: tex.scales, normalMap: tex.scalesN, normalScale: new THREE.Vector2(1.2, 1.2), color: 0x8a2416, roughness: 0.55, metalness: 0.15 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xe0d6bc, roughness: 0.5 });
  const memMat = new THREE.MeshStandardMaterial({ color: 0x6a1a12, roughness: 0.75, side: THREE.DoubleSide, emissive: 0x2a0500, emissiveIntensity: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffaa00, emissiveIntensity: 2.2 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.8 });
  const mats = [skinMat, partMat, hornMat, memMat];
  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // ------------------------------------------------ os de la colonne
  const bones = {}, list = [];
  const root = new THREE.Bone(); root.name = 'root'; bones.root = root;
  const restY = (z) => profileAt(z)[0];
  let parent = root, prevZ = 0;
  for (const [n, z] of SPINE.filter(([n, z]) => z > 0)) { const b = new THREE.Bone(); b.name = n; b.position.set(0, restY(z) - restY(prevZ), z - prevZ); parent.add(b); bones[n] = b; parent = b; prevZ = z; }
  parent = root; prevZ = 0;
  for (const [n, z] of SPINE.filter(([n, z]) => z < 0).reverse()) { const b = new THREE.Bone(); b.name = n; b.position.set(0, restY(z) - restY(prevZ), z - prevZ); parent.add(b); bones[n] = b; parent = b; prevZ = z; }
  for (const [n] of SPINE) list.push(bones[n]);

  // ------------------------------------------------ maillage du corps (anneaux elliptiques)
  const RINGS = 110, SIDES = 18, z0 = -15.5, z1 = 9.2;
  const pos = [], uv = [], colr = [], si = [], sw = [], idx = [];
  let arc = 0, last = null;
  for (let r = 0; r <= RINGS; r++) {
    const z = lerp(z0, z1, r / RINGS), [cy, rad] = profileAt(z);
    const p = new THREE.Vector3(0, cy, z); if (last) arc += p.distanceTo(last); last = p;
    // os voisins
    let k = 0; while (k < SPINE.length - 2 && SPINE[k + 1][1] < z) k++;
    const za = SPINE[k][1], zb = SPINE[k + 1][1], t = clamp((z - za) / (zb - za), 0, 1);
    for (let s = 0; s <= SIDES; s++) {
      const a = s / SIDES * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const ridge = sa > 0.85 ? (sa - 0.85) * 1.2 : 0; // arête dorsale
      pos.push(ca * rad * 1.08, cy + sa * rad * (0.92 + ridge), z);
      uv.push(s / SIDES * 3, arc / 2.2);
      const belly = clamp(-sa * 1.4, 0, 1);
      colr.push(lerp(1, 2.3, belly), lerp(1, 1.9, belly), lerp(1, 1.2, belly));
      si.push(k, k + 1, 0, 0); sw.push(1 - t, t, 0, 0);
    }
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SIDES; s++) { const a = r * (SIDES + 1) + s, b = a + SIDES + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = cast(new THREE.SkinnedMesh(geo, skinMat)); mesh.frustumCulled = false;
  mesh.add(root); mesh.bind(new THREE.Skeleton(list)); body.add(mesh);

  // piques dorsales sur chaque os
  const spikeGeo = new THREE.ConeGeometry(0.22, 1, 6); spikeGeo.translate(0, 0.5, 0);
  for (const [n, z] of SPINE) {
    if (n === 'head') continue; const [, rad] = profileAt(z);
    for (const dz of [0, 0.8]) { const sp = cast(new THREE.Mesh(spikeGeo, hornMat)); sp.position.set(0, rad * 0.95, dz); sp.scale.set(rad * 0.9 + 0.2, rad * 0.9 + 0.3, rad * 0.9 + 0.2); sp.rotation.x = -0.6; bones[n].add(sp); }
  }
  // pointe de queue en fer de lance
  { const tip = cast(new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), hornMat)); tip.scale.set(0.25, 0.9, 1.3); tip.position.set(0, 0.5, -2.6); bones.t5.add(tip); }

  // ------------------------------------------------ tête
  const head = new THREE.Group(); head.position.set(0, 0.1, 0.4); bones.head.add(head);
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), partMat)); skull.scale.set(1.05, 0.85, 1.25); head.add(skull);
  const snoutG = new THREE.CylinderGeometry(0.32, 0.62, 2.2, 8); snoutG.rotateX(Math.PI / 2); snoutG.translate(0, -0.05, 1.5);
  const snout = cast(new THREE.Mesh(snoutG, partMat)); snout.scale.set(1, 0.75, 1); head.add(snout);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.35, 0.3); head.add(jaw);
  const jawG = new THREE.CylinderGeometry(0.26, 0.5, 2.1, 8); jawG.rotateX(Math.PI / 2); jawG.translate(0, -0.05, 1.1);
  const jawM = cast(new THREE.Mesh(jawG, partMat)); jawM.scale.set(0.95, 0.45, 1); jaw.add(jawM);
  for (const sd of [-1, 1]) {
    const hornG = new THREE.ConeGeometry(0.2, 2.2, 7); hornG.translate(0, 1.1, 0);
    const h1 = cast(new THREE.Mesh(hornG, hornMat)); h1.position.set(sd * 0.45, 0.45, -0.4); h1.rotation.set(-1.1, 0, sd * -0.35); head.add(h1);
    const h2 = cast(new THREE.Mesh(hornG, hornMat)); h2.position.set(sd * 0.6, 0.1, -0.5); h2.scale.setScalar(0.6); h2.rotation.set(-1.4, 0, sd * -0.9); head.add(h2);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat); eye.position.set(sd * 0.48, 0.28, 0.55); eye.scale.set(1, 0.6, 1.4); head.add(eye);
    const brow = cast(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 5), hornMat)); brow.position.set(sd * 0.45, 0.42, 0.75); brow.rotation.x = Math.PI / 2 + 0.3; head.add(brow);
    for (let t = 0; t < 4; t++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), hornMat); tooth.position.set(sd * 0.22, -0.32, 1.0 + t * 0.4); tooth.rotation.x = Math.PI; head.add(tooth); }
  }

  // ------------------------------------------------ pattes (repliées en vol)
  const legs = [];
  const seg = (r0, r1, l) => { const g = new THREE.CylinderGeometry(r1, r0, l, 8); g.translate(0, -l / 2, 0); return cast(new THREE.Mesh(g, partMat)); };
  for (const [z, front] of [[1.2, true], [-2.6, false]]) for (const sd of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sd * 1.1, -0.6, z); body.add(hip);
    const th = seg(0.55, 0.38, 2.0); hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -2.0; th.add(knee);
    const sh = seg(0.35, 0.22, 1.8); knee.add(sh);
    const foot = new THREE.Group(); foot.position.y = -1.8; sh.add(foot);
    for (let c = -1; c <= 1; c++) { const cl = cast(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 5), hornMat)); cl.position.set(c * 0.16, -0.1, 0.25); cl.rotation.x = Math.PI / 2 + 0.5; foot.add(cl); }
    legs.push({ hip, knee, front, sd });
  }

  // ------------------------------------------------ ailes
  const wings = [];
  const boneSeg = (l, r) => { const g = new THREE.CylinderGeometry(r * 0.6, r, l, 7); g.rotateZ(-Math.PI / 2); g.translate(l / 2, 0, 0); return cast(new THREE.Mesh(g, partMat)); };
  const FING = [[9.5, 0.25], [8.4, -0.2], [7.2, -0.62], [5.8, -1.05]]; // [longueur, angle dans le plan de l'aile]
  for (const sd of [-1, 1]) {
    const side = new THREE.Group(); side.scale.x = sd; body.add(side); // l'aile gauche est le miroir de la droite
    const shoulder = new THREE.Group(); shoulder.position.set(0.9, 1.05, 1.3); side.add(shoulder);
    shoulder.add(boneSeg(4.2, 0.42));
    const elbow = new THREE.Group(); elbow.position.x = 4.2; shoulder.add(elbow);
    elbow.add(boneSeg(5.2, 0.3));
    const wrist = new THREE.Group(); wrist.position.x = 5.2; elbow.add(wrist);
    const thumb = cast(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 5), hornMat)); thumb.rotation.z = -Math.PI / 2; thumb.position.set(0.2, 0.15, 0.3); wrist.add(thumb);
    const tips = FING.map(([l, a]) => { const f = new THREE.Group(); f.rotation.y = -a; wrist.add(f); f.add(boneSeg(l, 0.12)); const tip = new THREE.Object3D(); tip.position.x = l; f.add(tip); return { f, tip, a }; });
    const hipPt = new THREE.Object3D(); hipPt.position.set(0.9, 0.55, -4.2); side.add(hipPt);
    // membrane : 3 panneaux entre doigts + panneau intérieur (doigt 4 → bras → flanc)
    const R1 = 7, ROWS_IN = 10;
    const nVerts = 3 * (R1 + 1) * 3 + (ROWS_IN + 1) * 3;
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    const mi = [];
    for (let p = 0; p < 3; p++) for (let r = 0; r < R1; r++) for (let c = 0; c < 2; c++) { const a = p * (R1 + 1) * 3 + r * 3 + c, b = a + 3; mi.push(a, b, a + 1, b, b + 1, a + 1); }
    const baseIn = 3 * (R1 + 1) * 3;
    for (let r = 0; r < ROWS_IN; r++) for (let c = 0; c < 2; c++) { const a = baseIn + r * 3 + c, b = a + 3; mi.push(a, b, a + 1, b, b + 1, a + 1); }
    mg.setIndex(mi);
    const membrane = cast(new THREE.Mesh(mg, memMat)); membrane.frustumCulled = false; side.add(membrane);
    wings.push({ sd, side, shoulder, elbow, wrist, tips, hipPt, membrane });
  }

  // ------------------------------------------------ selle + siège du cavalier
  const seat = new THREE.Object3D(); seat.position.set(0, profileAt(3.0)[0] + profileAt(3.0)[1] * 1.1 + 0.05, 3.0); body.add(seat);
  { const sad = cast(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 1.4), leather)); sad.position.set(0, -0.08, 0); seat.add(sad);
    const cantle = cast(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.15), leather)); cantle.position.set(0, 0.1, -0.65); seat.add(cantle);
    const pommel = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), leather)); pommel.position.set(0, 0.1, 0.65); seat.add(pommel); }

  group.scale.setScalar(0.85);

  // ------------------------------------------------ animation
  const w = new THREE.Vector3(), inv = new THREE.Matrix4(), state = { phase: 0, amp: 0.5, bank: 0, turn: 0, time: 0, mouth: 0 };
  const P = [];
  function local(o, v) { o.updateWorldMatrix(true, false); return v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv); }
  function rebuild(wg) {
    inv.copy(wg.side.matrixWorld).invert();
    const W = local(wg.wrist, new THREE.Vector3()), E = local(wg.elbow, new THREE.Vector3()), S = local(wg.shoulder, new THREE.Vector3()), H = local(wg.hipPt, new THREE.Vector3());
    const T = wg.tips.map((t) => local(t.tip, new THREE.Vector3()));
    const arr = wg.membrane.geometry.attributes.position.array; let o = 0;
    const put = (v) => { arr[o++] = v.x; arr[o++] = v.y; arr[o++] = v.z; };
    const A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3();
    for (let p = 0; p < 3; p++) for (let r = 0; r <= 7; r++) {
      const t = r / 7; A.lerpVectors(W, T[p], t); B.lerpVectors(W, T[p + 1], t);
      M.lerpVectors(A, B, 0.5).lerp(W, 0.16 * t * t); M.y -= 0.25 * Math.sin(t * Math.PI) * state.amp;
      put(A); put(M); put(B);
    }
    // panneau intérieur : du bras (épaule → coude → poignet) vers le bord de fuite (flanc → doigt 4)
    const lenSE = S.distanceTo(E), lenEW = E.distanceTo(W);
    for (let r = 0; r <= 10; r++) {
      const t = r / 10, d = t * (lenSE + lenEW);
      if (d < lenSE) A.lerpVectors(S, E, d / lenSE); else A.lerpVectors(E, W, (d - lenSE) / lenEW);
      B.lerpVectors(H, T[3], t); B.lerp(A, 0.14 * Math.sin(t * Math.PI));
      M.lerpVectors(A, B, 0.5); M.y -= 0.35 * Math.sin(t * Math.PI) * state.amp;
      put(A); put(M); put(B);
    }
    wg.membrane.geometry.attributes.position.needsUpdate = true; wg.membrane.geometry.computeVertexNormals();
  }

  return {
    group, body, seat, mats, skinMat, partMat, memMat, head, jaw, state,
    // flap 0..1 (battements), bank (roulis), turn (vitesse de virage), dt
    update(dt, flap, bank, turn) {
      const s = state; s.time += dt;
      s.amp = lerp(s.amp, clamp(flap, 0, 1), 1 - Math.exp(-3 * dt));
      s.phase += dt * TAU * lerp(0.45, 1.25, s.amp);
      const ph = s.phase, a = s.amp, sn = Math.sin(ph);
      for (const wg of wings) {
        const glide = 0.1 + Math.sin(s.time * 0.8) * 0.03;
        wg.shoulder.rotation.z = lerp(glide, 0.15 + 0.78 * sn, a);
        const fold = a * (0.5 + 0.5 * Math.cos(ph)) * 0.55;
        wg.shoulder.rotation.y = 0.3 + fold * 0.3;
        wg.elbow.rotation.set(0, -0.6 - fold * 0.5, lerp(-0.05, -0.28 * Math.sin(ph - 0.9), a));
        wg.wrist.rotation.set(0, 0.55 + fold * 0.8, lerp(-0.04, -0.22 * Math.sin(ph - 1.6), a));
        wg.tips.forEach((t, i) => { t.f.rotation.z = lerp(-0.03, -0.12 * Math.sin(ph - 2 - i * 0.2), a) - 0.02 * i; });
      }
      body.position.y = Math.cos(ph) * 0.45 * a;
      body.rotation.x = -Math.sin(ph) * 0.03 * a;
      // cou et queue
      s.bank = lerp(s.bank, bank, 1 - Math.exp(-4 * dt)); s.turn = lerp(s.turn, turn, 1 - Math.exp(-4 * dt));
      const tl = ['t0', 't1', 't2', 't3', 't4', 't5'];
      tl.forEach((n, i) => { const b = bones[n]; b.rotation.y = Math.sin(s.time * 1.6 - i * 0.7) * 0.05 * (1 + i * 0.25) - s.turn * 0.08; b.rotation.x = Math.sin(s.time * 1.1 - i * 0.5) * 0.04 + Math.cos(ph - i * 0.6) * 0.03 * a; });
      ['n1', 'n2', 'n3'].forEach((n, i) => { const b = bones[n]; b.rotation.y = s.turn * 0.07 + Math.sin(s.time * 0.7 + i) * 0.03; b.rotation.x = -Math.cos(ph - 0.5 - i * 0.4) * 0.025 * a; });
      bones.head.rotation.set(0.15 + Math.sin(s.time * 0.9) * 0.04, s.turn * 0.12, -s.bank * 0.3);
      jaw.rotation.x = 0.06 + s.mouth * 0.55 + Math.max(0, Math.sin(s.time * 0.5)) * 0.04;
      for (const l of legs) { l.hip.rotation.set(l.front ? -1.1 : -1.4, 0, l.sd * 0.15); l.knee.rotation.x = l.front ? 1.9 : 2.2; }
      group.updateMatrixWorld(true);
      for (const wg of wings) rebuild(wg);
    },
  };
}
