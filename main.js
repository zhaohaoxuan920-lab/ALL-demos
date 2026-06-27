import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// --- 1. Master Graphics Canvas Engine ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205); // Void dark atmosphere

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 16); //

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; 
renderer.toneMappingExposure = 1.4; //
document.body.appendChild(renderer.domElement);

// --- 2. Advanced High-Exposure Bloom Pass ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    3,  // Strong radiant emission
    0.08, // Crisp glow boundary radius
    0.38  // Low threshold
);
composer.addPass(bloomPass);
document.body.appendChild(renderer.domElement);

// 🌟 Add these 3 lines here:
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Makes the camera movement feel smooth and professional
controls.dampingFactor = 0.05;

// --- 3. Scene Objects (Target & Ambient Lights) ---
const boxGeo = new THREE.BoxGeometry(1, 10, 10);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.6, metalness: 0.4 });
const targetBox = new THREE.Mesh(boxGeo, boxMat);
targetBox.position.set(8, 0, 0); //
scene.add(targetBox);

scene.add(new THREE.AmbientLight(0xffffff, 0.02)); //
const projectileGlowLight = new THREE.PointLight(0xff7722, 6, 18);
scene.add(projectileGlowLight); //

// --- 4. Procedural Alpha Maps ---
const generateParticleTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,200,100,0.8)');
    grad.addColorStop(0.55, 'rgba(200,50,10,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
};
const flameTexture = generateParticleTexture(); //

// --- 5. High-Density Particle Engine Configuration ---
const MAX_PARTICLES = 7000; 
const pGeometry = new THREE.BufferGeometry();

const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
const sizes = new Float32Array(MAX_PARTICLES);

pGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
pGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
pGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); //
let flightTime = 0;
let isTrailActive = true;

