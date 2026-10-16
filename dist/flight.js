/**
 * Forgiving arcade flight dynamics, in metres, seconds and radians.
 * Local nose is +X, up is +Y, right wing is +Z. Positive heading turns
 * toward -Z; positive bank and rudder input turn right (negative heading).
 * This is a game model, not a simulator or flight-training tool.
 */
export function createFlight() {
  const state = {};
  const DEG = Math.PI / 180;
  const FIXED_STEP = 1 / 120;
  const CLEARANCE = 6.15;
  let accumulator = 0;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const approach = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);
  const surface = (height, x, z) => finite(height(x, z));

  function reset(mode = 'runway') {
    const airborne = mode === 'air';
    Object.assign(state, {
      x: airborne ? -1300 : -1200,
      y: airborne ? 260 : CLEARANCE,
      z: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: airborne ? 115 : 0,
      verticalSpeed: 0,
      throttle: airborne ? 0.65 : 0.15,
      gear: !airborne,
      flaps: 0,
      onGround: !airborne,
      crashed: false,
      crashReason: '',
      landed: false,
      time: 0,
    });
    accumulator = 0;
    return state;
  }

  function crash(reason, floor) {
    state.crashed = true;
    state.crashReason = reason;
    state.onGround = true;
    state.y = floor;
    state.speed = 0;
    state.verticalSpeed = 0;
    state.landed = false;
  }

  function integrate(dt, input, terrainHeight) {
    if (state.crashed) return;
    state.time += dt;
    state.throttle = clamp(state.throttle + input.throttleDelta * 0.32 * dt, 0, 1);
    state.flaps = clamp(finite(state.flaps), 0, 1);
    const rotationSpeed = 69 - state.flaps * 8;

    // Releasing the controls gently levels the aircraft, easing first flights.
    const targetPitch = input.pitch * (input.pitch >= 0 ? 25 : 20) * DEG;
    state.pitch = approach(state.pitch, targetPitch, input.pitch === 0 ? 0.64 : 1.25, dt);
    state.roll = approach(state.roll, state.onGround ? 0 : input.roll * 45 * DEG,
      input.roll === 0 ? 0.86 : 1.7, dt);

    if (state.onGround) {
      // Brakes can hold a stopped aircraft even when engines have some thrust.
      const drag = 0.3 + 0.009 * state.speed + 0.0001 * state.speed * state.speed;
      const acceleration = 9 * state.throttle - drag - (input.brake ? 13 : 0);
      state.speed = clamp(state.speed + acceleration * dt, 0, 190);
      state.heading -= (input.yaw + input.roll * 0.5) * Math.min(state.speed / 25, 1) * 0.3 * dt;
      state.verticalSpeed = 0;
      if (state.speed > rotationSpeed && state.pitch > 4 * DEG) {
        state.onGround = false;
        state.landed = false;
        state.verticalSpeed = Math.max(2, state.speed * Math.sin(state.pitch) * 0.65);
      }
    } else {
      const drag = 0.020 * state.speed + 0.00024 * state.speed * state.speed
        + (state.gear ? 0.7 : 0) + state.flaps * 0.85;
      const climbCost = Math.sin(state.pitch) * 3.2;
      state.speed = clamp(state.speed + (8.5 * state.throttle - drag - climbCost) * dt, 0, 190);

      // Coordinated banking plus gentle rudder; bank also costs a little lift.
      const yawRate = -9.81 * Math.tan(state.roll) / Math.max(48, state.speed)
        - input.yaw * 0.12;
      state.heading += yawRate * dt;
      const stallSpeed = 71 - state.flaps * 10;
      const liftDeficit = clamp((stallSpeed - state.speed) / stallSpeed, 0, 1);
      const sink = Math.pow(liftDeficit, 1.4) * 30;
      const targetVerticalSpeed = state.speed * Math.sin(state.pitch) * 0.82
        + (state.throttle - 0.65) * 4 - sink - Math.abs(state.roll) * 1.6;
      state.verticalSpeed = approach(state.verticalSpeed, clamp(targetVerticalSpeed, -48, 48), 1.35, dt);
    }

    // Keep heading numerically bounded even after very long sessions.
    state.heading = Math.atan2(Math.sin(state.heading), Math.cos(state.heading));
    const horizontalSpeed = state.speed * Math.cos(state.pitch);
    state.x += Math.cos(state.heading) * horizontalSpeed * dt;
    state.z -= Math.sin(state.heading) * horizontalSpeed * dt;
    const floor = surface(terrainHeight, state.x, state.z) + CLEARANCE;

    if (state.onGround) {
      state.y = floor;
      if (!state.gear && state.speed > 2) crash('地面滑跑时起落架未放下', floor);
    } else {
      state.y += state.verticalSpeed * dt;
      if (state.y <= floor) {
        if (!state.gear) crash('起落架未放下', floor);
        else if (state.verticalSpeed < -6) crash('接地过重：请减小下降率', floor);
        else if (Math.abs(state.roll) > 13 * DEG) crash('机翼触地：请保持机翼水平', floor);
        else if (state.pitch < -7 * DEG || state.pitch > 18 * DEG) crash('着陆姿态过大', floor);
        else if (state.speed > 108) crash('着陆速度过高', floor);
        else {
          state.y = floor;
          state.onGround = true;
          state.landed = true;
          state.verticalSpeed = 0;
          state.pitch = clamp(state.pitch, 0, 8 * DEG);
          state.roll = 0;
        }
      }
    }
  }

  function step(dt, input = {}, terrainHeight = () => 0) {
    if (!Number.isFinite(dt) || dt <= 0 || state.crashed) return state;
    const controls = {
      pitch: clamp(finite(input.pitch), -1, 1),
      roll: clamp(finite(input.roll), -1, 1),
      yaw: clamp(finite(input.yaw), -1, 1),
      throttleDelta: clamp(finite(input.throttleDelta), -1, 1),
      brake: Boolean(input.brake),
    };
    // A background tab can deliver a huge dt. Only simulate at most 0.1 s,
    // avoiding teleports and keeping collision checks at a fixed frequency.
    accumulator += Math.min(dt, 0.1);
    while (accumulator + 1e-10 >= FIXED_STEP) {
      integrate(FIXED_STEP, controls, terrainHeight);
      accumulator -= FIXED_STEP;
      if (state.crashed) { accumulator = 0; break; }
    }
    return state;
  }

  reset();
  return { state, reset, step };
}
