// ===== 物品配置（真实图片 + 多条音频随机播）=====
const ITEMS = [
  {
    id: 'carrot',
    name: '胡萝卜',
    img: 'assets/images/胡萝卜_transparent.png',
    audios: ['assets/audio/萝卜.mp3'],
  },
  {
    id: 'tissue',
    name: '纸巾',
    img: 'assets/images/纸巾.png',
    audios: ['assets/audio/纸巾.mp3', 'assets/audio/纸巾2.mp3'],
  },
  {
    id: 'mouse',
    name: '米老鼠',
    img: 'assets/images/米老鼠_transparent.png',
    audios: ['assets/audio/米老鼠1.mp3', 'assets/audio/米老鼠2.mp3'],
  },
];

// 真棒随机版本
const ZHENBANG_AUDIOS = [
  'assets/audio/真棒1.mp3',
  'assets/audio/真棒2.mp3',
  'assets/audio/真棒3.mp3',
  'assets/audio/真棒（超大声）.mp3',
];
// 投喂声（答对后有50%概率播放）
const TOUWEI_AUDIO = 'assets/audio/投喂声.mp3';

// 小猫图片列表
const CAT_IMAGES = [
  'assets/images/小猫 1.png',
  'assets/images/小猫 2.png',
  'assets/images/小猫 3.png',
  'assets/images/小猫 4.png',
];
let currentCatIndex = Math.floor(Math.random() * CAT_IMAGES.length);

const CAT_FOOD_KEY = 'zhenbang_cat_food';

// ===== 游戏状态 =====
let catFood     = 0;
let targetItem  = null;
let roundActive = false;
let audioCache  = {};

// ===== DOM 引用 =====
const floor              = document.getElementById('floor');
const promptBubble       = document.getElementById('prompt-bubble');
const promptText         = document.getElementById('prompt-text');
const catFoodCount       = document.getElementById('cat-food-count');
const catFace            = document.getElementById('cat-face');
const particlesContainer = document.getElementById('particles-container');
const startOverlay       = document.getElementById('start-overlay');
const startBtn           = document.getElementById('start-btn');

// ===== 初始化 =====
function init() {
  catFood = parseInt(localStorage.getItem(CAT_FOOD_KEY) || '0', 10);
  catFoodCount.textContent = catFood;

  // 随机初始猫图
  document.getElementById('cat-img').src = CAT_IMAGES[currentCatIndex];

  // 换一换按钮
  document.getElementById('cat-switch-btn').addEventListener('click', () => {
    currentCatIndex = (currentCatIndex + 1) % CAT_IMAGES.length;
    document.getElementById('cat-img').src = CAT_IMAGES[currentCatIndex];
  });

  drawRoom();
  window.addEventListener('resize', debounce(drawRoom, 120));

  startBtn.addEventListener('click', () => {
    startOverlay.classList.add('hidden');
    preloadAllAudio();
    startRound();
  });
}

