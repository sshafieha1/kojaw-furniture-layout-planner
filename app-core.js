// ============================================================
//  STATE
// ============================================================
const CANVAS_W = 3200, CANVAS_H = 2400;

// Scale: 4 px per inch  |  2 px per cm  (at zoom = 1)
const PX_PER = { imperial: 4, metric: 2 };
const GRID_MAJOR = { imperial: 12, metric: 100 }; // 1 ft | 1 m
const GRID_MINOR = { imperial: 3,  metric: 10  }; // 3 in | 10 cm
const COLORS = ['#6c63ff','#00d4aa','#ff6b9d','#ffa94d','#74c0fc','#a9e34b','#ff5a5a','#f8961e','#b197fc','#63e6be'];
const WALL_SNAP_PX   = 16;  // snap wall points to room edges
const ROOM_SNAP_PX   = 22;  // snap rooms to each other
const WALL_EDGE_SNAP_PX = 20; // snap wall to room edges when dragging

const state = {
  unit: 'imperial',
  displayUnit: 'ftIn',
  rooms: [],           // [{id,name,realW,realH,canvasX,canvasY,walls:[],furniture:[]}]
  selectedRoomIds: [], // multi-select
  selected: null,      // {type:'room'|'wall'|'furniture', roomId, wallIdx?, itemId?}
  tool: 'select',
  wallDraft: null,     // {roomId, points:[{rx,ry}], snapPt?}
  zoom: 1,
  showGrid: true,
  snapGrid: true,
  dragState: null,
  renamingId: null,
  selectedColor: '#6c63ff',
};

// ============================================================
//  UNIT HELPERS
// ============================================================
const canvas = document.getElementById('mainCanvas');
const ctx    = canvas.getContext('2d');

function ppu()         { return PX_PER[state.unit] * state.zoom; }
function realToPx(r)   { return r * ppu(); }
function pxToReal(p)   { return p / ppu(); }
function majorPx()     { return GRID_MAJOR[state.unit] * ppu(); }
function minorPx()     { return GRID_MINOR[state.unit] * ppu(); }

function unitLabel() { return state.unit === 'imperial' ? 'in' : 'cm'; }

function formatDim(real) {
  if (state.unit === 'imperial') {
    if (state.displayUnit === 'in') {
      const q = Math.round(real * 4) / 4;
      const whole = Math.floor(q);
      const frac  = q - whole;
      const fracStr = frac === 0 ? '' : (frac === 0.25 ? '¼' : frac === 0.5 ? '½' : '¾');
      return `${whole}${fracStr}"`;
    }
    const t = Math.round(real), ft = Math.floor(t / 12), inch = t % 12;
    if (ft === 0) return `${inch}"`;
    if (inch === 0) return `${ft}'`;
    return `${ft}' ${inch}"`;
  }
  if (state.displayUnit === 'cm') return `${Math.round(real)} cm`;
  const m = Math.floor(real / 100), cm = Math.round(real % 100);
  if (m === 0) return `${cm} cm`;
  if (cm === 0) return `${m} m`;
  return `${m} m ${cm} cm`;
}

function snapPx(px) {
  if (!state.snapGrid) return px;
  const s = minorPx();
  return Math.round(px / s) * s;
}

function roomOrigin(room) { return { ox: room.canvasX, oy: room.canvasY }; }

// ============================================================
//  ROTATION-AWARE BOUNDING BOX
//  Returns the axis-aligned bounding box (in room-local REAL coords)
//  of a rotated furniture item.
// ============================================================
function furnitureAABB(f) {
  const rot = f.rotation || 0;
  const hw = f.realW / 2, hh = f.realH / 2;
  const cx = f.rx + hw, cy = f.ry + hh;
  const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
  const ew = hw * cos + hh * sin;   // half-extents after rotation
  const eh = hw * sin + hh * cos;
  return { left: cx - ew, right: cx + ew, top: cy - eh, bottom: cy + eh, cx, cy, ew, eh };
}