// 🚀 核心触发器：负责把所有物理和渲染状态一键拉回完美起点
function triggerAnimation() {
  // 1. 恢复目标方块的大小
  targetBox.scale.set(1, 10, 10);
  
  // 2. 彻底强行熄灭内存池里所有残留的粒子，腾出干净的画布
  for (let i = 0; i < MAX_PARTICLES; i++) {
    activeParticles[i].active = false;
  }
  
  // 3. 把火箭瞬移回最左侧起点，并将时间归零
  boltPos.set(-30, 0, 0); 
  flightTime = 0; 
  
  // 4. 激活随身点光源的亮度和位置，死死按在起跑线上
  projectileGlowLight.intensity = 6;
  projectileGlowLight.position.copy(boltPos);
  
  // 5. 拉满后期通道的酷炫辉光效果
  bloomPass.strength = 3.0; 
  
  // 6. 闸门开启！允许火箭向前冲
  isExploded = false; 
  isTrailActive = true; 
}
const pMaterial = new THREE.ShaderMaterial({
    uniforms: { uTexture: { value: flameTexture } },
    vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = size * (300.0 / -mvPosition.z);
        }
    `, //
    fragmentShader: `
        uniform sampler2D uTexture;
        varying vec3 vColor;
        void main() {
            vec4 texColor = texture2D(uTexture, gl_PointCoord);
            if (texColor.a < 0.02) discard;
            gl_FragColor = vec4(vColor * texColor.rgb, texColor.a);
        }
    `, //
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
});

const mainParticleSystem = new THREE.Points(pGeometry, pMaterial);
scene.add(mainParticleSystem); //

// --- 6. Global Simulation Memory Pool ---
const activeParticles = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
    activeParticles.push({
        active: false, x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        r: 0, g: 0, b: 0,
        size: 0, age: 0, maxAge: 0,
        growth: 1.0, type: 'head'
    });
} //

function spawnVFXParticle(x, y, z, vx, vy, vz, r, g, b, size, maxAge, growth, type) {
    const p = activeParticles.find(item => !item.active);
    if (!p) return;
    p.active = true; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.r = r; p.g = g; p.b = b; p.size = size;
    p.age = 0; p.maxAge = maxAge; p.growth = growth; p.type = type;
} //

// --- 7. Multi-Stage Realistic Explosion Trigger ---
// ====== 2. 升级版三阶段碰撞爆炸 (完全替换 triggerRealisticExplosion) ======
function triggerRealisticExplosion(x, y, z) {
  
  // 阶段 A：中心高能强光闪烁 (Flash) - 瞬间充满中心
  for (let i = 0; i < 60; i++) {
    spawnVFXParticle(
      x + (Math.random() - 0.5) * 0.8,
      y + (Math.random() - 0.5) * 0.8,
      z + (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 6, 
      (Math.random() - 0.5) * 6, 
      (Math.random() - 0.5) * 6,
      3.5, 3.0, 2.5,                // 极高亮度的白黄光（配合 Bloom 滤镜会爆炸）
      3 + Math.random() * 2,    // 体积巨大
      0.5 + Math.random() * 0.2,   // 瞬间闪烁并消失
      1.08,                         // 快速膨胀
      'exp-flash'
    );
  }

  // 阶段 B：向外扩张的火焰与烟雾冲击波 (Fire Plumes)
  for (let i = 0; i < 250; i++) {
    const theta = Math.random() * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * Math.random() - 1.0);
    // 给粒子一个强烈向外的初始爆发速度
    const speed = 6.0 + Math.random() * 14.0; 
    
    spawnVFXParticle(
      x, y, z,
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed,
      Math.cos(phi) * speed,
      2.5, 0.5, 0.02,               // 核心浓烈火焰色
      2 + Math.random() * 1.5,    // 较大的火焰团
      2.5 + Math.random() * 2,    // 存活适中
      0.97,                         // 模拟空气阻力使其逐渐变小
      'exp-fire'
    );
  }

  // 阶段 C：高速放射状散射的火星流 (Kinetic Sparks)
  for (let i = 0; i < 200; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 12.0 + Math.random() * 18.0; // 极快的喷射速度
    
    spawnVFXParticle(
      x, y, z,
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed,
      Math.cos(phi) * speed,
      3.0, 1.2, 0.1,                // 金黄色火星
      0.5 + Math.random() * 0.6,
      0.4 + Math.random() * 0.5,
      0.88,
      'exp-spark'
    );
  }
}

// --- 8. Linear Path Simulation & Animation Loop ---
// --- 8. Linear Path Simulation & Animation Loop ---
const clock = new THREE.Clock();
let isExploded = false;
const flightSpeed = 17.5;
const boltPos = new THREE.Vector3(-30, 0, 0);

// ✅ 彻底删除了原本会冲突的单独 render() 函数！保证 clock.getDelta() 全局唯一。

function animate() {
  requestAnimationFrame(animate);
  
  // 1. 全局唯独在这里获取一次 delta，保证物理计算绝对准确
  const delta = Math.min(clock.getDelta(), 0.1); 
  const time = clock.getElapsedTime(); 

  // ====== 1. 修复版的飞行拖尾 ======
  // ✅ 放弃受 delta 严重影响的乘法，线上即使高帧率，也每帧固定生成平滑数量的粒子，确保效果一致
  const densityRate = 18; 
  
  for (let i = 0; i < densityRate; i++) {
    
    
    const offset = Math.random() * 1.8;
    const rx = boltPos.x - offset;
    
    // 模拟不稳定的火焰抖动
    const waveY = Math.sin(time * 32.0 + rx * 3.0) * 0.4 + Math.cos(time * 16.0 + rx * 1.5) * 0.2;
    const waveZ = Math.cos(time * 26.0 + rx * 2.5) * 0.4;
    const ry = boltPos.y + waveY + (Math.random() - 0.5) * 0.3;
    const rz = boltPos.z + waveZ + (Math.random() - 0.5) * 0.3;

    // 随机分配粒子类型：70% 火焰烟雾，30% 飞散的火星
    if (Math.random() > 0.3) {
      const vx = -3.5 - Math.random() * 3.0;
      const vy = (Math.random() - 0.5) * 1.0;
      const vz = (Math.random() - 0.5) * 1.0;
      
      spawnVFXParticle(
        rx, ry, rz, vx, vy, vz,
        2.5, 0.6, 0.05, 
        1.8 + Math.random() * 1.5, 
        0.9 + Math.random() * 0.7, 
        0.96, 
        'trail'
      );
    } else {
      const vx = -8.0 - Math.random() * 4.8;
      const vy = (Math.random() - 0.5) * 6.0;
      const vz = (Math.random() - 0.5) * 6.0;
      
      spawnVFXParticle(
        rx, ry, rz, vx, vy, vz,
        2.5, 0.6, 0.05,
        1.8 + Math.random() * 1.5,
        1.8 + Math.random() * 1.2, 
        0.975, 
        'trail'
      );
    }
  }
  
  if (!isExploded) {
    
    boltPos.x += flightSpeed * delta;
    projectileGlowLight.position.copy(boltPos); 
    
    // Core Combustion Cluster
    for (let i = 0; i < 6; i++) {
      spawnVFXParticle(
        boltPos.x + (Math.random() - 0.5) * 0.3,
        boltPos.y + (Math.random() - 0.5) * 0.3,
        boltPos.z + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.0, 
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 1.0,
        2.5, 2.2, 1.8,
        2.0 + Math.random() * 1.0, 
        0.08 + Math.random() * 0.06, 
        0.92, 
        'head'
      );
    } 

    // Kinetic Fire Ejection Trail
    // ✅ 同样将依赖 delta 的数量改为固定生成基数
    const kineticRate = 12;
    for (let i = 0; i < kineticRate; i++) {
      const offset = (Math.random() * 1.5);
      const rx = boltPos.x - offset;
      
      const waveY = Math.sin(time * 28.0 + rx * 2.5) * 0.45 + Math.cos(time * 14.0 + rx * 1.2) * 0.25;
      const waveZ = Math.cos(time * 24.0 + rx * 2.2) * 0.45;
      const ry = boltPos.y + waveY + (Math.random() - 0.5) * 0.4;
      const rz = boltPos.z + waveZ + (Math.random() - 0.5) * 0.4;
      const vx = -4.5 - Math.random() * 4.0;
      const vy = (Math.random() - 0.5) * 1.2;
      const vz = (Math.random() - 0.5) * 1.2;
      
      spawnVFXParticle(
        rx, ry, rz,
        vx * 1.2, vy, vz,
        2.2, 0.4, 0.02,
        1.5 + Math.random() * 1.2,
        1.8 + Math.random() * 1.2, 
        0.975,
        'trail'
      );
    }

    // Micro Spark Shreds
    if (Math.random() > 0.3) {
      spawnVFXParticle(
        boltPos.x, boltPos.y, boltPos.z,
        -8.0 - Math.random() * 6.0, 
        (Math.random() - 0.5) * 5.0,
        (Math.random() - 0.5) * 5.0,
        2.5, 0.8, 0.1,
        0.4 + Math.random() * 0.4, 
        0.2 + Math.random() * 0.3, 
        0.9,
        'trail-spark'
      );
    } 
  }

   // ====== 修改后的动态辉光碰撞检测 (Collision Check) ======
   // ====== 彻底解决收尾红圈：清空残留粒子版 ======
  
   // ====== 🌟 精准修改：撞击只触发一次爆炸逻辑 ======
  if (!isExploded && boltPos.x >= targetBox.position.x - 1.8) {
    // 1. 立刻切断辉光
    bloomPass.strength = 1.0; 
    isExploded = true; 
    // 2. 💥 只在这里触发唯一一次生成爆炸粒子
    triggerRealisticExplosion(boltPos.x + 0.8, boltPos.y, boltPos.z);
    targetBox.scale.set(0.85, 0.85, 0.85);
    setTimeout(() => {
    // 3. 把火箭坐标瞬间丢到安全区，防止下一帧再次满足 "boltPos.x >= ..." 的撞击条件
    boltPos.set(999, 0, 0); 
    projectileGlowLight.intensity = 0; 
   }, 200); 
    // 4. 设为 true，告诉系统当前处于“已爆炸完毕、等待重置”的状态
    
  }


  // --- 9. Fixed Matrix Buffer Arrays Array Updates ---
  const posArr = pGeometry.getAttribute('position').array;
  const colArr = pGeometry.getAttribute('color').array;
  const sizArr = pGeometry.getAttribute('size').array;
  let liveCounter = 0;
  
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = activeParticles[i];
    if (p.active) {
      p.age += delta;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;
      if (p.type.startsWith('exp')) {
        p.vx *= 0.91; p.vy *= 0.91; p.vz *= 0.91;
      } 
      p.size *= p.growth;
      const lifePct = p.age / p.maxAge;
      const idx = liveCounter * 3;
      posArr[idx] = p.x;
      posArr[idx + 1] = p.y;
      posArr[idx + 2] = p.z;

      const falloff = Math.max(0, 1.0 - lifePct);
      const isTrail = p.type.startsWith('trail');
      if (isTrail) {
        colArr[idx] = (p.r * 0.30) * falloff;
        colArr[idx + 1] = p.g * Math.pow(falloff, 2.5);
        colArr[idx + 2] = p.b * Math.pow(falloff, 5.0);
      } else {
        colArr[idx] = p.r * falloff;
        colArr[idx + 1] = p.g * Math.pow(falloff, 2.5);
        colArr[idx + 2] = p.b * Math.pow(falloff, 5.0);
      }
      sizArr[liveCounter] = p.size * falloff;
      liveCounter++;
    }
  }
  
  pGeometry.getAttribute('position').needsUpdate = true;
  pGeometry.getAttribute('color').needsUpdate = true;
  pGeometry.getAttribute('size').needsUpdate = true;
  pGeometry.setDrawRange(0, liveCounter); 
  
  controls.update();
  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}); 
// ====== 2. 彻底修复：点击按钮强制解锁并发射 ======
document.getElementById('launch-btn').addEventListener('click', () => {
  // 只有当火箭静止/已爆炸时，才允许重新触发
  if (isExploded) {
    triggerAnimation();
  }
  
});

animate();
triggerAnimation();
