/** Bruno Simon–style mobile controls: left joystick + right action buttons. */

const isTouchDevice = () =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia?.("(pointer: coarse)")?.matches);

function makeButton(className, label, ariaLabel) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `mobile-btn ${className}`;
  el.setAttribute("aria-label", ariaLabel);
  el.innerHTML = `<span class="mobile-btn-border" aria-hidden="true"></span><span class="mobile-btn-icon">${label}</span>`;
  return el;
}

export function createMobileControls({ onCycleRide, onInteract, onAction, onJump } = {}) {
  if (!isTouchDevice()) {
    return {
      enabled: false,
      show() {},
      hide() {},
      setMode() {},
      applyTo() {},
      destroy() {},
    };
  }

  const root = document.createElement("div");
  root.className = "mobile-controls";
  root.dataset.mode = "land";
  root.setAttribute("aria-hidden", "true");

  const stick = document.createElement("div");
  stick.className = "mobile-joystick";
  const limit = document.createElement("div");
  limit.className = "mobile-joystick-limit";
  const cursor = document.createElement("div");
  cursor.className = "mobile-joystick-cursor";
  stick.append(limit, cursor);
  root.appendChild(stick);

  const actions = document.createElement("div");
  actions.className = "mobile-actions";
  const boostBtn = makeButton("is-boost", "A", "Boost");
  const forwardBtn = makeButton("is-forward", "▲", "Accelerate");
  const brakeBtn = makeButton("is-brake", "■", "Brake");
  const jumpBtn = makeButton("is-jump", "⤒", "Jump");
  const actionBtn = makeButton("is-action", "B", "Action");
  const interactBtn = makeButton("is-interact", "E", "Interact");
  actions.append(boostBtn, forwardBtn, brakeBtn, jumpBtn, actionBtn, interactBtn);
  root.appendChild(actions);
  document.body.appendChild(root);

  const state = {
    visible: false,
    mode: "land",
    steerAxis: 0,
    throttleAxis: 0,
    forward: false,
    backward: false,
    boost: false,
    jump: false,
    action: false,
    stickActive: false,
    stickId: null,
    centerX: 0,
    centerY: 0,
    maxRadius: 48,
    axisScale: 55,
    curX: 0,
    curY: 0,
    stickDownAt: 0,
    stickDownX: 0,
    stickDownY: 0,
  };

  const holds = new Set();
  let lastSwitchTap = 0;

  const resizeStick = () => {
    const box = stick.getBoundingClientRect();
    state.centerX = box.left + box.width * 0.5;
    state.centerY = box.top + box.height * 0.5;
    const half = Math.max(24, box.width * 0.5);
    state.maxRadius = half * 0.55;
    state.axisScale = half * 0.65;
  };

  const updateCursor = () => {
    if (!state.stickActive) {
      cursor.style.transform = "translate(0px, 0px)";
      state.steerAxis = 0;
      state.throttleAxis = 0;
      return;
    }
    const dx = state.curX - state.centerX;
    const dy = state.curY - state.centerY;
    const distance = Math.hypot(dx, dy);
    let radius = distance;
    const soft = state.maxRadius * 0.45;
    if (radius > soft) radius = soft + Math.log(distance - soft + 1) * 5;
    if (radius > state.maxRadius) radius = state.maxRadius;
    const angle = Math.atan2(dy, dx);
    cursor.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;

    const rawX = Math.max(-1, Math.min(1, dx / state.axisScale));
    // Screen up (negative dy) = forward / climb.
    const rawY = Math.max(-1, Math.min(1, -dy / state.axisScale));
    state.steerAxis = Math.abs(rawX) < 0.12 ? 0 : rawX;
    state.throttleAxis = Math.abs(rawY) < 0.12 ? 0 : rawY;
  };

  const clearStick = (wasTap = false) => {
    if (wasTap) {
      const now = performance.now();
      if (now - lastSwitchTap < 320) {
        lastSwitchTap = 0;
        onCycleRide?.();
      } else {
        lastSwitchTap = now;
      }
    }
    state.stickActive = false;
    state.stickId = null;
    limit.classList.remove("is-active");
    updateCursor();
  };

  const resetInputs = () => {
    state.forward = false;
    state.backward = false;
    state.boost = false;
    state.jump = false;
    state.action = false;
    clearStick(false);
    holds.clear();
    root.querySelectorAll(".is-pressed").forEach((el) => el.classList.remove("is-pressed"));
  };

  const onStickDown = (event) => {
    if (!state.visible || state.stickId != null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeStick();
    state.stickActive = true;
    state.stickId = event.pointerId;
    state.curX = event.clientX;
    state.curY = event.clientY;
    state.stickDownAt = performance.now();
    state.stickDownX = event.clientX;
    state.stickDownY = event.clientY;
    limit.classList.add("is-active");
    stick.setPointerCapture(event.pointerId);
    updateCursor();
  };

  const onStickMove = (event) => {
    if (event.pointerId !== state.stickId) return;
    event.preventDefault();
    state.curX = event.clientX;
    state.curY = event.clientY;
    updateCursor();
  };

  const onStickUp = (event) => {
    if (event.pointerId !== state.stickId) return;
    event.preventDefault();
    const held = performance.now() - state.stickDownAt;
    const moved = Math.hypot(state.curX - state.stickDownX, state.curY - state.stickDownY);
    const wasTap = held < 220 && moved < 14;
    clearStick(wasTap);
  };

  stick.addEventListener("pointerdown", onStickDown);
  stick.addEventListener("pointermove", onStickMove);
  stick.addEventListener("pointerup", onStickUp);
  stick.addEventListener("pointercancel", onStickUp);
  stick.addEventListener("lostpointercapture", () => {
    if (state.stickActive) clearStick(false);
  });

  const bindHold = (button, key) => {
    let pointerId = null;
    const press = () => {
      holds.add(key);
      button.classList.add("is-pressed");
      if (key === "action") {
        // Interact/prompt consumes the press; otherwise it is a sonic boom.
        state.action = onAction?.() !== true;
      } else {
        state[key] = true;
        if (key === "jump") onJump?.();
      }
    };
    const release = () => {
      if (pointerId == null && !holds.has(key)) return;
      pointerId = null;
      holds.delete(key);
      state[key] = false;
      button.classList.remove("is-pressed");
    };
    button.addEventListener("pointerdown", (event) => {
      if (!state.visible) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pointerId != null) return;
      event.preventDefault();
      event.stopPropagation();
      pointerId = event.pointerId;
      button.setPointerCapture(event.pointerId);
      press();
    });
    const end = (event) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      event.preventDefault();
      release();
    };
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("lostpointercapture", () => {
      if (pointerId != null) release();
    });
  };

  bindHold(forwardBtn, "forward");
  bindHold(brakeBtn, "backward");
  bindHold(boostBtn, "boost");
  bindHold(jumpBtn, "jump");
  bindHold(actionBtn, "action");

  const bindTap = (button, fn) => {
    let pointerId = null;
    let armed = false;
    button.addEventListener("pointerdown", (event) => {
      if (!state.visible) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      pointerId = event.pointerId;
      armed = true;
      button.classList.add("is-pressed");
      button.setPointerCapture(event.pointerId);
    });
    const finish = (event, fire) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      event.preventDefault();
      pointerId = null;
      button.classList.remove("is-pressed");
      if (fire && armed) fn?.();
      armed = false;
    };
    button.addEventListener("pointerup", (event) => finish(event, true));
    button.addEventListener("pointercancel", (event) => finish(event, false));
    button.addEventListener("lostpointercapture", () => {
      pointerId = null;
      armed = false;
      button.classList.remove("is-pressed");
    });
  };

  bindTap(interactBtn, () => onInteract?.());

  const onResize = () => {
    if (state.visible) resizeStick();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetInputs();
  });

  return {
    enabled: true,
    show() {
      if (state.visible) return;
      state.visible = true;
      root.classList.add("is-visible");
      root.setAttribute("aria-hidden", "false");
      requestAnimationFrame(resizeStick);
    },
    hide() {
      if (!state.visible) return;
      resetInputs();
      state.visible = false;
      root.classList.remove("is-visible");
      root.setAttribute("aria-hidden", "true");
    },
    setMode(mode) {
      const next = mode === "air" ? "air" : "land";
      if (state.mode === next) return;
      state.mode = next;
      root.dataset.mode = next;
      // Drop mode-specific holds so nothing sticks across Kart ↔ UFO.
      state.forward = false;
      state.backward = false;
      state.jump = false;
      state.action = false;
      state.boost = false;
      forwardBtn.classList.remove("is-pressed");
      brakeBtn.classList.remove("is-pressed");
      jumpBtn.classList.remove("is-pressed");
      actionBtn.classList.remove("is-pressed");
      boostBtn.classList.remove("is-pressed");
      holds.delete("forward");
      holds.delete("backward");
      holds.delete("jump");
      holds.delete("action");
      holds.delete("boost");
      const boostIcon = boostBtn.querySelector(".mobile-btn-icon");
      const brakeIcon = brakeBtn.querySelector(".mobile-btn-icon");
      if (next === "air") {
        if (boostIcon) boostIcon.textContent = "↑";
        if (brakeIcon) brakeIcon.textContent = "↓";
        boostBtn.setAttribute("aria-label", "Ascend");
        brakeBtn.setAttribute("aria-label", "Descend");
      } else {
        if (boostIcon) boostIcon.textContent = "A";
        if (brakeIcon) brakeIcon.textContent = "■";
        boostBtn.setAttribute("aria-label", "Boost");
        brakeBtn.setAttribute("aria-label", "Brake");
      }
    },
    applyTo(input) {
      if (!state.visible) return;
      const air = state.mode === "air";

      if (air) {
        // Hover: stick is omnidirectional move; A ascend, ■ descend, B attack.
        if (state.throttleAxis > 0.12) input.forward = true;
        if (state.throttleAxis < -0.12) input.backward = true;
        if (state.steerAxis > 0.12) input.right = true;
        if (state.steerAxis < -0.12) input.left = true;
        if (state.boost) input.jump = true;
        if (state.backward) input.down = true;
        if (state.action) input.action = true;
        input.steerAxis = 0;
      } else {
        if (state.throttleAxis > 0.12 || state.forward) input.forward = true;
        if (state.throttleAxis < -0.12 || state.backward) input.backward = true;
        if (state.boost) {
          input.boost = true;
          if (state.throttleAxis >= -0.12) input.forward = true;
        }
        if (state.jump) input.jump = true;
        input.steerAxis = state.steerAxis;
      }
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      root.remove();
    },
  };
}
