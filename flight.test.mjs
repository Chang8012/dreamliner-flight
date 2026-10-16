import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// This test runs without installing packages or requiring package.json.
const source = await readFile(new URL('./dist/flight.js', import.meta.url), 'utf8');
const { createFlight } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const flat = () => 0;
const run = (f, seconds, input = {}, dt = 1 / 60) => {
  for (let t = 0; t < seconds - dt / 2; t += dt) f.step(dt, input, flat);
};

const takeoff = createFlight();
run(takeoff, 18, { throttleDelta: 1, pitch: 0.45 });
assert.equal(takeoff.state.onGround, false, 'full throttle and back pressure lift off in under 20 seconds');
assert.equal(takeoff.state.crashed, false);
assert.ok(takeoff.state.y > 40, 'climb gains altitude');

const right = createFlight();
right.reset('air');
run(right, 6, { roll: 0.75 });
assert.ok(right.state.heading < -0.1 && right.state.z > 0, 'right bank turns toward +Z');
const left = createFlight();
left.reset('air');
run(left, 6, { roll: -0.75 });
assert.ok(left.state.heading > 0.1 && left.state.z < 0, 'left bank turns toward -Z');
assert.ok(Math.abs(left.state.z + right.state.z) < 1e-8, 'turns are symmetric');
const bankBefore = right.state.roll;
run(right, 4);
assert.ok(Math.abs(right.state.roll) < Math.abs(bankBefore) * 0.1, 'released controls level wings');

const gentle = createFlight();
gentle.reset('air');
Object.assign(gentle.state, { y: 7, speed: 78, throttle: 0.25, gear: true, verticalSpeed: -2 });
run(gentle, 1);
assert.equal(gentle.state.landed, true, 'gentle gear-down descent lands');
assert.equal(gentle.state.crashed, false);
assert.equal(gentle.state.y, 6.15);

const hard = createFlight();
hard.reset('air');
Object.assign(hard.state, { y: 6.3, gear: true, verticalSpeed: -14 });
run(hard, 0.1);
assert.equal(hard.state.crashed, true, 'hard impact crashes');
assert.match(hard.state.crashReason, /接地过重/);

const gearUp = createFlight();
gearUp.reset('air');
Object.assign(gearUp.state, { y: 6.2, speed: 78, verticalSpeed: -2 });
run(gearUp, 0.1);
assert.equal(gearUp.state.crashed, true, 'gear-up impact crashes');
assert.match(gearUp.state.crashReason, /起落架/);

const coast = createFlight();
coast.state.speed = 45;
coast.state.throttle = 0;
run(coast, 5, { brake: true });
assert.equal(coast.state.speed, 0, 'brakes stop the aircraft without reversing');

const stall = createFlight();
stall.reset('air');
Object.assign(stall.state, { speed: 35, throttle: 0 });
run(stall, 3);
assert.ok(stall.state.verticalSpeed < -10, 'low airspeed loses lift');

const stable = createFlight();
stable.reset('air');
const unchanged = JSON.stringify(stable.state);
stable.step(NaN); stable.step(Infinity); stable.step(-1); stable.step(0);
assert.equal(JSON.stringify(stable.state), unchanged, 'invalid elapsed time does nothing');
stable.step(1000000, { pitch: NaN, roll: Infinity, throttleDelta: -Infinity });
assert.ok(stable.state.time <= 0.100001, 'a long frame is clamped');
assert.ok(Object.values(stable.state).every(value => typeof value !== 'number' || Number.isFinite(value)));

const fps30 = createFlight();
const fps120 = createFlight();
fps30.reset('air'); fps120.reset('air');
run(fps30, 8, { pitch: 0.15, roll: 0.4 }, 1 / 30);
run(fps120, 8, { pitch: 0.15, roll: 0.4 }, 1 / 120);
assert.ok(Math.abs(fps30.state.x - fps120.state.x) < 1e-8, 'fixed integration is frame-rate independent');
assert.ok(Math.abs(fps30.state.y - fps120.state.y) < 1e-8);

console.log('PASS: takeoff, climb, symmetric turns, auto-level, landing, hard/gear-up impact, braking, stall, dt safeguards, 30/120 FPS consistency');
