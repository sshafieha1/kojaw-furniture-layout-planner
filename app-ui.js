// ============================================================
//  UNIT TOGGLE
// ============================================================
document.getElementById('imperialBtn').addEventListener('click', ()=>setUnit('imperial'));
document.getElementById('metricBtn').addEventListener('click',   ()=>setUnit('metric'));

function setUnit(u) {
  state.unit=u;
  document.getElementById('imperialBtn').classList.toggle('active',u==='imperial');
  document.getElementById('metricBtn').classList.toggle('active',  u==='metric');
  const lbl=u==='imperial'?'in':'cm';
  ['unitLabelW','unitLabelH','unitLabelFW','unitLabelFH'].forEach(id=>
    document.getElementById(id).textContent=lbl);
  state.displayUnit=u==='imperial'?'ftIn':'mCm';
  syncDisplayUnitPill();
  draw();
}

// ============================================================
//  DISPLAY-UNIT TOGGLE
// ============================================================
function syncDisplayUnitPill() {
  const isImperial=state.unit==='imperial';
  const duFtIn=document.getElementById('duFtIn');
  const duIn  =document.getElementById('duIn');
  duFtIn.textContent=isImperial?'ft + in':'m + cm';
  duIn.textContent  =isImperial?'in only':'cm only';
  const compound=state.displayUnit==='ftIn'||state.displayUnit==='mCm';
  duFtIn.classList.toggle('active', compound);
  duIn.classList.toggle('active',  !compound);
}

document.getElementById('duFtIn').addEventListener('click',()=>{
  state.displayUnit=state.unit==='imperial'?'ftIn':'mCm';
  syncDisplayUnitPill(); renderSidebar(); draw();
});
document.getElementById('duIn').addEventListener('click',()=>{
  state.displayUnit=state.unit==='imperial'?'in':'cm';
  syncDisplayUnitPill(); renderSidebar(); draw();
});

// ============================================================
//  COLOR SWATCHES
// ============================================================
const swatchContainer=document.getElementById('colorSwatches');
COLORS.forEach(c=>{
  const el=document.createElement('div');
  el.className='color-swatch'+(c===state.selectedColor?' selected':'');
  el.style.background=c;
  el.addEventListener('click',()=>{
    state.selectedColor=c;
    swatchContainer.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
    el.classList.add('selected');
  });
  swatchContainer.appendChild(el);
});

// ============================================================
//  CREATE ROOM
// ============================================================
let editingRoomId=null;

document.getElementById('btnCreateRoom').addEventListener('click', createOrUpdateRoom);

function createOrUpdateRoom() {
  const w=parseFloat(document.getElementById('roomWidth').value);
  const h=parseFloat(document.getElementById('roomHeight').value);
  const name=document.getElementById('roomName').value.trim();
  if (!w||!h||w<=0||h<=0){alert('Enter valid dimensions.');return;}
  if (editingRoomId) {
    const room=state.rooms.find(r=>r.id===editingRoomId);
    if (room){room.realW=w;room.realH=h;room.name=name;}
    clearRoomEditFields();
  } else {
    const offset=state.rooms.length*(realToPx(10)+20);
    const room={
      id:'room_'+Date.now(), name, realW:w, realH:h,
      canvasX:80+offset, canvasY:80+offset, walls:[], furniture:[],
    };
    state.rooms.push(room);
    state.selectedRoomIds=[room.id];
    state.selected={type:'room',roomId:room.id};
    document.getElementById('statusText').textContent=
      'Room created. Tip: Select rooms from the sidebar list.';
    clearRoomEditFields();
  }
  draw(); renderSidebar();
}

function clearRoomEditFields() {
  editingRoomId=null;
  document.getElementById('roomWidth').value='';
  document.getElementById('roomHeight').value='';
  document.getElementById('roomName').value='';
  document.getElementById('btnCreateRoom').textContent='+ Create Room';
}

function populateRoomEditFields(room) {
  editingRoomId=room.id;
  document.getElementById('roomWidth').value=room.realW;
  document.getElementById('roomHeight').value=room.realH;
  document.getElementById('roomName').value=room.name||'';
  document.getElementById('btnCreateRoom').textContent='✓ Update Room';
}

// ============================================================
//  WALL TOOLS
// ============================================================
document.getElementById('btnWallMode').addEventListener('click',()=>setTool('wall'));
document.getElementById('btnSelectMode').addEventListener('click',()=>setTool('select'));
document.getElementById('btnClearWalls').addEventListener('click',()=>{
  const id=state.selectedRoomIds[0]||(state.selected&&state.selected.roomId);
  const room=state.rooms.find(r=>r.id===id);
  if (room) room.walls=[];
  state.wallDraft=null; draw();
});