// Get the 4 corners of a rotated rectangle (room-local real units)
function furnitureCorners(f) {
  const rot = f.rotation || 0;
  const hw = f.realW / 2, hh = f.realH / 2;
  const cx = f.rx + hw, cy = f.ry + hh;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return [
    { x: cx + (-hw)*cos - (-hh)*sin, y: cy + (-hw)*sin + (-hh)*cos },
    { x: cx + ( hw)*cos - (-hh)*sin, y: cy + ( hw)*sin + (-hh)*cos },
    { x: cx + ( hw)*cos - ( hh)*sin, y: cy + ( hw)*sin + ( hh)*cos },
    { x: cx + (-hw)*cos - ( hh)*sin, y: cy + (-hw)*sin + ( hh)*cos },
  ];
}

// SAT (Separating Axis Theorem) overlap test for two rotated rects (real coords)
function rotatedRectsOverlap(f1, f2) {
  const c1 = furnitureCorners(f1);
  const c2 = furnitureCorners(f2);
  const axes = getAxes(c1).concat(getAxes(c2));
  for (const ax of axes) {
    const p1 = projectPoly(c1, ax);
    const p2 = projectPoly(c2, ax);
    if (p1.max < p2.min || p2.max < p1.min) return false;
  }
  return true;
}

function getAxes(corners) {
  const axes = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(edge.x, edge.y);
    axes.push({ x: -edge.y / len, y: edge.x / len });
  }
  return axes;
}

function projectPoly(corners, axis) {
  let min = Infinity, max = -Infinity;
  for (const c of corners) {
    const dot = c.x * axis.x + c.y * axis.y;
    min = Math.min(min, dot); max = Math.max(max, dot);
  }
  return { min, max };
}

// Check if a rotated furniture item collides with any wall segment (real local coords)
function furnitureCollidesWithWall(f, room) {
  const corners = furnitureCorners(f);
  // Room boundary walls (segments)
  const rW = room.realW, rH = room.realH;
  const roomSegs = [
    [{x:0,y:0},{x:rW,y:0}],
    [{x:rW,y:0},{x:rW,y:rH}],
    [{x:rW,y:rH},{x:0,y:rH}],
    [{x:0,y:rH},{x:0,y:0}],
  ];
  const aabb = furnitureAABB(f);
  // Quick AABB check against room boundaries
  if (aabb.left < 0 || aabb.right > rW || aabb.top < 0 || aabb.bottom > rH) return true;

  // Check interior walls
  for (const wall of room.walls) {
    const pts = wall.closed ? [...wall.points, wall.points[0]] : wall.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = {x: pts[i].rx, y: pts[i].ry};
      const b = {x: pts[i + 1].rx, y: pts[i + 1].ry};
      if (segIntersectsConvexPoly(a, b, corners)) return true;
    }
  }
  return false;
}

// Does segment (a→b) intersect a convex polygon?
function segIntersectsConvexPoly(a, b, corners) {
  // Check if either endpoint is inside the polygon
  if (pointInConvexPoly(a, corners) || pointInConvexPoly(b, corners)) return true;
  // Check segment vs each edge
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i], d = corners[(i + 1) % corners.length];
    if (segsIntersect(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) return true;
  }
  return false;
}

function pointInConvexPoly(pt, corners) {
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (cross < 0) return false;
  }
  return true;
}

function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Check if placing furniture f at (rx, ry) in room would cause a collision
function wouldCollide(f, room, newRx, newRy) {
  const testF = { ...f, rx: newRx, ry: newRy };
  // Check against room boundaries + walls
  if (furnitureCollidesWithWall(testF, room)) return true;
  // Check against other furniture
  for (const other of room.furniture) {
    if (other.id === f.id) continue;
    if (other.rx === undefined) continue;
    if (rotatedRectsOverlap(testF, other)) return true;
  }
  return false;
}

// ============================================================
//  CANVAS INIT
// ============================================================
function initCanvas() {
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  draw();
}

// ============================================================
//  DRAW ORCHESTRATOR
// ============================================================
function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#0d1018';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (state.showGrid) drawGlobalGrid();

  state.rooms.forEach(room => {
    const roomSel = state.selectedRoomIds.includes(room.id);
    drawRoom(room, roomSel);
    drawRoomWalls(room);
    drawRoomFurniture(room);
  });

  drawWallDraft();

  if (state.rooms.length === 0) drawEmptyState();
}

