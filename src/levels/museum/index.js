// ============================================================================
// Inside the Museum — the Grand Welcoming Atrium and the Exhibit Hall.
//
// The building is two levels. The ATRIUM is the second floor: entrance doors,
// the crimson runner, the reception desk off to the east, the coat check to the
// west, and the purple-curtained portal dead ahead. Through the portal is one
// enormous EXHIBIT HALL — its floor 36 units down — reached by the central ramp.
// The hall is the art exhibit: two hundred rainbow paint ladders scattered over one giant white
// drop cloth, ready to be knocked over and driven through (see paint.js).
// The ramp landing spans the full width of the hall, so the
// top of the stairs opens left and right onto the balconies: open, unrailed
// ledges down both sides and across the far end that look into the void and can
// be driven straight off.
//
// The hall is twice the lobby's width and three times its length, so in plan the
// building is a T: the lobby wing is the narrow stem at its south end. Everything
// in the lobby is measured from ATRIUM, the shell and the hall from MUSEUM_HALL.
//
// The level follows the same contract as the house and the farm: it builds its
// own Scene contents and hands main.js a flat list of 2-D colliders (walls are
// `noRoof` so a tall wall is never read as a drivable rooftop), a lights list,
// the start/exit boxes, and the surface queries main.js uses for the ramp.
//
// `buildMuseumWorld(scene)` is the whole API.
// ============================================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  MUSEUM_HALL, MUSEUM_START, MUSEUM_EXIT, MUSEUM_VESTIBULE, ATRIUM_EDGE, ATRIUM,
  RUNNER, RECEPTION, COAT, PORTAL, EXHIBIT, RAMP, BALCONY, RAMP_UNDER_CLEARANCE,
  museumSurfaceAt, museumOnRamp,
} from './layout.js?v=1800000000193';
import { buildPaintExhibit } from './paint.js?v=1800000000190';

export {
  MUSEUM_HALL, MUSEUM_START, MUSEUM_EXIT, MUSEUM_VESTIBULE, ATRIUM_EDGE, ATRIUM,
  RUNNER, RECEPTION, COAT, PORTAL, EXHIBIT, RAMP, BALCONY,
};

// ---- Procedural textures ---------------------------------------------------
// Everything is drawn on a canvas so the level needs no image files. In a
// headless build there is no `document`, so each helper returns null and the
// material falls back to its flat colour.
function canvasTexture(draw, w = 512, h = 512, rx = 1, ry = 1) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  if (THREE.RepeatWrapping) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  return tex;
}

function veinedStone(base, veinA, veinB, rx = 1, ry = 1) {
  return canvasTexture((g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (Math.random() - 0.5) * 190;
        y += (Math.random() - 0.5) * 190;
        g.lineTo(x, y);
      }
      g.strokeStyle = i % 3 === 0 ? veinB : veinA;
      g.lineWidth = 0.5 + Math.random() * 1.4;
      g.globalAlpha = 0.1 + Math.random() * 0.16;
      g.stroke();
    }
    g.globalAlpha = 1;
  }, 512, 512, rx, ry);
}

function walnutWood(rx = 1, ry = 1) {
  return canvasTexture((g, w, h) => {
    g.fillStyle = '#4b2c18';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = (i / 90) * w + (Math.random() - 0.5) * 8;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 24) {
        g.lineTo(x + Math.sin(y * 0.025 + i) * (5 + (i % 5) * 2), y);
      }
      g.strokeStyle = i % 4 === 0 ? 'rgba(120,78,44,0.30)' : 'rgba(26,13,6,0.34)';
      g.lineWidth = 0.8 + Math.random() * 2.6;
      g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 5 + Math.random() * 8, 12 + Math.random() * 20, 0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(24,12,5,0.45)';
      g.lineWidth = 2;
      g.stroke();
    }
  }, 512, 512, rx, ry);
}

function velvetCloth(base, rx = 1, ry = 1) {
  return canvasTexture((g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,220,200,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = 'rgba(198,158,72,0.55)';
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
  }, 256, 512, rx, ry);
}

function orientalRug() {
  return canvasTexture((g, w, h) => {
    g.fillStyle = '#6d1720';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 10;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.lineWidth = 3;
    g.strokeRect(28, 28, w - 56, h - 56);
    g.fillStyle = 'rgba(201,162,74,0.55)';
    for (let i = 0; i < 6; i++) {
      const cx = 55 + (i % 3) * ((w - 110) / 2);
      const cy = 55 + Math.floor(i / 3) * ((h - 110) / 2);
      g.beginPath();
      g.moveTo(cx, cy - 22);
      g.lineTo(cx + 22, cy);
      g.lineTo(cx, cy + 22);
      g.lineTo(cx - 22, cy);
      g.closePath();
      g.fill();
    }
  }, 256, 384, 1, 1);
}