function setTool(t) {
  state.tool=t;
  const badge=document.getElementById('wallModeBadge');
  badge.textContent=t==='wall'?'drawing':'inactive';
  badge.classList.toggle('active',t==='wall');
  document.getElementById('btnWallMode').classList.toggle('active',t==='wall');
  document.getElementById('btnSelectMode').classList.toggle('active',t==='select');
  if (t==='wall') {
    if (state.selected && state.selected.type !== 'room') state.selected=null;
    state.selectedWalls=[];
    if (state.snapGrid) {
      state.snapGrid = false;
      const btnSnap = document.getElementById('btnSnapToggle');
      if (btnSnap) { btnSnap.classList.remove('active'); btnSnap.title = 'Snap OFF'; }
    }
    draw();
  } else {
    state.wallDraft=null;
    draw();
  }
  document.getElementById('wallHint').style.display=t==='wall'?'flex':'none';
}


// ============================================================
//  ADD FURNITURE
// ============================================================
document.getElementById('btnAddFurniture').addEventListener('click',()=>{
  const name=document.getElementById('furnitureName').value.trim()||'Item';
  const w=parseFloat(document.getElementById('furnitureW').value);
  const h=parseFloat(document.getElementById('furnitureH').value);
  if (!w||!h||w<=0||h<=0){alert('Enter valid furniture dimensions.');return;}
  let targetIds = state.selectedRoomIds;
  if (targetIds.length === 0 && state.rooms.length > 0) {
      targetIds = [state.rooms[0].id];
  }
  targetIds.forEach(rid=>{
    const room=state.rooms.find(r=>r.id===rid);
    if (!room) return;
    room.furniture.push({
      id:'f_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      name, realW:w, realH:h, color:state.selectedColor,
      rx:undefined, ry:undefined, rotation:0,
    });
  });
  document.getElementById('furnitureName').value='';
  document.getElementById('furnitureW').value='';
  document.getElementById('furnitureH').value='';
  renderSidebar(); draw();
});

// ============================================================
//  SIDEBAR RENDER (Rooms + Furniture)
// ============================================================
function renderSidebar() {
  renderRoomsList();
  renderAllFurnitureLists();
}

