// Playable arcade-cabinet mini-games shown when zooming into a machine.
// 4 classic, pure retro arcade games (uncorrelated to resume projects):
//   astro  -> ASTRO BLASTER (Classic space retro arcade shooter)
//   brick  -> BRICK SMASH   (Classic paddle & bouncing ball breakout)
//   racer  -> TURBO DRIFT   (Classic 80s top-down highway speed racer)
//   hopper -> PIXEL HOPPER  (Classic side-scrolling endless jumper)

const W = 640;
const H = 480;
const HUD_H = 44;

const rand = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function gridBackground(ctx, color, t = 0) {
  ctx.fillStyle = "#121026";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, HUD_H);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  const off = (t * 40) % 32;
  for (let y = HUD_H + off; y <= H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// 1. ASTRO BLASTER — Classic Retro Space Invaders Shooter
// ---------------------------------------------------------------------------
function astroBlaster() {
  let player, bullets, aliens, bombs, particles, ufo, wave, score, dead, t, alienDir, alienStepTimer, shootTimer;

  const spawnFleet = () => {
    aliens = [];
    const rows = 4;
    const cols = 8;
    const startX = 60;
    const startY = HUD_H + 40;
    const colors = ["#ff5b4a", "#ff7a32", "#ffd23f", "#4fc3f7"];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        aliens.push({
          x: startX + c * 58,
          y: startY + r * 38,
          w: 32,
          h: 22,
          color: colors[r],
          pts: (rows - r) * 10,
          alive: true,
          frame: 0,
        });
      }
    }
    alienDir = 1;
    alienStepTimer = 0;
  };

  return {
    title: "ASTRO BLASTER",
    help: "Left / Right (A / D) steer · Space fire lasers · Clear the alien invasion",
    reset() {
      player = { x: W / 2 - 18, y: H - 42, w: 36, h: 22, speed: 280, lives: 3 };
      bullets = [];
      bombs = [];
      particles = [];
      ufo = null;
      wave = 1;
      score = 0;
      dead = false;
      t = 0;
      shootTimer = 0;
      spawnFleet();
    },
    update(dt, input) {
      if (dead) return;
      t += dt;
      shootTimer -= dt;

      // Player move
      if (input.left) player.x -= player.speed * dt;
      if (input.right) player.x += player.speed * dt;
      player.x = clamp(player.x, 16, W - player.w - 16);

      // Player shoot
      if ((input.action || input.tap?.action) && shootTimer <= 0) {
        bullets.push({ x: player.x + player.w / 2 - 2, y: player.y - 8, w: 4, h: 14, speed: 460 });
        shootTimer = 0.22;
      }

      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.y -= b.speed * dt;
        if (b.y < HUD_H) {
          bullets.splice(i, 1);
          continue;
        }
        // Hit UFO
        if (ufo && b.x > ufo.x && b.x < ufo.x + ufo.w && b.y > ufo.y && b.y < ufo.y + ufo.h) {
          score += 150;
          for (let k = 0; k < 16; k++) {
            particles.push({ x: ufo.x + 20, y: ufo.y + 10, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, c: "#ffd23f", life: 0.5 });
          }
          ufo = null;
          bullets.splice(i, 1);
          continue;
        }
        // Hit alien
        let hit = false;
        for (const a of aliens) {
          if (!a.alive) continue;
          if (b.x > a.x && b.x < a.x + a.w && b.y > a.y && b.y < a.y + a.h) {
            a.alive = false;
            hit = true;
            score += a.pts;
            for (let k = 0; k < 12; k++) {
              particles.push({ x: a.x + a.w / 2, y: a.y + a.h / 2, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, c: a.color, life: 0.45 });
            }
            break;
          }
        }
        if (hit) bullets.splice(i, 1);
      }

      // Update Aliens
      const aliveAliens = aliens.filter((a) => a.alive);
      if (aliveAliens.length === 0) {
        wave++;
        score += 200;
        spawnFleet();
        return;
      }

      const fleetSpeed = Math.max(0.12, 0.65 - (1 - aliveAliens.length / aliens.length) * 0.5 - wave * 0.05);
      alienStepTimer += dt;
      if (alienStepTimer >= fleetSpeed) {
        alienStepTimer = 0;
        let edgeHit = false;
        for (const a of aliveAliens) {
          if ((alienDir > 0 && a.x + a.w >= W - 24) || (alienDir < 0 && a.x <= 24)) {
            edgeHit = true;
            break;
          }
        }
        if (edgeHit) {
          alienDir = -alienDir;
          for (const a of aliveAliens) {
            a.y += 18;
            if (a.y + a.h >= player.y) dead = true;
          }
        } else {
          for (const a of aliveAliens) {
            a.x += alienDir * 14;
            a.frame = 1 - a.frame;
          }
        }

        // Alien bombs
        if (Math.random() < 0.45 && bombs.length < 4) {
          const shooter = aliveAliens[rand(aliveAliens.length)];
          bombs.push({ x: shooter.x + shooter.w / 2 - 2, y: shooter.y + shooter.h, w: 4, h: 10, speed: 200 + wave * 20 });
        }
      }

      // Update Bombs
      for (let i = bombs.length - 1; i >= 0; i--) {
        const bm = bombs[i];
        bm.y += bm.speed * dt;
        if (bm.y > H) {
          bombs.splice(i, 1);
          continue;
        }
        if (bm.x > player.x && bm.x < player.x + player.w && bm.y > player.y && bm.y < player.y + player.h) {
          bombs.splice(i, 1);
          player.lives--;
          for (let k = 0; k < 20; k++) {
            particles.push({ x: player.x + player.w / 2, y: player.y + 10, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, c: "#ff5b4a", life: 0.6 });
          }
          if (player.lives <= 0) dead = true;
        }
      }

      // Mystery UFO
      if (!ufo && Math.random() < 0.003) {
        ufo = { x: -48, y: HUD_H + 12, w: 44, h: 18, speed: 120 };
      }
      if (ufo) {
        ufo.x += ufo.speed * dt;
        if (ufo.x > W + 20) ufo = null;
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    },
    draw(ctx, color) {
      gridBackground(ctx, color, t);

      // Mystery UFO
      if (ufo) {
        ctx.fillStyle = "#ffd23f";
        rr(ctx, ufo.x, ufo.y + 4, ufo.w, ufo.h - 4, 6);
        ctx.fill();
        ctx.fillStyle = "#ff5b4a";
        rr(ctx, ufo.x + 10, ufo.y, ufo.w - 20, 8, 4);
        ctx.fill();
      }

      // Aliens
      for (const a of aliens) {
        if (!a.alive) continue;
        ctx.fillStyle = a.color;
        const ax = a.x;
        const ay = a.y;
        // Pixel-like arcade invader shape
        ctx.fillRect(ax + 6, ay, 20, 6);
        ctx.fillRect(ax + 2, ay + 6, 28, 8);
        ctx.fillRect(ax, ay + 14, 32, 6);
        if (a.frame === 0) {
          ctx.fillRect(ax + 2, ay + 20, 6, 4);
          ctx.fillRect(ax + 24, ay + 20, 6, 4);
        } else {
          ctx.fillRect(ax + 8, ay + 20, 6, 4);
          ctx.fillRect(ax + 18, ay + 20, 6, 4);
        }
        // Eyes
        ctx.fillStyle = "#121026";
        ctx.fillRect(ax + 8, ay + 8, 4, 4);
        ctx.fillRect(ax + 20, ay + 8, 4, 4);
      }

      // Bullets
      ctx.fillStyle = "#4fc3f7";
      for (const b of bullets) {
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }

      // Bombs
      ctx.fillStyle = "#ff5b4a";
      for (const bm of bombs) {
        ctx.fillRect(bm.x, bm.y, bm.w, bm.h);
      }

      // Player Ship
      ctx.fillStyle = "#fff1dc";
      ctx.fillRect(player.x + player.w / 2 - 3, player.y - 4, 6, 6); // cannon tip
      ctx.fillStyle = "#4fc3f7";
      rr(ctx, player.x + 6, player.y, player.w - 12, player.h, 4);
      ctx.fill();
      ctx.fillStyle = "#ff5b4a";
      ctx.fillRect(player.x, player.y + 10, 8, 12);
      ctx.fillRect(player.x + player.w - 8, player.y + 10, 8, 12);

      // Lives indicator
      for (let l = 0; l < player.lives; l++) {
        ctx.fillStyle = "#4fc3f7";
        ctx.fillRect(W - 32 - l * 20, H - 18, 14, 10);
      }

      // Particles
      for (const p of particles) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
    },
    get score() {
      return score;
    },
    get dead() {
      return dead;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. BRICK SMASH — Classic Retro Breakout
// ---------------------------------------------------------------------------
function brickSmash() {
  let paddle, ball, bricks, particles, score, dead, started, t;

  const initBricks = () => {
    bricks = [];
    const rows = 5;
    const cols = 9;
    const bw = 58;
    const bh = 18;
    const pad = 8;
    const startX = (W - (cols * (bw + pad) - pad)) / 2;
    const startY = HUD_H + 40;
    const colors = ["#ff5b4a", "#ff7a32", "#ffd23f", "#a9d66b", "#4fc3f7"];
    const pts = [50, 40, 30, 20, 10];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        bricks.push({
          x: startX + c * (bw + pad),
          y: startY + r * (bh + pad),
          w: bw,
          h: bh,
          color: colors[r],
          pts: pts[r],
          alive: true,
        });
      }
    }
  };

  return {
    title: "BRICK SMASH",
    help: "Left / Right (A / D) move paddle · Space launch ball · Smash all bricks!",
    reset() {
      paddle = { x: W / 2 - 50, y: H - 36, w: 100, h: 14, speed: 440 };
      ball = { x: W / 2, y: H - 52, r: 7, vx: 220, vy: -260 };
      particles = [];
      score = 0;
      dead = false;
      started = false;
      t = 0;
      initBricks();
    },
    update(dt, input) {
      if (dead) return;
      t += dt;

      // Paddle move
      if (input.left) paddle.x -= paddle.speed * dt;
      if (input.right) paddle.x += paddle.speed * dt;
      paddle.x = clamp(paddle.x, 16, W - paddle.w - 16);

      if (!started) {
        ball.x = paddle.x + paddle.w / 2;
        ball.y = paddle.y - ball.r - 2;
        if (input.action || input.tap?.action || input.up) started = true;
        return;
      }

      // Ball move
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Wall bounce
      if (ball.x - ball.r < 12) {
        ball.x = 12 + ball.r;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x + ball.r > W - 12) {
        ball.x = W - 12 - ball.r;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - ball.r < HUD_H + 4) {
        ball.y = HUD_H + 4 + ball.r;
        ball.vy = Math.abs(ball.vy);
      } else if (ball.y > H + 20) {
        dead = true;
      }

      // Paddle hit
      if (
        ball.vy > 0 &&
        ball.x >= paddle.x - 4 &&
        ball.x <= paddle.x + paddle.w + 4 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h
      ) {
        ball.y = paddle.y - ball.r;
        const hitNorm = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const speed = Math.hypot(ball.vx, ball.vy) * 1.02;
        const maxAngle = Math.PI * 0.42;
        const angle = hitNorm * maxAngle;
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.cos(angle) * speed;
      }

      // Brick hit
      for (const b of bricks) {
        if (!b.alive) continue;
        if (
          ball.x + ball.r > b.x &&
          ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y &&
          ball.y - ball.r < b.y + b.h
        ) {
          b.alive = false;
          score += b.pts;
          ball.vy = -ball.vy;
          for (let k = 0; k < 12; k++) {
            particles.push({
              x: b.x + b.w / 2,
              y: b.y + b.h / 2,
              vx: (Math.random() - 0.5) * 180,
              vy: (Math.random() - 0.5) * 180,
              c: b.color,
              life: 0.4,
            });
          }
          break;
        }
      }

      // Reset bricks if all cleared
      if (bricks.every((b) => !b.alive)) {
        score += 500;
        initBricks();
        started = false;
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    },
    draw(ctx, color) {
      gridBackground(ctx, color, t);

      // Bricks
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.color;
        rr(ctx, b.x, b.y, b.w, b.h, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 3);
      }

      // Paddle
      ctx.fillStyle = "#ffd23f";
      rr(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6);
      ctx.fill();
      ctx.fillStyle = "#ff5b4a";
      ctx.fillRect(paddle.x + paddle.w / 2 - 8, paddle.y + 2, 16, paddle.h - 4);

      // Ball
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();

      // Particles
      for (const p of particles) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 3, 3);
      }

      if (!started && !dead) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.fillText("PRESS SPACE TO LAUNCH BALL", W / 2, H - 70);
      }
    },
    get score() {
      return score;
    },
    get dead() {
      return dead;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. TURBO DRIFT — Classic 80s Highway Racer
// ---------------------------------------------------------------------------
function turboDrift() {
  let player, traffic, coins, particles, score, speed, dead, t;
  const LANES = [160, 260, 360, 460];

  const spawnCar = () => {
    const lane = rand(LANES.length);
    const colors = ["#4fc3f7", "#ffd23f", "#fff1dc", "#7c6cf0"];
    traffic.push({
      x: LANES[lane] - 18,
      y: -60,
      w: 36,
      h: 58,
      speed: 120 + rand(80),
      color: colors[rand(colors.length)],
    });
  };

  const spawnCoin = () => {
    const lane = rand(LANES.length);
    coins.push({
      x: LANES[lane],
      y: -40,
      r: 10,
    });
  };

  return {
    title: "TURBO DRIFT",
    help: "Left / Right (A / D) steer · Space / Up for Turbo Nitro · Dodge traffic!",
    reset() {
      player = { laneX: LANES[1] - 18, x: LANES[1] - 18, y: H - 90, w: 36, h: 60 };
      traffic = [];
      coins = [];
      particles = [];
      score = 0;
      speed = 280;
      dead = false;
      t = 0;
    },
    update(dt, input) {
      if (dead) return;
      t += dt;

      // Turbo boost
      const boosting = input.action || input.up;
      const targetSpeed = boosting ? 460 : 280;
      speed += (targetSpeed - speed) * 4 * dt;
      score += Math.floor(speed * dt * 0.2);

      // Steer
      if (input.left) player.x -= 340 * dt;
      if (input.right) player.x += 340 * dt;
      player.x = clamp(player.x, LANES[0] - 32, LANES[LANES.length - 1] + 12);

      // Spawn traffic & coins
      if (Math.random() < 0.035 && traffic.length < 5) spawnCar();
      if (Math.random() < 0.02 && coins.length < 3) spawnCoin();

      // Update traffic
      for (let i = traffic.length - 1; i >= 0; i--) {
        const c = traffic[i];
        c.y += (speed - c.speed) * dt;
        if (c.y > H + 80) {
          traffic.splice(i, 1);
          continue;
        }
        // Collision
        if (
          player.x < c.x + c.w - 4 &&
          player.x + player.w > c.x + 4 &&
          player.y < c.y + c.h - 6 &&
          player.y + player.h > c.y + 6
        ) {
          dead = true;
          for (let k = 0; k < 25; k++) {
            particles.push({
              x: player.x + player.w / 2,
              y: player.y + player.h / 2,
              vx: (Math.random() - 0.5) * 260,
              vy: (Math.random() - 0.5) * 260,
              c: "#ff5b4a",
              life: 0.6,
            });
          }
        }
      }

      // Update coins
      for (let i = coins.length - 1; i >= 0; i--) {
        const cn = coins[i];
        cn.y += speed * dt;
        if (cn.y > H + 40) {
          coins.splice(i, 1);
          continue;
        }
        if (Math.hypot(player.x + player.w / 2 - cn.x, player.y + player.h / 2 - cn.y) < 28) {
          score += 50;
          coins.splice(i, 1);
          for (let k = 0; k < 10; k++) {
            particles.push({
              x: cn.x,
              y: cn.y,
              vx: (Math.random() - 0.5) * 140,
              vy: (Math.random() - 0.5) * 140,
              c: "#ffd23f",
              life: 0.4,
            });
          }
        }
      }

      // Exhaust particles
      if (Math.random() < 0.6) {
        particles.push({
          x: player.x + (Math.random() > 0.5 ? 8 : 28),
          y: player.y + player.h,
          vx: (Math.random() - 0.5) * 20,
          vy: 80,
          c: boosting ? "#4fc3f7" : "#ff5b4a",
          life: 0.3,
        });
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    },
    draw(ctx, color) {
      // Road background
      ctx.fillStyle = "#151228";
      ctx.fillRect(0, 0, W, H);

      // Road shoulder & asphalt
      const roadLeft = LANES[0] - 50;
      const roadWidth = LANES[LANES.length - 1] - LANES[0] + 100;
      ctx.fillStyle = "#201c38";
      ctx.fillRect(roadLeft, HUD_H, roadWidth, H - HUD_H);

      // Road curbs
      ctx.fillStyle = "#ff5b4a";
      ctx.fillRect(roadLeft - 8, HUD_H, 8, H - HUD_H);
      ctx.fillRect(roadLeft + roadWidth, HUD_H, 8, H - HUD_H);

      // Moving lane markers
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 4;
      ctx.setLineDash([24, 20]);
      ctx.lineDashOffset = -(t * speed) % 44;
      for (let i = 0; i < LANES.length - 1; i++) {
        const lx = (LANES[i] + LANES[i + 1]) / 2;
        ctx.beginPath();
        ctx.moveTo(lx, HUD_H);
        ctx.lineTo(lx, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Coins
      for (const cn of coins) {
        ctx.fillStyle = "#ffd23f";
        ctx.beginPath();
        ctx.arc(cn.x, cn.y, cn.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cn.x, cn.y, cn.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      // Traffic cars
      for (const c of traffic) {
        ctx.fillStyle = c.color;
        rr(ctx, c.x, c.y, c.w, c.h, 6);
        ctx.fill();
        ctx.fillStyle = "#121026";
        ctx.fillRect(c.x + 4, c.y + 12, c.w - 8, 14); // windshield
        ctx.fillStyle = "#ff5b4a";
        ctx.fillRect(c.x + 4, c.y + c.h - 4, 6, 4); // taillights
        ctx.fillRect(c.x + c.w - 10, c.y + c.h - 4, 6, 4);
      }

      // Player car
      ctx.fillStyle = "#ff5b4a";
      rr(ctx, player.x, player.y, player.w, player.h, 7);
      ctx.fill();
      // Racing stripes
      ctx.fillStyle = "#fff1dc";
      ctx.fillRect(player.x + player.w / 2 - 3, player.y, 6, player.h);
      // Windshield
      ctx.fillStyle = "#121026";
      ctx.fillRect(player.x + 5, player.y + 16, player.w - 10, 16);
      // Headlights
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(player.x + 4, player.y, 6, 4);
      ctx.fillRect(player.x + player.w - 10, player.y, 6, 4);

      // Particles
      for (const p of particles) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
    },
    get score() {
      return score;
    },
    get dead() {
      return dead;
    },
  };
}

// ---------------------------------------------------------------------------
// 4. PIXEL HOPPER — Classic Infinite Jumper Runner
// ---------------------------------------------------------------------------
function pixelHopper() {
  let player, obstacles, gems, particles, score, dead, t, scrollX, spawnTimer;

  const spawnObstacle = () => {
    const isFlying = Math.random() < 0.35;
    obstacles.push({
      x: W + 20,
      y: isFlying ? H - 95 : H - 56,
      w: isFlying ? 28 : 24,
      h: isFlying ? 20 : 28,
      flying: isFlying,
      color: isFlying ? "#ff5b4a" : "#7c6cf0",
    });
  };

  const spawnGem = () => {
    gems.push({
      x: W + 20,
      y: H - 85 - rand(45),
      r: 8,
    });
  };

  return {
    title: "PIXEL HOPPER",
    help: "Space / Up / W to Jump (Tap again to Double Jump!) · Collect gold gems",
    reset() {
      player = { x: 80, y: H - 56, w: 26, h: 28, vy: 0, jumps: 2, onGround: true };
      obstacles = [];
      gems = [];
      particles = [];
      score = 0;
      dead = false;
      t = 0;
      scrollX = 0;
      spawnTimer = 1.0;
    },
    update(dt, input) {
      if (dead) return;
      t += dt;
      scrollX += 280 * dt;
      score += Math.floor(dt * 15);

      // Jump
      if (input.tap?.action || input.tap?.up) {
        if (player.jumps > 0) {
          player.vy = -420;
          player.jumps--;
          player.onGround = false;
          for (let k = 0; k < 6; k++) {
            particles.push({
              x: player.x + player.w / 2,
              y: player.y + player.h,
              vx: (Math.random() - 0.5) * 80,
              vy: Math.random() * 40,
              c: "#ffd23f",
              life: 0.3,
            });
          }
        }
      }

      // Gravity
      player.vy += 1100 * dt;
      player.y += player.vy * dt;

      const groundY = H - 56;
      if (player.y >= groundY) {
        player.y = groundY;
        player.vy = 0;
        player.jumps = 2;
        player.onGround = true;
      }

      // Spawning
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnObstacle();
        if (Math.random() < 0.6) spawnGem();
        spawnTimer = 1.2 + Math.random() * 0.9;
      }

      // Obstacles
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        ob.x -= 280 * dt;
        if (ob.x < -40) {
          obstacles.splice(i, 1);
          continue;
        }
        // Collision
        if (
          player.x + 4 < ob.x + ob.w &&
          player.x + player.w - 4 > ob.x &&
          player.y + 4 < ob.y + ob.h &&
          player.y + player.h > ob.y
        ) {
          dead = true;
          for (let k = 0; k < 20; k++) {
            particles.push({
              x: player.x + player.w / 2,
              y: player.y + player.h / 2,
              vx: (Math.random() - 0.5) * 220,
              vy: (Math.random() - 0.5) * 220,
              c: "#ff5b4a",
              life: 0.5,
            });
          }
        }
      }

      // Gems
      for (let i = gems.length - 1; i >= 0; i--) {
        const gm = gems[i];
        gm.x -= 280 * dt;
        if (gm.x < -20) {
          gems.splice(i, 1);
          continue;
        }
        if (Math.hypot(player.x + player.w / 2 - gm.x, player.y + player.h / 2 - gm.y) < 24) {
          score += 50;
          gems.splice(i, 1);
          for (let k = 0; k < 8; k++) {
            particles.push({
              x: gm.x,
              y: gm.y,
              vx: (Math.random() - 0.5) * 120,
              vy: (Math.random() - 0.5) * 120,
              c: "#ffd23f",
              life: 0.35,
            });
          }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    },
    draw(ctx, color) {
      gridBackground(ctx, color, t);

      // Floor ground
      ctx.fillStyle = "#242045";
      ctx.fillRect(0, H - 28, W, 28);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(0, H - 28, W, 3);

      // Obstacles
      for (const ob of obstacles) {
        ctx.fillStyle = ob.color;
        if (ob.flying) {
          // Drone
          rr(ctx, ob.x, ob.y, ob.w, ob.h, 4);
          ctx.fill();
          ctx.fillStyle = "#ffd23f";
          ctx.fillRect(ob.x + 4, ob.y + 6, 8, 4);
        } else {
          // Spike barrier
          ctx.beginPath();
          ctx.moveTo(ob.x, ob.y + ob.h);
          ctx.lineTo(ob.x + ob.w / 2, ob.y);
          ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Gems
      for (const gm of gems) {
        ctx.fillStyle = "#ffd23f";
        ctx.beginPath();
        ctx.arc(gm.x, gm.y, gm.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(gm.x - 2, gm.y - 2, 4, 4);
      }

      // Player Hopper Character
      ctx.fillStyle = "#7c6cf0";
      rr(ctx, player.x, player.y, player.w, player.h, 5);
      ctx.fill();
      // Cap
      ctx.fillStyle = "#ff5b4a";
      ctx.fillRect(player.x + 2, player.y, player.w - 4, 7);
      ctx.fillRect(player.x + player.w - 4, player.y + 3, 6, 4);
      // Face eye
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(player.x + player.w - 9, player.y + 10, 5, 5);
      ctx.fillStyle = "#121026";
      ctx.fillRect(player.x + player.w - 6, player.y + 11, 3, 3);
      // Sneakers
      ctx.fillStyle = "#fff1dc";
      ctx.fillRect(player.x + 2, player.y + player.h - 4, 8, 4);
      ctx.fillRect(player.x + player.w - 10, player.y + player.h - 4, 8, 4);

      // Particles
      for (const p of particles) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
    },
    get score() {
      return score;
    },
    get dead() {
      return dead;
    },
  };
}

const GAMES = {
  astro: astroBlaster,
  brick: brickSmash,
  racer: turboDrift,
  hopper: pixelHopper,
  // backwards compatibility for old IDs
  robots: astroBlaster,
  power: brickSmash,
  taxis: turboDrift,
  stocks: pixelHopper,
};

const KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "action",
  Enter: "action",
};

export function createArcadeGameOverlay() {
  const root = document.createElement("div");
  root.id = "arcade-game";
  root.className = "arcade-game";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="arcade-game-cabinet">
      <div class="arcade-game-marquee"><span class="arcade-game-title"></span><span class="arcade-game-sub"></span></div>
      <div class="arcade-game-bezel">
        <canvas class="arcade-game-screen" width="${W}" height="${H}"></canvas>
        <div class="arcade-game-scanlines"></div>
      </div>
      <div class="arcade-game-deck">
        <p class="arcade-game-help"></p>
        <div class="arcade-game-actions">
          <button class="arcade-game-close" type="button">Exit Cabinet · Esc</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const titleEl = root.querySelector(".arcade-game-title");
  const subEl = root.querySelector(".arcade-game-sub");
  const helpEl = root.querySelector(".arcade-game-help");
  const closeEl = root.querySelector(".arcade-game-close");

  const held = { left: false, right: false, up: false, down: false, action: false };
  const tapped = new Set();
  let open = false;
  let game = null;
  let machine = null;
  let state = "ready";
  let best = 0;
  let raf = 0;
  let last = 0;
  let onClose = null;

  const hiKey = () => `arcade-hi-${machine?.id}`;

  const drawHud = () => {
    ctx.fillStyle = "#1a1638";
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = machine.color;
    ctx.fillRect(0, HUD_H - 2, W, 2);
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`SCORE ${String(game.score).padStart(5, "0")}`, 16, 28);
    ctx.textAlign = "right";
    ctx.fillStyle = machine.color;
    ctx.fillText(`HI-SCORE ${String(best).padStart(5, "0")}`, W - 16, 28);
  };

  const drawBanner = (big, small) => {
    ctx.fillStyle = "rgba(18, 14, 40, 0.82)";
    ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.textAlign = "center";
    ctx.fillStyle = machine.color;
    ctx.font = "bold 34px monospace";
    ctx.fillText(big, W / 2, H / 2 - 8);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px monospace";
    if (Math.floor(performance.now() / 450) % 2 === 0) ctx.fillText(small, W / 2, H / 2 + 28);
  };

  const frame = (now) => {
    if (!open) return;
    const dt = Math.min(1 / 30, (now - last) / 1000 || 0);
    last = now;
    const input = {
      ...held,
      tap: {
        left: tapped.has("left"),
        right: tapped.has("right"),
        up: tapped.has("up"),
        down: tapped.has("down"),
        action: tapped.has("action"),
      },
    };
    tapped.clear();

    if (state === "ready") {
      if (input.tap.action || input.tap.up) {
        state = "play";
        game.update(dt, input);
      }
    } else if (state === "play") {
      game.update(dt, input);
      if (game.dead) {
        state = "over";
        if (game.score > best) {
          best = game.score;
          try {
            localStorage.setItem(hiKey(), String(best));
          } catch {
            /* storage unavailable */
          }
        }
      }
    } else if (state === "over" && input.tap.action) {
      game.reset();
      state = "play";
    }

    game.draw(ctx, machine.color);
    drawHud();
    if (state === "ready") drawBanner(game.title, "PRESS SPACE TO INSERT COIN & PLAY");
    if (state === "over") drawBanner("GAME OVER", "PRESS SPACE TO PLAY AGAIN · ESC TO EXIT");
    raf = requestAnimationFrame(frame);
  };

  const close = () => {
    if (!open) return;
    open = false;
    cancelAnimationFrame(raf);
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    for (const k of Object.keys(held)) held[k] = false;
    const cb = onClose;
    onClose = null;
    cb?.();
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (!open) return;
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      const action = KEY_MAP[event.code];
      if (!action) return;
      event.preventDefault();
      if (!event.repeat) tapped.add(action);
      held[action] = true;
    },
    true
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (!open) return;
      const action = KEY_MAP[event.code];
      if (action) held[action] = false;
    },
    true
  );
  closeEl.addEventListener("click", close);
  root.addEventListener("pointerdown", (event) => {
    if (event.target === root) close();
  });

  return {
    isOpen: () => open,
    close,
    open(def, closeCallback) {
      machine = def;
      game = (GAMES[def.id] ?? astroBlaster)();
      game.reset();
      state = "ready";
      try {
        best = Number(localStorage.getItem(hiKey())) || 0;
      } catch {
        best = 0;
      }
      onClose = closeCallback;
      root.style.setProperty("--arcade-color", def.color);
      titleEl.textContent = game.title;
      subEl.textContent = "CLASSIC RETRO ARCADE";
      helpEl.textContent = game.help;
      open = true;
      root.classList.add("is-open");
      root.setAttribute("aria-hidden", "false");
      tapped.clear();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
  };
}
