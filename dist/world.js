// Procedural island airport. Coordinates and elevations are in metres.
export function createWorld(THREE, scene) {
  const world = new THREE.Group();
  world.name = 'Island airport';
  scene.add(world);
  const runway = { xMin: -1700, xMax: 1700, z: 0, width: 65 };
  const materials = [];
  const textures = [];
  const material = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra });
    materials.push(m);
    return m;
  };
  const grass = material(0xffffff, { vertexColors: true });
  const asphalt = material(0x343d42);
  const taxiAsphalt = material(0x525b5b);
  const concrete = material(0xa5b1ad);
  const white = material(0xf5f1df);
  const yellow = material(0xf4c960);
  const wall = material(0xdde6e1);
  const roof = material(0x628080);
  const glass = material(0x346773, { metalness: 0.3, roughness: 0.3 });
  const dark = material(0x334f55);
  const bark = material(0x6a6550);
  const leaf = material(0xffffff, { roughness: 1 });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const temp = new THREE.Object3D();
  const color = new THREE.Color();
  let seed = 78709;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const gaussian = (x, z, cx, cz, sx, sz, height) =>
    height * Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2);
  function naturalHeight(x, z) {
    const theta = Math.atan2(z + 500, x);
    const edge = 1 + 0.055 * Math.sin(theta * 5) + 0.035 * Math.cos(theta * 9);
    const radial = Math.hypot(x / 5100, (z + 500) / 4400) / edge;
    const coast = (1 - radial) * 300;
    const hills = gaussian(x, z, 1100, 2150, 1150, 1150, 270)
      + gaussian(x, z, -2200, 1900, 900, 1100, 225)
      + gaussian(x, z, 3450, 1600, 800, 950, 170)
      + gaussian(x, z, -900, -2550, 950, 650, 120);
    const detail = (Math.sin(x * 0.0019 + z * 0.0008) * 9
      + Math.cos(z * 0.0026 - x * 0.0005) * 6) * smooth(15, 130, coast);
    const inland = Math.min(coast, 34 + hills + detail);
    // A broad, perfectly level apron also protects runway approaches.
    // One terrain-cell margin keeps interpolated boundary points flat too.
    const dx = Math.max(Math.abs(x) - 2160, 0);
    const dz = Math.max(-710 - z, z - 310, 0);
    const airportBlend = smooth(0, 650, Math.hypot(dx, dz));
    return Math.max(-95, inland * airportBlend);
  }

  // terrainHeight interpolates the very same triangles used for rendering.
  const size = 14000, segments = 240, step = size / segments;
  const row = segments + 1;
  const heights = new Float32Array(row * row);
  const positions = new Float32Array(row * row * 3);
  const colors = new Float32Array(row * row * 3);
  const indices = new Uint32Array(segments * segments * 6);
  const sandColor = new THREE.Color(0xd9d1a7);
  const grassColor = new THREE.Color(0x70936b);
  const hillColor = new THREE.Color(0x537963);
  const rockColor = new THREE.Color(0x97a194);
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const index = j * row + i;
      const x = i * step - size / 2;
      const z = j * step - size / 2;
      const h = naturalHeight(x, z);
      heights[index] = h;
      positions.set([x, h, z], index * 3);
      color.copy(sandColor).lerp(grassColor, smooth(-1, 16, h));
      const airportGrass = 1 - smooth(0, 750, Math.hypot(
        Math.max(Math.abs(x) - 2160, 0), Math.max(-710 - z, z - 310, 0)));
      color.lerp(grassColor, airportGrass);
      color.lerp(hillColor, smooth(55, 210, h) * 0.7);
      color.lerp(rockColor, smooth(190, 310, h) * 0.65);
      const variation = 0.96 + 0.045 * Math.sin(x * 0.006) * Math.cos(z * 0.007);
      color.multiplyScalar(variation);
      colors.set([color.r, color.g, color.b], index * 3);
      if (i < segments && j < segments) {
        const t = (j * segments + i) * 6;
        indices.set([index, index + row, index + 1, index + 1, index + row, index + row + 1], t);
      }
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, grass);
  terrain.receiveShadow = true;
  world.add(terrain);
  function terrainHeight(x, z) {
    const u = (x + size / 2) / step;
    const v = (z + size / 2) / step;
    if (u < 0 || v < 0 || u >= segments || v >= segments) return -8;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const a = j * row + i;
    const h = fx + fz <= 1
      ? heights[a] + fx * (heights[a + 1] - heights[a]) + fz * (heights[a + row] - heights[a])
      : heights[a + row + 1] + (1 - fx) * (heights[a + row] - heights[a + row + 1])
        + (1 - fz) * (heights[a + 1] - heights[a + row + 1]);
    return Math.max(-8, h);
  }

  const oceanMaterial = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorld = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        float ripples = sin(p.x * .035 + p.y * .018 + time * .65)
          * sin(p.y * .047 - time * .4);
        float swell = sin(p.x * .003 + p.y * .004 + time * .12);
        float distanceToEye = length(cameraPosition - vWorld);
        float glitter = pow(max(0.0, ripples), 14.0) * .12
          * (1.0 - smoothstep(1500.0, 9500.0, distanceToEye));
        vec3 sea = mix(vec3(.035, .25, .33), vec3(.075, .40, .45), .56 + swell * .16);
        sea += ripples * .009 + glitter;
        gl_FragColor = vec4(sea, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  materials.push(oceanMaterial);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -8.04;
  world.add(ocean);

  function box(x, y, z, sx, sy, sz, mat, cast = false) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  }
  function instances(geometry, mat, entries, shadows = false) {
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    entries.forEach((entry, i) => {
      const [x, y, z, sx, sy, sz, rotation = 0, tint] = entry;
      temp.position.set(x, y, z);
      temp.rotation.set(0, rotation, 0);
      temp.scale.set(sx, sy, sz);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
      if (tint !== undefined) mesh.setColorAt(i, new THREE.Color(tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  }
  box(0, .05, 0, 3520, .1, 94, concrete);
  box(0, .13, 0, 3400, .12, 65, asphalt);
  box(0, .08, -190, 2920, .12, 32, taxiAsphalt);
  box(0, .08, -360, 1230, .12, 255, concrete);
  for (const x of [-1390, -650, 650, 1390]) box(x, .08, -100, 32, .12, 180, taxiAsphalt);
  const markings = [];
  for (let x = -1380; x <= 1380; x += 90) markings.push([x, .215, 0, 42, .035, 1.6]);
  for (const z of [-29, 29]) markings.push([0, .215, z, 3350, .035, .9]);
  for (const end of [-1, 1]) {
    for (const z of [-23, -17, -11, 11, 17, 23]) markings.push([end * 1615, .215, z, 55, .035, 3]);
    for (const z of [-18, 18]) {
      markings.push([end * 1250, .215, z, 45, .035, 6]);
      markings.push([end * 1030, .215, z, 24, .035, 3]);
    }
  }
  instances(cube, white, markings);
  const taxiMarks = [[0, .17, -190, 2890, .03, .7]];
  for (const x of [-1390, -650, 650, 1390]) taxiMarks.push([x, .17, -105, .7, .03, 145]);
  for (let x = -480; x <= 480; x += 120) {
    taxiMarks.push([x, .17, -340, .7, .03, 132]);
    taxiMarks.push([x, .17, -275, 65, .03, .7]);
  }
  instances(cube, yellow, taxiMarks);
  function runwayText(text, x, angle) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f3e2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 180px Arial';
    ctx.fillText(text, 128, 134);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    materials.push(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(35, 65), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotateZ(angle);
    mesh.position.set(x, .25, 0);
    world.add(mesh);
  }
  runwayText('09', -1500, -Math.PI / 2);
  runwayText('27', 1500, Math.PI / 2);
  const runwayLightMat = material(0xfbf3ca, { emissive: 0xffe8ae, emissiveIntensity: 1.8 });
  const blueLightMat = material(0x73d9ff, { emissive: 0x30a6ff, emissiveIntensity: 1.8 });
  const runwayLights = [], taxiLights = [];
  for (let x = -1680; x <= 1680; x += 60) {
    runwayLights.push([x, .75, -35, .9, 1.1, .9], [x, .75, 35, .9, 1.1, .9]);
    if (Math.abs(x) <= 1420) taxiLights.push([x, .5, -209, .75, .8, .75]);
  }
  instances(cube, runwayLightMat, runwayLights);
  instances(cube, blueLightMat, taxiLights);

  // Airport architecture: continuous glass terminal and slender control tower.
  box(0, 13, -466, 890, 26, 62, wall, true);
  box(0, 29, -466, 930, 7, 75, roof, true);
  box(0, 14, -433.9, 864, 17, 1.2, glass);
  const columns = [], windowRows = [];
  for (let x = -420; x <= 420; x += 35) columns.push([x, 14, -432, 1.8, 25, 2]);
  instances(cube, wall, columns);
  for (let x = -360; x <= 360; x += 120) {
    box(x, 7.5, -411, 9, 5, 42, wall, true);
    box(x + 6, 7.5, -391, 20, 6, 9, glass, true);
  }
  box(-610, 34, -510, 14, 68, 14, wall, true);
  box(-610, 69, -510, 35, 11, 29, glass, true);
  box(-610, 76, -510, 39, 3, 33, roof, true);
  box(-610, 84, -510, 1.4, 15, 1.4, dark);
  for (let i = 0; i < 3; i++) {
    box(950 + i * 160, 15, -430, 120, 30, 100, wall, true);
    box(950 + i * 160, 31, -430, 126, 3, 106, roof, true);
    box(950 + i * 160, 12, -379.2, 95, 23, 1, dark);
  }
  box(0, .09, -570, 1850, .13, 20, taxiAsphalt);
  box(0, .1, -612, 800, .15, 56, taxiAsphalt);
  for (let x = -380; x < 400; x += 18) windowRows.push([x, .21, -610, .6, .03, 37]);
  instances(cube, white, windowRows);
  const cars = [];
  for (let i = 0; i < 48; i++) {
    const x = -371 + Math.floor(i / 2) * 30;
    cars.push([x, 1.4, -602 - (i % 2) * 18, 4, 2.3, 8, 0, [0xe9e7d7, 0x4c6972, 0x648786, 0xb17c5e][i % 4]]);
  }
  instances(cube, wall, cars, true);

  // One trunk draw and one crown draw for the entire forest.
  const trunks = [], crowns = [];
  for (let i = 0; i < 2600; i++) {
    const x = (random() - .5) * 10200;
    const z = (random() - .5) * 8800 - 450;
    const h = terrainHeight(x, z);
    if (h < 10 || h > 230 || (Math.abs(x) < 2380 && z > -860 && z < 480)) continue;
    if (Math.sin(x * .002 + z * .001) + Math.cos(z * .003) < -.7) continue;
    const height = 11 + random() * 23;
    const radius = 4 + random() * 6;
    trunks.push([x, h + height * .28, z, radius * .16, height * .56, radius * .16]);
    crowns.push([x, h + height * .72, z, radius, height * .38, radius, random() * 6.28,
      new THREE.Color().setHSL(.30 + random() * .055, .24 + random() * .14, .24 + random() * .11)]);
  }
  instances(new THREE.CylinderGeometry(1, 1, 1, 5), bark, trunks);
  instances(new THREE.IcosahedronGeometry(1, 0), leaf, crowns);

  const clouds = [];
  const cloudMaterial = material(0xf2f5ed, { roughness: 1, flatShading: false });
  for (let i = 0; i < 20; i++) {
    const x = (random() - .5) * 16000;
    const z = (random() - .5) * 14000;
    const y = 1100 + random() * 800;
    const size = 95 + random() * 110;
    for (let j = 0; j < 5; j++) {
      clouds.push([x + (j - 2) * size * .85, y + Math.sin(j * 1.6) * size * .2,
        z + (random() - .5) * size, size * (1 + random() * .4), size * .4, size * .65]);
    }
  }
  const cloudMesh = instances(new THREE.SphereGeometry(1, 12, 8), cloudMaterial, clouds);
  cloudMesh.receiveShadow = false;

  return {
    runway,
    terrainHeight,
    update(dt, time) {
      oceanMaterial.uniforms.time.value = time;
      cloudMesh.position.x = Math.sin(time * .001) * 220;
    },
    dispose() {
      scene.remove(world);
      const geometries = new Set();
      world.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(mat => mat.dispose());
      textures.forEach(texture => texture.dispose());
    }
  };
}