function renderRoomsList() {
  const list=document.getElementById('roomsList');
  if (!list) return;
  if (state.rooms.length===0) {
    list.innerHTML='<p class="empty-list-hint">No rooms created yet.</p>';
    return;
  }
  list.innerHTML=state.rooms.map(room=>{
    const isSel=state.selectedRoomIds.includes(room.id);
    return `<div class="furniture-item room-list-item${isSel?' selected':''}" data-room-id="${room.id}">
      <div class="furniture-item-swatch" style="background:#a29bff"></div>
      <div style="flex:1;min-width:0">
        <div class="furniture-item-name">${room.name||'Unnamed Room'}</div>
        <div class="furniture-item-size">${formatDim(room.realW)} × ${formatDim(room.realH)}</div>
      </div>
      <div class="furniture-item-actions">
        <button class="icon-btn-sm" data-action="edit-room" data-room-id="${room.id}" title="Edit">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 9l5.5-5.5L9 5 3.5 10.5 2 10z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn-sm" data-action="delete-room" data-room-id="${room.id}" title="Delete">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.room-list-item').forEach(el=>{
    el.addEventListener('click', e=>{
      if (e.target.closest('[data-action]')) return;
      const rid=el.dataset.roomId;
      if (e.ctrlKey||e.metaKey) {
        const idx=state.selectedRoomIds.indexOf(rid);
        if (idx>=0) state.selectedRoomIds.splice(idx,1);
        else state.selectedRoomIds.push(rid);
      } else {
        if (state.selectedRoomIds.includes(rid) && state.selectedRoomIds.length === 1) {
            state.selectedRoomIds = [];
            if (state.selected && state.selected.type === 'room') state.selected = null;
            if (editingRoomId === rid) {
                clearRoomEditFields();
            }
        } else {
            state.selectedRoomIds=[rid];
            state.selected={type:'room',roomId:rid};
            const room=state.rooms.find(r=>r.id===rid);
            if (room) populateRoomEditFields(room);
        }
      }
      draw(); renderRoomsList();
    });
  });
  list.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const rid=btn.dataset.roomId;
      if (btn.dataset.action==='edit-room') {
        const room=state.rooms.find(r=>r.id===rid);
        if (room) {
          state.selectedRoomIds=[rid];
          state.selected={type:'room',roomId:rid};
          populateRoomEditFields(room);
          draw(); renderRoomsList();
        }
      } else if (btn.dataset.action==='delete-room') {
        state.rooms=state.rooms.filter(r=>r.id!==rid);
        state.selectedRoomIds=state.selectedRoomIds.filter(id=>id!==rid);
        if (state.selected&&state.selected.roomId===rid) state.selected=null;
        draw(); renderSidebar();
      }
    });
  });
}

function renderAllFurnitureLists() {
  const list=document.getElementById('furnitureList');
  const allItems=[];
  state.rooms.forEach(room=>room.furniture.forEach(f=>allItems.push({f,room})));
  if (allItems.length===0) {
    list.innerHTML='<p class="empty-list-hint">No furniture added yet.</p>'; return;
  }
  list.innerHTML=allItems.map(({f,room})=>{
    const isSel=state.selected&&state.selected.type==='furniture'&&state.selected.itemId===f.id;
    return `<div class="furniture-item${isSel?' selected':''}" draggable="true" data-id="${f.id}" data-room="${room.id}">
      <div class="furniture-item-swatch" style="background:${f.color}"></div>
      <div style="flex:1;min-width:0">
        <div class="furniture-item-name">${f.name}</div>
        <div class="furniture-item-size">${formatDim(f.realW)} × ${formatDim(f.realH)}${room.name?' · '+room.name:''}</div>
      </div>
      <div class="furniture-item-actions">
        <button class="icon-btn-sm" data-action="rename" data-id="${f.id}" data-room="${room.id}" title="Rename">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 9l5.5-5.5L9 5 3.5 10.5 2 10z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn-sm" data-action="select-f" data-id="${f.id}" data-room="${room.id}" title="Select">
          <svg viewBox="0 0 12 12" fill="none"><path d="M3 3l6 3-3 1-1 3z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn-sm" data-action="delete" data-id="${f.id}" data-room="${room.id}" title="Delete">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  }).join('')+'<p class="drag-hint">↑ Drag items onto the canvas</p>';

  list.querySelectorAll('.furniture-item').forEach(el=>{
    el.addEventListener('click', e=>{
      if (e.target.closest('[data-action]')) return;
      const fid=el.dataset.id, rid=el.dataset.room;
      state.selected={type:'furniture',roomId:rid,itemId:fid};
      draw(); renderAllFurnitureLists();
    });
    el.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('furniture-id',el.dataset.id);
      e.dataTransfer.setData('furniture-room-id',el.dataset.room);
    });
  });
  list.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const {id, room:roomId, action}=btn.dataset;
      const room=state.rooms.find(r=>r.id===roomId);
      if (!room) return;
      if (action==='delete') {
        room.furniture=room.furniture.filter(f=>f.id!==id);
        if (state.selected&&state.selected.itemId===id) state.selected=null;
        renderAllFurnitureLists(); draw();
      } else if (action==='rename') {
        openRenameModal(id,roomId);
      } else if (action==='select-f') {
        state.selected={type:'furniture',roomId,itemId:id};
        draw(); renderAllFurnitureLists();
      }
    });
  });
}

// ============================================================
//  RENAME MODAL
// ============================================================
function openRenameModal(itemId,roomId) {
  const room=state.rooms.find(r=>r.id===roomId);
  const f=room&&room.furniture.find(x=>x.id===itemId);
  if (!f) return;
  state.renamingId={itemId,roomId};
  document.getElementById('renameInput').value=f.name;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('renameInput').focus();
}
function closeModal(){document.getElementById('modalOverlay').classList.remove('open');state.renamingId=null;}
document.getElementById('modalClose').addEventListener('click',closeModal);
document.getElementById('modalCancel').addEventListener('click',closeModal);
document.getElementById('modalSave').addEventListener('click',()=>{
  if (!state.renamingId) return;
  const {itemId,roomId}=state.renamingId;
  const room=state.rooms.find(r=>r.id===roomId);
  const f=room&&room.furniture.find(x=>x.id===itemId);
  if (f) f.name=document.getElementById('renameInput').value.trim()||f.name;
  closeModal(); renderSidebar(); draw();
});

// ============================================================
//  ZOOM
// ============================================================
document.getElementById('btnZoomIn').addEventListener('click',   ()=>setZoom(state.zoom*1.2));
document.getElementById('btnZoomOut').addEventListener('click',  ()=>setZoom(state.zoom/1.2));
document.getElementById('btnZoomReset').addEventListener('click',()=>setZoom(1));

