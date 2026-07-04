// ============================================================
//  CANVAS POSITION HELPERS
// ============================================================
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { 
    cx: (e.clientX - r.left) * (canvas.width / r.width),
    cy: (e.clientY - r.top)  * (canvas.height / r.height)
  };
}

function toRoomLocal(room, cx, cy) {
  return { rx: pxToReal(cx - room.canvasX), ry: pxToReal(cy - room.canvasY) };
}

function snapReal(r) {
  if (!state.snapGrid) return r;
  const stepReal = pxToReal(minorPx());
  return Math.round(r / stepReal) * stepReal;
}

function snapToRoomLocal(room, cx, cy) {
  const rx = pxToReal(cx - room.canvasX);
  const ry = pxToReal(cy - room.canvasY);
  return { rx: snapReal(rx), ry: snapReal(ry) };
}

// ============================================================
//  MAGNETIC SNAPPING
// ============================================================
function snapToRoomEdges(room, cx, cy) {
  const pxW = realToPx(room.realW), pxH = realToPx(room.realH);
  const ox = room.canvasX, oy = room.canvasY;
  const candidates = [
    {cx:ox,cy:oy},{cx:ox+pxW,cy:oy},{cx:ox+pxW,cy:oy+pxH},{cx:ox,cy:oy+pxH},
    {cx:ox+pxW/2,cy:oy},{cx:ox+pxW,cy:oy+pxH/2},{cx:ox+pxW/2,cy:oy+pxH},{cx:ox,cy:oy+pxH/2},
  ];
  const edges = [
    {x1:ox,y1:oy,x2:ox+pxW,y2:oy},{x1:ox+pxW,y1:oy,x2:ox+pxW,y2:oy+pxH},
    {x1:ox,y1:oy+pxH,x2:ox+pxW,y2:oy+pxH},{x1:ox,y1:oy,x2:ox,y2:oy+pxH},
  ];
  edges.forEach(({x1,y1,x2,y2}) => {
    const lenSq = (x2-x1)**2+(y2-y1)**2;
    const t = Math.max(0,Math.min(1,((cx-x1)*(x2-x1)+(cy-y1)*(y2-y1))/lenSq));
    candidates.push({cx:x1+t*(x2-x1),cy:y1+t*(y2-y1)});
  });
  let best=null, bestD=WALL_SNAP_PX;
  candidates.forEach(c=>{const d=Math.hypot(cx-c.cx,cy-c.cy);if(d<bestD){bestD=d;best=c;}});
  return best;
}

function snapRoomToRooms(draggingIds, roomId, newOx, newOy) {
  const room = state.rooms.find(r=>r.id===roomId);
  if (!room) return {dx:0,dy:0};
  const pxW=realToPx(room.realW),pxH=realToPx(room.realH);
  let bestDx=null,bestDy=null,bestD=ROOM_SNAP_PX;
  state.rooms.forEach(target=>{
    if (draggingIds.includes(target.id)) return;
    const tpxW=realToPx(target.realW),tpxH=realToPx(target.realH);
    const tox=target.canvasX,toy=target.canvasY;
    [[newOx,tox],[newOx+pxW,tox],[newOx,tox+tpxW],[newOx+pxW,tox+tpxW]]
      .forEach(([a,b])=>{const d=Math.abs(a-b);if(d<bestD){bestD=d;bestDx=b-a;}});
    [[newOy,toy],[newOy+pxH,toy],[newOy,toy+tpxH],[newOy+pxH,toy+tpxH]]
      .forEach(([a,b])=>{const d=Math.abs(a-b);if(d<bestD){bestD=d;bestDy=b-a;}});
  });
  return {dx:bestDx||0,dy:bestDy||0};
}

