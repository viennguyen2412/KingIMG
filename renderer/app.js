(function(){
  "use strict";

  /* ---------------- state ---------------- */
  var images = [];   // {id, file, name, img, width, height}
  var presets = [];  // {id, name, mode, width, height, axis, axisValue, maxWidth, maxHeight, format, quality}
  var selected = new Set();
  var cropState = {}; // key "imgId:presetId" -> {sx, sy}
  var editingPresetId = null;
  var lastZipUrl = null;
  var lastExportFolder = '';

  function uid(){ return 'id' + Math.random().toString(36).slice(2,9); }

  /* ---------------- default presets ---------------- */
  var DEFAULT_PRESETS = [
    {id:uid(), name:'Facebook Feed', mode:'fixed', width:1200, height:630, format:'webp', quality:80},
    {id:uid(), name:'Instagram Story', mode:'fixed', width:1080, height:1920, format:'webp', quality:80},
    {id:uid(), name:'Zalo OA Cover', mode:'fixed', width:800, height:800, format:'webp', quality:85},
    {id:uid(), name:'Blog Thumbnail', mode:'axis', axis:'width', axisValue:600, format:'jpeg', quality:85}
  ];
  presets = DEFAULT_PRESETS.slice();

  var hostApi = window.chrome && window.chrome.webview && window.chrome.webview.hostObjects
    ? window.chrome.webview.hostObjects.kingimgApi
    : null;

  window.kingImg = window.kingImg || (hostApi ? {
    isNative: true,
    loadPresets: function(){ return hostApi.LoadPresets(); },
    savePresets: function(json){ return hostApi.SavePresets(json); },
    loadTemplates: function(){ return hostApi.LoadTemplates(); },
    saveTemplates: function(json){ return hostApi.SaveTemplates(json); },
    chooseExportFolder: function(){ return hostApi.ChooseExportFolder(); },
    chooseSourceFolder: function(){ return hostApi.ChooseSourceFolder(); },
    listImagesInFolder: function(folder){ return hostApi.ListImagesInFolder(folder); },
    readImageFile: function(folder, fileName){ return hostApi.ReadImageFile(folder, fileName); },
    saveFile: function(folder, fileName, base64){ return hostApi.SaveFile(folder, fileName, base64); },
    openFolder: function(folder){ return hostApi.OpenFolder(folder); },
    listSystemFonts: function(){ return hostApi.ListSystemFonts(); },
    addCustomFont: function(fileName, base64){ return hostApi.AddCustomFont(fileName, base64); },
    listCustomFonts: function(){ return hostApi.ListCustomFonts(); }
  } : {
    isNative: false,
    loadPresets: function(){ return Promise.resolve(localStorage.getItem('kingimg.presets') || JSON.stringify(DEFAULT_PRESETS)); },
    savePresets: function(json){ localStorage.setItem('kingimg.presets', json); return Promise.resolve(); },
    loadTemplates: function(){ return Promise.resolve(localStorage.getItem('kingimg.templates') || '[]'); },
    saveTemplates: function(json){ localStorage.setItem('kingimg.templates', json); return Promise.resolve(); },
    chooseExportFolder: function(){ return Promise.resolve(''); },
    chooseSourceFolder: function(){ return Promise.resolve(''); },
    listImagesInFolder: function(){ return Promise.resolve('[]'); },
    readImageFile: function(){ return Promise.resolve(''); },
    saveFile: function(){ return Promise.resolve(false); },
    openFolder: function(){ return Promise.resolve(); },
    listSystemFonts: function(){ return Promise.resolve(JSON.stringify(['Segoe UI','Arial','Calibri','Cambria','Georgia','Times New Roman'])); },
    addCustomFont: function(){ return Promise.resolve(''); },
    listCustomFonts: function(){ return Promise.resolve('[]'); }
  });

  /* ---------------- utils ---------------- */
  function formatBytes(b){
    if(b < 1024) return b + ' B';
    if(b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/1024/1024).toFixed(2) + ' MB';
  }

  function sanitizeFileName(name){
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d').replace(/Đ/g,'D')
      .replace(/\s+/g,'-')
      .replace(/[^a-zA-Z0-9.\-_]/g,'');
  }

  function parseJsonSafe(json, fallback){
    try { return JSON.parse(json); }
    catch(e){ return fallback; }
  }

  function persistPresets(){
    return window.kingImg.savePresets(JSON.stringify(presets));
  }

  function persistTemplates(){
    return window.kingImg.saveTemplates(JSON.stringify(templates));
  }

  function blobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function saveBlobToDisk(folder, fileName, blob){
    return blobToDataUrl(blob).then(function(dataUrl){
      return window.kingImg.saveFile(folder, fileName, dataUrl);
    });
  }

  function computeCover(imgW, imgH, targetW, targetH){
    var k = Math.max(targetW/imgW, targetH/imgH);
    return { k:k, cropW: targetW/k, cropH: targetH/k };
  }

  function needsCrop(imgW, imgH, targetW, targetH){
    return Math.abs((imgW/imgH) - (targetW/targetH)) > 0.004;
  }

  function isTemplateSizeMismatch(imgW, imgH, tpl){
    return Math.abs(imgW - tpl.canvasW) > 2 || Math.abs(imgH - tpl.canvasH) > 2;
  }

  function loadImageFile(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){
        var img = new Image();
        img.onload = function(){
          resolve({ id:uid(), file:file, name:file.name, img:img, width:img.naturalWidth, height:img.naturalHeight, dataUrl:reader.result });
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function mimeFromFileName(fileName){
    var ext = (fileName.split('.').pop() || '').toLowerCase();
    if(ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if(ext === 'webp') return 'image/webp';
    if(ext === 'png') return 'image/png';
    return 'image/png';
  }

  function imageDataUrlFromBase64(fileName, base64){
    if(!base64) return '';
    if(/^data:/i.test(base64)) return base64;
    return 'data:' + mimeFromFileName(fileName) + ';base64,' + base64;
  }

  function loadImageDataUrl(fileName, dataUrl){
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){
        resolve({
          id: uid(),
          file: { name:fileName, type:mimeFromFileName(fileName) },
          name: fileName,
          img: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          dataUrl: dataUrl
        });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /* ---------------- DOM refs ---------------- */
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var pickBtn = document.getElementById('pickBtn');
  var thumbsEl = document.getElementById('thumbs');
  var presetGrid = document.getElementById('presetGrid');
  var cropContent = document.getElementById('cropContent');
  var exportBtn = document.getElementById('exportBtn');
  var exportHelper = document.getElementById('exportHelper');
  var resultsEl = document.getElementById('results');
  var zipBar = document.getElementById('zipBar');
  var zipBtn = document.getElementById('zipBtn');

  var modalOverlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalErr = document.getElementById('modalErr');

  /* ---------------- file handling ---------------- */
  pickBtn.addEventListener('click', function(){ fileInput.click(); });
  dropzone.addEventListener('click', function(e){ if(e.target===dropzone) fileInput.click(); });
  fileInput.addEventListener('change', function(e){ handleFiles(e.target.files); fileInput.value=''; });

  ['dragenter','dragover'].forEach(function(ev){
    dropzone.addEventListener(ev, function(e){ e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    dropzone.addEventListener(ev, function(e){ e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', function(e){
    if(e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });

  function handleFiles(fileList){
    var files = Array.prototype.filter.call(fileList, function(f){ return f.type.indexOf('image/')===0; });
    if(files.length===0) return;
    Promise.all(files.map(loadImageFile)).then(function(loaded){
      images = images.concat(loaded);
      renderAll();
    });
  }

  function removeImage(id){
    images = images.filter(function(i){ return i.id!==id; });
    renderAll();
  }

  function renderImages(){
    if(images.length===0){ thumbsEl.classList.add('hidden'); thumbsEl.innerHTML=''; return; }
    thumbsEl.classList.remove('hidden');
    thumbsEl.innerHTML = images.map(function(im){
      return '<div class="thumb">' +
        '<img src="'+im.dataUrl+'" alt="">' +
        '<button class="rm" data-rm="'+im.id+'" type="button">×</button>' +
        '<div class="name">'+escapeHtml(im.name)+'</div>' +
      '</div>';
    }).join('');
    thumbsEl.querySelectorAll('[data-rm]').forEach(function(btn){
      btn.addEventListener('click', function(){ removeImage(btn.getAttribute('data-rm')); });
    });
  }

  function escapeHtml(s){
    var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  }

  /* ---------------- presets render ---------------- */
  function dimsTextFor(p){
    if(p.mode==='fixed') return p.width + ' × ' + p.height + ' px';
    if(p.mode==='axis') return (p.axis==='width' ? 'Ngang ' : 'Dọc ') + p.axisValue + 'px · còn lại theo tỉ lệ';
    return 'Tối đa ' + p.maxWidth + ' × ' + p.maxHeight + ' px';
  }
  function modeLabelFor(p){
    if(p.mode==='fixed') return 'Khung cố định · crop nếu cần';
    if(p.mode==='axis') return 'Cố định 1 chiều · theo tỉ lệ';
    return 'Giới hạn khung · không crop';
  }
  function formatBadge(p){
    return p.format==='webp'?'WEBP':p.format==='jpeg'?'JPG':p.format==='png'?'PNG':'GỐC';
  }
  function swatchFor(p){
    var maxW=44, maxH=32;
    if(p.mode==='fixed'){
      var r = p.width/p.height, bw, bh;
      if(r >= maxW/maxH){ bw=maxW; bh=maxW/r; } else { bh=maxH; bw=maxH*r; }
      return '<div class="box" style="width:'+bw.toFixed(0)+'px;height:'+bh.toFixed(0)+'px;border-radius:3px;"></div>';
    }
    if(p.mode==='axis'){
      return '<div class="box dashed" style="width:'+maxW+'px;height:'+(maxH*0.7).toFixed(0)+'px;border-radius:3px;"></div>';
    }
    return '<div class="box outline-only" style="width:'+maxW+'px;height:'+maxH+'px;border-radius:3px;"></div>';
  }

  function renderPresets(){
    var html = presets.map(function(p){
      var sel = selected.has(p.id);
      return '<div class="preset-card'+(sel?' selected':'')+'" data-card="'+p.id+'">' +
        '<div class="pc-top">' +
          '<div class="swatch">'+swatchFor(p)+'</div>' +
          '<div><div class="pc-name">'+escapeHtml(p.name)+'</div><span class="pc-format">'+formatBadge(p)+'</span></div>' +
        '</div>' +
        '<div class="pc-dims">'+dimsTextFor(p)+'</div>' +
        '<div class="pc-mode">'+modeLabelFor(p)+'</div>' +
        '<div class="pc-footer">' +
          '<label class="pc-select"><input type="checkbox" data-sel="'+p.id+'" '+(sel?'checked':'')+'> Chọn xuất</label>' +
          '<div class="pc-actions"><button data-edit="'+p.id+'" type="button">Sửa</button><button data-del="'+p.id+'" type="button">Xóa</button></div>' +
        '</div>' +
      '</div>';
    }).join('') +
    '<div class="preset-card add" id="addPresetCard"><div class="plus">+</div><div>Thêm preset</div></div>';

    presetGrid.innerHTML = html;

    presetGrid.querySelectorAll('[data-sel]').forEach(function(cb){
      cb.addEventListener('change', function(){
        var id = cb.getAttribute('data-sel');
        if(cb.checked) selected.add(id); else selected.delete(id);
        renderAll();
      });
    });
    presetGrid.querySelectorAll('[data-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){ openModal(btn.getAttribute('data-edit')); });
    });
    presetGrid.querySelectorAll('[data-del]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-del');
        presets = presets.filter(function(p){ return p.id!==id; });
        selected.delete(id);
        persistPresets();
        renderAll();
      });
    });
    document.getElementById('addPresetCard').addEventListener('click', function(){ openModal(null); });
  }

  /* ---------------- modal ---------------- */
  var modeRadios = document.querySelectorAll('input[name=mode]');
  var fFixed = document.getElementById('fields-fixed');
  var fAxis = document.getElementById('fields-axis');
  var fMax = document.getElementById('fields-max');
  var fQuality = document.getElementById('fields-quality');
  var fFormat = document.getElementById('f-format');
  var fQualityRange = document.getElementById('f-quality');
  var qualityVal = document.getElementById('qualityVal');

  modeRadios.forEach(function(r){ r.addEventListener('change', syncModalFields); });
  fFormat.addEventListener('change', syncModalFields);
  fQualityRange.addEventListener('input', function(){ qualityVal.textContent = fQualityRange.value; });

  function syncModalFields(){
    var mode = document.querySelector('input[name=mode]:checked').value;
    fFixed.classList.toggle('hidden', mode!=='fixed');
    fAxis.classList.toggle('hidden', mode!=='axis');
    fMax.classList.toggle('hidden', mode!=='max');
    var fmt = fFormat.value;
    fQuality.classList.toggle('hidden', !(fmt==='webp' || fmt==='jpeg'));
  }

  function openModal(presetId){
    editingPresetId = presetId;
    modalErr.classList.add('hidden');
    var p = presetId ? presets.find(function(x){ return x.id===presetId; }) : null;
    modalTitle.textContent = p ? 'Sửa preset' : 'Thêm preset';

    document.getElementById('f-name').value = p ? p.name : '';
    var mode = p ? p.mode : 'fixed';
    document.querySelector('input[name=mode][value="'+mode+'"]').checked = true;

    document.getElementById('f-fixed-w').value = p && p.mode==='fixed' ? p.width : '';
    document.getElementById('f-fixed-h').value = p && p.mode==='fixed' ? p.height : '';
    document.getElementById('f-axis-dir').value = p && p.mode==='axis' ? p.axis : 'width';
    document.getElementById('f-axis-val').value = p && p.mode==='axis' ? p.axisValue : '';
    document.getElementById('f-max-w').value = p && p.mode==='max' ? p.maxWidth : '';
    document.getElementById('f-max-h').value = p && p.mode==='max' ? p.maxHeight : '';

    fFormat.value = p ? p.format : 'webp';
    fQualityRange.value = p ? (p.quality||80) : 80;
    qualityVal.textContent = fQualityRange.value;

    syncModalFields();
    modalOverlay.classList.add('open');
  }
  function closeModal(){ modalOverlay.classList.remove('open'); }
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function(e){ if(e.target===modalOverlay) closeModal(); });

  document.getElementById('modalSave').addEventListener('click', function(){
    var name = document.getElementById('f-name').value.trim();
    var mode = document.querySelector('input[name=mode]:checked').value;
    if(!name){ showModalErr('Anh nhập tên preset giúp em nha.'); return; }

    var preset = { id: editingPresetId || uid(), name: name, mode: mode, format: fFormat.value, quality: parseInt(fQualityRange.value,10) };

    if(mode==='fixed'){
      var w = parseInt(document.getElementById('f-fixed-w').value,10);
      var h = parseInt(document.getElementById('f-fixed-h').value,10);
      if(!w || !h || w<1 || h<1){ showModalErr('Nhập đủ chiều ngang và dọc (px) nha.'); return; }
      preset.width = w; preset.height = h;
    } else if(mode==='axis'){
      var axis = document.getElementById('f-axis-dir').value;
      var val = parseInt(document.getElementById('f-axis-val').value,10);
      if(!val || val<1){ showModalErr('Nhập giá trị px cho chiều cố định.'); return; }
      preset.axis = axis; preset.axisValue = val;
    } else {
      var mw = parseInt(document.getElementById('f-max-w').value,10);
      var mh = parseInt(document.getElementById('f-max-h').value,10);
      if(!mw || !mh || mw<1 || mh<1){ showModalErr('Nhập đủ khung tối đa (px) nha.'); return; }
      preset.maxWidth = mw; preset.maxHeight = mh;
    }

    if(editingPresetId){
      presets = presets.map(function(p){ return p.id===editingPresetId ? preset : p; });
    } else {
      presets.push(preset);
    }
    persistPresets();
    closeModal();
    renderAll();
  });

  function showModalErr(msg){ modalErr.textContent = msg; modalErr.classList.remove('hidden'); }

  /* ---------------- crop section ---------------- */
  function fixedPresetsSelected(){
    return presets.filter(function(p){ return selected.has(p.id) && p.mode==='fixed'; });
  }

  function renderCrop(){
    var fixedSel = fixedPresetsSelected();
    if(images.length===0 || fixedSel.length===0){
      cropContent.innerHTML = '<div class="empty-note">Chưa cần crop — sẽ hiện ở đây khi anh chọn ảnh + preset dạng "khung cố định" có tỉ lệ khác ảnh gốc.</div>';
      return;
    }

    var cards = [];
    images.forEach(function(im){
      fixedSel.forEach(function(p){
        if(!needsCrop(im.width, im.height, p.width, p.height)) return;
        var key = im.id + ':' + p.id;
        var cover = computeCover(im.width, im.height, p.width, p.height);
        if(!cropState[key]){
          cropState[key] = { sx:(im.width-cover.cropW)/2, sy:(im.height-cover.cropH)/2 };
        }
        cards.push({ im:im, p:p, key:key, cover:cover });
      });
    });

    if(cards.length===0){
      cropContent.innerHTML = '<div class="empty-note">Tỉ lệ ảnh đã khớp preset đang chọn — không cần crop thủ công.</div>';
      return;
    }

    cropContent.innerHTML = cards.map(function(c){
      return '<div class="crop-card" data-key="'+c.key+'">' +
        '<div class="ch">Ảnh <b>'+escapeHtml(c.im.name)+'</b> → preset <b>'+escapeHtml(c.p.name)+'</b> ('+c.p.width+'×'+c.p.height+')</div>' +
        '<div class="crop-stage" data-stage="'+c.key+'"><img src="'+c.im.dataUrl+'" alt=""><div class="crop-box" data-box="'+c.key+'"></div></div>' +
        '<div class="crop-hint">Kéo khung để chọn vùng giữ lại — mặc định đã canh giữa.</div>' +
        '<button class="crop-reset" data-reset="'+c.key+'" type="button">Canh giữa lại</button>' +
      '</div>';
    }).join('');

    cards.forEach(function(c){ setupCropDrag(c); });

    cropContent.querySelectorAll('[data-reset]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var key = btn.getAttribute('data-reset');
        var c = cards.find(function(x){ return x.key===key; });
        cropState[key] = { sx:(c.im.width-c.cover.cropW)/2, sy:(c.im.height-c.cover.cropH)/2 };
        renderCrop();
      });
    });
  }

  function setupCropDrag(c){
    var stage = cropContent.querySelector('[data-stage="'+c.key+'"]');
    var box = cropContent.querySelector('[data-box="'+c.key+'"]');
    var img = stage.querySelector('img');

    function layout(){
      var dispW = stage.clientWidth;
      var scale = dispW / c.im.width;
      var dispH = c.im.height * scale;
      stage.style.width = dispW + 'px';
      stage.style.height = dispH + 'px';
      img.style.width = dispW + 'px';
      img.style.height = dispH + 'px';

      var st = cropState[c.key];
      box.style.width = (c.cover.cropW * scale) + 'px';
      box.style.height = (c.cover.cropH * scale) + 'px';
      box.style.left = (st.sx * scale) + 'px';
      box.style.top = (st.sy * scale) + 'px';
      box._scale = scale;
    }
    // wait one frame so stage has its natural width from the image
    requestAnimationFrame(layout);

    var dragging = false, startX=0, startY=0, startSx=0, startSy=0;

    box.addEventListener('pointerdown', function(e){
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startSx = cropState[c.key].sx; startSy = cropState[c.key].sy;
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var scale = box._scale || 1;
      var dx = (e.clientX - startX) / scale;
      var dy = (e.clientY - startY) / scale;
      var maxSx = c.im.width - c.cover.cropW;
      var maxSy = c.im.height - c.cover.cropH;
      var sx = Math.max(0, Math.min(maxSx, startSx + dx));
      var sy = Math.max(0, Math.min(maxSy, startSy + dy));
      cropState[c.key] = { sx:sx, sy:sy };
      box.style.left = (sx*scale) + 'px';
      box.style.top = (sy*scale) + 'px';
    });
    box.addEventListener('pointerup', function(){ dragging = false; });
    box.addEventListener('pointercancel', function(){ dragging = false; });
    window.addEventListener('resize', layout);
  }

  /* ---------------- export ---------------- */
  function computeOutputCanvas(imageObj, preset){
    var canvas = document.createElement('canvas');
    var ctx;
    if(preset.mode==='fixed'){
      var targetW = preset.width, targetH = preset.height;
      canvas.width = targetW; canvas.height = targetH;
      ctx = canvas.getContext('2d');
      var cover = computeCover(imageObj.width, imageObj.height, targetW, targetH);
      var key = imageObj.id + ':' + preset.id;
      var sx, sy;
      if(cropState[key]){ sx = cropState[key].sx; sy = cropState[key].sy; }
      else { sx = (imageObj.width-cover.cropW)/2; sy = (imageObj.height-cover.cropH)/2; }
      sx = Math.max(0, Math.min(imageObj.width-cover.cropW, sx));
      sy = Math.max(0, Math.min(imageObj.height-cover.cropH, sy));
      ctx.drawImage(imageObj.img, sx, sy, cover.cropW, cover.cropH, 0, 0, targetW, targetH);
    } else if(preset.mode==='axis'){
      var tW, tH;
      if(preset.axis==='width'){ tW = preset.axisValue; tH = Math.round(imageObj.height * (preset.axisValue/imageObj.width)); }
      else { tH = preset.axisValue; tW = Math.round(imageObj.width * (preset.axisValue/imageObj.height)); }
      canvas.width = tW; canvas.height = tH;
      ctx = canvas.getContext('2d');
      ctx.drawImage(imageObj.img, 0, 0, imageObj.width, imageObj.height, 0, 0, tW, tH);
    } else {
      var scale = Math.min(preset.maxWidth/imageObj.width, preset.maxHeight/imageObj.height, 1);
      var w = Math.round(imageObj.width*scale), h = Math.round(imageObj.height*scale);
      canvas.width = w; canvas.height = h;
      ctx = canvas.getContext('2d');
      ctx.drawImage(imageObj.img, 0, 0, imageObj.width, imageObj.height, 0, 0, w, h);
    }
    return canvas;
  }

  function mimeFor(preset, originalType){
    if(preset.format==='original') return originalType || 'image/png';
    if(preset.format==='webp') return 'image/webp';
    if(preset.format==='jpeg') return 'image/jpeg';
    return 'image/png';
  }
  function extFor(mime){
    return mime==='image/webp'?'webp':mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'img';
  }

  exportBtn.addEventListener('click', async function(){
    var chosen = presets.filter(function(p){ return selected.has(p.id); });
    if(images.length===0 || chosen.length===0) return;

    var exportFolder = '';
    if(window.kingImg.isNative){
      exportFolder = await window.kingImg.chooseExportFolder();
      if(!exportFolder) return;
      lastExportFolder = exportFolder;
    }

    exportBtn.disabled = true;
    exportBtn.textContent = 'Đang xử lý...';

    var zip = (!window.kingImg.isNative && typeof JSZip !== 'undefined') ? new JSZip() : null;
    var results = [];
    var tasks = [];

    images.forEach(function(im){
      chosen.forEach(function(p){
        tasks.push(function(){
          var canvas = computeOutputCanvas(im, p);
          var mime = mimeFor(p, im.file.type);
          var quality = (mime==='image/webp'||mime==='image/jpeg') ? (p.quality/100) : undefined;
          return new Promise(function(resolve){
            canvas.toBlob(function(blob){
              var ext = extFor(mime);
              var base = im.name.replace(/\.[^.]+$/, '');
              var fileName = sanitizeFileName(p.name + '_' + base + '.' + ext);
              var url = URL.createObjectURL(blob);
              var row = { fileName:fileName, url:url, size:blob.size, width:canvas.width, height:canvas.height, thumb:im.dataUrl, saved:false };
              if(window.kingImg.isNative){
                saveBlobToDisk(exportFolder, fileName, blob).then(function(ok){
                  row.saved = !!ok;
                  results.push(row);
                  resolve();
                });
              } else {
                results.push(row);
                if(zip) zip.file(fileName, blob);
                resolve();
              }
            }, mime, quality);
          });
        });
      });
    });

    tasks.reduce(function(p, fn){ return p.then(fn); }, Promise.resolve())
      .then(function(){
        renderResults(results);
        if(window.kingImg.isNative){
          zipBar.classList.remove('hidden');
          zipBtn.disabled = false;
          zipBtn.textContent = 'Mở thư mục vừa lưu';
        } else if(zip){
          return zip.generateAsync({type:'blob'}).then(function(content){
            if(lastZipUrl) URL.revokeObjectURL(lastZipUrl);
            lastZipUrl = URL.createObjectURL(content);
            zipBar.classList.remove('hidden');
            zipBtn.disabled = false;
            zipBtn.textContent = 'Tải tất cả (.zip)';
          });
        } else {
          zipBar.classList.add('hidden');
        }
      })
      .finally(function(){
        exportBtn.disabled = false;
        exportBtn.textContent = 'Xuất ảnh';
      });
  });

  zipBtn.addEventListener('click', function(){
    if(window.kingImg.isNative && lastExportFolder){
      window.kingImg.openFolder(lastExportFolder);
      return;
    }
    if(!lastZipUrl) return;
    var a = document.createElement('a');
    a.href = lastZipUrl; a.download = 'anh-xuat.zip';
    document.body.appendChild(a); a.click(); a.remove();
  });

  function renderResults(results){
    if(results.length===0){ resultsEl.classList.add('hidden'); resultsEl.innerHTML=''; return; }
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = results.map(function(r){
      return '<div class="result-row">' +
        '<img src="'+r.thumb+'" alt="">' +
        '<div class="result-info"><div class="result-name">'+escapeHtml(r.fileName)+'</div>' +
        '<div class="result-meta">'+r.width+'×'+r.height+' · '+formatBytes(r.size)+'</div></div>' +
        (window.kingImg.isNative ? '<span class="result-status">'+(r.saved?'Đã lưu':'Lỗi lưu')+'</span>' : '<a href="'+r.url+'" download="'+r.fileName+'">Tải xuống</a>') +
      '</div>';
    }).join('');
  }

  function updateExportHelper(){
    var chosen = presets.filter(function(p){ return selected.has(p.id); });
    if(images.length===0){ exportHelper.textContent = 'Thêm ảnh ở bước 1 để bắt đầu.'; exportBtn.disabled = true; return; }
    if(chosen.length===0){ exportHelper.textContent = 'Chọn ít nhất 1 preset ở bước 2.'; exportBtn.disabled = true; return; }
    exportHelper.textContent = 'Sẽ xuất ' + (images.length*chosen.length) + ' file từ ' + images.length + ' ảnh × ' + chosen.length + ' preset.';
    exportBtn.disabled = false;
  }

  /* ---------------- master render ---------------- */
  function renderAll(){
    renderImages();
    renderPresets();
    renderCrop();
    updateExportHelper();
  }


  /* ================= TAB 2: CHÈN TEXT ================= */

  var FONT_SOURCE_LABELS = {
    bundled: 'Font bundle',
    system: 'Font máy',
    custom: 'Font riêng'
  };
  var fontCatalog = {
    bundled: [{ name:'Be Vietnam Pro', fileName:null }],
    system: ['Segoe UI','Arial','Calibri','Cambria','Georgia','Times New Roman'],
    custom: []
  };
  var legacyStyleMap = {
    clean: { fontFamily:'Segoe UI', bold:true, italic:false },
    serif: { fontFamily:'Georgia', bold:true, italic:false },
    bold:  { fontFamily:'Segoe UI', bold:true, italic:false }
  };

  var templates = [];      // {id,name,canvasW,canvasH,format,quality,slots:[{id,label,x,y,width,height,fontSize,color,align,fontFamily,bold,italic,underline,outline,background}]}
  var images2 = [];        // {id,file,name,img,width,height,dataUrl,templateId,texts:{slotId:text},overrides:{slotId:{fontSize,color}}}
  var lastUsedTemplateId = null;
  var activeImageId2 = null;
  var lastZipUrl2 = null;
  var lastExportFolder2 = '';
  var batchCsvText = '';
  var batchCsvName = '';

  var draftTpl = null;
  var draftRefImg = null;
  var selectedSlotId = null;
  var draftPreviewTexts = {};

  /* ---- tab switching ---- */
  document.querySelectorAll('.tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.tabview').forEach(function(v){ v.classList.add('hidden'); });
      document.getElementById(btn.getAttribute('data-tab')).classList.remove('hidden');
    });
  });

  /* ---- DOM refs ---- */
  var templateGrid = document.getElementById('templateGrid');
  var templateGridWrap = document.getElementById('templateGridWrap');
  var templateEditorWrap = document.getElementById('templateEditorWrap');
  var dropzone2 = document.getElementById('dropzone2');
  var fileInput2 = document.getElementById('fileInput2');
  var pickBtn2 = document.getElementById('pickBtn2');
  var thumbs2El = document.getElementById('thumbs2');
  var activeEditorWrap = document.getElementById('activeEditorWrap');
  var exportBtn2 = document.getElementById('exportBtn2');
  var exportHelper2 = document.getElementById('exportHelper2');
  var resultsEl2 = document.getElementById('results2');
  var zipBar2 = document.getElementById('zipBar2');
  var zipBtn2 = document.getElementById('zipBtn2');
  var exportTplListBtn = document.getElementById('exportTplListBtn');
  var batchToggleBtn = document.getElementById('batchToggleBtn');
  var batchBody = document.getElementById('batchBody');
  var batchCsvInput = document.getElementById('batchCsvInput');
  var batchFileInfo = document.getElementById('batchFileInfo');
  var batchRunBtn = document.getElementById('batchRunBtn');
  var batchStatus = document.getElementById('batchStatus');

  function placeholderDataUri(w, h){
    var label = w + ' \u00D7 ' + h + ' \u2014 ch\u01b0a c\u00f3 \u1ea3nh m\u1eabu g\u1ed1c';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">' +
      '<rect width="100%" height="100%" fill="#1B1E25"/>' +
      '<rect x="2" y="2" width="'+(w-4)+'" height="'+(h-4)+'" fill="none" stroke="#383D4A" stroke-width="3" stroke-dasharray="14,10"/>' +
      '<text x="50%" y="50%" fill="#5C6170" font-size="'+Math.max(14,Math.round(Math.min(w,h)*0.045))+'" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">'+label+'</text>' +
    '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function cssFontFamily(name){
    var family = (name || 'Segoe UI').replace(/'/g, "\\'");
    return "'" + family + "', 'Segoe UI', Arial, sans-serif";
  }

  function canvasFont(slot, fontSize){
    var style = slot.italic ? 'italic ' : '';
    var weight = slot.bold ? '700 ' : '400 ';
    return style + weight + fontSize + 'px ' + cssFontFamily(slot.fontFamily);
  }

  function normalizeSlot(slot){
    if(!slot.fontFamily){
      var mapped = legacyStyleMap[slot.styleKey] || legacyStyleMap.clean;
      slot.fontFamily = mapped.fontFamily;
      slot.bold = mapped.bold;
      slot.italic = mapped.italic;
    }
    slot.bold = !!slot.bold;
    slot.italic = !!slot.italic;
    slot.underline = !!slot.underline;
    if(!slot.outline || typeof slot.outline !== 'object'){
      slot.outline = { enabled:false, color:'#000000', width:2 };
    } else {
      slot.outline.enabled = !!slot.outline.enabled;
      slot.outline.color = slot.outline.color || '#000000';
      slot.outline.width = Math.max(1, parseInt(slot.outline.width,10) || 2);
    }
    if(!slot.background || typeof slot.background !== 'object'){
      slot.background = { enabled: slot.backdrop !== false, shape:'rect', color:'#000000', opacity:45 };
    } else {
      slot.background.enabled = !!slot.background.enabled;
      slot.background.shape = slot.background.shape === 'circle' ? 'circle' : 'rect';
      slot.background.color = slot.background.color || '#000000';
      slot.background.opacity = Math.max(0, Math.min(100, parseInt(slot.background.opacity,10)));
      if(!Number.isFinite(slot.background.opacity)) slot.background.opacity = 45;
    }
    delete slot.styleKey;
    delete slot.backdrop;
    return slot;
  }

  function normalizeTemplate(tpl){
    tpl.slots = (tpl.slots || []).map(normalizeSlot);
    return tpl;
  }

  function fontOptionsFor(source){
    if(source === 'bundled') return fontCatalog.bundled.map(function(f){ return f.name; });
    if(source === 'custom') return fontCatalog.custom.map(function(f){ return f.name; });
    return fontCatalog.system.slice();
  }

  function fontSourceFor(name){
    if(fontCatalog.bundled.some(function(f){ return f.name === name; })) return 'bundled';
    if(fontCatalog.custom.some(function(f){ return f.name === name; })) return 'custom';
    return 'system';
  }

  function fileToDataUrl(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadCustomFontFace(font){
    if(!font || !font.fileName || !window.FontFace) return Promise.resolve();
    var face = new FontFace(font.name, 'url("https://kingimg-fonts.app/' + encodeURIComponent(font.fileName) + '")');
    return face.load().then(function(loaded){
      document.fonts.add(loaded);
    }).catch(function(){});
  }

  function loadFontCatalog(){
    return Promise.all([
      window.kingImg.listSystemFonts(),
      window.kingImg.listCustomFonts()
    ]).then(function(values){
      var system = parseJsonSafe(values[0], fontCatalog.system);
      var custom = parseJsonSafe(values[1], []);
      if(Array.isArray(system) && system.length) fontCatalog.system = system;
      if(Array.isArray(custom)) fontCatalog.custom = custom;
      return Promise.all(fontCatalog.custom.map(loadCustomFontFace));
    });
  }

  function applySlotStyleToElement(el, slot, scale, override){
    normalizeSlot(slot);
    var ovr = override || {};
    var fontSize = (ovr.fontSize || slot.fontSize) * scale;
    el.style.fontSize = fontSize + 'px';
    el.style.fontFamily = cssFontFamily(slot.fontFamily);
    el.style.fontWeight = slot.bold ? '700' : '400';
    el.style.fontStyle = slot.italic ? 'italic' : 'normal';
    el.style.textDecoration = slot.underline ? 'underline' : 'none';
    el.style.color = ovr.color || slot.color;
    el.style.textAlign = slot.align;
    el.style.lineHeight = '1.25';
    var outline = slot.outline || { enabled:false };
    el.style.webkitTextStroke = outline.enabled ? (outline.width + 'px ' + outline.color) : '0px transparent';
    var bg = slot.background || { enabled:false };
    if(bg.enabled){
      el.style.background = hexToRgba(bg.color, (bg.opacity != null ? bg.opacity : 45) / 100);
      el.style.borderRadius = bg.shape === 'circle' ? '50%' : '4px';
    } else {
      el.style.background = 'transparent';
      el.style.borderRadius = '0';
    }
  }

  /* ---- template grid ---- */
  function tplMiniSwatch(t){
    var boxW=48, boxH=36;
    var scale = Math.min(boxW/t.canvasW, boxH/t.canvasH);
    var slotsHtml = t.slots.map(function(s){
      return '<i style="left:'+(s.x*scale)+'px;top:'+(s.y*scale)+'px;width:'+Math.max(2,s.width*scale)+'px;height:'+Math.max(2,s.height*scale)+'px;"></i>';
    }).join('');
    return '<div class="tpl-mini">'+slotsHtml+'</div>';
  }

  function renderTemplateGrid(){
    var cards = templates.map(function(t){
      return '<div class="preset-card" data-tplcard="'+t.id+'">' +
        '<div class="pc-top">' + tplMiniSwatch(t) +
        '<div><div class="pc-name">'+escapeHtml(t.name)+'</div><span class="pc-format">'+formatBadge(t)+'</span></div></div>' +
        '<div class="pc-dims">'+t.canvasW+' \u00D7 '+t.canvasH+' px</div>' +
        '<div class="pc-mode">'+t.slots.length+' v\u1ecb tr\u00ed text</div>' +
        '<div class="pc-footer"><span></span><div class="pc-actions"><button data-tpledit="'+t.id+'" type="button">S\u1eeda</button><button data-tpldel="'+t.id+'" type="button">X\u00f3a</button></div></div>' +
      '</div>';
    }).join('');

    var emptyNote = templates.length===0 ? '<div class="empty-note" style="grid-column:1/-1;margin-bottom:10px;">Ch\u01b0a c\u00f3 m\u1eabu n\u00e0o \u2014 b\u1ea5m "+ Th\u00eam m\u1eabu" \u0111\u1ec3 t\u1ea1o m\u1eabu \u0111\u1ea7u ti\u00ean.</div>' : '';

    templateGrid.innerHTML = emptyNote + cards +
      '<div class="preset-card add" id="addTplCard"><div class="plus">+</div><div>Th\u00eam m\u1eabu</div></div>';

    document.getElementById('addTplCard').addEventListener('click', function(){ openTemplateEditor(null); });
    templateGrid.querySelectorAll('[data-tpledit]').forEach(function(btn){
      btn.addEventListener('click', function(){ openTemplateEditor(btn.getAttribute('data-tpledit')); });
    });
    templateGrid.querySelectorAll('[data-tpldel]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-tpldel');
        templates = templates.filter(function(t){ return t.id!==id; });
        images2.forEach(function(im){ if(im.templateId===id) im.templateId = templates[0] ? templates[0].id : null; });
        if(lastUsedTemplateId===id) lastUsedTemplateId = templates[0] ? templates[0].id : null;
        persistTemplates();
        renderAll2();
      });
    });
  }

  /* ---- template editor ---- */
  function openTemplateEditor(tplId){
    var existing = tplId ? templates.find(function(t){ return t.id===tplId; }) : null;
    draftTpl = existing ? normalizeTemplate(JSON.parse(JSON.stringify(existing))) : { id:uid(), name:'', canvasW:0, canvasH:0, format:'webp', quality:80, slots:[] };
    draftRefImg = null;
    selectedSlotId = null;
    draftPreviewTexts = {};
    templateGridWrap.classList.add('hidden');
    templateEditorWrap.classList.remove('hidden');
    renderTemplateEditor();
  }

  function closeTemplateEditor(){
    draftTpl = null; draftRefImg = null; selectedSlotId = null;
    templateGridWrap.classList.remove('hidden');
    templateEditorWrap.classList.add('hidden');
    templateEditorWrap.innerHTML = '';
  }

  function renderTemplateEditor(){
    var hasRef = draftTpl.canvasW > 0;
    var isEdit = templates.some(function(t){ return t.id===draftTpl.id; });

    var html = '<div class="tpl-editor">' +
      '<h3 style="margin:0 0 14px;font-size:15px;">'+(isEdit ? 'S\u1eeda m\u1eabu' : 'T\u1ea1o m\u1eabu m\u1edbi')+'</h3>' +
      '<div class="field"><label>T\u00ean m\u1eabu</label><input type="text" id="tpl-name" placeholder="VD: \u1ea2nh b\u00eca" value="'+escapeHtml(draftTpl.name)+'"></div>' +
      '<div class="row2">' +
        '<div class="field"><label>\u0110\u1ecbnh d\u1ea1ng xu\u1ea5t</label><select id="tpl-format">' +
          ['webp','jpeg','png','original'].map(function(f){ return '<option value="'+f+'"'+(draftTpl.format===f?' selected':'')+'>'+(f==='webp'?'WebP':f==='jpeg'?'JPG':f==='png'?'PNG':'Gi\u1eef nguy\u00ean g\u1ed1c')+'</option>'; }).join('') +
        '</select></div>' +
        '<div class="field" id="tpl-quality-field"><label>Ch\u1ea5t l\u01b0\u1ee3ng \u2014 <span id="tplQualityVal">'+draftTpl.quality+'</span>%</label><input type="range" id="tpl-quality" min="10" max="100" value="'+draftTpl.quality+'"></div>' +
      '</div>';

    if(!hasRef){
      html += '<div class="dropzone" id="tplDropzone">' +
        '<p class="dz-title">Th\u1ea3 \u1ea3nh m\u1eabu v\u00e0o \u0111\u1ec3 \u0111\u1eb7t v\u1ecb tr\u00ed text</p>' +
        '<p class="dz-sub">\u1ea2nh n\u00e0y ch\u1ec9 \u0111\u1ec3 tham kh\u1ea3o, kh\u00f4ng \u0111\u01b0\u1ee3c l\u01b0u l\u1ea1i \u2014 k\u00edch th\u01b0\u1edbc c\u1ee7a n\u00f3 s\u1ebd l\u00e0 size c\u1ed1 \u0111\u1ecbnh c\u1ee7a m\u1eabu</p>' +
        '<button class="dz-btn" id="tplPickBtn" type="button">Ch\u1ecdn \u1ea3nh m\u1eabu</button>' +
        '<input type="file" id="tplFileInput" accept="image/*" class="hidden">' +
      '</div>';
    } else {
      html += '<div class="tpl-stage-wrap">' +
        '<div class="tpl-ruler-shell">' +
          '<div class="tpl-ruler-corner"></div>' +
          '<div class="tpl-ruler tpl-ruler-x" id="tplRulerX"></div>' +
          '<div class="tpl-ruler tpl-ruler-y" id="tplRulerY"></div>' +
          '<div class="tpl-stage" id="tplStage" tabindex="0"><img id="tplStageImg" src="'+(draftRefImg ? draftRefImg.dataUrl : placeholderDataUri(draftTpl.canvasW, draftTpl.canvasH))+'" alt=""><div class="tpl-guide tpl-guide-v" id="tplGuideV"></div><div class="tpl-guide tpl-guide-h" id="tplGuideH"></div></div>' +
        '</div>' +
        '<div><button class="btn tpl-add-slot" id="tplAddSlot" type="button">+ Th\u00eam v\u1ecb tr\u00ed text</button></div>' +
      '</div>' +
      '<div id="tplSlotSettingsHost"></div>';
    }

    html += '<div class="tpl-editor-actions"><button class="btn" id="tplCancel" type="button">H\u1ee7y</button><button class="btn primary" id="tplSaveBtn" type="button">L\u01b0u m\u1eabu</button></div></div>';

    templateEditorWrap.innerHTML = html;

    document.getElementById('tpl-name').addEventListener('input', function(e){ draftTpl.name = e.target.value; });
    document.getElementById('tpl-format').addEventListener('change', function(e){ draftTpl.format = e.target.value; syncTplQualityVisibility(); });
    document.getElementById('tpl-quality').addEventListener('input', function(e){ draftTpl.quality = parseInt(e.target.value,10); document.getElementById('tplQualityVal').textContent = e.target.value; });
    syncTplQualityVisibility();
    document.getElementById('tplCancel').addEventListener('click', closeTemplateEditor);
    document.getElementById('tplSaveBtn').addEventListener('click', saveTemplateDraft);

    if(!hasRef){
      var tdz = document.getElementById('tplDropzone');
      var tfi = document.getElementById('tplFileInput');
      document.getElementById('tplPickBtn').addEventListener('click', function(){ tfi.click(); });
      tdz.addEventListener('click', function(e){ if(e.target===tdz) tfi.click(); });
      tfi.addEventListener('change', function(e){ handleTplRefFile(e.target.files[0]); });
      ['dragenter','dragover'].forEach(function(ev){ tdz.addEventListener(ev, function(e){ e.preventDefault(); tdz.classList.add('drag'); }); });
      ['dragleave','drop'].forEach(function(ev){ tdz.addEventListener(ev, function(e){ e.preventDefault(); tdz.classList.remove('drag'); }); });
      tdz.addEventListener('drop', function(e){ if(e.dataTransfer.files[0]) handleTplRefFile(e.dataTransfer.files[0]); });
    } else {
      renderTplSlots();
      document.getElementById('tplAddSlot').addEventListener('click', addTplSlot);
    }
  }

  function syncTplQualityVisibility(){
    var el = document.getElementById('tpl-quality-field');
    if(el) el.classList.toggle('hidden', !(draftTpl.format==='webp' || draftTpl.format==='jpeg'));
  }

  function handleTplRefFile(file){
    if(!file) return;
    loadImageFile(file).then(function(loaded){
      draftRefImg = loaded;
      draftTpl.canvasW = loaded.width;
      draftTpl.canvasH = loaded.height;
      renderTemplateEditor();
    });
  }

  function addTplSlot(){
    var w = Math.round(draftTpl.canvasW*0.6), h = Math.round(draftTpl.canvasH*0.14);
    var slot = {
      id: uid(),
      label: 'V\u1ecb tr\u00ed ' + (draftTpl.slots.length+1),
      x: Math.round((draftTpl.canvasW-w)/2),
      y: Math.round((draftTpl.canvasH-h)/2),
      width: w, height: h,
      fontSize: Math.max(12, Math.round(draftTpl.canvasH*0.06)),
      color: '#ffffff',
      align: 'center',
      fontFamily: 'Be Vietnam Pro',
      bold: false,
      italic: false,
      underline: false,
      outline: { enabled:false, color:'#000000', width:2 },
      background: { enabled:true, shape:'rect', color:'#000000', opacity:45 }
    };
    draftTpl.slots.push(slot);
    selectedSlotId = slot.id;
    renderTplSlots();
  }

  function renderTplSlots(){
    var stage = document.getElementById('tplStage');
    var img = document.getElementById('tplStageImg');
    if(!stage) return;
    stage.querySelectorAll('.tpl-slot').forEach(function(n){ n.remove(); });

    function layoutStage(){
      var s = stage.clientWidth / draftTpl.canvasW;
      stage.style.width = (draftTpl.canvasW*s) + 'px';
      stage.style.height = (draftTpl.canvasH*s) + 'px';
      img.style.width = (draftTpl.canvasW*s) + 'px';
      img.style.height = (draftTpl.canvasH*s) + 'px';
      draftTpl.slots.forEach(function(slot){ positionSlotBox(slot, s); });
      renderTplRulers(s);
      updateTplGuides(s);
    }

    draftTpl.slots.forEach(function(slot){
      normalizeSlot(slot);
      var box = document.createElement('div');
      box.className = 'tpl-slot' + (slot.id===selectedSlotId ? ' selected' : '');
      box.setAttribute('data-slot', slot.id);
      box.innerHTML = '<textarea class="tpl-slot-preview" data-preview="'+slot.id+'" placeholder="'+escapeHtml(slot.label)+'">'+escapeHtml(draftPreviewTexts[slot.id] || '')+'</textarea><div class="tpl-slot-resize" data-resize="'+slot.id+'"></div>';
      stage.appendChild(box);
      var preview = box.querySelector('.tpl-slot-preview');
      preview.addEventListener('focus', function(){ selectSlot(slot.id); });
      preview.addEventListener('input', function(e){ draftPreviewTexts[slot.id] = e.target.value; });
      wireSlotDrag(box, slot, stage);
    });

    requestAnimationFrame(layoutStage);
    window.addEventListener('resize', layoutStage);
    renderTplSlotSettings();
  }

  function positionSlotBox(slot, scale){
    var box = document.querySelector('.tpl-slot[data-slot="'+slot.id+'"]');
    if(!box) return;
    box.style.left = (slot.x*scale)+'px';
    box.style.top = (slot.y*scale)+'px';
    box.style.width = (slot.width*scale)+'px';
    box.style.height = (slot.height*scale)+'px';
    var preview = box.querySelector('.tpl-slot-preview');
    if(preview) applySlotStyleToElement(preview, slot, scale, null);
    updateTplGuides(scale);
  }

  function renderTplRulers(scale){
    var xRuler = document.getElementById('tplRulerX');
    var yRuler = document.getElementById('tplRulerY');
    var stage = document.getElementById('tplStage');
    if(!xRuler || !yRuler || !stage) return;
    var step = scale < 0.35 ? 100 : 50;
    var xTicks = [];
    for(var x=0; x<=draftTpl.canvasW; x+=step){
      xTicks.push('<span class="tpl-ruler-tick tpl-ruler-tick-x" style="left:'+(x*scale)+'px"><b>'+x+'</b></span>');
    }
    var yTicks = [];
    for(var y=0; y<=draftTpl.canvasH; y+=step){
      yTicks.push('<span class="tpl-ruler-tick tpl-ruler-tick-y" style="top:'+(y*scale)+'px"><b>'+y+'</b></span>');
    }
    xRuler.style.width = stage.clientWidth + 'px';
    yRuler.style.height = stage.clientHeight + 'px';
    xRuler.innerHTML = xTicks.join('');
    yRuler.innerHTML = yTicks.join('');
  }

  function updateTplGuides(scale){
    var slot = draftTpl && draftTpl.slots.find(function(s){ return s.id===selectedSlotId; });
    var v = document.getElementById('tplGuideV');
    var h = document.getElementById('tplGuideH');
    if(!v || !h) return;
    if(!slot){
      v.style.display = 'none';
      h.style.display = 'none';
      return;
    }
    v.style.display = 'block';
    h.style.display = 'block';
    v.style.left = (slot.x * scale) + 'px';
    h.style.top = (slot.y * scale) + 'px';
  }

  function wireSlotDrag(box, slot, stage){
    var dragging=false, startX=0, startY=0, startSx=0, startSy=0;
    box.addEventListener('pointerdown', function(e){
      if(e.target.classList.contains('tpl-slot-resize')) return;
      if(e.target.classList.contains('tpl-slot-preview')){ selectSlot(slot.id); return; }
      selectSlot(slot.id);
      dragging = true;
      startX=e.clientX; startY=e.clientY; startSx=slot.x; startSy=slot.y;
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var scale = stage.clientWidth/draftTpl.canvasW;
      var dx=(e.clientX-startX)/scale, dy=(e.clientY-startY)/scale;
      slot.x = Math.max(0, Math.min(draftTpl.canvasW-slot.width, startSx+dx));
      slot.y = Math.max(0, Math.min(draftTpl.canvasH-slot.height, startSy+dy));
      positionSlotBox(slot, scale);
    });
    box.addEventListener('pointerup', function(){ dragging=false; });
    box.addEventListener('pointercancel', function(){ dragging=false; });

    var resizing=false, rStartX=0, rStartY=0, rStartW=0, rStartH=0;
    var handle = box.querySelector('.tpl-slot-resize');
    handle.addEventListener('pointerdown', function(e){
      e.stopPropagation();
      selectSlot(slot.id);
      resizing = true;
      rStartX=e.clientX; rStartY=e.clientY; rStartW=slot.width; rStartH=slot.height;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', function(e){
      if(!resizing) return;
      var scale = stage.clientWidth/draftTpl.canvasW;
      var dx=(e.clientX-rStartX)/scale, dy=(e.clientY-rStartY)/scale;
      slot.width = Math.max(20, Math.min(draftTpl.canvasW-slot.x, rStartW+dx));
      slot.height = Math.max(16, Math.min(draftTpl.canvasH-slot.y, rStartH+dy));
      positionSlotBox(slot, scale);
    });
    handle.addEventListener('pointerup', function(){ resizing=false; });
    handle.addEventListener('pointercancel', function(){ resizing=false; });
  }

  function selectSlot(id){
    selectedSlotId = id;
    document.querySelectorAll('.tpl-slot').forEach(function(b){
      b.classList.toggle('selected', b.getAttribute('data-slot')===id);
    });
    var stage = document.getElementById('tplStage');
    var scale = stage ? stage.clientWidth/draftTpl.canvasW : 1;
    updateTplGuides(scale);
    renderTplSlotSettings();
  }

  document.addEventListener('keydown', function(e){
    if(!draftTpl || !selectedSlotId || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var slot = draftTpl.slots.find(function(s){ return s.id===selectedSlotId; });
    if(!slot) return;
    var step = e.shiftKey ? 10 : 1;
    if(e.key === 'ArrowLeft') slot.x -= step;
    if(e.key === 'ArrowRight') slot.x += step;
    if(e.key === 'ArrowUp') slot.y -= step;
    if(e.key === 'ArrowDown') slot.y += step;
    slot.x = Math.max(0, Math.min(draftTpl.canvasW-slot.width, slot.x));
    slot.y = Math.max(0, Math.min(draftTpl.canvasH-slot.height, slot.y));
    var stage = document.getElementById('tplStage');
    var scale = stage ? stage.clientWidth/draftTpl.canvasW : 1;
    positionSlotBox(slot, scale);
    e.preventDefault();
  });

  function renderTplSlotSettings(){
    var host = document.getElementById('tplSlotSettingsHost');
    if(!host) return;
    var slot = draftTpl.slots.find(function(s){ return s.id===selectedSlotId; });
    if(!slot){ host.innerHTML=''; return; }
    normalizeSlot(slot);
    var currentSource = fontSourceFor(slot.fontFamily);
    var fontOptions = fontOptionsFor(currentSource);

    host.innerHTML = '<div class="tpl-slot-settings">' +
      '<div class="row2">' +
        '<div class="field"><label>T\u00ean v\u1ecb tr\u00ed (g\u1ee3i nh\u1edb)</label><input type="text" id="slot-label" value="'+escapeHtml(slot.label)+'"></div>' +
        '<div class="field"><label>Ngu\u1ed3n font</label><select id="slot-font-source">' +
          Object.keys(FONT_SOURCE_LABELS).map(function(k){ return '<option value="'+k+'"'+(currentSource===k?' selected':'')+'>'+FONT_SOURCE_LABELS[k]+'</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Font</label><select id="slot-font-family">' +
          fontOptions.map(function(name){ return '<option value="'+escapeHtml(name)+'"'+(slot.fontFamily===name?' selected':'')+'>'+escapeHtml(name)+'</option>'; }).join('') +
        '</select><p class="field-note" id="slot-font-note">'+(currentSource==='system'?'Font máy chỉ hiển thị đúng trên máy có cài font này.':'')+'</p></div>' +
        '<div class="font-action"><button class="btn" id="slot-add-font" type="button">+ Th\u00eam font t\u1eeb m\u00e1y</button><input type="file" class="hidden" id="slot-font-file" accept=".ttf,.otf"></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Size ch\u1eef (px)</label><input type="number" id="slot-fontsize" value="'+slot.fontSize+'" min="8"></div>' +
        '<div class="field"><label>M\u00e0u ch\u1eef</label><input type="color" id="slot-color" value="'+slot.color+'"></div>' +
      '</div>' +
      '<div class="field"><label>C\u0103n l\u1ec1</label><select id="slot-align">' +
        ['left','center','right'].map(function(a){ return '<option value="'+a+'"'+(slot.align===a?' selected':'')+'>'+(a==='left'?'Tr\u00e1i':a==='center'?'Gi\u1eefa':'Ph\u1ea3i')+'</option>'; }).join('') +
      '</select></div>' +
      '<div class="check-row">' +
        '<label class="check-inline"><input type="checkbox" id="slot-bold" '+(slot.bold?'checked':'')+'> \u0110\u1eadm</label>' +
        '<label class="check-inline"><input type="checkbox" id="slot-italic" '+(slot.italic?'checked':'')+'> Nghi\u00eang</label>' +
        '<label class="check-inline"><input type="checkbox" id="slot-underline" '+(slot.underline?'checked':'')+'> G\u1ea1ch ch\u00e2n</label>' +
      '</div>' +
      '<div class="sub-block">' +
        '<label class="radio-opt"><input type="checkbox" id="slot-outline-enabled" '+(slot.outline.enabled?'checked':'')+'> <span class="opt-title">Vi\u1ec1n ch\u1eef</span></label>' +
        '<div class="row2 sub-fields'+(slot.outline.enabled?'':' hidden')+'" id="outline-fields">' +
          '<div class="field"><label>M\u00e0u vi\u1ec1n</label><input type="color" id="slot-outline-color" value="'+slot.outline.color+'"></div>' +
          '<div class="field"><label>\u0110\u1ed9 d\u00e0y vi\u1ec1n (px)</label><input type="number" id="slot-outline-width" value="'+slot.outline.width+'" min="1" max="20"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sub-block">' +
        '<label class="radio-opt"><input type="checkbox" id="slot-bg-enabled" '+(slot.background.enabled?'checked':'')+'> <span class="opt-title">N\u1ec1n sau ch\u1eef</span></label>' +
        '<div class="sub-fields'+(slot.background.enabled?'':' hidden')+'" id="bg-fields">' +
          '<div class="row2">' +
            '<div class="field"><label>Shape</label><select id="slot-bg-shape">' +
              '<option value="rect"'+(slot.background.shape==='rect'?' selected':'')+'>Vu\u00f4ng</option>' +
              '<option value="circle"'+(slot.background.shape==='circle'?' selected':'')+'>Tr\u00f2n</option>' +
            '</select></div>' +
            '<div class="field"><label>M\u00e0u n\u1ec1n</label><input type="color" id="slot-bg-color" value="'+slot.background.color+'"></div>' +
          '</div>' +
          '<div class="field"><label>\u0110\u1ed9 m\u1edd \u2014 <span id="slot-bg-opacity-val">'+slot.background.opacity+'</span>%</label><input type="range" id="slot-bg-opacity" min="0" max="100" value="'+slot.background.opacity+'"></div>' +
          '<p class="crop-hint">N\u1ec1n s\u1ebd t\u1ef1 co theo kh\u1ed1i ch\u1eef th\u1eadt khi xu\u1ea5t \u1ea3nh.</p>' +
        '</div>' +
      '</div>' +
      '<button class="btn danger-ghost" id="slot-delete" type="button">X\u00f3a v\u1ecb tr\u00ed n\u00e0y</button>' +
    '</div>';

    var stageEl = document.getElementById('tplStage');
    var scale = stageEl.clientWidth/draftTpl.canvasW;

    document.getElementById('slot-label').addEventListener('input', function(e){
      slot.label = e.target.value;
      var b = document.querySelector('.tpl-slot[data-slot="'+slot.id+'"] .tpl-slot-preview');
      if(b) b.setAttribute('placeholder', e.target.value);
    });
    document.getElementById('slot-font-source').addEventListener('change', function(e){
      var options = fontOptionsFor(e.target.value);
      if(options.length) slot.fontFamily = options[0];
      renderTplSlotSettings();
      positionSlotBox(slot, scale);
    });
    document.getElementById('slot-font-family').addEventListener('change', function(e){ slot.fontFamily = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-fontsize').addEventListener('input', function(e){ slot.fontSize = parseInt(e.target.value,10)||8; positionSlotBox(slot, scale); });
    document.getElementById('slot-color').addEventListener('input', function(e){ slot.color = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-align').addEventListener('change', function(e){ slot.align = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-bold').addEventListener('change', function(e){ slot.bold = e.target.checked; positionSlotBox(slot, scale); });
    document.getElementById('slot-italic').addEventListener('change', function(e){ slot.italic = e.target.checked; positionSlotBox(slot, scale); });
    document.getElementById('slot-underline').addEventListener('change', function(e){ slot.underline = e.target.checked; positionSlotBox(slot, scale); });
    document.getElementById('slot-outline-enabled').addEventListener('change', function(e){
      slot.outline.enabled = e.target.checked;
      document.getElementById('outline-fields').classList.toggle('hidden', !e.target.checked);
      positionSlotBox(slot, scale);
    });
    document.getElementById('slot-outline-color').addEventListener('input', function(e){ slot.outline.color = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-outline-width').addEventListener('input', function(e){ slot.outline.width = Math.max(1, parseInt(e.target.value,10)||1); positionSlotBox(slot, scale); });
    document.getElementById('slot-bg-enabled').addEventListener('change', function(e){
      slot.background.enabled = e.target.checked;
      document.getElementById('bg-fields').classList.toggle('hidden', !e.target.checked);
      positionSlotBox(slot, scale);
    });
    document.getElementById('slot-bg-shape').addEventListener('change', function(e){ slot.background.shape = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-bg-color').addEventListener('input', function(e){ slot.background.color = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-bg-opacity').addEventListener('input', function(e){
      slot.background.opacity = parseInt(e.target.value,10);
      document.getElementById('slot-bg-opacity-val').textContent = e.target.value;
      positionSlotBox(slot, scale);
    });
    document.getElementById('slot-add-font').addEventListener('click', function(){ document.getElementById('slot-font-file').click(); });
    document.getElementById('slot-font-file').addEventListener('change', function(e){
      var file = e.target.files[0];
      if(!file) return;
      fileToDataUrl(file).then(function(dataUrl){
        return window.kingImg.addCustomFont(file.name, dataUrl);
      }).then(function(fontName){
        return loadFontCatalog().then(function(){
          if(fontName) slot.fontFamily = fontName;
          renderTplSlotSettings();
          positionSlotBox(slot, scale);
        });
      });
    });
    document.getElementById('slot-delete').addEventListener('click', function(){
      draftTpl.slots = draftTpl.slots.filter(function(s){ return s.id!==slot.id; });
      selectedSlotId = null;
      renderTplSlots();
    });
  }

  function saveTemplateDraft(){
    if(!draftTpl.name.trim()){ alert('Anh nh\u1eadp t\u00ean m\u1eabu gi\u00fap em nha.'); return; }
    if(draftTpl.canvasW===0){ alert('Anh th\u1ea3 \u1ea3nh m\u1eabu \u0111\u1ec3 \u0111\u1eb7t v\u1ecb tr\u00ed tr\u01b0\u1edbc khi l\u01b0u nha.'); return; }
    normalizeTemplate(draftTpl);
    var idx = templates.findIndex(function(t){ return t.id===draftTpl.id; });
    if(idx>=0) templates[idx] = draftTpl; else templates.push(draftTpl);
    persistTemplates();
    closeTemplateEditor();
    renderAll2();
  }

  /* ---- images2 / dropzone2 ---- */
  pickBtn2.addEventListener('click', function(){ fileInput2.click(); });
  dropzone2.addEventListener('click', function(e){ if(e.target===dropzone2) fileInput2.click(); });
  fileInput2.addEventListener('change', function(e){ handleFiles2(e.target.files); fileInput2.value=''; });
  ['dragenter','dragover'].forEach(function(ev){ dropzone2.addEventListener(ev, function(e){ e.preventDefault(); dropzone2.classList.add('drag'); }); });
  ['dragleave','drop'].forEach(function(ev){ dropzone2.addEventListener(ev, function(e){ e.preventDefault(); dropzone2.classList.remove('drag'); }); });
  dropzone2.addEventListener('drop', function(e){ if(e.dataTransfer && e.dataTransfer.files) handleFiles2(e.dataTransfer.files); });

  function handleFiles2(fileList){
    var files = Array.prototype.filter.call(fileList, function(f){ return f.type.indexOf('image/')===0; });
    if(files.length===0) return;
    Promise.all(files.map(loadImageFile)).then(function(loaded){
      loaded.forEach(function(im){
        im.templateId = lastUsedTemplateId || (templates[0] ? templates[0].id : null);
        im.texts = {};
        im.overrides = {};
      });
      images2 = images2.concat(loaded);
      if(!activeImageId2) activeImageId2 = loaded[0].id;
      renderAll2();
    });
  }

  function removeImage2(id){
    images2 = images2.filter(function(i){ return i.id!==id; });
    if(activeImageId2===id) activeImageId2 = images2[0] ? images2[0].id : null;
    renderAll2();
  }

  function renderThumbs2(){
    if(images2.length===0){ thumbs2El.classList.add('hidden'); thumbs2El.innerHTML=''; return; }
    thumbs2El.classList.remove('hidden');
    thumbs2El.innerHTML = images2.map(function(im){
      var tpl = templates.find(function(t){ return t.id===im.templateId; });
      var mismatch = tpl && isTemplateSizeMismatch(im.width, im.height, tpl);
      return '<div class="thumb2'+(im.id===activeImageId2?' active':'')+'" data-thumb2="'+im.id+'">' +
        (mismatch ? '<div class="warn" title="Sai k\u00edch th\u01b0\u1edbc so v\u1edbi m\u1eabu">!</div>' : '') +
        '<img src="'+im.dataUrl+'" alt="">' +
        '<button class="rm" data-rm2="'+im.id+'" type="button">\u00d7</button>' +
        '<div class="name">'+escapeHtml(im.name)+'</div>' +
      '</div>';
    }).join('');
    thumbs2El.querySelectorAll('[data-thumb2]').forEach(function(el){
      el.addEventListener('click', function(e){
        if(e.target.hasAttribute('data-rm2')) return;
        activeImageId2 = el.getAttribute('data-thumb2');
        renderActiveEditor();
        renderThumbs2();
      });
    });
    thumbs2El.querySelectorAll('[data-rm2]').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); removeImage2(btn.getAttribute('data-rm2')); });
    });
  }

  /* ---- active image editor ---- */
  function renderActiveEditor(){
    var im = images2.find(function(i){ return i.id===activeImageId2; });
    if(!im){ activeEditorWrap.innerHTML=''; return; }

    if(templates.length===0){
      activeEditorWrap.innerHTML = '<div class="empty-note">Ch\u01b0a c\u00f3 m\u1eabu n\u00e0o \u1edf b\u01b0\u1edbc 01 \u2014 t\u1ea1o m\u1eabu tr\u01b0\u1edbc r\u1ed3i quay l\u1ea1i \u0111\u00e2y ch\u00e8n text nha.</div>';
      return;
    }

    var tpl = templates.find(function(t){ return t.id===im.templateId; }) || templates[0];
    im.templateId = tpl.id;
    var mismatch = isTemplateSizeMismatch(im.width, im.height, tpl);

    var html = '<div class="active-editor">' +
      '<div class="ae-row"><label>M\u1eabu \u00e1p d\u1ee5ng</label><select id="ae-template">' +
        templates.map(function(t){ return '<option value="'+t.id+'"'+(t.id===tpl.id?' selected':'')+'>'+escapeHtml(t.name)+' ('+t.canvasW+'\u00d7'+t.canvasH+')</option>'; }).join('') +
      '</select></div>';

    if(mismatch){
      html += '<div class="ae-warning">\u1ea2nh n\u00e0y l\u00e0 '+im.width+'\u00d7'+im.height+'px, m\u1eabu y\u00eau c\u1ea7u '+tpl.canvasW+'\u00d7'+tpl.canvasH+'px \u2014 v\u1ecb tr\u00ed ch\u1eef c\u00f3 th\u1ec3 b\u1ecb l\u1ec7ch. Qua tab 1 resize \u0111\u00fang size tr\u01b0\u1edbc khi xu\u1ea5t.</div>';
    }

    html += '<div class="ae-stage" id="aeStage"><img id="aeStageImg" src="'+im.dataUrl+'" alt="">';
    tpl.slots.forEach(function(slot){
      html += '<textarea class="ae-text" data-aeslot="'+slot.id+'" placeholder="'+escapeHtml(slot.label)+'"></textarea>';
    });
    html += '</div>';

    html += '<div class="ae-overrides"><p class="crop-hint">Tinh ch\u1ec9nh nhanh cho ri\u00eang \u1ea3nh n\u00e0y (kh\u00f4ng \u0111\u1ed5i m\u1eabu g\u1ed1c):</p>';
    tpl.slots.forEach(function(slot){
      html += '<div class="ae-override-row" data-ovr="'+slot.id+'"><span>'+escapeHtml(slot.label)+'</span>' +
        '<input type="number" class="ovr-size" min="8" placeholder="size">' +
        '<input type="color" class="ovr-color"></div>';
    });
    html += '</div></div>';

    activeEditorWrap.innerHTML = html;

    document.getElementById('ae-template').addEventListener('change', function(e){
      im.templateId = e.target.value;
      lastUsedTemplateId = e.target.value;
      renderActiveEditor();
      renderThumbs2();
    });

    var stage = document.getElementById('aeStage');
    var stageImg = document.getElementById('aeStageImg');

    function layout(){
      var scale = stage.clientWidth / tpl.canvasW;
      var dispH = tpl.canvasH * scale;
      stage.style.height = dispH + 'px';
      stageImg.style.height = dispH + 'px';
      tpl.slots.forEach(function(slot){
        normalizeSlot(slot);
        var ta = stage.querySelector('[data-aeslot="'+slot.id+'"]');
        if(!ta) return;
        var ovr = im.overrides[slot.id] || {};
        ta.style.left = (slot.x*scale)+'px';
        ta.style.top = (slot.y*scale)+'px';
        ta.style.width = (slot.width*scale)+'px';
        ta.style.height = (slot.height*scale)+'px';
        applySlotStyleToElement(ta, slot, scale, ovr);
        if(document.activeElement !== ta) ta.value = im.texts[slot.id] || '';
      });
    }
    requestAnimationFrame(layout);
    window.addEventListener('resize', layout);

    tpl.slots.forEach(function(slot){
      var ta = stage.querySelector('[data-aeslot="'+slot.id+'"]');
      ta.value = im.texts[slot.id] || '';
      ta.addEventListener('input', function(e){ im.texts[slot.id] = e.target.value; });
    });

    activeEditorWrap.querySelectorAll('.ae-override-row').forEach(function(row){
      var slotId = row.getAttribute('data-ovr');
      var slot = tpl.slots.find(function(s){ return s.id===slotId; });
      var sizeInput = row.querySelector('.ovr-size');
      var colorInput = row.querySelector('.ovr-color');
      sizeInput.value = (im.overrides[slotId] && im.overrides[slotId].fontSize) || '';
      colorInput.value = (im.overrides[slotId] && im.overrides[slotId].color) || slot.color;
      sizeInput.addEventListener('input', function(e){
        im.overrides[slotId] = im.overrides[slotId] || {};
        im.overrides[slotId].fontSize = e.target.value ? parseInt(e.target.value,10) : undefined;
        layout();
      });
      colorInput.addEventListener('input', function(e){
        im.overrides[slotId] = im.overrides[slotId] || {};
        im.overrides[slotId].color = e.target.value;
        layout();
      });
    });
  }

  /* ---- export tab2 ---- */
  function wrapText(ctx, text, maxWidth){
    var lines = [];
    String(text || '').split(/\r?\n/).forEach(function(part){
      var words = part.split(/\s+/).filter(Boolean);
      var cur = '';
      words.forEach(function(w){
        var test = cur ? cur+' '+w : w;
        if(ctx.measureText(test).width > maxWidth && cur){ lines.push(cur); cur = w; }
        else cur = test;
      });
      if(cur) lines.push(cur);
    });
    return lines;
  }

  function computeTextCanvas(imageObj, tpl){
    var canvas = document.createElement('canvas');
    canvas.width = imageObj.width; canvas.height = imageObj.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(imageObj.img, 0, 0, imageObj.width, imageObj.height, 0, 0, imageObj.width, imageObj.height);

    tpl.slots.forEach(function(slot){
      normalizeSlot(slot);
      var text = (imageObj.texts && imageObj.texts[slot.id]) || '';
      if(!text.trim()) return;
      var ovr = (imageObj.overrides && imageObj.overrides[slot.id]) || {};
      var fontSize = ovr.fontSize || slot.fontSize;
      var color = ovr.color || slot.color;
      ctx.font = canvasFont(slot, fontSize);
      ctx.textBaseline = 'alphabetic';
      var lineHeight = fontSize*1.25;
      var lines = wrapText(ctx, text, slot.width);
      if(lines.length===0) return;
      var lineWidths = lines.map(function(line){ return ctx.measureText(line).width; });
      var maxLineWidth = Math.max.apply(Math, lineWidths);
      var blockH = lines.length*lineHeight;
      var blockTop = slot.y + Math.max(0, (slot.height-blockH)/2);
      var xPos = slot.align==='left' ? slot.x : slot.align==='right' ? slot.x+slot.width : slot.x+slot.width/2;
      var blockLeft = slot.align==='left' ? xPos : slot.align==='right' ? xPos-maxLineWidth : xPos-maxLineWidth/2;
      var padX=10, padY=6;

      if(slot.background && slot.background.enabled){
        ctx.save();
        ctx.fillStyle = hexToRgba(slot.background.color, (slot.background.opacity!=null?slot.background.opacity:45)/100);
        if(slot.background.shape === 'circle'){
          var cx = blockLeft + maxLineWidth/2;
          var cy = blockTop + blockH/2;
          var radius = Math.max(maxLineWidth, blockH)/2 + Math.max(padX, padY);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI*2);
          ctx.fill();
        } else {
          ctx.fillRect(blockLeft-padX, blockTop-padY, maxLineWidth+padX*2, blockH+padY*2);
        }
        ctx.restore();
      }

      ctx.textAlign = slot.align;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      if(slot.outline && slot.outline.enabled){
        ctx.save();
        ctx.font = canvasFont(slot, fontSize);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = slot.align;
        ctx.lineWidth = Math.max(1, parseInt(slot.outline.width,10) || 1);
        ctx.strokeStyle = slot.outline.color || '#000000';
        lines.forEach(function(line, i){
          ctx.strokeText(line, xPos, blockTop + fontSize*0.85 + i*lineHeight);
        });
        ctx.restore();
      }

      ctx.fillStyle = color;
      lines.forEach(function(line, i){
        ctx.fillText(line, xPos, blockTop + fontSize*0.85 + i*lineHeight);
      });

      if(slot.underline){
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, fontSize/14);
        ctx.lineCap = 'round';
        lines.forEach(function(line, i){
          var w = lineWidths[i];
          if(w <= 0) return;
          var lineLeft = slot.align==='left' ? xPos : slot.align==='right' ? xPos-w : xPos-w/2;
          var y = blockTop + fontSize*0.94 + i*lineHeight;
          ctx.beginPath();
          ctx.moveTo(lineLeft, y);
          ctx.lineTo(lineLeft + w, y);
          ctx.stroke();
        });
        ctx.restore();
      }
    });
    return canvas;
  }

  exportBtn2.addEventListener('click', async function(){
    if(images2.length===0 || templates.length===0) return;
    var exportFolder = '';
    if(window.kingImg.isNative){
      exportFolder = await window.kingImg.chooseExportFolder();
      if(!exportFolder) return;
      lastExportFolder2 = exportFolder;
    }

    exportBtn2.disabled = true;
    exportBtn2.textContent = '\u0110ang x\u1eed l\u00fd...';

    var zip = (!window.kingImg.isNative && typeof JSZip !== 'undefined') ? new JSZip() : null;
    var results = [];
    var tasks = images2.map(function(im){
      return function(){
        var tpl = templates.find(function(t){ return t.id===im.templateId; });
        if(!tpl) return Promise.resolve();
        var canvas = computeTextCanvas(im, tpl);
        var mime = mimeFor(tpl, im.file.type);
        var quality = (mime==='image/webp'||mime==='image/jpeg') ? (tpl.quality/100) : undefined;
        return new Promise(function(resolve){
          canvas.toBlob(function(blob){
            var ext = extFor(mime);
            var base = im.name.replace(/\.[^.]+$/, '');
            var fileName = sanitizeFileName(tpl.name + '_' + base + '.' + ext);
            var url = URL.createObjectURL(blob);
            var row = { fileName:fileName, url:url, size:blob.size, width:canvas.width, height:canvas.height, thumb:im.dataUrl, saved:false };
            if(window.kingImg.isNative){
              saveBlobToDisk(exportFolder, fileName, blob).then(function(ok){
                row.saved = !!ok;
                results.push(row);
                resolve();
              });
            } else {
              results.push(row);
              if(zip) zip.file(fileName, blob);
              resolve();
            }
          }, mime, quality);
        });
      };
    });

    tasks.reduce(function(p, fn){ return p.then(fn); }, Promise.resolve())
      .then(function(){
        renderResults2(results);
        if(window.kingImg.isNative){
          zipBar2.classList.remove('hidden');
          zipBtn2.disabled = false;
          zipBtn2.textContent = 'Mở thư mục vừa lưu';
        } else if(zip){
          return zip.generateAsync({type:'blob'}).then(function(content){
            if(lastZipUrl2) URL.revokeObjectURL(lastZipUrl2);
            lastZipUrl2 = URL.createObjectURL(content);
            zipBar2.classList.remove('hidden');
            zipBtn2.disabled = false;
            zipBtn2.textContent = 'Tải tất cả (.zip)';
          });
        } else { zipBar2.classList.add('hidden'); }
      })
      .finally(function(){
        exportBtn2.disabled = false;
        exportBtn2.textContent = 'Xu\u1ea5t t\u1ea5t c\u1ea3 \u1ea3nh';
      });
  });

  zipBtn2.addEventListener('click', function(){
    if(window.kingImg.isNative && lastExportFolder2){
      window.kingImg.openFolder(lastExportFolder2);
      return;
    }
    if(!lastZipUrl2) return;
    var a = document.createElement('a');
    a.href = lastZipUrl2; a.download = 'anh-chen-text.zip';
    document.body.appendChild(a); a.click(); a.remove();
  });

  function renderResults2(results){
    if(results.length===0){ resultsEl2.classList.add('hidden'); resultsEl2.innerHTML=''; return; }
    resultsEl2.classList.remove('hidden');
    resultsEl2.innerHTML = results.map(function(r){
      return '<div class="result-row">' +
        '<img src="'+r.thumb+'" alt="">' +
        '<div class="result-info"><div class="result-name">'+escapeHtml(r.fileName)+'</div>' +
        '<div class="result-meta">'+r.width+'\u00d7'+r.height+' \u00b7 '+formatBytes(r.size)+'</div></div>' +
        (window.kingImg.isNative ? '<span class="result-status">'+(r.saved?'Đã lưu':'Lỗi lưu')+'</span>' : '<a href="'+r.url+'" download="'+r.fileName+'">T\u1ea3i xu\u1ed1ng</a>') +
      '</div>';
    }).join('');
  }

  function updateExportHelper2(){
    if(images2.length===0){ exportHelper2.textContent = 'Th\u00eam \u1ea3nh \u1edf b\u01b0\u1edbc 02 \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.'; exportBtn2.disabled = true; return; }
    if(templates.length===0){ exportHelper2.textContent = 'T\u1ea1o \u00edt nh\u1ea5t 1 m\u1eabu \u1edf b\u01b0\u1edbc 01.'; exportBtn2.disabled = true; return; }
    exportHelper2.textContent = 'S\u1ebd xu\u1ea5t ' + images2.length + ' file, m\u1ed7i \u1ea3nh theo m\u1eabu \u0111ang g\u00e1n.';
    exportBtn2.disabled = false;
  }

  function buildTemplateListText(){
    var lines = [];
    templates.forEach(function(t){
      lines.push('MẪU: ' + t.name + ' (' + t.canvasW + '×' + t.canvasH + 'px, xuất ' + formatBadge(t) + ')');
      (t.slots || []).forEach(function(s){
        lines.push('  - vị trí: ' + s.label);
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  exportTplListBtn.addEventListener('click', async function(){
    if(templates.length===0){ alert('Chưa có mẫu nào để xuất.'); return; }
    var blob = new Blob([buildTemplateListText()], {type:'text/plain;charset=utf-8'});
    var fileName = 'danh-sach-mau.txt';
    if(window.kingImg.isNative){
      var folder = await window.kingImg.chooseExportFolder();
      if(!folder) return;
      var ok = await saveBlobToDisk(folder, fileName, blob);
      alert(ok ? 'Đã lưu danh sách mẫu.' : 'Lưu danh sách mẫu chưa thành công.');
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });

  function updateBatchReady(){
    if(!batchRunBtn) return;
    batchRunBtn.disabled = !batchCsvText || templates.length===0 || !window.kingImg.isNative;
  }

  function setBatchStatus(html, isError){
    batchStatus.classList.remove('hidden');
    batchStatus.classList.toggle('error', !!isError);
    batchStatus.innerHTML = html;
  }

  function clearBatchStatus(){
    batchStatus.classList.add('hidden');
    batchStatus.classList.remove('error');
    batchStatus.innerHTML = '';
  }

  function renderBatchErrors(errors){
    setBatchStatus(
      '<b>Batch chưa chạy vì còn lỗi:</b><ul>' +
      errors.map(function(e){ return '<li>'+escapeHtml(e)+'</li>'; }).join('') +
      '</ul>',
      true
    );
  }

  function parseCsvRows(text){
    var rows = [], row = [], field = '', inQuotes = false;
    var line = 1, rowLine = 1;
    text = String(text || '').replace(/^\uFEFF/, '');
    for(var i=0; i<text.length; i++){
      var ch = text[i];
      if(inQuotes){
        if(ch === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
          if(ch === '\n') line++;
        }
        continue;
      }
      if(ch === '"'){ inQuotes = true; continue; }
      if(ch === ','){ row.push(field); field = ''; continue; }
      if(ch === '\r' || ch === '\n'){
        row.push(field);
        if(row.some(function(v){ return v.trim() !== ''; })) rows.push({ line:rowLine, values:row });
        row = []; field = '';
        if(ch === '\r' && text[i+1] === '\n') i++;
        line++;
        rowLine = line;
        continue;
      }
      field += ch;
    }
    row.push(field);
    if(row.some(function(v){ return v.trim() !== ''; })) rows.push({ line:rowLine, values:row });
    return rows;
  }

  function parseBatchCsv(text){
    var errors = [];
    var rows = parseCsvRows(text);
    if(rows.length===0) return { records:[], errors:['File CSV đang trống.'] };
    var headers = rows[0].values.map(function(h){ return h.trim().replace(/^\uFEFF/, '').toLowerCase(); });
    var required = ['ten_anh','ten_mau','ten_vi_tri','noi_dung'];
    required.forEach(function(name){
      if(headers.indexOf(name) < 0) errors.push('Thiếu cột "' + name + '".');
    });
    if(errors.length) return { records:[], errors:errors };
    var idx = {
      image: headers.indexOf('ten_anh'),
      template: headers.indexOf('ten_mau'),
      slot: headers.indexOf('ten_vi_tri'),
      text: headers.indexOf('noi_dung')
    };
    var records = rows.slice(1).map(function(row){
      return {
        line: row.line,
        imageName: (row.values[idx.image] || '').trim(),
        templateName: (row.values[idx.template] || '').trim(),
        slotLabel: (row.values[idx.slot] || '').trim(),
        text: (row.values[idx.text] || '').trim()
      };
    });
    records.forEach(function(r){
      if(!r.imageName) errors.push('Dòng ' + r.line + ': thiếu ten_anh.');
      if(!r.templateName) errors.push('Dòng ' + r.line + ': thiếu ten_mau.');
      if(!r.slotLabel) errors.push('Dòng ' + r.line + ': thiếu ten_vi_tri.');
    });
    if(records.length===0) errors.push('CSV chưa có dòng dữ liệu nào.');
    return { records:records, errors:errors };
  }

  function templateMatchesByName(name){
    return templates.filter(function(t){ return t.name === name; });
  }

  async function validateBatchRecords(records, sourceFolder){
    var errors = [];
    var groups = {};
    var imageCache = {};
    var listJson = await window.kingImg.listImagesInFolder(sourceFolder);
    var folderImages = parseJsonSafe(listJson, []);
    var imageLookup = {};
    folderImages.forEach(function(name){ imageLookup[name.toLowerCase()] = name; });

    records.forEach(function(r){
      var tplMatches = templateMatchesByName(r.templateName);
      var tpl = null;
      if(tplMatches.length===0) errors.push('Dòng ' + r.line + ': không tìm thấy mẫu "' + r.templateName + '".');
      else if(tplMatches.length>1) errors.push('Dòng ' + r.line + ': có nhiều mẫu cùng tên "' + r.templateName + '", cần đổi tên cho duy nhất.');
      else tpl = tplMatches[0];

      var slot = null;
      if(tpl){
        var slotMatches = (tpl.slots || []).filter(function(s){ return s.label === r.slotLabel; });
        if(slotMatches.length===0) errors.push('Dòng ' + r.line + ': mẫu "' + r.templateName + '" không có vị trí "' + r.slotLabel + '".');
        else if(slotMatches.length>1) errors.push('Dòng ' + r.line + ': mẫu "' + r.templateName + '" có nhiều vị trí cùng tên "' + r.slotLabel + '".');
        else slot = slotMatches[0];
      }

      var key = r.imageName.toLowerCase();
      var actualName = imageLookup[key];
      if(r.imageName && !actualName) errors.push('Dòng ' + r.line + ': không tìm thấy ảnh "' + r.imageName + '" trong thư mục nguồn.');
      if(!groups[key]) groups[key] = { csvName:r.imageName, actualName:actualName, tpl:null, records:[] };
      groups[key].records.push({ source:r, tpl:tpl, slot:slot });
      if(actualName) groups[key].actualName = actualName;
      if(tpl && !groups[key].tpl) groups[key].tpl = tpl;
    });

    Object.keys(groups).forEach(function(key){
      var tplIds = {};
      groups[key].records.forEach(function(item){ if(item.tpl) tplIds[item.tpl.id] = item.tpl.name; });
      if(Object.keys(tplIds).length > 1){
        errors.push('Ảnh "' + groups[key].csvName + '" đang được gán nhiều mẫu khác nhau trong cùng file CSV.');
      }
    });

    for(var key in groups){
      var group = groups[key];
      if(!group.actualName || !group.tpl) continue;
      try {
        var base64 = await window.kingImg.readImageFile(sourceFolder, group.actualName);
        var image = await loadImageDataUrl(group.actualName, imageDataUrlFromBase64(group.actualName, base64));
        imageCache[key] = image;
        if(isTemplateSizeMismatch(image.width, image.height, group.tpl)){
          errors.push('Ảnh "' + group.csvName + '" là ' + image.width + '×' + image.height + 'px, mẫu "' + group.tpl.name + '" yêu cầu ' + group.tpl.canvasW + '×' + group.tpl.canvasH + 'px.');
        }
      } catch(e) {
        errors.push('Không đọc được ảnh "' + group.csvName + '".');
      }
    }

    return { errors:errors, groups:groups, imageCache:imageCache };
  }

  function canvasToBlobAsync(canvas, mime, quality){
    return new Promise(function(resolve){
      canvas.toBlob(function(blob){ resolve(blob); }, mime, quality);
    });
  }

  async function exportBatchGroups(validation, exportFolder){
    var results = [];
    var keys = Object.keys(validation.groups);
    for(var i=0; i<keys.length; i++){
      var group = validation.groups[keys[i]];
      var image = validation.imageCache[keys[i]];
      if(!image || !group.tpl) continue;
      var texts = {};
      group.records.forEach(function(item){
        if(item.slot) texts[item.slot.id] = item.source.text;
      });
      var exportImage = Object.assign({}, image, { texts:texts, overrides:{} });
      var canvas = computeTextCanvas(exportImage, group.tpl);
      var mime = mimeFor(group.tpl, image.file.type);
      var quality = (mime==='image/webp'||mime==='image/jpeg') ? (group.tpl.quality/100) : undefined;
      var blob = await canvasToBlobAsync(canvas, mime, quality);
      var ext = extFor(mime);
      var base = group.actualName.replace(/\.[^.]+$/, '');
      var fileName = sanitizeFileName(group.tpl.name + '_' + base + '.' + ext);
      var url = URL.createObjectURL(blob);
      var row = { fileName:fileName, url:url, size:blob.size, width:canvas.width, height:canvas.height, thumb:image.dataUrl, saved:false };
      row.saved = !!(await saveBlobToDisk(exportFolder, fileName, blob));
      results.push(row);
    }
    return results;
  }

  batchToggleBtn.addEventListener('click', function(){
    batchBody.classList.toggle('hidden');
  });

  batchCsvInput.addEventListener('change', function(e){
    var f = e.target.files[0];
    batchCsvText = '';
    batchCsvName = '';
    clearBatchStatus();
    if(!f){
      batchFileInfo.textContent = 'Chưa chọn file.';
      updateBatchReady();
      return;
    }
    var reader = new FileReader();
    reader.onload = function(){
      batchCsvText = reader.result || '';
      batchCsvName = f.name;
      var parsed = parseBatchCsv(batchCsvText);
      var rowCount = parsed.records.length;
      batchFileInfo.textContent = 'Đã chọn: ' + batchCsvName + ' (' + rowCount + ' dòng dữ liệu).';
      if(parsed.errors.length) renderBatchErrors(parsed.errors);
      if(!window.kingImg.isNative) setBatchStatus('Batch CSV chỉ chạy trong bản app Windows.', true);
      updateBatchReady();
    };
    reader.onerror = function(){
      batchFileInfo.textContent = 'Không đọc được file CSV.';
      updateBatchReady();
    };
    reader.readAsText(f);
  });

  batchRunBtn.addEventListener('click', async function(){
    if(!batchCsvText || !window.kingImg.isNative) return;
    clearBatchStatus();
    var parsed = parseBatchCsv(batchCsvText);
    if(parsed.errors.length){ renderBatchErrors(parsed.errors); return; }

    batchRunBtn.disabled = true;
    batchRunBtn.textContent = 'Đang kiểm tra...';
    try {
      var sourceFolder = await window.kingImg.chooseSourceFolder();
      if(!sourceFolder) return;
      setBatchStatus('Đang kiểm tra ảnh và mẫu...', false);
      var validation = await validateBatchRecords(parsed.records, sourceFolder);
      if(validation.errors.length){
        renderBatchErrors(validation.errors);
        return;
      }

      var exportFolder = await window.kingImg.chooseExportFolder();
      if(!exportFolder) return;
      lastExportFolder2 = exportFolder;
      batchRunBtn.textContent = 'Đang xuất...';
      setBatchStatus('Đang xuất ảnh batch...', false);
      var results = await exportBatchGroups(validation, exportFolder);
      renderResults2(results);
      zipBar2.classList.remove('hidden');
      zipBtn2.disabled = false;
      zipBtn2.textContent = 'Mở thư mục vừa lưu';
      setBatchStatus('Đã xuất xong ' + results.length + ' file.', false);
    } catch(e) {
      setBatchStatus('Batch chưa chạy được: ' + escapeHtml(e && e.message ? e.message : String(e)), true);
    } finally {
      batchRunBtn.textContent = 'Chạy batch';
      updateBatchReady();
    }
  });

  function renderAll2(){
    renderTemplateGrid();
    renderThumbs2();
    renderActiveEditor();
    updateExportHelper2();
    updateBatchReady();
  }

  function initApp(){
    Promise.all([
      window.kingImg.loadPresets(),
      window.kingImg.loadTemplates(),
      loadFontCatalog()
    ]).then(function(values){
      var loadedPresets = parseJsonSafe(values[0], DEFAULT_PRESETS);
      var loadedTemplates = parseJsonSafe(values[1], []);
      if(Array.isArray(loadedPresets) && loadedPresets.length) presets = loadedPresets;
      if(Array.isArray(loadedTemplates)) templates = loadedTemplates.map(normalizeTemplate);
    }).finally(function(){
      renderAll2();
      renderAll();
    });
  }

  initApp();
})();
