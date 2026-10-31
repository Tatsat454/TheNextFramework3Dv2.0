/** Bruno Simon–style mobile controls: left joystick + right action buttons. */

const isTouchDevice = () =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches);

function makeButton(className, label, ariaLabel) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `mobile-btn ${className}`;
  el.setAttribute("aria-label", ariaLabel);
  el.innerHTML = `<span class="mobile-btn-border" aria-hidden="true"></span><span class="mobile-btn-icon">${label}</span>`;
  return el;
}

export function createMobileControls({
  onCycleRide,
  onInteract,
  onJump,
} = {}) {
  if (!isTouchDevice()) {
    return {
      enabled: false,
      show() {},
      hide() {},
      applyTo() {},
      destroy() {},
    };
  }

  const root = document.createElement("div");
  root.className = "mobile-controls";
  root.setAttribute("aria-hidden", "true");

  // —— Joystick (left) ——
  const stick = document.createElement("div");
  stick.className = "mobile-joystick";
  const limit = document.createElement("div");
  limit.className = "mobile-joystick-limit";
  const cursor = document.createElement("div");
  cursor.className = "mobile-joystick-cursor";
  stick.append(limit, cursor);
  root.appendChild(stick);

  // —— Action column (right) ——
  const actions = document.createElement("div");
  actions.className = "mobile-actions";
  const boostBtn = makeButton("is-boost", "≫", "Boost");
  const forwardBtn = makeButton("is-forward", "▲", "Accelerate");
  const brakeBtn = makeButton("is-brake", "■", "Brake");
  const jumpBtn = makeButton("is-jump", "⤒", "Jump");
  const cycleBtn = makeButton("is-cycle", "V", "Switch vehicle");
  const interactBtn = makeButton("is-interact", "E", "Interact");
  actions.append(boostBtn, forwardBtn, brakeBtn, jumpBtn, cycleBtn, interactBtn);
  root.appendChild(actions);
  document.body.appendChild(root);

  const state = {
    visible: false,
    steerAxis: 0,
    forward: false,
    backward: false,
    boost: false,
    jump: false,
    stickActive: false,
    stickId: null,
    centerX: 0,
    centerY: 0,
    curX: 0,
    curY: 0,
  };

  const resizeStick = () => {
    const box = stick.getBoundingClientRect();
    state.centerX = box.left + box.width * 0.5;
    state.centerY = box.top + box.height * 0.5;
  };

  const updateCursor = () => {
    if (!state.stickActive) {
      cursor.style.transform = "translate(0px, 0px)";
      state.steerAxis = 0;
      return;
    }
    const dx = state.curX - state.centerX;
    const dy = state.curY - state.centerY;
    const distance = Math.hypot(dx, dy);
    let radius = distance;
    if (radius > 22) radius = 22 + Math.log(distance - 22 + 1) * 5;
    if (radius > 48) radius = 48;
    const angle = Math.atan2(dy, dx);
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    cursor.style.transform = `translate(${cx}px, ${cy}px)`;
    // Horizontal axis steers; deadzone keeps thumbs from twitching.
    const raw = Math.max(-1, Math.min(1, dx / 55));
    state.steerAxis = Math.abs(raw) < 0.12 ? 0 : raw;
  };

  const onStickStart = (event) => {
    event.preventDefault();
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    resizeStick();
    state.stickActive = true;
    state.stickId = touch.identifier;
    state.curX = touch.clientX;
    state.curY = touch.clientY;
    limit.classList.add("is-active");
    updateCursor();
  };

  const onStickMove = (event) => {
    if (!state.stickActive) return;
    event.preventDefault();
    const touch = [...event.changedTouches].find((t) => t.identifier === state.stickId);
    if (!touch) return;
    state.curX = touch.clientX;
    state.curY = touch.clientY;
    updateCursor();
  };

  const onStickEnd = (event) => {
    const touch = [...event.changedTouches].find((t) => t.identifier === state.stickId);
    if (!touch) return;
    state.stickActive = false;
    state.stickId = null;
    limit.classList.remove("is-active");
    updateCursor();
  };

  stick.addEventListener("touchstart", onStickStart, { passive: false });
  window.addEventListener("touchmove", onStickMove, { passive: false });
  window.addEventListener("touchend", onStickEnd);
  window.addEventListener("touchcancel", onStickEnd);
  window.addEventListener("resize", resizeStick);

  const bindHold = (button, onStart, onEnd) => {
    let id = null;
    const start = (event) => {
      event.preventDefault();
      const touch = event.changedTouches?.[0] || event;
      id = touch.identifier ?? "mouse";
      button.classList.add("is-pressed");
      onStart();
    };
    const end = (event) => {
      if (event.changedTouches) {
        if (![...event.changedTouches].some((t) => t.identifier === id)) return;
      } else if (id !== "mouse") return;
      id = null;
      button.classList.remove("is-pressed");
      onEnd();
    };
    button.addEventListener("touchstart", start, { passive: false });
    button.addEventListener("mousedown", start);
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    window.addEventListener("mouseup", end);
  };

  bindHold(
    forwardBtn,
    () => {
      state.forward = true;
    },
    () => {
      state.forward = false;
    }
  );
  bindHold(
    brakeBtn,
    () => {
      state.backward = true;
    },
    () => {
      state.backward = false;
    }
  );
  bindHold(
    boostBtn,
    () => {
      state.boost = true;
      state.forward = true;
    },
    () => {
      state.boost = false;
      if (!forwardBtn.classList.contains("is-pressed")) state.forward = false;
    }
  );
  bindHold(
    jumpBtn,
    () => {
      state.jump = true;
      onJump?.();
    },
    () => {
      state.jump = false;
    }
  );

  // Tap actions
  const tap = (button, fn) => {
    button.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        button.classList.add("is-pressed");
        fn?.();
      },
      { passive: false }
    );
    button.addEventListener("touchend", () => button.classList.remove("is-pressed"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      fn?.();
    });
  };
  tap(cycleBtn, () => onCycleRide?.());
  tap(interactBtn, () => onInteract?.());

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    state.forward = false;
    state.backward = false;
    state.boost = false;
    state.jump = false;
    state.stickActive = false;
    state.steerAxis = 0;
    cursor.style.transform = "translate(0px, 0px)";
    root.querySelectorAll(".is-pressed").forEach((el) => el.classList.remove("is-pressed"));
  });

  return {
    enabled: true,
    show() {
      state.visible = true;
      root.classList.add("is-visible");
      root.setAttribute("aria-hidden", "false");
      requestAnimationFrame(resizeStick);
    },
    hide() {
      state.visible = false;
      root.classList.remove("is-visible");
      root.setAttribute("aria-hidden", "true");
    },
    applyTo(input) {
      if (!state.visible) return;
      if (state.forward) input.forward = true;
      if (state.backward) input.backward = true;
      if (state.boost) input.boost = true;
      if (state.jump) input.jump = true;
      // Analog steer only — vehicle prefers steerAxis over left/right booleans.
      input.steerAxis = state.steerAxis;
    },
    destroy() {
      window.removeEventListener("touchmove", onStickMove);
      window.removeEventListener("touchend", onStickEnd);
      window.removeEventListener("touchcancel", onStickEnd);
      window.removeEventListener("resize", resizeStick);
      root.remove();
    },
  };
}