// ===== 3D 房间背景（Canvas）=====
function drawRoom() {
  const canvas = document.getElementById('room-canvas');
  if (!canvas) return;

  canvas.width  = floor.offsetWidth;
  canvas.height = floor.offsetHeight;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  if (W === 0 || H === 0) return;

  const wallH = Math.floor(H * 0.30);

  // ── 墙面 ──
  const wallGrad = ctx.createLinearGradient(0, 0, 0, wallH);
  wallGrad.addColorStop(0, '#f5ead6');
  wallGrad.addColorStop(1, '#ddd0b8');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, W, wallH);

  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let x = 0; x < W; x += 30) {
    ctx.fillStyle = '#c8a878';
    ctx.fillRect(x, 0, 15, wallH);
  }
  ctx.restore();

  ctx.fillStyle = '#b89a70';
  ctx.fillRect(0, wallH - 13, W, 13);
  ctx.fillStyle = '#d4bc90';
  ctx.fillRect(0, wallH - 16, W, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, wallH, W, 6);

  // ── 地板透视瓷砖 ──
  const floorScreenH = H - wallH;
  const focal  = W * 0.75;
  const camH   = floorScreenH / focal;
  const zNear  = 1.0;
  const zFar   = 55;
  const NUM_Z  = 65;
  const tileW  = 1.0;

  const proj = (wx, wz) => ({
    x: W / 2 + (wx * focal) / wz,
    y: wallH + (camH * focal) / wz,
  });

  for (let zi = NUM_Z; zi >= 0; zi--) {
    const t0 = zi       / NUM_Z;
    const t1 = (zi + 1) / NUM_Z;
    const zFront = zNear * Math.pow(zFar / zNear, t0);
    const zBack  = zNear * Math.pow(zFar / zNear, t1);

    const yFront = wallH + (camH * focal) / zFront;
    const yBack  = wallH + (camH * focal) / zBack;
    if (yBack > H + 2 || yFront < wallH - 2) continue;

    const xHalf = (W / 2 + tileW * focal) * zFront / focal;
    const xiMin = Math.floor(-xHalf / tileW) - 1;
    const xiMax = Math.ceil( xHalf  / tileW) + 1;

    for (let xi = xiMin; xi <= xiMax; xi++) {
      const tl = proj(xi * tileW,       zBack);
      const tr = proj((xi + 1) * tileW, zBack);
      const br = proj((xi + 1) * tileW, zFront);
      const bl = proj(xi * tileW,       zFront);

      if (Math.max(tl.x, tr.x, br.x, bl.x) < 0) continue;
      if (Math.min(tl.x, tr.x, br.x, bl.x) > W) continue;

      const depth = zi / NUM_Z;
      const s = 1.0 - depth * 0.45;
      const even = (xi + zi) % 2 === 0;

      ctx.fillStyle = even
        ? `rgb(${Math.round(220*s)},${Math.round(176*s)},${Math.round(110*s)})`
        : `rgb(${Math.round(198*s)},${Math.round(152*s)},${Math.round(92*s)})`;

      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `rgba(120,72,30,${0.20 * s})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  const aoGrad = ctx.createLinearGradient(0, wallH, 0, wallH + 28);
  aoGrad.addColorStop(0, 'rgba(0,0,0,0.15)');
  aoGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aoGrad;
  ctx.fillRect(0, wallH, W, 28);

  const vig = ctx.createRadialGradient(W/2, H, H * 0.2, W/2, H, W * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, wallH, W, H - wallH);
}

// ===== 音频系统 =====
function tryLoadAudio(src) {
  if (audioCache[src]) return Promise.resolve(audioCache[src]);
  return new Promise((resolve) => {
    const audio = new Audio(src);
    const done = (result) => { if (result) audioCache[src] = result; resolve(result); };
    audio.addEventListener('canplay', () => done(audio), { once: true });
    audio.addEventListener('error', () => done(null), { once: true });
    // iOS 上 canplay 有时不触发，3秒后兜底直接返回对象尝试播放
    setTimeout(() => { if (!audioCache[src]) done(audio); }, 3000);
    audio.load();
  });
}

function preloadAllAudio() {
  const allSrcs = [
    ...ITEMS.flatMap(i => i.audios),
    ...ZHENBANG_AUDIOS,
    TOUWEI_AUDIO,
  ];
  allSrcs.forEach(src => tryLoadAudio(src));
}

async function playItemVoice(item) {
  const src = item.audios[Math.floor(Math.random() * item.audios.length)];
  await tryLoadAudio(src);
  const audio = new Audio(src);
  audio.play().catch(() => speakText(item.name + '！'));
}

async function playZhenbang() {
  const src = ZHENBANG_AUDIOS[Math.floor(Math.random() * ZHENBANG_AUDIOS.length)];
  await tryLoadAudio(src);
  const audio = new Audio(src);
  audio.play().catch(() => speakText('真棒！！！'));
  // 50% 概率在真棒结束后播投喂声
  if (Math.random() < 0.5) {
    audio.addEventListener('ended', async () => {
      await tryLoadAudio(TOUWEI_AUDIO);
      new Audio(TOUWEI_AUDIO).play().catch(() => {});
    }, { once: true });
  }
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN'; utter.rate = 1.1; utter.pitch = 1.3;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function playWrongSound() { speakText('嗯？'); }

// ===== 猫咪犹豫系统 =====
const HESITATION_BEHAVIORS = [
  { cls: 'cat-look-left',  dur: 1300 },
  { cls: 'cat-look-right', dur: 1100 },
  { cls: 'cat-curious',    dur: 1600 },
  { cls: 'cat-back-off',   dur: 900  },
  { cls: 'cat-think',      dur: 1400 },
];

let hesitationTimer = null;

function startHesitation() {
  stopHesitation();
  _scheduleHesitation();
}

function stopHesitation() {
  clearTimeout(hesitationTimer);
  hesitationTimer = null;
  HESITATION_BEHAVIORS.forEach(b => catFace.classList.remove(b.cls));
}

function _scheduleHesitation() {
  const delay = 900 + Math.random() * 2200;
  hesitationTimer = setTimeout(() => {
    if (!roundActive) return;
    const beh = HESITATION_BEHAVIORS[Math.floor(Math.random() * HESITATION_BEHAVIORS.length)];
    HESITATION_BEHAVIORS.forEach(b => catFace.classList.remove(b.cls));
    catFace.classList.add(beh.cls);
    setTimeout(() => {
      catFace.classList.remove(beh.cls);
      if (roundActive) _scheduleHesitation();
    }, beh.dur);
  }, delay);
}

// ===== 游戏流程 =====
function startRound() {
  roundActive = false;
  stopHesitation();
  floor.innerHTML = '';

  // 重新插入 canvas（innerHTML 清空会删掉它）
  const canvas = document.createElement('canvas');
  canvas.id = 'room-canvas';
  floor.appendChild(canvas);
  drawRoom();

  promptBubble.className = 'hidden';
  catFace.classList.remove('happy', ...HESITATION_BEHAVIORS.map(b => b.cls));

  // 每种物品最多出现一次，随机取 3~4 个
  const count = Math.min(3 + Math.floor(Math.random() * 2), ITEMS.length);
  const pool  = [...ITEMS];
  shuffleArray(pool);
  const roundItems = pool.slice(0, count).map(it => ({ ...it }));
  targetItem = roundItems[Math.floor(Math.random() * roundItems.length)];

  const positions = generatePositions(count);
  roundItems.forEach((item, i) => {
    floor.appendChild(createItemCard(item, positions[i], i));
  });

  setTimeout(() => {
    promptText.textContent = '找到：' + targetItem.name + '！';
    promptBubble.className = 'visible';
    playItemVoice(targetItem);
    roundActive = true;
    startHesitation();
  }, 650);
}

function createItemCard(item, pos, cardIndex) {
  const card = document.createElement('div');
  card.className = 'item-card';

  const rotation = (Math.random() - 0.5) * 18;
  card.style.left = pos.x + 'px';
  card.style.top  = pos.y + 'px';
  card.style.setProperty('--rot', rotation + 'deg');
  card.style.transform = `rotate(${rotation}deg)`;

  const body = document.createElement('div');
  body.className = 'item-body';
  body.style.setProperty('--spawn-delay', (cardIndex * 130) + 'ms');
  body.innerHTML = `
    <img class="item-photo" src="${item.img}" alt="${item.name}">
    <span class="item-name">${item.name}</span>
  `;

  card.appendChild(body);
  card.addEventListener('click', () => onItemClick(card, item));
  return card;
}

// ===== 点击物品（猫爪伸出）=====
function onItemClick(card, item) {
  if (!roundActive) return;
  roundActive = false; // 防止动画中途重复点击

  animatePawReach(card, () => {
    if (item.id === targetItem.id) {
      // ── 选对 ──
      stopHesitation();
      card.classList.add('correct');
      promptBubble.className = 'hidden';

      playZhenbang();
      spawnParticles(card);
      showStars(card);

      catFace.classList.add('happy');

      const reward = 1 + Math.floor(Math.random() * 2);
      setTimeout(() => dropCatFood(reward, card), 400);
      setTimeout(() => {
        startRound();
      }, 2300);

    } else {
      // ── 选错 ──
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      playWrongSound();
      setTimeout(() => { roundActive = true; }, 80);
    }
  });
}

// ===== 3D 猫爪伸出动画 =====
function animatePawReach(targetCard, callback) {
  const cardRect = targetCard.getBoundingClientRect();
  const itemCX   = cardRect.left + cardRect.width  / 2;
  const itemCY   = cardRect.top  + cardRect.height / 2;

  const PAW_W      = 72;
  const PAW_H      = 122;
  const sideOffset = (Math.random() - 0.5) * 22; // 轻微左右随机

  const paw = document.createElement('img');
  paw.className = 'paw-3d';
  paw.src = 'assets/images/猫爪_transparent.png';
  paw.alt = '';

  // 起始位置：在物品正下方，屏幕外
  paw.style.left      = (itemCX - PAW_W / 2 + sideOffset) + 'px';
  paw.style.top       = (window.innerHeight + PAW_H) + 'px';
  paw.style.transform = 'perspective(220px) rotateX(-40deg) scale(0.72)';
  paw.style.opacity   = '1';
  document.body.appendChild(paw);

  // ── 阶段1：靠近（向上滑到物品下方约 40px，3D 近大远小）──
  rAF2(() => {
    paw.style.transition = 'top 0.22s ease-out, transform 0.22s ease-out';
    paw.style.top        = (itemCY + 40) + 'px';
    paw.style.transform  = 'perspective(220px) rotateX(-10deg) scale(1.0)';
  });

  // ── 阶段2：犹豫退缩（往回缩一点，3D 倾角加大）──
  setTimeout(() => {
    paw.style.transition = 'top 0.18s ease-out, transform 0.18s ease-out';
    paw.style.top        = (itemCY + 58) + 'px';
    paw.style.transform  = 'perspective(220px) rotateX(-26deg) scale(0.88)';
  }, 230);

  // ── 短暂停顿（迟疑感）──
  // 阶段3：决定了！快速出击触碰物品 ──
  setTimeout(() => {
    paw.style.transition = 'top 0.11s cubic-bezier(0.6, 0, 0.9, 0.5), transform 0.11s ease-in';
    paw.style.top        = (itemCY - 4) + 'px';
    paw.style.transform  = 'perspective(220px) rotateX(10deg) scale(1.08)';
  }, 510);

  // ── 触碰瞬间触发回调 ──
  setTimeout(() => {
    callback();
    // ── 阶段4：缩回屏幕外 ──
    paw.style.transition = 'top 0.32s ease-in, transform 0.32s ease-in, opacity 0.22s ease-in';
    paw.style.top        = (window.innerHeight + PAW_H) + 'px';
    paw.style.transform  = 'perspective(220px) rotateX(-40deg) scale(0.65)';
    paw.style.opacity    = '0';
    setTimeout(() => paw.remove(), 360);
  }, 640);
}

// rAF 两帧后执行（确保 DOM 已插入再触发 transition）
function rAF2(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

// ===== 位置生成（只在地板区域，避免重叠）=====
function generatePositions(count) {
  const rect     = floor.getBoundingClientRect();
  const cardSize = Math.min(110, rect.width * 0.28);
  const padding  = 14;
  const wallH    = Math.floor(rect.height * 0.30);
  const yMin     = wallH + padding + 20;
  const yMax     = rect.height - cardSize - padding;
  const xMin     = padding;
  const xMax     = rect.width - cardSize - padding;
  const positions   = [];
  const maxAttempts = 120;

  for (let i = 0; i < count; i++) {
    let attempt = 0, pos;
    do {
      pos = {
        x: xMin + Math.random() * (xMax - xMin),
        y: yMin + Math.random() * (yMax - yMin),
      };
      attempt++;
    } while (
      attempt < maxAttempts &&
      positions.some(p =>
        Math.abs(p.x - pos.x) < cardSize + 12 &&
        Math.abs(p.y - pos.y) < cardSize + 12
      )
    );
    positions.push(pos);
  }
  return positions;
}

// ===== 猫粮飞进嘴里 =====
function dropCatFood(amount, sourceCard) {
  const catImgEl = document.getElementById('cat-img');
  const headRect = catImgEl.getBoundingClientRect();
  // 目标：猫嘴位置（图片中间偏上）
  const mouthX = headRect.left + headRect.width  / 2;
  const mouthY = headRect.top  + headRect.height * 0.45;

  const cardRect = sourceCard ? sourceCard.getBoundingClientRect() : null;

  for (let i = 0; i < amount; i++) {
    setTimeout(() => {
      const food = document.createElement('img');
      food.className = 'falling-food';
      food.src = 'assets/images/猫粮.png';
      food.alt = '';

      // 起始位置：被点中的物品中心
      const startX = cardRect
        ? cardRect.left + cardRect.width  / 2 + (Math.random() - 0.5) * 16
        : mouthX + (Math.random() - 0.5) * 30;
      const startY = cardRect
        ? cardRect.top  + cardRect.height / 2
        : headRect.top - 40;

      food.style.left = startX + 'px';
      food.style.top  = startY + 'px';
      food.style.setProperty('--tx', (mouthX - startX) + 'px');
      food.style.setProperty('--ty', (mouthY - startY) + 'px');
      food.style.setProperty('--duration', '0.62s');
      document.body.appendChild(food);

      // 到嘴后加分，图片短暂放大表示"吃到了"
      setTimeout(() => {
        food.remove();
        addCatFood(1);
        const catImg = document.getElementById('cat-img');
        catImg.style.transform = 'scale(1.15)';
        setTimeout(() => { catImg.style.transform = ''; }, 180);
      }, 640);
    }, i * 280);
  }
}

function addCatFood(amount) {
  catFood += amount;
  localStorage.setItem(CAT_FOOD_KEY, catFood.toString());
  catFoodCount.textContent = catFood;
  catFoodCount.classList.remove('bump');
  void catFoodCount.offsetWidth;
  catFoodCount.classList.add('bump');
  setTimeout(() => catFoodCount.classList.remove('bump'), 300);
}

// ===== 庆祝特效 =====
function spawnParticles(card) {
  const rect   = card.getBoundingClientRect();
  const cx     = rect.left + rect.width  / 2;
  const cy     = rect.top  + rect.height / 2;
  const colors = ['#ff9a20', '#ffd040', '#ff6b30', '#ffb840', '#ffe060'];

  for (let i = 0; i < 16; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (Math.PI * 2 * i) / 16;
    const dist  = 45 + Math.random() * 60;
    p.style.left       = cx + 'px';
    p.style.top        = cy + 'px';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
    particlesContainer.appendChild(p);
    setTimeout(() => p.remove(), 850);
  }
}

function showStars(card) {
  const rect  = card.getBoundingClientRect();
  const stars = ['⭐', '✨', '🌟'];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('div');
    s.className   = 'star';
    s.textContent = stars[Math.floor(Math.random() * stars.length)];
    s.style.left  = (rect.left + Math.random() * rect.width)  + 'px';
    s.style.top   = (rect.top  + Math.random() * rect.height) + 'px';
    particlesContainer.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
}

// ===== 工具函数 =====
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ===== 启动 =====
init();