// Snap a wall (as a rigid body) so that points near room edges stick to them
function snapWallToRoomEdges(room, wall) {
  const rW = room.realW, rH = room.realH;
  const snapR = pxToReal(WALL_EDGE_SNAP_PX);
  
  let bestDx = 0, bestDy = 0;
  let minDx = snapR, minDy = snapR;

  for (const p of wall.points) {
    const dx0 = 0 - p.rx;
    const dxW = rW - p.rx;
    if (Math.abs(dx0) < Math.abs(minDx)) { minDx = dx0; bestDx = dx0; }
    if (Math.abs(dxW) < Math.abs(minDx)) { minDx = dxW; bestDx = dxW; }
    
    const dy0 = 0 - p.ry;
    const dyH = rH - p.ry;
    if (Math.abs(dy0) < Math.abs(minDy)) { minDy = dy0; bestDy = dy0; }
    if (Math.abs(dyH) < Math.abs(minDy)) { minDy = dyH; bestDy = dyH; }
  }

  if (bestDx !== 0 || bestDy !== 0) {
    let canSnap = true;
    for (const p of wall.points) {
      const nx = p.rx + bestDx;
      const ny = p.ry + bestDy;
      if (nx < -0.01 || nx > rW + 0.01 || ny < -0.01 || ny > rH + 0.01) {
        canSnap = false;
        break;
      }
    }
    if (canSnap) {
      wall.points = wall.points.map(p => ({
        rx: p.rx + bestDx,
        ry: p.ry + bestDy
      }));
    }
  }
}

// ============================================================
//  HIT TESTS
// ============================================================
function hitRoom(cx, cy) {
  for (let i=state.rooms.length-1;i>=0;i--) {
    const room=state.rooms[i];
    const ox=room.canvasX,oy=room.canvasY;
    const pxW=realToPx(room.realW),pxH=realToPx(room.realH);
    const BORDER=6;
    const onLeft  =Math.abs(cx-ox)<BORDER&&cy>=oy&&cy<=oy+pxH;
    const onRight =Math.abs(cx-ox-pxW)<BORDER&&cy>=oy&&cy<=oy+pxH;
    const onTop   =Math.abs(cy-oy)<BORDER&&cx>=ox&&cx<=ox+pxW;
    const onBottom=Math.abs(cy-oy-pxH)<BORDER&&cx>=ox&&cx<=ox+pxW;
    const inside  =cx>ox&&cx<ox+pxW&&cy>oy&&cy<oy+pxH;
    if (onLeft||onRight||onTop||onBottom||inside) return room;
  }
  return null;
}

// Rotation-aware furniture hit test (point in rotated rect)
function hitFurniture(room, cx, cy) {
  // cx/cy are CANVAS coords; convert to room-local real
  for (let i=room.furniture.length-1;i>=0;i--) {
    const f=room.furniture[i];
    if (f.rx===undefined) continue;
    const fcx = room.canvasX + realToPx(f.rx + f.realW/2);
    const fcy = room.canvasY + realToPx(f.ry + f.realH/2);
    const rot = -(f.rotation||0);
    const dx = cx - fcx, dy = cy - fcy;
    const lx = dx*Math.cos(rot) - dy*Math.sin(rot);
    const ly = dx*Math.sin(rot) + dy*Math.cos(rot);
    const hw = realToPx(f.realW)/2, hh = realToPx(f.realH)/2;
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return f;
  }
  return null;
}

// Check canvas point hits a wall AREA (closed polygon) or segment
function hitWall(cx, cy) {
  const THRESH = 7;
  for (const room of state.rooms) {
    const ox=room.canvasX,oy=room.canvasY;
    for (let wi=0;wi<room.walls.length;wi++) {
      const wall=room.walls[wi];
      if (wall.points.length < 2) continue;
      const pts = wall.closed ? [...wall.points, wall.points[0]] : wall.points;
      const canvasPts = pts.map(p=>({x:ox+realToPx(p.rx),y:oy+realToPx(p.ry)}));

      // For closed walls: check if point is inside the polygon
      if (wall.closed && pointInPolygon(cx,cy,canvasPts.slice(0,-1))) {
        return {room, wallIdx:wi};
      }
      // For any wall: check segments
      for (let si=0;si<canvasPts.length-1;si++) {
        const a=canvasPts[si],b=canvasPts[si+1];
        if (pointToSegDist(cx,cy,a.x,a.y,b.x,b.y)<THRESH) return {room,wallIdx:wi};
      }
    }
  }
  return null;
}