function setZoom(z) {
  state.zoom=Math.min(4,Math.max(0.2,z));
  document.getElementById('zoomLabel').textContent=Math.round(state.zoom*100)+'%';
  draw();
}
document.getElementById('canvasScrollWrapper').addEventListener('wheel',e=>{
  if (e.ctrlKey||e.metaKey){e.preventDefault();setZoom(state.zoom*(e.deltaY<0?1.1:0.9));}
},{passive:false});

// ============================================================
//  GRID & SNAP TOGGLES
// ============================================================
const btnGrid=document.getElementById('btnGridToggle');
const btnSnap=document.getElementById('btnSnapToggle');
btnGrid.addEventListener('click',()=>{
  state.showGrid=!state.showGrid;
  btnGrid.classList.toggle('active',state.showGrid);
  btnGrid.title=state.showGrid?'Hide grid lines':'Show grid lines';
  draw();
});
btnSnap.addEventListener('click',()=>{
  state.snapGrid=!state.snapGrid;
  btnSnap.classList.toggle('active',state.snapGrid);
  btnSnap.title=state.snapGrid?'Snap ON':'Snap OFF';
});
btnGrid.classList.add('active'); btnSnap.classList.add('active');
btnGrid.title='Hide grid lines'; btnSnap.title='Snap ON – items align to grid';

// ============================================================
//  DELETE SELECTED
// ============================================================
document.getElementById('btnDeleteSelected').addEventListener('click',deleteSelected);

// ============================================================
//  SAVE / OPEN / PRINT
// ============================================================

// ---- SAVE ----
document.getElementById('btnSave').addEventListener('click', () => {
  const saveData = {
    version: 1,
    unit: state.unit,
    displayUnit: state.displayUnit,
    zoom: state.zoom,
    showGrid: state.showGrid,
    snapGrid: state.snapGrid,
    rooms: state.rooms,
  };
  const json = JSON.stringify(saveData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-floorplan.floorplan';
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById('statusText').textContent = 'Design saved as my-floorplan.floorplan';
});

// ---- OPEN ----
document.getElementById('btnOpen').addEventListener('click', () => {
  document.getElementById('fileOpenInput').value = '';
  document.getElementById('fileOpenInput').click();
});

document.getElementById('fileOpenInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data.rooms || !Array.isArray(data.rooms)) throw new Error('Invalid file format.');

      // Restore persisted state
      state.rooms = data.rooms;
      state.zoom = typeof data.zoom === 'number' ? data.zoom : 1;
      state.showGrid = data.showGrid !== false;
      state.snapGrid = data.snapGrid !== false;

      // Clear runtime state
      state.selected = null;
      state.selectedRoomIds = [];
      state.selectedWalls = [];
      state.wallDraft = null;

      // Apply unit/display unit
      if (data.unit) setUnit(data.unit);
      if (data.displayUnit) {
        state.displayUnit = data.displayUnit;
        syncDisplayUnitPill();
      }

      // Sync grid/snap button states
      const btnGrid = document.getElementById('btnGridToggle');
      const btnSnap = document.getElementById('btnSnapToggle');
      btnGrid.classList.toggle('active', state.showGrid);
      btnGrid.title = state.showGrid ? 'Hide grid lines' : 'Show grid lines';
      btnSnap.classList.toggle('active', state.snapGrid);
      btnSnap.title = state.snapGrid ? 'Snap ON' : 'Snap OFF';

      setZoom(state.zoom);
      clearRoomEditFields();
      renderSidebar();
      draw();
      document.getElementById('statusText').textContent = `Loaded: ${file.name}`;
    } catch (err) {
      alert('Could not load file: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// ---- PRINT ----
document.getElementById('btnPrint').addEventListener('click', () => {
  const dataUrl = canvas.toDataURL('image/png');
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>FloorPlan Print</title>
    <style>body{margin:0;background:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;}
    img{max-width:100%;max-height:100vh;}</style></head>
    <body><img src="${dataUrl}" onload="window.print()"/></body></html>`);
  win.document.close();
});

// ============================================================
//  CANVAS CLICK → ROOM SELECTION POPULATES SIDEBAR
// ============================================================
canvas.addEventListener('click',e=>{
  if (state.tool!=='select') return;
  const {cx,cy}=canvasPos(e);
  const room=hitRoom(cx,cy);
  if (room&&state.selected&&state.selected.type==='room'&&state.selected.roomId===room.id) {
    populateRoomEditFields(room);
  } else if (!room) {
    if (editingRoomId) {
      clearRoomEditFields();
    }
  }
});

// ============================================================
//  INIT
// ============================================================
if (!state.selectedWalls) state.selectedWalls=[];
setUnit('imperial');
setTool('select');
syncDisplayUnitPill();
initCanvas();
document.getElementById('wallHint').style.display='none';
renderSidebar();
