// Souffle de feu du dragon : particules additives (flamme blanche → jaune → orange → rouge → fumée), lumière vacillante.
import * as THREE from 'three';

export function createFire(scene) {
  const N = 1400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), maxLife = new Float32Array(N), seed = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(N), 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  for (let i = 0; i < N; i++) { seed[i] = Math.random(); pos[i * 3 + 1] = -1e5; }
  // texture de flamme douce
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: new THREE.CanvasTexture(cv) }, scale: { value: 600 } },
    vertexShader: `attribute float aLife; attribute float aSeed; uniform float scale; varying float vL; varying float vS;
      void main() { vL = aLife; vS = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float size = mix(0.6, 5.5, smoothstep(0.0, 1.0, aLife)) * (0.7 + aSeed * 0.6);
        gl_PointSize = size * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vL; varying float vS;
      void main() { if (vL <= 0.0 || vL >= 1.0) discard; float a = texture2D(map, gl_PointCoord).a;
        vec3 hot = vec3(1.0, 0.9, 0.55), mid = vec3(1.0, 0.42, 0.05), cool = vec3(0.8, 0.1, 0.01), smoke = vec3(0.1, 0.08, 0.07);
        vec3 c = vL < 0.15 ? mix(hot, mid, vL / 0.15) : vL < 0.5 ? mix(mid, cool, (vL - 0.15) / 0.35) : mix(cool, smoke, (vL - 0.5) / 0.5);
        float alpha = a * (1.0 - smoothstep(0.55, 1.0, vL)) * (vL < 0.5 ? 1.0 : 0.6);
        gl_FragColor = vec4(c * (vL < 0.5 ? 2.6 : 0.5), alpha * (0.7 + vS * 0.3)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
  const light = new THREE.PointLight(0xff7a2a, 0, 60, 1.6); scene.add(light);
  let next = 0, power = 0;
  const lifeAttr = geo.attributes.aLife.array;
  return {
    // origin : gueule (monde), dir : direction du souffle (unitaire), carrier : vitesse de la monture
    update(dt, on, origin, dir, carrier) {
      power += ((on ? 1 : 0) - power) * (1 - Math.exp(-8 * dt));
      if (on) {
        const n = Math.floor(480 * dt) + 1;
        for (let k = 0; k < n; k++) {
          const i = next; next = (next + 1) % N;
          const sp = 48 + Math.random() * 22, spread = 0.07;
          pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
          vel[i * 3] = (dir.x + (Math.random() - 0.5) * spread * 2) * sp + carrier.x;
          vel[i * 3 + 1] = (dir.y + (Math.random() - 0.5) * spread * 2) * sp + carrier.y;
          vel[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * spread * 2) * sp + carrier.z;
          life[i] = 0.0001; maxLife[i] = 0.9 + Math.random() * 0.6;
        }
      }
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { lifeAttr[i] = 0; continue; }
        life[i] += dt / maxLife[i]; if (life[i] >= 1) { life[i] = 0; lifeAttr[i] = 0; pos[i * 3 + 1] = -1e5; continue; }
        const drag = Math.exp(-2.2 * dt), t = performance.now() * 0.003 + i;
        vel[i * 3] = vel[i * 3] * drag + Math.sin(t) * 6 * dt; vel[i * 3 + 2] = vel[i * 3 + 2] * drag + Math.cos(t * 1.3) * 6 * dt;
        vel[i * 3 + 1] = vel[i * 3 + 1] * drag + (life[i] > 0.4 ? 9 : 3) * dt; // la fumée monte
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        lifeAttr[i] = life[i];
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aLife.needsUpdate = true;
      if (origin) light.position.copy(origin).addScaledVector(dir, 6);
      light.intensity = power * (900 + Math.random() * 500);
    },
  };
}
