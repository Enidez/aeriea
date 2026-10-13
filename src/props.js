// Armes procédurales (épée longue, espadon) et fixation dans la main d'un squelette.
import * as THREE from 'three';

const steel = new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 1, roughness: 0.22 });
const gold = new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 1, roughness: 0.3 });
const leather = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.85 });

// lame le long de +Y, poignée centrée à l'origine (là où se ferme la main)
export function makeSword(len = 0.9, width = 0.055) {
  const g = new THREE.Group();
  const s = new THREE.Shape(); // profil de lame avec gouttière et pointe
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width * 0.42, len * 0.86); s.lineTo(0, len); s.lineTo(-width * 0.42, len * 0.86); s.lineTo(-width / 2, 0);
  const bladeG = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 });
  bladeG.translate(0, 0.12, -0.004);
  const blade = new THREE.Mesh(bladeG, steel); g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(width * 4.2, 0.03, 0.035), gold); guard.position.y = 0.115; g.add(guard);
  for (const sd of [-1, 1]) { const q = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), gold); q.position.set(sd * width * 2.1, 0.115, 0); g.add(q); }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, len * 0.24, 8), leather); grip.position.y = 0.115 - len * 0.12; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), gold); pommel.position.y = 0.115 - len * 0.24 - 0.02; g.add(pommel);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.y = 0; g.children.forEach((c) => { c.position.y -= 0.115 - len * 0.12; }); // origine = milieu de la poignée
  return g;
}

// fixe une arme dans la main en reprenant l'orientation de l'arme tenue par le modèle source (même animation)
// srcWeapon : maillage d'arme du modèle source, en pose de liaison ; la lame de `weapon` est le long de +Y
export function gripLike(srcWeapon, hand, fingerTip, weapon) {
  srcWeapon.updateWorldMatrix(true, false); hand.updateWorldMatrix(true, false);
  const g = srcWeapon.geometry; g.computeBoundingBox();
  const size = g.boundingBox.getSize(new THREE.Vector3()), c = g.boundingBox.getCenter(new THREE.Vector3());
  const ax = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  const blade = new THREE.Vector3(); blade[ax] = Math.sign(c[ax]) || 1;
  weapon.quaternion.copy(srcWeapon.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), blade));
  const hp = hand.getWorldPosition(new THREE.Vector3()), fp = fingerTip.getWorldPosition(new THREE.Vector3());
  weapon.position.copy(hp).lerp(fp, 0.6);
  weapon.updateMatrixWorld(true); hand.attach(weapon); // position monde → repère de la main
  return weapon;
}