function pointInPolygon(px, py, corners) {
  let inside = false;
  for (let i=0,j=corners.length-1;i<corners.length;j=i++) {
    const xi=corners[i].x,yi=corners[i].y,xj=corners[j].x,yj=corners[j].y;
    if ((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function pointToSegDist(px,py,x1,y1,x2,y2) {
  const dx=x2-x1,dy=y2-y1,lenSq=dx*dx+dy*dy;
  if (lenSq===0) return Math.hypot(px-x1,py-y1);
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/lenSq));
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}

function isRotHandle(f, room, cx, cy) {
  const rot = f.rotation||0;
  const fcx = room.canvasX + realToPx(f.rx + f.realW/2);
  const fcy = room.canvasY + realToPx(f.ry + f.realH/2);
  const pxH = realToPx(f.realH);
  const hx = fcx + Math.sin(rot) * (pxH/2 + 14);
  const hy = fcy - Math.cos(rot) * (pxH/2 + 14);
  return Math.hypot(cx-hx,cy-hy) <= 10;
}

function isResizeHandle(f, room, cx, cy) {
  const rot = f.rotation||0;
  const fcx = room.canvasX + realToPx(f.rx + f.realW/2);
  const fcy = room.canvasY + realToPx(f.ry + f.realH/2);
  const pxW = realToPx(f.realW), pxH = realToPx(f.realH);
  const hx = fcx + Math.cos(rot)*pxW/2 - Math.sin(rot)*pxH/2;
  const hy = fcy + Math.sin(rot)*pxW/2 + Math.cos(rot)*pxH/2;
  return Math.hypot(cx-hx,cy-hy) <= 10;
}

// ============================================================
//  WALL DRAWING
// ============================================================
function handleWallClick(e) {
  if (!state.wallDraft) return;
  const d = state.wallDraft;
  const room = state.rooms.find(r=>r.id===d.roomId);
  if (!room) return;
  if (!d.mouse) return;
  const pt = {rx:d.mouse.rx, ry:d.mouse.ry};
  if (d.points.length > 1) {
    const first = d.points[0];
    if (pxToReal(WALL_SNAP_PX*2) > Math.hypot(pt.rx-first.rx,pt.ry-first.ry)) {
      finalizeWall(true); return;
    }
  }
  d.points.push(pt);
  draw();
}

function finalizeWall(closed) {
  if (!state.wallDraft) return;
  if (typeof commitState === 'function') commitState();
  const d = state.wallDraft;
  if (!d||d.points.length<2) {state.wallDraft=null;draw();return;}
  const room = state.rooms.find(r=>r.id===d.roomId);
  if (room) room.walls.push({points:[...d.points],closed});
  state.wallDraft = null;
  draw();
}

// ============================================================
//  MOUSE EVENTS
// ============================================================
let mouseDown = null;

canvas.addEventListener('mousedown', e => {
  if (e.button!==0) return;
  const {cx,cy} = canvasPos(e);

  // ---- WALL TOOL ----
  if (state.tool==='wall') {
    if (!state.wallDraft) {
      const room = hitRoom(cx,cy);
      if (!room) return;
      const edgeSnap = snapToRoomEdges(room,cx,cy);
      let pt;
      if (edgeSnap) {
        pt={rx:pxToReal(edgeSnap.cx-room.canvasX),ry:pxToReal(edgeSnap.cy-room.canvasY)};
      } else {
        const sl=snapToRoomLocal(room,cx,cy);
        pt={rx:Math.max(0,Math.min(room.realW,sl.rx)),ry:Math.max(0,Math.min(room.realH,sl.ry))};
      }
      state.wallDraft={roomId:room.id,points:[pt],mouse:pt,snapPt:null};
      draw(); return;
    }
    handleWallClick(e); return;
  }

  // ---- SELECT TOOL ----

  // 1. Check handles of selected furniture first
  if (state.selected && state.selected.type === 'furniture') {
    const room = state.rooms.find(r => r.id === state.selected.roomId);
    if (room) {
      const f = room.furniture.find(x => x.id === state.selected.itemId);
      if (f) {
        if (isRotHandle(f, room, cx, cy)) {
          if (typeof commitState === 'function') commitState();
          const fcx = room.canvasX + realToPx(f.rx + f.realW/2);
          const fcy = room.canvasY + realToPx(f.ry + f.realH/2);
          mouseDown = { type: 'rotate', f, room, startAngle: Math.atan2(cy-fcy, cx-fcx), startRot: f.rotation || 0 };
          return;
        }
        if (isResizeHandle(f, room, cx, cy)) {
          if (typeof commitState === 'function') commitState();
          mouseDown = { type: 'resize', f, room, startW: f.realW, startH: f.realH, startCx: cx, startCy: cy };
          return;
        }
      }
    }
  }

  // 2. Furniture (rotation-aware hit) — check all rooms
  for (const room of [...state.rooms].reverse()) {
    const f = hitFurniture(room, cx, cy);
    if (f) {
      if (typeof commitState === 'function') commitState();
      state.selected={type:'furniture',roomId:room.id,itemId:f.id};
      const local=toRoomLocal(room,cx,cy);
      mouseDown={type:'dragFurniture',f,room,offRx:local.rx-f.rx,offRy:local.ry-f.ry};
      draw(); return;
    }
  }

  // 2. Wall (area + segment hit) — support Ctrl multi-select
  const wallHit = hitWall(cx,cy);
  if (wallHit) {
    if (e.ctrlKey||e.metaKey) {
      // Multi-select walls: store array of selected walls
      if (!state.selectedWalls) state.selectedWalls=[];
      const key=`${wallHit.room.id}:${wallHit.wallIdx}`;
      const already = state.selectedWalls.findIndex(w=>w.roomId===wallHit.room.id&&w.wallIdx===wallHit.wallIdx);
      if (already>=0) state.selectedWalls.splice(already,1);
      else state.selectedWalls.push({roomId:wallHit.room.id,wallIdx:wallHit.wallIdx});
      // Set primary selection to last added
      if (state.selectedWalls.length>0) {
        const last=state.selectedWalls[state.selectedWalls.length-1];
        state.selected={type:'wall',roomId:last.roomId,wallIdx:last.wallIdx};
      }
    } else {
      state.selectedWalls=[{roomId:wallHit.room.id,wallIdx:wallHit.wallIdx}];
      state.selected={type:'wall',roomId:wallHit.room.id,wallIdx:wallHit.wallIdx};
    }
    // Start drag for wall(s)
    const wallsToDrag = state.selectedWalls||[{roomId:wallHit.room.id,wallIdx:wallHit.wallIdx}];
    const startSnaps = wallsToDrag.map(ws=>{
      const r=state.rooms.find(r=>r.id===ws.roomId);
      const w=r&&r.walls[ws.wallIdx];
      return {roomId:ws.roomId,wallIdx:ws.wallIdx,startPoints:w?w.points.map(p=>({...p})):[]};
    });
    if (typeof commitState === 'function') commitState();
    mouseDown={type:'dragWalls',startCx:cx,startCy:cy,walls:startSnaps};
    draw(); return;
  }

  // 3. Room
  const room = hitRoom(cx,cy);
  if (room) {
    if (state.selectedRoomIds.includes(room.id)) {
      if (typeof commitState === 'function') commitState();
      const dragRooms=state.selectedRoomIds;
      mouseDown={
        type:'dragRooms',ids:dragRooms,startCx:cx,startCy:cy,
        startPositions:state.rooms.reduce((acc,r)=>{acc[r.id]={x:r.canvasX,y:r.canvasY};return acc;},{})
      };
      return;
    }
  }

  // clicked empty or unselected room
  state.selected=null; state.selectedRoomIds=[]; state.selectedWalls=[];
  if (typeof renderSidebar === 'function') renderSidebar();
  if (typeof clearRoomEditFields === 'function') clearRoomEditFields();
  draw();
});

canvas.addEventListener('mousemove', e => {
  const {cx,cy}=canvasPos(e);
  updateStatusCursor(cx,cy);

  let hoverCursor = 'default';
  if (state.tool === 'wall') {
    hoverCursor = 'crosshair';
  } else if (!mouseDown) {
    let hitF = null;
    for (const room of [...state.rooms].reverse()) {
      hitF = hitFurniture(room, cx, cy);
      if (hitF) break;
    }
    if (hitF) {
      hoverCursor = 'pointer';
    } else {
      const wHit = hitWall(cx, cy);
      if (wHit) hoverCursor = 'pointer';
    }
  }
  canvas.style.cursor = mouseDown ? 'grabbing' : hoverCursor;

  // Wall draft tracking
  if (state.tool==='wall'&&state.wallDraft) {
    const room=state.rooms.find(r=>r.id===state.wallDraft.roomId);
    if (room) {
      const edgeSnap=snapToRoomEdges(room,cx,cy);
      let rx,ry;
      if (edgeSnap) {
        rx=pxToReal(edgeSnap.cx-room.canvasX); ry=pxToReal(edgeSnap.cy-room.canvasY);
        state.wallDraft.snapPt=edgeSnap;
      } else {
        const sl=snapToRoomLocal(room,cx,cy);
        rx=sl.rx; ry=sl.ry; state.wallDraft.snapPt=null;
      }
      if (e.shiftKey&&state.wallDraft.points.length>0) {
        const last=state.wallDraft.points[state.wallDraft.points.length-1];
        if (Math.abs(rx-last.rx)>=Math.abs(ry-last.ry)) ry=last.ry;
        else rx=last.rx;
      }
      rx=Math.max(0,Math.min(room.realW,rx));
      ry=Math.max(0,Math.min(room.realH,ry));
      state.wallDraft.mouse={rx,ry};
    }
    draw(); return;
  }

  if (!mouseDown) return;
  const md=mouseDown;

  if (md.type==='dragFurniture') {
    const f=md.f, room=md.room;
    const local=toRoomLocal(room,cx,cy);
    let rx=pxToReal(snapPx(realToPx(local.rx-md.offRx)));
    let ry=pxToReal(snapPx(realToPx(local.ry-md.offRy)));
    // Clamp using rotation-aware AABB half-extents
    const aabb=furnitureAABB({...f,rx,ry});
    rx=Math.max(aabb.ew-f.realW/2,Math.min(room.realW-(aabb.ew+f.realW/2),rx));
    ry=Math.max(aabb.eh-f.realH/2,Math.min(room.realH-(aabb.eh+f.realH/2),ry));
    // Only move if no collision
    if (!wouldCollide(f,room,rx,ry)) {f.rx=rx;f.ry=ry;}
    draw();
  }
  else if (md.type==='rotate') {
    const f=md.f,room=md.room;
    const fcx=room.canvasX+realToPx(f.rx+f.realW/2);
    const fcy=room.canvasY+realToPx(f.ry+f.realH/2);
    const angle=Math.atan2(cy-fcy,cx-fcx);
    const newRot=md.startRot+(angle-md.startAngle);
    const oldRot=f.rotation;
    f.rotation=newRot;
    // Revert if rotation causes collision; show warning (throttled)
    if (wouldCollide(f,room,f.rx,f.ry)) {
      f.rotation=oldRot;
      if (!md._warnThrottle) {
        if (typeof showRotateWarning === 'function') showRotateWarning();
        md._warnThrottle = true;
        setTimeout(()=>{if(md) md._warnThrottle=false;}, 1500);
      }
    } else {
      md._warnThrottle = false;
    }
    draw();
  }
  else if (md.type==='resize') {
    const f=md.f;
    f.realW=Math.max(pxToReal(minorPx()),md.startW+pxToReal(cx-md.startCx));
    f.realH=Math.max(pxToReal(minorPx()),md.startH+pxToReal(cy-md.startCy));
    draw();
  }
  else if (md.type==='dragWalls') {
    let dxReal=pxToReal(cx-md.startCx);
    let dyReal=pxToReal(cy-md.startCy);
    
    md.walls.forEach(ws=>{
      const room=state.rooms.find(r=>r.id===ws.roomId);
      if (!room) return;
      ws.startPoints.forEach(p => {
         if (p.rx + dxReal < 0) dxReal = -p.rx;
         if (p.rx + dxReal > room.realW) dxReal = room.realW - p.rx;
         if (p.ry + dyReal < 0) dyReal = -p.ry;
         if (p.ry + dyReal > room.realH) dyReal = room.realH - p.ry;
      });
    });

    md.walls.forEach(ws=>{
      const room=state.rooms.find(r=>r.id===ws.roomId);
      if (!room) return;
      const wall=room.walls[ws.wallIdx];
      if (!wall) return;
      wall.points=ws.startPoints.map(p=>({
        rx: p.rx + dxReal,
        ry: p.ry + dyReal
      }));
    });

    // After moving, snap to room edges
    md.walls.forEach(ws=>{
      const room=state.rooms.find(r=>r.id===ws.roomId);
      if (room) snapWallToRoomEdges(room, room.walls[ws.wallIdx]);
    });
    draw();
  }
  else if (md.type==='dragRooms') {
    const dx=cx-md.startCx, dy=cy-md.startCy;
    md.ids.forEach(id=>{
      const room=state.rooms.find(r=>r.id===id);
      if (!room) return;
      const sp=md.startPositions[id];
      room.canvasX=sp.x+dx; room.canvasY=sp.y+dy;
    });
    if (md.ids.length>0) {
      const pRoom=state.rooms.find(r=>r.id===md.ids[0]);
      if (pRoom) {
        const snap=snapRoomToRooms(md.ids,pRoom.id,pRoom.canvasX,pRoom.canvasY);
        if (snap.dx||snap.dy) {
          md.ids.forEach(id=>{
            const room=state.rooms.find(r=>r.id===id);
            if (room){room.canvasX+=snap.dx;room.canvasY+=snap.dy;}
          });
        }
      }
    }
    draw();
  }
});

canvas.addEventListener('mouseup', ()=>{mouseDown=null;});

canvas.addEventListener('dblclick', e=>{
  if (state.tool==='wall'&&state.wallDraft) finalizeWall(false);
});

// drag from sidebar
canvas.addEventListener('dragover', e=>{e.preventDefault();});
canvas.addEventListener('drop', e=>{
  e.preventDefault();
  const id=e.dataTransfer.getData('furniture-id');
  if (!id) return;
  const {cx,cy}=canvasPos(e);
  const targetRoom=hitRoom(cx,cy);
  if (!targetRoom) return;
  let f=null,sourceRoom=null;
  for (const r of state.rooms) {
    const found=r.furniture.find(x=>x.id===id);
    if (found){f=found;sourceRoom=r;break;}
  }
  if (!f) return;
  const local=toRoomLocal(targetRoom,cx,cy);
  const newRx=Math.max(0,Math.min(targetRoom.realW-f.realW,pxToReal(snapPx(realToPx(local.rx-f.realW/2)))));
  const newRy=Math.max(0,Math.min(targetRoom.realH-f.realH,pxToReal(snapPx(realToPx(local.ry-f.realH/2)))));

  if (typeof commitState === 'function') commitState();

  if (sourceRoom&&sourceRoom.id!==targetRoom.id) {
    sourceRoom.furniture=sourceRoom.furniture.filter(x=>x.id!==id);
    targetRoom.furniture.push(f);
  }
  if (!wouldCollide(f,targetRoom,newRx,newRy)){
    f.rx=newRx;
    f.ry=newRy;
    f.hidden=false; // Ensure it's unhidden if dragged successfully
  }
  state.selected={type:'furniture',roomId:targetRoom.id,itemId:f.id};
  draw(); renderSidebar();
});

// keyboard
document.addEventListener('keydown', e=>{
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key==='Delete'||e.key==='Backspace') deleteSelected();
  if (e.key==='Escape') {
    state.wallDraft=null; state.selected=null;
    state.selectedRoomIds=[]; state.selectedWalls=[];
    if (typeof clearRoomEditFields === 'function') clearRoomEditFields();
    draw();
  }
  if (e.key==='r'&&state.selected&&state.selected.type==='furniture') {
    const room=state.rooms.find(r=>r.id===state.selected.roomId);
    if (room) {
      const f=room.furniture.find(x=>x.id===state.selected.itemId);
      if (f) {
        if (typeof commitState === 'function') commitState();
        const oldRot=f.rotation||0;
        f.rotation=oldRot+Math.PI/2;
        if (wouldCollide(f,room,f.rx,f.ry)) {
          f.rotation=oldRot;
          if (typeof showRotateWarning === 'function') showRotateWarning();
        }
        draw();
      }
    }
  }
});

function deleteSelected() {
  if (!state.selected) return;
  if (typeof commitState === 'function') commitState();
  const {type,roomId,wallIdx,itemId}=state.selected;
  const room=state.rooms.find(r=>r.id===roomId);
  if (type==='room') {
    state.rooms=state.rooms.filter(r=>r.id!==roomId);
    state.selectedRoomIds=state.selectedRoomIds.filter(id=>id!==roomId);
  } else if (type==='wall'&&room) {
    room.walls.splice(wallIdx,1);
    state.selectedWalls=(state.selectedWalls||[]).filter(w=>!(w.roomId===roomId&&w.wallIdx===wallIdx));
  } else if (type==='furniture'&&room) {
    room.furniture=room.furniture.filter(f=>f.id!==itemId);
  }
  state.selected=null;
  draw(); renderSidebar();
}

function updateStatusCursor(cx,cy) {
  document.getElementById('statusCursor').textContent=
    `${formatDim(Math.max(0,pxToReal(cx)))} , ${formatDim(Math.max(0,pxToReal(cy)))}`;
}

// ============================================================
//  TOUCH SUPPORT (mobile / tablet)
// ============================================================
let touchStartPos    = null;
let lastTouchTime    = 0;
let lastTwoFingerMid = null;
let lastTwoFingerDist = null;

// ---- helpers ----
function canvasPosFromClient(clientX, clientY) {
  return canvasPos({ clientX, clientY });
}
function roomLocalPt(room, cx, cy) {
  const sl = snapToRoomLocal(room, cx, cy);
  return {
    rx: Math.max(0, Math.min(room.realW, sl.rx)),
    ry: Math.max(0, Math.min(room.realH, sl.ry)),
  };
}

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();

  // Two-finger pan and zoom: just reset, handled in touchmove
  if (e.touches.length === 2) {
    lastTwoFingerMid = null;
    lastTwoFingerDist = null;
    touchStartPos = null;
    return;
  }
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  touchStartPos = { x: touch.clientX, y: touch.clientY, time: Date.now() };

  // ---- WALL TOOL on mobile: start rectangular drag ----
  if (state.tool === 'wall' && (window.innerWidth <= 900 || window.matchMedia('(hover: none) and (pointer: coarse)').matches)) {
    const { cx, cy } = canvasPosFromClient(touch.clientX, touch.clientY);
    const room = hitRoom(cx, cy);
    if (room) {
      const edgeSnap = snapToRoomEdges(room, cx, cy);
      let pt;
      if (edgeSnap) {
        pt = { rx: pxToReal(edgeSnap.cx - room.canvasX), ry: pxToReal(edgeSnap.cy - room.canvasY) };
      } else {
        pt = roomLocalPt(room, cx, cy);
      }
      state.wallDraft = { roomId: room.id, points: [pt], mouse: pt, snapPt: null, mobileRect: true };
      draw();
    }
    return; // Don't dispatch mousedown — touch handles it entirely
  }

  // All other tools: dispatch mousedown so existing handlers work
  canvas.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0,
    clientX: touch.clientX, clientY: touch.clientY,
    ctrlKey: false, metaKey: false, shiftKey: false,
  }));
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();

  // ---- Two-finger pan and zoom ----
  if (e.touches.length === 2) {
    const t1 = e.touches[0], t2 = e.touches[1];
    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    
    if (lastTwoFingerMid && lastTwoFingerDist) {
      // Pan
      const dx = midX - lastTwoFingerMid.x;
      const dy = midY - lastTwoFingerMid.y;
      const wrapper = document.getElementById('canvasScrollWrapper');
      if (wrapper) { wrapper.scrollLeft -= dx; wrapper.scrollTop -= dy; }
      
      // Zoom
      if (Math.abs(dist - lastTwoFingerDist) > 3) {
        const zoomDelta = dist / lastTwoFingerDist;
        if (typeof setZoom === 'function' && typeof state !== 'undefined') {
          // Adjust zoom smoothly based on distance change
          setZoom(state.zoom * zoomDelta);
        }
      }
    }
    lastTwoFingerMid = { x: midX, y: midY };
    lastTwoFingerDist = dist;
    return;
  }
  lastTwoFingerMid = null;
  lastTwoFingerDist = null;
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];

  // ---- WALL TOOL on mobile: update rectangle end point ----
  if (state.tool === 'wall' && state.wallDraft && state.wallDraft.mobileRect) {
    const { cx, cy } = canvasPosFromClient(touch.clientX, touch.clientY);
    const room = state.rooms.find(r => r.id === state.wallDraft.roomId);
    if (room) {
      state.wallDraft.mouse = roomLocalPt(room, cx, cy);
      draw();
    }
    return;
  }

  // Normal single-finger move
  canvas.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true,
    clientX: touch.clientX, clientY: touch.clientY,
    shiftKey: false,
  }));
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  if (e.touches.length < 2) {
    lastTwoFingerMid = null;
    lastTwoFingerDist = null;
  }

  // ---- WALL TOOL on mobile: finalize the rectangle ----
  if (state.tool === 'wall' && state.wallDraft && state.wallDraft.mobileRect) {
    const draft = state.wallDraft;
    const start = draft.points[0];
    const end   = draft.mouse || start;

    // Only commit if the user dragged meaningfully (≥20 screen pixels)
    const t       = e.changedTouches[0];
    const screenDX = touchStartPos ? (t.clientX - touchStartPos.x) : 0;
    const screenDY = touchStartPos ? (t.clientY - touchStartPos.y) : 0;
    const screenDist = Math.sqrt(screenDX * screenDX + screenDY * screenDY);

    if (screenDist >= 20) {
      const x0 = Math.min(start.rx, end.rx);
      const y0 = Math.min(start.ry, end.ry);
      const x1 = Math.max(start.rx, end.rx);
      const y1 = Math.max(start.ry, end.ry);
      const room = state.rooms.find(r => r.id === draft.roomId);
      // Ensure a meaningful size in real units before committing
      if (room && (x1 - x0) > 0.5 && (y1 - y0) > 0.5) {
        if (typeof commitState === 'function') commitState();
        room.walls.push({
          points: [
            { rx: x0, ry: y0 },
            { rx: x1, ry: y0 },
            { rx: x1, ry: y1 },
            { rx: x0, ry: y1 },
          ],
          closed: true,
        });
      }
    }

    state.wallDraft = null;
    const overlay = document.getElementById('wallMeasureOverlay');
    if (overlay) overlay.classList.remove('active');
    draw();
    touchStartPos = null;
    return;
  }

  // Normal: dispatch mouseup then check for tap/double-tap
  canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));

  if (!touchStartPos) return;
  const now     = Date.now();
  const elapsed = now - touchStartPos.time;
  const t       = e.changedTouches[0];
  const dx      = (t?.clientX || touchStartPos.x) - touchStartPos.x;
  const dy      = (t?.clientY || touchStartPos.y) - touchStartPos.y;
  const dist    = Math.sqrt(dx * dx + dy * dy);

  if (elapsed < 500 && dist < 14) {
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, button: 0,
      clientX: t.clientX, clientY: t.clientY,
    }));
    if (now - lastTouchTime < 350) {
      canvas.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true, cancelable: true, button: 0,
        clientX: t.clientX, clientY: t.clientY,
      }));
    }
    lastTouchTime = now;
  }
  touchStartPos = null;
}, { passive: false });