// Original abstract portraits, painted in canvas, hanging in the gilt frames.
function portraitCanvas(variant) {
  const palettes = [
    ['#2a1a12', '#6b3f22', '#c9a24a', '#d8b98a'],
    ['#14202a', '#31505e', '#b98e5a', '#e0c9a0'],
    ['#241428', '#52345e', '#c39a55', '#dcc49a'],
    ['#1e2214', '#3f4a2a', '#b7893f', '#e3ceb0'],
  ];
  const p = palettes[variant % palettes.length];
  return canvasTexture((g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, p[0]);
    grad.addColorStop(1, p[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = p[1];
    g.beginPath();
    g.ellipse(w / 2, h * 0.88, w * 0.42, h * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p[3];
    g.beginPath();
    g.ellipse(w / 2, h * 0.46, w * 0.16, h * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(w * 0.56, h * 0.47, w * 0.08, h * 0.19, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p[2];
    g.lineWidth = 9;
    g.beginPath();
    g.arc(w / 2, h * 0.68, w * 0.17, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(255,220,170,${0.02 + Math.random() * 0.05})`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 70);
      g.stroke();
    }
  }, 320, 400, 1, 1);
}

// The garden outside the glass vestibule: a soft daylight gradient with a
// lawn band and a few tree blobs. Seen only through the entrance glass.
function gardenBackdrop() {
  return canvasTexture((g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#bcd9ee');
    sky.addColorStop(0.55, '#eaf2f7');
    sky.addColorStop(0.56, '#6fa05a');
    sky.addColorStop(1, '#3f7038');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(52,86,46,0.9)';
    for (let i = 0; i < 9; i++) {
      const x = (i / 8) * w;
      const r = 20 + (i % 3) * 12;
      g.beginPath();
      g.arc(x, h * 0.56 - r * 0.4, r, 0, Math.PI * 2);
      g.fill();
    }
  }, 1024, 512, 1, 1);
}

function rgTexture(tex, color, opts) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: opts && opts.roughness !== undefined ? opts.roughness : 0.85,
    metalness: opts && opts.metalness !== undefined ? opts.metalness : 0.04,
  });
  if (tex) {
    material.map = tex;
    material.needsUpdate = true;
  }
  return material;
}

export function buildMuseumWorld(scene, opts = {}) {
  const group = new THREE.Group();
  group.name = 'museumInterior';
  scene.add(group);

  const colliders = [];
  const lights = [];
  const ceilingGroup = new THREE.Group();
  group.add(ceilingGroup);

  const H = MUSEUM_HALL;
  const innerW = H.maxX - H.minX;
  const innerD = H.maxZ - H.minZ;
  const hallZc = (H.minZ + H.maxZ) / 2;
  const T = H.wall;
  const AT = ATRIUM_EDGE;
  const AT_D = H.maxZ - AT;             // atrium depth (70)
  // The lobby keeps its own, narrower footprint; the hall's walls stand proud
  // of it, so the plan of the building is a T.
  const AX0 = ATRIUM.minX;
  const AX1 = ATRIUM.maxX;
  const atrW = AX1 - AX0;

  // ---- Materials -----------------------------------------------------------
  const floorMat = rgTexture(veinedStone('#f4f1e8', 'rgba(120,122,124,0.42)', 'rgba(176,134,74,0.30)', 9, 4), 0xffffff, { roughness: 0.14, metalness: 0.03 });
  const exhibitFloorMat = rgTexture(veinedStone('#b9b4aa', 'rgba(80,78,74,0.42)', 'rgba(140,110,66,0.24)', 12, 12), 0xffffff, { roughness: 0.2, metalness: 0.02 });
  const balconyMat = rgTexture(veinedStone('#e7e1d4', 'rgba(140,128,110,0.36)', 'rgba(160,130,80,0.22)', 4, 12), 0xffffff, { roughness: 0.3, metalness: 0.02 });
  const wallMat = rgTexture(walnutWood(5, 2.4), 0xffffff, { roughness: 0.5 });
  const ceilingMat = rgTexture(walnutWood(4, 4), 0xffffff, { roughness: 0.62 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.62, metalness: 0.12 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.26, metalness: 0.85 });
  const brassDark = new THREE.MeshStandardMaterial({ color: 0x846428, roughness: 0.4, metalness: 0.7 });
  const runnerMat = rgTexture(velvetCloth('#74101f', 1.2, 3), 0xffffff, { roughness: 0.96 });
  const greenMarble = rgTexture(veinedStone('#123a29', 'rgba(210,172,74,0.55)', 'rgba(255,230,150,0.38)', 2, 2), 0xffffff, { roughness: 0.08, metalness: 0.08 });
  const maroonLeather = rgTexture(velvetCloth('#5d1a20', 2, 2), 0xffffff, { roughness: 0.66 });
  const cognacVelvet = rgTexture(velvetCloth('#7d3f22', 2, 2), 0xffffff, { roughness: 1 });
  const purpleVelvet = rgTexture(velvetCloth('#3d1050', 1, 3), 0xffffff, { roughness: 0.98 });
  const rugMat = rgTexture(orientalRug(), 0xffffff, { roughness: 1 });
  const frostGlass = new THREE.MeshStandardMaterial({
    color: 0xfff2d6, emissive: 0xffcf94, emissiveIntensity: 1.05,
    roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.82,
  });
  const clearGlass = new THREE.MeshStandardMaterial({
    color: 0xdff0ff, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32,
  });
  const emeraldShade = new THREE.MeshStandardMaterial({
    color: 0x0e4a35, emissive: 0x2f9a6a, emissiveIntensity: 0.5,
    roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.82,
  });
  const skylightMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dd, emissive: 0xffe7bd, emissiveIntensity: 0.85, roughness: 0.38,
  });
  const paintingMats = [0, 1, 2, 3].map((i) => {
    const map = portraitCanvas(i);
    return map
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0.02, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.16 })
      : new THREE.MeshStandardMaterial({ color: [0x6b3f22, 0x31505e, 0x52345e, 0x3f4a2a][i], roughness: 0.8 });
  });
  const gardenMap = gardenBackdrop();
  const gardenMat = gardenMap
    ? new THREE.MeshBasicMaterial({ map: gardenMap })
    : new THREE.MeshBasicMaterial({ color: 0xdfeef7 });

  // ---- Small builders ------------------------------------------------------
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, target = group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    target.add(m);
    return m;
  };
  const cbox = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, 0, 0, 0, ceilingGroup);
  const cyl = (rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 18) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };
  const sph = (r, mat, x, y, z, seg = 12) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    group.add(m);
    return m;
  };

  // ---- Shell ---------------------------------------------------------------
  // Lobby floor (the second floor), the two balcony floors and the deep
  // exhibit floor. The lobby keeps its original, narrower footprint.
  box(atrW + T * 2, 0.5, AT_D, floorMat, 0, -0.25, (AT + H.maxZ) / 2);
  box(innerW + T * 2, 1.2, innerD + T * 2, ceilingMat, 0, H.ceil + 0.6, hallZc, 0, 0, 0, ceilingGroup);

  const balconyW = (H.maxX - BALCONY.innerX);
  const exhibitZ0 = EXHIBIT.northInnerZ;
  const exhibitZ1 = AT;
  const exhibitDepth = exhibitZ1 - exhibitZ0;    // 912
  const exhibitZc = (exhibitZ0 + exhibitZ1) / 2;
  // East and west balconies, and the balcony across the north end.
  box(balconyW, 0.5, exhibitDepth, balconyMat, (BALCONY.innerX + H.maxX) / 2, -0.25, exhibitZc);
  box(balconyW, 0.5, exhibitDepth, balconyMat, -(BALCONY.innerX + H.maxX) / 2, -0.25, exhibitZc);
  box(innerW, 0.5, exhibitZ0 - H.minZ, balconyMat, 0, -0.25, (H.minZ + exhibitZ0) / 2);
  // The deep floor of the exhibit hall.
  box(BALCONY.innerX * 2, 0.5, exhibitDepth, exhibitFloorMat, 0, EXHIBIT.floorY - 0.25, exhibitZc);
  // The landing at the head of the ramp runs the whole width of the hall, so
  // from the top of the stairs you can turn either way and drive straight out
  // onto the balconies.
  box(BALCONY.innerX * 2, 0.5, AT - RAMP.zTop, floorMat, 0, -0.25, (AT + RAMP.zTop) / 2);

  const wall = (w, d, x, z, y0, y1, opts = {}) => {
    const h = y1 - y0;
    box(w, h, d, wallMat, x, y0 + h / 2, z);
    colliders.push({ x, z, halfW: w / 2, halfD: d / 2, h: y1, noRoof: true, ...opts });
  };
  // Hall shell: the north wall and the two long side walls, which run down to
  // the exhibit floor and stop at AT — south of that the building is only as
  // wide as the lobby.
  const hallDepth = AT - H.minZ;
  const hallZcMid = (H.minZ + AT) / 2;
  wall(innerW + T * 2, T, 0, H.minZ - T / 2, EXHIBIT.floorY, H.ceil);
  wall(T, hallDepth + T, H.maxX + T / 2, hallZcMid, EXHIBIT.floorY, H.ceil);
  wall(T, hallDepth + T, H.minX - T / 2, hallZcMid, EXHIBIT.floorY, H.ceil);
  // The two shoulders: the hall's south wall either side of the lobby wing.
  const shoulderW = H.maxX + T - AX1;
  wall(shoulderW, T, (AX1 + H.maxX + T) / 2, AT + T / 2, EXHIBIT.floorY, H.ceil);
  wall(shoulderW, T, -(AX1 + H.maxX + T) / 2, AT + T / 2, EXHIBIT.floorY, H.ceil);
  // Lobby side walls, closing the narrow wing off the hall's flanks.
  wall(T, AT_D + T, AX1 + T / 2, (AT + H.maxZ) / 2, H.floorY, H.ceil);
  wall(T, AT_D + T, AX0 - T / 2, (AT + H.maxZ) / 2, H.floorY, H.ceil);
  // South wall (atrium), split around the entrance.
  const gap = H.doorGap;
  const leftD = gap.x0 - (AX0 - T);
  const rightD = (AX1 + T) - gap.x1;
  wall(leftD, T, (AX0 - T + gap.x0) / 2, H.maxZ + T / 2, MUSEUM_HALL.floorY, H.ceil);
  wall(rightD, T, (gap.x1 + AX1 + T) / 2, H.maxZ + T / 2, MUSEUM_HALL.floorY, H.ceil);
  box(gap.x1 - gap.x0, H.ceil - gap.top, T, wallMat, 0, (gap.top + H.ceil) / 2, H.maxZ + T / 2);

  // Ceiling collider.
  colliders.push({
    x: 0, z: hallZc, halfW: (innerW + T * 2) / 2, halfD: (innerD + T * 2) / 2,
    h: H.ceil, ceiling: true, soft: true, noRoof: true,
  });

  // ---- Atrium: skirting, pilasters, portraits, sconces --------------------
  const skirt = (w, d, x, z) => box(w, 1.8, d, trimMat, x, 0.9, z);
  skirt(innerW, 1.4, 0, H.minZ + 0.7);
  // The south skirt stops either side of the entrance. Run straight across the
  // opening it was a low bar through the doorway that the car drove through.
  skirt(gap.x0 - AX0, 1.4, (AX0 + gap.x0) / 2, H.maxZ - 0.7);
  skirt(AX1 - gap.x1, 1.4, (gap.x1 + AX1) / 2, H.maxZ - 0.7);
  skirt(1.4, AT_D, AX0 + 0.7, (AT + H.maxZ) / 2);
  skirt(1.4, AT_D, AX1 - 0.7, (AT + H.maxZ) / 2);

  const pilaster = (x, z) => {
    box(2.6, H.ceil, 1.4, trimMat, x, H.ceil / 2, z);
    box(3.4, 1.0, 2.0, brassDark, x, H.ceil - 2.2, z);
    box(3.4, 1.0, 2.0, brassDark, x, 1.6, z);
  };
  for (const z of [80, 110, 140 - 3]) {
    pilaster(AX0 + 0.8, z);
    pilaster(AX1 - 0.8, z);
  }

  const portrait = (side, z, variant) => {
    const east = side > 0;
    const fx = east ? AX1 - 0.6 : AX0 + 0.6;
    box(1.4, 20.5, 16.5, brassMat, fx, 27, z);
    box(1.0, 18.6, 14.8, trimMat, east ? fx - 0.3 : fx + 0.3, 27, z);
    plane(13.8, 17.6, paintingMats[variant], east ? fx - 0.9 : fx + 0.9, 27, z, east ? -Math.PI / 2 : Math.PI / 2);
    box(0.5, 1.4, 3.2, brassMat, east ? fx - 0.6 : fx + 0.6, 15.6, z);
  };
  [84, 136].forEach((z, i) => portrait(1, z, i));
  [78, 140 - 3].forEach((z, i) => portrait(-1, z, i + 1));

  const sconce = (side, z) => {
    const east = side > 0;
    const x = east ? AX1 - 0.4 : AX0 + 0.4;
    box(0.6, 5.0, 1.6, brassDark, x, 20, z);
    box(1.6, 0.7, 0.8, brassMat, east ? x - 0.8 : x + 0.8, 21.6, z);
    cyl(1.25, 0.9, 1.5, frostGlass, east ? x - 1.5 : x + 1.5, 23.2, z, 0, 0, 0, 10);
  };
  for (const z of [92, 124]) {
    sconce(1, z);
    sconce(-1, z);
  }

  // ---- Atrium ceiling: coffers, rosettes, skylights ----------------------
  for (let x = -120; x <= 120; x += 20) {
    cbox(0.8, 0.7, AT_D - 6, trimMat, x, H.ceil - 0.4, (AT + H.maxZ) / 2);
  }
  for (let z = 80; z <= 135; z += 20) {
    cbox(atrW - 8, 0.7, 0.8, trimMat, 0, H.ceil - 0.4, z);
  }
  for (let x = -120; x <= 120; x += 20) {
    for (let z = 80; z <= 135; z += 20) {
      const rosette = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.35, 8), brassMat);
      rosette.position.set(x, H.ceil - 0.88, z);
      ceilingGroup.add(rosette);
    }
  }
  for (const z of [90, 122]) {
    cbox(46, 0.4, 16, skylightMat, 0, H.ceil - 0.95, z);
    cbox(50, 0.35, 1.2, brassDark, 0, H.ceil - 0.9, z - 8.4);
    cbox(50, 0.35, 1.2, brassDark, 0, H.ceil - 0.9, z + 8.4);
  }
  // Emissive skylights over the huge empty hall, for scale and light. The hall
  // is a 336 square, so four strips cover it.
  for (const z of [-30, -110, -190, -250]) {
    cbox(150, 0.4, 22, skylightMat, 0, H.ceil - 0.95, z);
  }

  // ---- Runner --------------------------------------------------------------
  const runnerLen = RUNNER.z1 - RUNNER.z0;
  const runnerZ = (RUNNER.z0 + RUNNER.z1) / 2;
  box(RUNNER.halfW * 2, 0.14, runnerLen, runnerMat, 0, 0.07, runnerZ);
  for (const s of [-1, 1]) {
    box(1.3, 0.18, runnerLen, brassMat, s * (RUNNER.halfW - 0.9), 0.1, runnerZ);
    box(0.5, 0.18, runnerLen, brassDark, s * (RUNNER.halfW - 2.1), 0.1, runnerZ);
    for (let z = RUNNER.z0 + 2; z <= RUNNER.z1 - 2; z += 8) {
      sph(0.5, brassMat, s * (RUNNER.halfW + 0.5), 0.22, z, 8);
    }
  }
  for (let z = RUNNER.z0 + 12; z <= RUNNER.z1 - 8; z += 26) {
    box(3.2, 0.12, 3.2, brassDark, 0, 0.16, z, 0, Math.PI / 4, 0);
  }

  // ---- Stanchions and vases ----------------------------------------------
  const stanchion = (x, z) => {
    cyl(1.1, 1.3, 0.4, brassDark, x, 0.2, z, 0, 0, 0, 12);
    cyl(0.32, 0.32, 5.4, brassMat, x, 3.1, z, 0, 0, 0, 10);
    sph(0.55, brassMat, x, 6.0, z, 12);
  };
  for (const x of [-21, 21]) {
    for (let z = 136; z >= AT + 6; z -= 24) stanchion(x, z);
    for (let z = 136; z > AT + 6; z -= 24) {
      cyl(0.16, 0.16, 23.4, purpleVelvet, x, 5.2, z - 12, Math.PI / 2, 0, 0, 6);
    }
  }

  const lilyMat = new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 0.5 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.85 });
  const vase = (x, z) => {
    box(5.4, 6, 5.4, trimMat, x, 3, z);
    box(6.0, 0.5, 6.0, brassDark, x, 6.2, z);
    cyl(1.5, 1.9, 3.2, clearGlass, x, 8.0, z, 0, 0, 0, 16);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fx = x + Math.cos(a) * 0.85;
      const fz = z + Math.sin(a) * 0.85;
      cyl(0.12, 0.12, 4.2, leafMat, fx, 10.6, fz, 0, 0, 0, 6);
      sph(0.62, lilyMat, fx, 12.8, fz, 8);
      sph(0.22, brassMat, fx, 12.8, fz, 6);
    }
    colliders.push({ x, z, halfW: 2.9, halfD: 2.9, h: 13, noRoof: true });
  };
  for (const x of [-36, 36]) {
    for (const z of [120, 84]) vase(x, z);
  }

  // ---- Reception desk, off to the east -----------------------------------
  const R = RECEPTION;
  const deskSeg = (R.a1 - R.a0) / R.segments;
  for (let i = 0; i < R.segments; i++) {
    const a = R.a0 + deskSeg * (i + 0.5);
    const x = R.cx + Math.cos(a) * R.r;
    const z = R.cz + Math.sin(a) * R.r;
    const len = R.r * deskSeg + 0.35;
    const ry = -(a + Math.PI / 2);
    box(len, R.height, 7.2, wallMat, x, R.height / 2, z, 0, ry, 0);
    box(len + 0.5, 0.9, 7.9, brassDark, x, 0.55, z, 0, ry, 0);
    box(len + 0.5, 0.9, 7.9, brassMat, x, R.height - 0.45, z, 0, ry, 0);
    box(len + 0.6, 0.75, 8.4, greenMarble, x, R.height + 0.37, z, 0, ry, 0);
    for (const f of [-0.26, 0, 0.26]) {
      const fx = x + Math.cos(a) * 3.4 + Math.cos(ry) * f * len;
      const fz = z + Math.sin(a) * 3.4 - Math.sin(ry) * f * len;
      box(0.45, R.height - 2.4, 0.35, brassDark, fx, R.height / 2, fz, 0, ry, 0);
    }
    const hw = (len / 2) * Math.abs(Math.cos(ry)) + 3.6 * Math.abs(Math.sin(ry));
    const hd = (len / 2) * Math.abs(Math.sin(ry)) + 3.6 * Math.abs(Math.cos(ry));
    colliders.push({ x, z, halfW: hw, halfD: hd, h: R.height, noRoof: true });
  }
  const deskLamp = (a) => {
    const x = R.cx + Math.cos(a) * R.r;
    const z = R.cz + Math.sin(a) * R.r;
    cyl(0.9, 1.2, 0.5, brassMat, x, R.height + 0.95, z);
    cyl(0.22, 0.22, 4.4, brassMat, x, R.height + 3.2, z);
    cyl(1.0, 2.0, 2.1, emeraldShade, x, R.height + 6.1, z, 0, 0, 0, 14);
    sph(0.35, brassMat, x, R.height + 7.3, z);
  };
  deskLamp((165 * Math.PI) / 180);
  deskLamp((180 * Math.PI) / 180);
  deskLamp((195 * Math.PI) / 180);
  const deskProp = (a, w, h, d, mat) => {
    const x = R.cx + Math.cos(a) * R.r;
    const z = R.cz + Math.sin(a) * R.r;
    box(w, h, d, mat, x, R.height + 0.75 + h / 2, z, 0, -(a + Math.PI / 2), 0);
  };
  deskProp((158 * Math.PI) / 180, 3.2, 2.2, 2.0, brassMat);
  deskProp((172 * Math.PI) / 180, 2.6, 1.4, 3.0, trimMat);
  deskProp((190 * Math.PI) / 180, 3.2, 2.2, 2.0, brassMat);
  deskProp((203 * Math.PI) / 180, 2.6, 1.4, 3.0, trimMat);

  // The crest on the east wall behind the desk.
  box(0.5, 22, 22, trimMat, AX1 - 0.4, 30, R.cz);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.65, 10, 32), brassMat);
  crest.position.set(AX1 - 0.8, 30, R.cz);
  crest.rotation.y = -Math.PI / 2;
  group.add(crest);
  sph(3.4, brassMat, AX1 - 0.9, 30, R.cz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(0.4, 4.6, 0.9, brassMat, AX1 - 0.9, 30 + Math.sin(a) * 6.2, R.cz + Math.cos(a) * 6.2, 0, 0, a);
  }

  // ---- Coat check, on the west side --------------------------------------
  box(1.2, 27, COAT.z1 - COAT.z0, trimMat, AX0 + 0.8, 15, COAT.counterZ);
  box(1.5, 1.5, COAT.z1 - COAT.z0 + 3, brassMat, AX0 + 1.0, 28.8, COAT.counterZ);
  box(1.5, 1.5, COAT.z1 - COAT.z0 + 3, brassMat, AX0 + 1.0, 1.3, COAT.counterZ);
  box(1.5, 27, 1.5, brassMat, AX0 + 1.0, 15, COAT.z0 + 3);
  box(1.5, 27, 1.5, brassMat, AX0 + 1.0, 15, COAT.z1 - 3);
  for (const y of [11, 19]) {
    cyl(0.3, 0.3, COAT.z1 - COAT.z0 - 8, brassMat, AX0 + 2.2, y, COAT.counterZ, Math.PI / 2, 0, 0, 8);
  }
  for (let z = COAT.z0 + 8; z <= COAT.z1 - 8; z += 3) {
    box(0.5, 7, 0.25, trimMat, AX0 + 2.5, 15, z);
    box(2.4, 0.3, 0.3, brassMat, AX0 + 3.4, 18.3, z);
    box(1.2, 0.5, 0.2, brassMat, AX0 + 4.2, 12.4, z);
  }
  const coatCounterX = -97;
  box(14, 9, COAT.z1 - COAT.z0 - 4, wallMat, coatCounterX, 4.5, COAT.counterZ);
  box(15, 1.1, COAT.z1 - COAT.z0 - 1.5, maroonLeather, coatCounterX, 9.5, COAT.counterZ);
  box(14.4, 7.2, COAT.z1 - COAT.z0 - 3.4, maroonLeather, coatCounterX, 5.0, COAT.counterZ);
  for (let z = COAT.z0 + 10; z <= COAT.z1 - 10; z += 5) {
    for (const y of [3.2, 6.2]) sph(0.3, brassMat, coatCounterX + 7.9, y, z, 8);
  }
  cyl(0.25, 0.25, COAT.z1 - COAT.z0 - 6, brassMat, coatCounterX + 8.7, 0.9, COAT.counterZ, Math.PI / 2, 0, 0, 8);
  colliders.push({ x: coatCounterX, z: COAT.counterZ, halfW: 8, halfD: (COAT.z1 - COAT.z0) / 2 - 2, h: 9.6, noRoof: true });
  // Low arch over the coat check.
  for (const z of [COAT.z0 + 2, COAT.z1 - 2]) {
    box(8, 17, 4.5, wallMat, -20 - 77, 8.5, z);
    box(9.4, 1.2, 5.8, brassDark, -20 - 77, 16.6, z);
  }
  box(9.4, 2.8, COAT.z1 - COAT.z0 + 4, wallMat, -97, 19.4, COAT.counterZ);
  // One cognac banquette on an oriental rug, south of the counter.
  box(36, 0.12, 26, rugMat, -90, 0.06, 86);
  box(7, 2.2, 20, cognacVelvet, -88, 2.0, 86);
  box(2.4, 7.0, 20, cognacVelvet, -93.4, 4.2, 86);
  for (const dz of [-6, 0, 6]) {
    box(5.2, 1.4, 4.2, cognacVelvet, -88, 3.3, 86 + dz);
    box(1.6, 0.5, 4.0, brassMat, -86, 2.1, 86 + dz);
  }
  colliders.push({ x: -90, z: 86, halfW: 8, halfD: 11, h: 8, noRoof: true });

  // ---- Grand portal, dead ahead ------------------------------------------
  const P = PORTAL;
  // Solid wall either side of the portal, with the balcony openings outboard.
  wall(60, T, -54, P.z, H.floorY, H.ceil, { bottom: H.floorY });
  wall(60, T, 54, P.z, H.floorY, H.ceil, { bottom: H.floorY });
  // Headers over the two balcony openings.
  box(46, H.ceil - 28, T, wallMat, -107, (28 + H.ceil) / 2, P.z);
  box(46, H.ceil - 28, T, wallMat, 107, (28 + H.ceil) / 2, P.z);

  for (const s of [-1, 1]) {
    box(10, P.height, 9, wallMat, s * 30, P.height / 2, P.z);
    box(11.6, 3.2, 9.6, brassMat, s * 30, P.height + 1.2, P.z);
    for (const dz of [-3.2, 0, 3.2]) {
      sph(1.1, brassDark, s * 30, P.height - 0.6, P.z + dz, 8);
      cyl(0.7, 1.4, 2.2, brassDark, s * 30, P.height - 2.4, P.z + dz, 0, 0, 0, 8);
    }
    colliders.push({ x: s * 30, z: P.z, halfW: 5, halfD: 4.5, h: P.height + 3, bottom: H.floorY, noRoof: true });
  }
  box(80, 9, 9, wallMat, 0, P.height + 4.5, P.z);
  // Brass lining.
  for (const x of [-P.halfW + 0.6, P.halfW - 0.6]) {
    box(1.3, P.height - 1.2, 0.6, brassMat, x, (P.height - 1.2) / 2, P.z + 3.2);
  }
  box(P.halfW * 2 - 1.2, 1.2, 0.6, brassMat, 0, P.height - 0.6, P.z + 3.2);
  // The arch over the opening.
  const archN = 12;
  for (let i = 0; i < archN; i++) {
    const t0 = Math.PI * (i / archN);
    const t1 = Math.PI * ((i + 1) / archN);
    const tm = (t0 + t1) / 2;
    const x = Math.cos(tm) * P.halfW;
    const y = P.height + Math.sin(tm) * P.halfW;
    box(P.halfW * (Math.PI / archN) + 1.2, 2.2, 7, trimMat, x, y, P.z + 3.8, 0, 0, tm + Math.PI / 2);
  }
  // Purple velvet drapes, pulled aside and tied with gold rope.
  for (const s of [-1, 1]) {
    for (const [dx, r] of [[0, 1.5], [1.4, 1.9], [2.8, 1.7], [4.0, 1.4]]) {
      cyl(r * 0.8, r, 38, purpleVelvet, s * (P.halfW + 1.6 + dx), 21, P.z + 6.2, 0, 0, 0, 12);
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.3, 8, 18), brassMat);
    tie.position.set(s * (P.halfW + 2.6), 14.5, P.z + 6.2);
    tie.rotation.x = Math.PI / 2;
    group.add(tie);
  }
  cyl(0.25, 0.25, P.halfW * 2 + 18, brassMat, 0, P.height + 0.6, P.z + 6.2, 0, 0, Math.PI / 2, 8);

  // ---- The ramp down ------------------------------------------------------
  const rampDrop = RAMP.zTop - RAMP.zBottom;
  const rampRise = RAMP.yTop - RAMP.yBottom;
  const rampLen = Math.hypot(rampDrop, rampRise);
  const rampAngle = Math.atan2(rampRise, rampDrop);
  box(RAMP.halfW * 2, 2, rampLen, floorMat, 0, (RAMP.yTop + RAMP.yBottom) / 2 - 1, (RAMP.zTop + RAMP.zBottom) / 2, -rampAngle, 0, 0);
  const rampY = (z) => RAMP.yTop + (RAMP.yBottom - RAMP.yTop) * ((RAMP.zTop - z) / rampDrop);
  const segN = 12;
  const segLen = rampDrop / segN;
  // Rails down the slope only. The landing at the top is deliberately open on
  // both sides: that is the way out onto the balconies. Each rail is solid only
  // at the height of the ramp it stands on (`bottom`), so the hall floor under
  // the slope is open and the car can drive UNDER the ramp.
  for (let i = 0; i < segN; i++) {
    const zc = RAMP.zBottom + segLen * (i + 0.5);
    const y = rampY(zc);
    for (const s of [-1, 1]) {
      box(1.5, 7, segLen + 0.2, wallMat, s * (RAMP.halfW + 0.75), y + 1.5, zc);
      box(1.9, 0.4, segLen + 0.3, brassMat, s * (RAMP.halfW + 0.75), y + 5.2, zc);
      colliders.push({
        x: s * (RAMP.halfW + 0.75), z: zc, halfW: 0.9, halfD: segLen / 2 + 0.2,
        h: y + 5.4, bottom: y, noRoof: true,
      });
    }
  }
  // The underside of the landing closes the far end of the space under the
  // ramp: solid only below atrium height, so a car climbing the slope to the
  // top is unaffected but one down in the hall cannot pop up through the floor.
  colliders.push({
    x: 0, z: RAMP.zTop, halfW: RAMP.halfW + 1, halfD: 1,
    h: 0, top: -RAMP_UNDER_CLEARANCE, noRoof: true,
  });

  // ---- Balconies ----------------------------------------------------------
  // Open ledges: no railings on the lip itself, so the car can drive straight
  // off it and drop the 36 units to the exhibit floor. The fascia BELOW the lip
  // is the pit's side wall, so it is solid — a car down in the hall used to nose
  // it and be snapped up onto the balcony through the wall.
  const railLen = exhibitDepth;
  for (const s of [-1, 1]) {
    // Fascia under the balcony edge, from the deep floor up to the balcony.
    box(1.2, -EXHIBIT.floorY, railLen, wallMat, s * BALCONY.innerX, EXHIBIT.floorY / 2, exhibitZc);
    colliders.push({
      x: s * BALCONY.innerX, z: exhibitZc, halfW: 0.6, halfD: railLen / 2,
      h: MUSEUM_HALL.floorY, top: MUSEUM_HALL.floorY, bottom: EXHIBIT.floorY, noRoof: true,
    });
  }
  // And under the far (north) end.
  box(innerW, -EXHIBIT.floorY, 1.2, wallMat, 0, EXHIBIT.floorY / 2, EXHIBIT.northInnerZ);
  colliders.push({
    x: 0, z: EXHIBIT.northInnerZ, halfW: innerW / 2, halfD: 0.6,
    h: MUSEUM_HALL.floorY, top: MUSEUM_HALL.floorY, bottom: EXHIBIT.floorY, noRoof: true,
  });

  // The hall's front wall UNDER the lobby floor. Above atrium height the portal
  // and its flanks own that face (see the portal build below), but below it
  // there was nothing at all: a car in the exhibit hall could drive out from
  // under the landing, through the wall beside the portal, and away around the
  // empty shell of the building. This closes the pit into a box — it stops just
  // under the floor slabs so no face is coplanar with them.
  box(ATRIUM.maxX * 2, -EXHIBIT.floorY - 0.5, 1.2, wallMat, 0, EXHIBIT.floorY / 2 - 0.25, AT);
  colliders.push({
    x: 0, z: AT, halfW: ATRIUM.maxX, halfD: 0.6,
    h: MUSEUM_HALL.floorY, top: MUSEUM_HALL.floorY, bottom: EXHIBIT.floorY, noRoof: true,
  });

  // ---- The art exhibit: paint ladders on one giant drop cloth --------------
  // Two hundred ordinary A-frame ladders, each with a bucket of vivid rainbow
  // paint, scattered over a white drop cloth that covers the whole hall floor.
  // Knock a ladder over and its can spills a spreading puddle; drive through wet
  // paint and the car carries it out as a trail.
  const paint = buildPaintExhibit(group, {
    floorY: EXHIBIT.floorY,
    // Paint follows the floor the car is on, so a trail can run up the ramp and
    // out into the lobby.
    surfaceAt: museumSurfaceAt,
    bounds: {
      x0: -BALCONY.innerX + 0.5, x1: BALCONY.innerX - 0.5,
      z0: EXHIBIT.northInnerZ + 0.5, z1: AT - 0.5,
    },
    preview: !!opts.preview,
  });

  // ---- Atrium columns -----------------------------------------------------
  for (const cx of [-56, 56]) {
    for (const cz of [82, 130]) {
      box(9, 2.2, 9, trimMat, cx, 1.1, cz);
      cyl(3.0, 3.4, H.ceil - 6, wallMat, cx, H.ceil / 2, cz, 0, 0, 0, 20);
      box(9, 2.6, 9, brassDark, cx, H.ceil - 4, cz);
      colliders.push({ x: cx, z: cz, halfW: 4.2, halfD: 4.2, h: H.ceil, noRoof: true });
    }
  }

  // ---- Chandelier ---------------------------------------------------------
  const chand = { x: 0, z: 105 };
  cyl(0.45, 0.45, 12, brassDark, chand.x, H.ceil - 6, chand.z, 0, 0, 0, 8);
  const tiers = [
    { y: H.ceil - 14, r: 16, n: 10 },
    { y: H.ceil - 18, r: 12, n: 8 },
    { y: H.ceil - 22, r: 8, n: 6 },
  ];
  for (const tier of tiers) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(tier.r, 0.42, 10, 40), brassMat);
    ring.position.set(chand.x, tier.y, chand.z);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    for (let i = 0; i < tier.n; i++) {
      const a = (i / tier.n) * Math.PI * 2;
      const ax = chand.x + Math.cos(a) * (tier.r / 2);
      const az = chand.z + Math.sin(a) * (tier.r / 2);
      box(tier.r, 0.3, 0.3, brassMat, ax, tier.y, az, 0, -a, 0);
      const gx = chand.x + Math.cos(a) * tier.r;
      const gz = chand.z + Math.sin(a) * tier.r;
      cyl(1.5, 1.5, 0.7, frostGlass, gx, tier.y - 1.1, gz, 0, 0, 0, 12);
      sph(0.5, brassMat, gx, tier.y - 0.4, gz, 8);
    }
  }
  sph(2.2, brassMat, chand.x, H.ceil - 26, chand.z, 14);

  // ---- Entrance vestibule + the two real entrance doors -------------------
  const V = MUSEUM_VESTIBULE;
  const vestLen = V.z1 - V.z0;
  const vestZc = (V.z0 + V.z1) / 2;
  box(V.halfW * 2, 0.4, vestLen, floorMat, 0, -0.2, vestZc);
  for (const s of [-1, 1]) {
    box(0.4, 26, vestLen, clearGlass, s * V.halfW, 13, vestZc);
    box(0.7, 0.7, vestLen, trimMat, s * V.halfW, 26.2, vestZc);
    for (let z = V.z0 + 2; z <= V.z1 - 2; z += 8) {
      box(0.7, 26, 0.7, trimMat, s * V.halfW, 13, z);
    }
    colliders.push({ x: s * V.halfW, z: vestZc, halfW: 0.6, halfD: vestLen / 2, h: 26, noRoof: true });
  }
  box(V.halfW * 2 + 4, 0.4, vestLen + 4, trimMat, 0, 26.6, vestZc);
  // The glass wall at the far end, with a steel frame. The exit trigger fires
  // before the car reaches it, but the glass is SOLID too: the trigger is dead
  // for the first couple of seconds after arriving, and a boosted car used to
  // shoot through this invisible wall and out into the void around the shell.
  box(V.halfW * 2, 26, 0.4, clearGlass, 0, 13, V.z1);
  colliders.push({ x: 0, z: V.z1, halfW: V.halfW, halfD: 0.2, h: 26, noRoof: true });
  for (const x of [-V.halfW, -15, 0, 15, V.halfW]) {
    box(0.6, 26, 0.6, trimMat, x, 13, V.z1);
  }
  box(V.halfW * 2, 0.6, 0.6, trimMat, 0, 26, V.z1);
  plane(150, 70, gardenMat, 0, 12, V.z1 + 10, Math.PI);

  const entranceDoor = buildEntranceDoors({
    gap, planeZ: H.maxZ, height: 26, leafMat: wallMat, glassMat: frostGlass, brassMat, trimMat,
  });
  group.add(entranceDoor.group);

  // ---- Lights -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffe9cc, 0x2a1810, 1.5);
  group.add(hemi);
  lights.push(hemi);
  const key = new THREE.DirectionalLight(0xffd9a8, 1.1);
  key.position.set(40, 140, 80);
  group.add(key);
  lights.push(key);
  const addPoint = (color, intensity, distance, x, y, z) => {
    const p = new THREE.PointLight(color, intensity, distance);
    p.position.set(x, y, z);
    group.add(p);
    lights.push(p);
    return p;
  };
  const chandLight = addPoint(0xffcf9a, 2.6, 130, chand.x, H.ceil - 22, chand.z);
  addPoint(0xffb877, 1.0, 70, chand.x, 24, chand.z);
  addPoint(0xffe2b0, 1.4, 80, 100, 18, RECEPTION.cz);
  addPoint(0xffbe7a, 1.1, 55, -100, 14, COAT.counterZ);
  addPoint(0xffc27a, 1.0, 55, 0, 20, P.z - 6);
  addPoint(0xffd9a8, 1.1, 55, 0, 14, H.maxZ - 16);
  // The huge empty hall still needs to read. High washes over its square plan,
  // plus two low ones so the balconies are not dark ledges.
  addPoint(0xffe0b4, 1.6, 190, 0, 26, -40);
  addPoint(0xffe0b4, 1.6, 190, 0, 26, -170);
  addPoint(0xffe0b4, 1.4, 160, 0, 26, -252);
  // One low wash at the far end, or the north balcony's fascia reads as a black
  // band across the end of the hall.
  addPoint(0xffe0b4, 1.2, 150, 0, 10, -258);
  addPoint(0xffcf9a, 1.0, 120, 190, 9, -120);
  addPoint(0xffcf9a, 1.0, 120, -190, 9, -120);
  // The vestibule and the doors themselves: without these the glazed entrance
  // reads as a dark hole from inside the atrium.
  addPoint(0xffe0b4, 1.5, 60, 0, 16, 152);
  addPoint(0xffe6c0, 1.2, 55, 0, 14, 172);

  // ---- Per-frame ---------------------------------------------------------
  let t = 0;
  // `actors` are any other cars in the room this frame (P2, the chase car):
  // each lays its own paint, and only the ones allowed to may topple ladders.
  // `carYaw` is the player's heading, which the ladder's hit test needs, and
  // `carKind` picks the player's tyre signature (monster-truck ruts, the
  // steamroller's single drum, the robot's footprints).
  const update = (delta, carPos, speed = 0, actors = null, carYaw = null, carKind = null) => {
    t += delta;
    chandLight.intensity = 2.55 + Math.sin(t * 1.7) * 0.06 + Math.sin(t * 3.1) * 0.03;
    if (carPos) entranceDoor.update(carPos, delta);
    paint.update(delta, carPos, speed, actors, carYaw, carKind);
  };

  return {
    group,
    colliders,
    lights,
    ceilingGroup,
    start: MUSEUM_START,
    exit: MUSEUM_EXIT,
    surfaceAt: museumSurfaceAt,
    onRamp: museumOnRamp,
    update,
    paint,
    reset: () => paint.reset(),
  };
}

// A push-door leaf's angle for this frame. Opening tracks the car exactly (the
// nose is doing the pushing, so the leaf moves as fast as the car does); closing
// is deliberately slow, and never closes past what the car still needs while it
// is in the doorway, so the leaves drift shut behind it instead of slamming.
const DOOR_PUSH_TRACK = 30;    // per second: fast enough to stay with the nose
const DOOR_CLOSE_RATE = 1.2;   // rad/s: a full leaf takes about a second to shut
function pushDoorAngle(angle, target, delta) {
  const cur = Math.abs(angle);
  const want = Math.abs(target);
  const sign = Math.sign(angle) || Math.sign(target) || 1;
  const mag = cur < want
    ? cur + (want - cur) * Math.min(1, DOOR_PUSH_TRACK * delta)
    : Math.max(want, cur - DOOR_CLOSE_RATE * delta);
  return sign * mag;
}

// Two full-height glazed doors in the south opening. They are hung on push
// hinges, exactly like the house bathroom door: they have no collider, they
// swing away from whichever side the car is on, and they fall shut behind it.
function buildEntranceDoors(opts) {
  const { gap, planeZ, height, leafMat, glassMat, brassMat, trimMat } = opts;
  const group = new THREE.Group();
  group.name = 'museumEntranceDoors';
  const gapW = gap.x1 - gap.x0;
  const leafW = gapW / 2 - 0.2;
  const leaves = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * (gapW / 2 - 0.1), 0, planeZ);
    group.add(hinge);
    const childX = -side * leafW / 2;
    const add = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = false;
      hinge.add(m);
      return m;
    };
    // Walnut frame with one tall glazed panel: the glass runs almost the full
    // height of the leaf, so the chase camera (which looks at about knee height)
    // sees glass and the lit vestibule rather than a solid wooden slab.
    add(leafW, 1.6, 0.9, leafMat, childX, 0.8, 0);
    add(leafW, 1.4, 0.9, leafMat, childX, height - 0.7, 0);
    add(0.9, height, 0.9, leafMat, childX - leafW / 2 + 0.45, height / 2, 0);
    add(0.9, height, 0.9, leafMat, childX + leafW / 2 - 0.45, height / 2, 0);
    add(0.8, 0.6, 0.9, leafMat, childX, height * 0.55, 0);
    const paneW = leafW - 2.0;
    add(paneW, height - 3.6, 0.22, glassMat, childX, height / 2, 0);
    // Brass pulls on both faces, near the meeting stile.
    add(0.18, 3.4, 0.18, brassMat, childX - side * (leafW / 2 - 1.1), height * 0.46, 0.8);
    add(0.18, 3.4, 0.18, brassMat, childX - side * (leafW / 2 - 1.1), height * 0.46, -0.8);
    leaves.push({ hinge, side, angle: 0, swing: 0 });
  }

  // Push doors, not automatic ones: a leaf does not move at all until the car's
  // nose reaches the leaf line, and from then on its angle is tied to how far
  // the nose has driven past that line — so it opens exactly as fast as the car
  // is moving, and falls shut gently once the tail clears.
  const HALF_LEN = opts.carHalfLength || 2.2;   // nose-to-centre
  const PUSH_DEPTH = HALF_LEN;                  // travel that opens it fully
  const OPEN_ANGLE = 1.2;
  const update = (carPos, delta) => {
    const dz = carPos.z - planeZ;
    const penetration = HALF_LEN - Math.abs(dz);   // <=0 until the nose touches
    const inDoor = Math.abs(carPos.x) < gapW / 2;
    const press = inDoor && penetration > 0 ? Math.min(1, penetration / PUSH_DEPTH) : 0;
    for (const leaf of leaves) {
      let target = 0;
      if (press > 0.01) {
        // Outside (dz > 0) pushes the leaves inward; inside pushes them out.
        if (leaf.swing === 0 || Math.abs(leaf.angle) < 0.04) leaf.swing = dz >= 0 ? -1 : 1;
        target = leaf.side * leaf.swing * OPEN_ANGLE * press;
      } else if (Math.abs(leaf.angle) < 0.04) {
        leaf.swing = 0;
      }
      leaf.angle = pushDoorAngle(leaf.angle, target, delta);
      leaf.hinge.rotation.y = leaf.angle;
    }
  };

  return { group, update };
}