// ============================================================
//  GRID
// ============================================================
function drawGlobalGrid() {
  const maj = majorPx(), min = minorPx();

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < CANVAS_W; x += min) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
  for (let y = 0; y < CANVAS_H; y += min) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke(); }

  ctx.strokeStyle = 'rgba(255,255,255,0.075)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CANVAS_W; x += maj) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
  for (let y = 0; y < CANVAS_H; y += maj) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke(); }
}

// ============================================================
//  ROOM
// ============================================================
function drawRoom(room, selected) {
  const pxW = realToPx(room.realW), pxH = realToPx(room.realH);
  const { ox, oy } = roomOrigin(room);

  // floor
  ctx.fillStyle = '#1a2035';
  ctx.fillRect(ox, oy, pxW, pxH);

  // walls
  ctx.setLineDash([]);
  ctx.strokeStyle = selected ? '#ffffff' : '#a29bff';
  ctx.lineWidth   = selected ? 4 : 3;
  if (selected) { ctx.shadowColor = 'rgba(162,155,255,0.5)'; ctx.shadowBlur = 14; }
  ctx.strokeRect(ox, oy, pxW, pxH);
  ctx.shadowBlur = 0;

  // room name
  if (room.name) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font = `bold ${Math.min(22, Math.max(12, pxW / 10))}px 'Space Grotesk',sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(room.name, ox + pxW / 2, oy + 10);
  }

  // dimension labels
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '11px Inter,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(formatDim(room.realW), ox + pxW / 2, oy - 18);
  ctx.save();
  ctx.translate(ox - 18, oy + pxH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(formatDim(room.realH), 0, 0);
  ctx.restore();

  // corner handles
  [[0,0],[pxW,0],[pxW,pxH],[0,pxH]].forEach(([cx,cy]) => {
    ctx.fillStyle = selected ? '#00d4aa' : 'rgba(108,99,255,0.6)';
    ctx.beginPath(); ctx.arc(ox+cx, oy+cy, 4, 0, Math.PI*2); ctx.fill();
  });
}

// ============================================================
//  ROOM WALLS (interior)
// ============================================================
function drawRoomWalls(room) {
  const { ox, oy } = roomOrigin(room);
  room.walls.forEach((wall, wi) => {
    if (wall.points.length < 2) return;
    const selWalls = state.selectedWalls || [];
    const isSel = (state.selected &&
      state.selected.type === 'wall' &&
      state.selected.roomId === room.id &&
      state.selected.wallIdx === wi) ||
      selWalls.some(w => w.roomId === room.id && w.wallIdx === wi);

    const toX = p => ox + realToPx(p.rx);
    const toY = p => oy + realToPx(p.ry);

    // === HATCH FILL for closed walls ===
    if (wall.closed && wall.points.length >= 3) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(toX(wall.points[0]), toY(wall.points[0]));
      wall.points.slice(1).forEach(p => ctx.lineTo(toX(p), toY(p)));
      ctx.closePath();
      ctx.clip();

      const xs = wall.points.map(p => toX(p));
      const ys = wall.points.map(p => toY(p));
      const bMinX = Math.min(...xs) - 2;
      const bMaxX = Math.max(...xs) + 2;
      const bMinY = Math.min(...ys) - 2;
      const bMaxY = Math.max(...ys) + 2;

      // Semi-transparent white diagonal hatching at 45°
      ctx.strokeStyle = isSel ? 'rgba(0,212,170,0.22)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      const spacing = 12;
      // Lines: y = x + c (slope 1, 45°)
      // c ranges from bMinY-bMaxX to bMaxY-bMinX to cover the whole box
      const cMin = (bMinY - bMaxX) - spacing;
      const cMax = (bMaxY - bMinX) + spacing;
      const ext  = (bMaxX - bMinX) + (bMaxY - bMinY);
      for (let c = cMin; c <= cMax; c += spacing) {
        ctx.beginPath();
        ctx.moveTo(bMinX - ext, (bMinX - ext) + c);
        ctx.lineTo(bMaxX + ext, (bMaxX + ext) + c);
        ctx.stroke();
      }
      ctx.restore();
    }

    // === OUTLINE + LABELS + HANDLES ===
    ctx.save();
    ctx.strokeStyle = isSel ? '#00d4aa' : '#cbd5e1';
    ctx.lineWidth   = isSel ? 4 : 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(toX(wall.points[0]), toY(wall.points[0]));
    wall.points.slice(1).forEach(p => ctx.lineTo(toX(p), toY(p)));
    if (wall.closed) ctx.closePath();
    ctx.stroke();

    // segment labels
    const pts = wall.closed
      ? [...wall.points, wall.points[0]]
      : wall.points;
    for (let i = 0; i < pts.length - 1; i++) {
      drawSegLabel(toX(pts[i]), toY(pts[i]), toX(pts[i+1]), toY(pts[i+1]), isSel);
    }

    // point handles
    wall.points.forEach(p => {
      ctx.fillStyle = isSel ? '#00d4aa' : 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(toX(p), toY(p), isSel ? 5 : 3, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
  });
}

// ============================================================
//  SEGMENT LABEL
// ============================================================
function drawSegLabel(x1,y1,x2,y2,highlighted) {
  const len = Math.hypot(x2-x1, y2-y1);
  if (len < 22) return;
  const text  = formatDim(pxToReal(len));
  const angle = Math.atan2(y2-y1, x2-x1);
  const flip  = (angle > Math.PI/2 || angle < -Math.PI/2);

  ctx.save();
  ctx.translate((x1+x2)/2, (y1+y2)/2);
  ctx.rotate(flip ? angle + Math.PI : angle);
  ctx.font = `500 10px Inter,sans-serif`;
  const tw = ctx.measureText(text).width + 10;
  ctx.fillStyle = highlighted ? 'rgba(0,212,170,0.92)' : 'rgba(20,28,48,0.88)';
  ctx.beginPath(); ctx.roundRect(-tw/2,-8,tw,15,4); ctx.fill();
  ctx.fillStyle = highlighted ? '#fff' : 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ============================================================
//  WALL DRAFT
// ============================================================
function drawWallDraft() {
  const d = state.wallDraft;
  const overlay = document.getElementById('wallMeasureOverlay');

  if (!d || d.points.length === 0) {
    if (overlay) overlay.classList.remove('active');
    return;
  }

  const room = state.rooms.find(r => r.id === d.roomId);
  if (!room) { if (overlay) overlay.classList.remove('active'); return; }
  const { ox, oy } = roomOrigin(room);
  const toX = r => ox + realToPx(r.rx);
  const toY = r => oy + realToPx(r.ry);

  // ============================================================
  //  MOBILE: rectangular tap-drag preview
  // ============================================================
  if (d.mobileRect) {
    const start = d.points[0];
    const end   = d.mouse || start;

    const w = Math.abs(end.rx - start.rx);
    const h = Math.abs(end.ry - start.ry);

    // Update overlay with W x H
    if (overlay) {
      if (w < 0.01 && h < 0.01) {
        overlay.classList.remove('active');
      } else {
        overlay.innerHTML = '<span class="wm-label">Width × Height</span>' +
          formatDim(w) + ' × ' + formatDim(h);
        overlay.classList.add('active');
      }
    }

    const sx = toX(start), sy = toY(start);
    const ex = ox + realToPx(end.rx), ey = oy + realToPx(end.ry);
    const rX = Math.min(sx, ex), rY = Math.min(sy, ey);
    const rW = Math.abs(ex - sx), rH = Math.abs(ey - sy);

    ctx.save();

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(108,99,255,0.13)';
    ctx.fillRect(rX, rY, rW, rH);

    // Dashed outline
    ctx.strokeStyle = 'rgba(108,99,255,0.95)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 4]);
    ctx.strokeRect(rX, rY, rW, rH);
    ctx.setLineDash([]);

    // Dimension labels on each edge
    if (rW > 40) {
      drawSegLabel(rX, rY, rX + rW, rY, true);           // top
      drawSegLabel(rX, rY + rH, rX + rW, rY + rH, true); // bottom
    }
    if (rH > 40) {
      drawSegLabel(rX, rY, rX, rY + rH, true);           // left
      drawSegLabel(rX + rW, rY, rX + rW, rY + rH, true); // right
    }

    // Corner dots
    [[rX, rY],[rX+rW, rY],[rX+rW, rY+rH],[rX, rY+rH]].forEach(([cx, cy]) => {
      ctx.fillStyle = '#6c63ff';
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
    });
    // Start-corner highlight
    ctx.fillStyle = '#00d4aa';
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI*2); ctx.fill();

    ctx.restore();
    return;
  }

  // ============================================================
  //  DESKTOP: polyline preview (unchanged)
  // ============================================================
  if (overlay) {
    if (!d.mouse) {
      overlay.classList.remove('active');
    } else {
      const last = d.points[d.points.length - 1];
      const dx   = d.mouse.rx - last.rx;
      const dy   = d.mouse.ry - last.ry;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) {
        overlay.classList.remove('active');
      } else {
        overlay.innerHTML = '<span class="wm-label">Current segment</span>' + formatDim(dist);
        overlay.classList.add('active');
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(108,99,255,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6,4]);
  ctx.beginPath();
  ctx.moveTo(toX(d.points[0]), toY(d.points[0]));
  d.points.slice(1).forEach(p => ctx.lineTo(toX(p), toY(p)));
  if (d.mouse) ctx.lineTo(ox + realToPx(d.mouse.rx), oy + realToPx(d.mouse.ry));
  ctx.stroke();
  ctx.setLineDash([]);

  if (d.mouse && d.points.length > 0) {
    const last = d.points[d.points.length - 1];
    drawSegLabel(toX(last), toY(last), ox+realToPx(d.mouse.rx), oy+realToPx(d.mouse.ry), true);
  }

  d.points.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? '#00d4aa' : '#6c63ff';
    ctx.beginPath(); ctx.arc(toX(p), toY(p), 5, 0, Math.PI*2); ctx.fill();
  });

  if (d.snapPt) {
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(d.snapPt.cx, d.snapPt.cy, 8, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================
//  FURNITURE
// ============================================================
function drawRoomFurniture(room) {
  const { ox, oy } = roomOrigin(room);
  room.furniture.forEach(f => {
    if (f.rx === undefined) return;
    const isSel = state.selected && state.selected.type === 'furniture' && state.selected.itemId === f.id;
    const pxW = realToPx(f.realW), pxH = realToPx(f.realH);
    const cx = ox + realToPx(f.rx) + pxW/2;
    const cy = oy + realToPx(f.ry) + pxH/2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(f.rotation || 0);
    ctx.shadowColor = f.color + '44';
    ctx.shadowBlur  = isSel ? 18 : 6;

    ctx.fillStyle   = f.color + '2e';
    ctx.strokeStyle = isSel ? '#ffffff' : f.color;
    ctx.lineWidth   = isSel ? 2.5 : 1.5;
    ctx.beginPath(); ctx.roundRect(-pxW/2,-pxH/2,pxW,pxH,4); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // label
    const fs = Math.min(13, Math.max(9, pxW / Math.max(f.name.length * 0.65, 1)));
    ctx.fillStyle = isSel ? '#fff' : f.color;
    ctx.font = `600 ${fs}px Inter,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.name, 0, -4);
    ctx.fillStyle = (isSel ? '#ffffffaa' : f.color + 'aa');
    ctx.font = `400 ${Math.max(8, fs-3)}px Inter,sans-serif`;
    ctx.fillText(`${formatDim(f.realW)}×${formatDim(f.realH)}`, 0, 8);
    ctx.restore();

    if (isSel) {
      // rotation handle
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(f.rotation||0);
      ctx.fillStyle = '#00d4aa';
      ctx.beginPath(); ctx.arc(0, -pxH/2-14, 6, 0, Math.PI*2); ctx.fill();
      // resize handle
      ctx.fillStyle = '#6c63ff';
      ctx.beginPath(); ctx.arc(pxW/2, pxH/2, 6, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  });
}

// ============================================================
//  EMPTY STATE
// ============================================================
function drawEmptyState() {
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.font = '14px Inter,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Enter room dimensions in the sidebar and click "Create Room" to begin.', CANVAS_W/2, CANVAS_H/2);
}
