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

  var hostApiPromise = window.chrome && window.chrome.webview && window.chrome.webview.hostObjects
    ? Promise.resolve(window.chrome.webview.hostObjects.kingimgApi)
    : null;

  window.kingImg = window.kingImg || (hostApiPromise ? {
    isNative: true,
    writeRuntimeLog: function(message){ return hostApiPromise.then(function(api){ return api.WriteRuntimeLog(message); }); },
    loadPresets: function(){ return hostApiPromise.then(function(api){ return api.LoadPresets(); }); },
    savePresets: function(json){ return hostApiPromise.then(function(api){ return api.SavePresets(json); }); },
    loadTemplates: function(){ return hostApiPromise.then(function(api){ return api.LoadTemplates(); }); },
    saveTemplates: function(json){ return hostApiPromise.then(function(api){ return api.SaveTemplates(json); }); },
    exportTextTemplatePackage: function(json){ return hostApiPromise.then(function(api){ return api.ExportTextTemplatePackage(json); }); },
    importTextTemplatePackage: function(){ return hostApiPromise.then(function(api){ return api.ImportTextTemplatePackage(); }); },
    loadTextTemplatePackageFromPath: function(path){ return hostApiPromise.then(function(api){ return api.LoadTextTemplatePackageFromPath(path); }); },
    chooseExportFolder: function(){ return hostApiPromise.then(function(api){ return api.ChooseExportFolder(); }); },
    chooseSourceFolder: function(){ return hostApiPromise.then(function(api){ return api.ChooseSourceFolder(); }); },
    chooseBatchCsvFile: function(){ return hostApiPromise.then(function(api){ return api.ChooseBatchCsvFile(); }); },
    loadBatchCsvFileFromPath: function(path){ return hostApiPromise.then(function(api){ return api.LoadBatchCsvFileFromPath(path); }); },
    overwriteBatchCsv: function(path, text){ return hostApiPromise.then(function(api){ return api.OverwriteBatchCsv(path, text); }); },
    ensureTextOutputFolder: function(folder){ return hostApiPromise.then(function(api){ return api.EnsureTextOutputFolder(folder); }); },
    listImagesInFolder: function(folder){ return hostApiPromise.then(function(api){ return api.ListImagesInFolder(folder); }); },
    readImageFile: function(folder, fileName){ return hostApiPromise.then(function(api){ return api.ReadImageFile(folder, fileName); }); },
    saveFile: function(folder, fileName, base64){ return hostApiPromise.then(function(api){ return api.SaveFile(folder, fileName, base64); }); },
    fileExists: function(folder, fileName){ return hostApiPromise.then(function(api){ return api.FileExists(folder, fileName); }); },
    openFolder: function(folder){ return hostApiPromise.then(function(api){ return api.OpenFolder(folder); }); },
    listSystemFonts: function(){ return hostApiPromise.then(function(api){ return api.ListSystemFonts(); }); },
    addCustomFont: function(fileName, base64){ return hostApiPromise.then(function(api){ return api.AddCustomFont(fileName, base64); }); },
    listCustomFonts: function(){ return hostApiPromise.then(function(api){ return api.ListCustomFonts(); }); },
    chooseSavePdfFile: function(){ return hostApiPromise.then(function(api){ return api.ChooseSavePdfFile(); }); },
    mergeImagesToPdf: function(imagesJson, outputPath){ return hostApiPromise.then(function(api){ return api.MergeImagesToPdf(imagesJson, outputPath); }); }
  } : {
    isNative: false,
    writeRuntimeLog: function(){ return Promise.resolve(); },
    loadPresets: function(){ return Promise.resolve(localStorage.getItem('kingimg.presets') || JSON.stringify(DEFAULT_PRESETS)); },
    savePresets: function(json){ localStorage.setItem('kingimg.presets', json); return Promise.resolve(); },
    loadTemplates: function(){ return Promise.resolve(localStorage.getItem('kingimg.templates') || '[]'); },
    saveTemplates: function(json){ localStorage.setItem('kingimg.templates', json); return Promise.resolve(); },
    exportTextTemplatePackage: function(){ return Promise.resolve(''); },
    importTextTemplatePackage: function(){ return Promise.resolve(''); },
    loadTextTemplatePackageFromPath: function(){ return Promise.resolve(''); },
    chooseExportFolder: function(){ return Promise.resolve(''); },
    chooseSourceFolder: function(){ return Promise.resolve(''); },
    chooseBatchCsvFile: function(){ return Promise.resolve(''); },
    loadBatchCsvFileFromPath: function(){ return Promise.resolve(''); },
    overwriteBatchCsv: function(){ return Promise.resolve(''); },
    ensureTextOutputFolder: function(){ return Promise.resolve(''); },
    listImagesInFolder: function(){ return Promise.resolve('[]'); },
    readImageFile: function(){ return Promise.resolve(''); },
    saveFile: function(){ return Promise.resolve(false); },
    fileExists: function(){ return Promise.resolve(false); },
    openFolder: function(){ return Promise.resolve(); },
    listSystemFonts: function(){ return Promise.resolve(JSON.stringify(['Segoe UI','Arial','Calibri','Cambria','Georgia','Times New Roman'])); },
    addCustomFont: function(){ return Promise.resolve(''); },
    listCustomFonts: function(){ return Promise.resolve('[]'); },
    chooseSavePdfFile: function(){ return Promise.resolve(''); },
    mergeImagesToPdf: function(){ return Promise.resolve(false); }
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

  function normalizeUnicode(value){
    var text = String(value == null ? '' : value);
    return typeof text.normalize === 'function' ? text.normalize('NFC') : text;
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

    var jobs = [];
    images.forEach(function(im){
      chosen.forEach(function(p){
        var mime = mimeFor(p, im.file.type);
        var ext = extFor(mime);
        var base = im.name.replace(/\.[^.]+$/, '');
        var fileName = base + '.' + ext;
        jobs.push({ im:im, p:p, mime:mime, fileName:fileName });
      });
    });

    var existingSet = new Set();
    if(window.kingImg.isNative && exportFolder){
      var uniqueNames = Array.from(new Set(jobs.map(function(j){ return j.fileName; })));
      var checks = await Promise.all(uniqueNames.map(function(name){
        return window.kingImg.fileExists(exportFolder, name).then(function(exists){ return {name:name, exists:exists}; });
      }));
      checks.forEach(function(c){ if(c.exists) existingSet.add(c.name); });
    }

    var seenNames = new Set();
    var dupNames = new Set();
    jobs.forEach(function(j){
      if(seenNames.has(j.fileName)) dupNames.add(j.fileName);
      seenNames.add(j.fileName);
    });

    var conflictCount = new Set(Array.from(existingSet).concat(Array.from(dupNames))).size;
    var overwrite = true;
    if(conflictCount > 0){
      overwrite = window.confirm(
        'Phát hiện ' + conflictCount + ' tên file bị trùng (đã tồn tại trong thư mục hoặc trùng giữa các ảnh/preset đang xuất).\n\n' +
        'Nhấn OK để ghi đè tất cả, Cancel để bỏ qua các file trùng tên.'
      );
    }

    exportBtn.disabled = true;
    exportBtn.textContent = 'Đang xử lý...';

    var zip = (!window.kingImg.isNative && typeof JSZip !== 'undefined') ? new JSZip() : null;
    var results = [];
    var writtenNames = new Set();
    var tasks = jobs.map(function(job){
      return function(){
        var fileName = job.fileName;
        var skip = !overwrite && (existingSet.has(fileName) || writtenNames.has(fileName));
        if(skip){
          results.push({ fileName:fileName, url:'', size:0, width:job.im.width, height:job.im.height, thumb:job.im.dataUrl, saved:false, skipped:true });
          return Promise.resolve();
        }
        var canvas = computeOutputCanvas(job.im, job.p);
        var quality = (job.mime==='image/webp'||job.mime==='image/jpeg') ? (job.p.quality/100) : undefined;
        writtenNames.add(fileName);
        return new Promise(function(resolve){
          canvas.toBlob(function(blob){
            var url = URL.createObjectURL(blob);
            var row = { fileName:fileName, url:url, size:blob.size, width:canvas.width, height:canvas.height, thumb:job.im.dataUrl, saved:false };
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
          }, job.mime, quality);
        });
      };
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
      var status;
      if(r.skipped) status = '<span class="result-status">Bỏ qua (trùng tên)</span>';
      else if(window.kingImg.isNative) status = '<span class="result-status">'+(r.saved?'Đã lưu':'Lỗi lưu')+'</span>';
      else status = '<a href="'+r.url+'" download="'+r.fileName+'">Tải xuống</a>';
      return '<div class="result-row">' +
        '<img src="'+r.thumb+'" alt="">' +
        '<div class="result-info"><div class="result-name">'+escapeHtml(r.fileName)+'</div>' +
        '<div class="result-meta">'+r.width+'×'+r.height+' · '+formatBytes(r.size)+'</div></div>' +
        status +
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
    bundled: [
      { name:'Be Vietnam Pro', fileName:null },
      { name:'Patrick Hand', fileName:null },
      { name:'Mali', fileName:null },
      { name:'Dancing Script', fileName:null }
    ],
    system: ['Segoe UI','Arial','Calibri','Cambria','Georgia','Times New Roman'],
    custom: []
  };
  var BUNDLED_FONT_NOTES = {
    'Be Vietnam Pro': 'Gọn, dễ đọc và hỗ trợ đầy đủ tiếng Việt.',
    'Patrick Hand': 'Gần phong cách Segoe Print nhất, hỗ trợ đầy đủ tiếng Việt.',
    'Mali': 'Nét viết tay tròn, mềm; có sẵn đậm và nghiêng.',
    'Dancing Script': 'Nét chữ nối mềm, hợp tiêu đề hoặc chữ ký.'
  };
  var BUNDLED_FONT_LOAD_SPECS = {
    'Be Vietnam Pro': ['400', '700', 'italic 400', 'italic 700'],
    'Patrick Hand': ['400'],
    'Mali': ['400', '700', 'italic 400', 'italic 700'],
    'Dancing Script': ['400', '700']
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
  var batchCsvPath = '';
  var batchCsvFolder = '';
  var batchRecords = [];
  var batchParseErrors = [];
  var batchSelectedRow = -1;
  var batchPreviewImageCache = {};
  var batchPreviewRenderToken = 0;
  var batchPreviewTimer = null;

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
  var exportTextPresetBtn = document.getElementById('exportTextPresetBtn');
  var importTextPresetBtn = document.getElementById('importTextPresetBtn');
  var exportTplListBtn = document.getElementById('exportTplListBtn');
  var batchToggleBtn = document.getElementById('batchToggleBtn');
  var batchBody = document.getElementById('batchBody');
  var batchCsvInput = document.getElementById('batchCsvInput');
  var batchFileInfo = document.getElementById('batchFileInfo');
  var batchReview = document.getElementById('batchReview');
  var batchEditor = document.getElementById('batchEditor');
  var batchPreview = document.getElementById('batchPreview');
  var batchRunBtn = document.getElementById('batchRunBtn');
  var batchOverwriteRunBtn = document.getElementById('batchOverwriteRunBtn');
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

  function hexToRgba(hex, alpha){
    var h = (hex || '#000000').replace('#', '');
    if(h.length === 3) h = h.split('').map(function(c){ return c + c; }).join('');
    var r = parseInt(h.substr(0, 2), 16) || 0;
    var g = parseInt(h.substr(2, 2), 16) || 0;
    var b = parseInt(h.substr(4, 2), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
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
    slot.verticalAlign = slot.verticalAlign === 'center' ? 'center' : slot.verticalAlign === 'bottom' ? 'bottom' : 'top';
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

  function fontOptionLabel(name, source){
    if(source !== 'bundled') return name;
    if(name === 'Patrick Hand') return name + ' — gần Segoe Print';
    if(name === 'Mali') return name + ' — mềm, tròn';
    if(name === 'Dancing Script') return name + ' — chữ nối';
    return name + ' — gọn, dễ đọc';
  }

  function fontNoteFor(source, name){
    if(name === 'Segoe Print'){
      return 'Segoe Print gốc thiếu nhiều ký tự tiếng Việt. Nên chọn Patrick Hand để giữ nét viết tay mà không lỗi dấu.';
    }
    if(source === 'bundled') return BUNDLED_FONT_NOTES[name] || 'Font đi kèm app, dùng offline.';
    if(source === 'system') return 'Font máy chỉ hiển thị đúng trên máy có cài font này.';
    return 'Font riêng đã được lưu cùng app trên máy này.';
  }

  function isVietnameseFontWarning(name){
    return name === 'Segoe Print';
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

  function loadBundledFontFaces(){
    if(!document.fonts || !document.fonts.load) return Promise.resolve();
    var sample = 'Tiếng Việt: Trường Sa, Hoàng Sa, ă â ê ô ơ ư đ';
    var loads = [];
    fontCatalog.bundled.forEach(function(font){
      (BUNDLED_FONT_LOAD_SPECS[font.name] || ['400']).forEach(function(spec){
        loads.push(document.fonts.load(spec + ' 16px "' + font.name + '"', sample).catch(function(){}));
      });
    });
    return Promise.all(loads);
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
      return Promise.all([
        loadBundledFontFaces(),
        Promise.all(fontCatalog.custom.map(loadCustomFontFace))
      ]);
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
          fontOptions.map(function(name){ return '<option value="'+escapeHtml(name)+'"'+(slot.fontFamily===name?' selected':'')+'>'+escapeHtml(fontOptionLabel(name, currentSource))+'</option>'; }).join('') +
        '</select><p class="field-note'+(isVietnameseFontWarning(slot.fontFamily)?' font-warning':'')+'" id="slot-font-note">'+escapeHtml(fontNoteFor(currentSource, slot.fontFamily))+'</p></div>' +
        '<div class="font-action"><button class="btn" id="slot-add-font" type="button">+ Th\u00eam font t\u1eeb m\u00e1y</button><input type="file" class="hidden" id="slot-font-file" accept=".ttf,.otf"></div>' +
      '</div>' +
      '<div class="row2">' +
        '<div class="field"><label>Size ch\u1eef (px)</label><input type="number" id="slot-fontsize" value="'+slot.fontSize+'" min="8"></div>' +
        '<div class="field"><label>M\u00e0u ch\u1eef</label><input type="color" id="slot-color" value="'+slot.color+'"></div>' +
      '</div>' +
      '<div class="field"><label>C\u0103n l\u1ec1</label><select id="slot-align">' +
        ['left','center','right'].map(function(a){ return '<option value="'+a+'"'+(slot.align===a?' selected':'')+'>'+(a==='left'?'Tr\u00e1i':a==='center'?'Gi\u1eefa':'Ph\u1ea3i')+'</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>C\u0103n d\u1ecdc</label><select id="slot-vertical-align">' +
        ['top','center','bottom'].map(function(a){ return '<option value="'+a+'"'+(slot.verticalAlign===a?' selected':'')+'>'+(a==='top'?'Tr\u00ean':a==='center'?'Gi\u1eefa':'D\u01b0\u1edbi')+'</option>'; }).join('') +
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
    document.getElementById('slot-font-family').addEventListener('change', function(e){
      slot.fontFamily = e.target.value;
      var note = document.getElementById('slot-font-note');
      if(note){
        note.textContent = fontNoteFor(fontSourceFor(slot.fontFamily), slot.fontFamily);
        note.classList.toggle('font-warning', isVietnameseFontWarning(slot.fontFamily));
      }
      positionSlotBox(slot, scale);
    });
    document.getElementById('slot-fontsize').addEventListener('input', function(e){ slot.fontSize = parseInt(e.target.value,10)||8; positionSlotBox(slot, scale); });
    document.getElementById('slot-color').addEventListener('input', function(e){ slot.color = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-align').addEventListener('change', function(e){ slot.align = e.target.value; positionSlotBox(slot, scale); });
    document.getElementById('slot-vertical-align').addEventListener('change', function(e){ slot.verticalAlign = e.target.value; positionSlotBox(slot, scale); });
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
    normalizeUnicode(text).split(/\r?\n/).forEach(function(part){
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
      var text = normalizeUnicode((imageObj.texts && imageObj.texts[slot.id]) || '');
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
      var blockTop = slot.verticalAlign==='top' ? slot.y : slot.verticalAlign==='bottom' ? slot.y+Math.max(0, slot.height-blockH) : slot.y+Math.max(0, (slot.height-blockH)/2);
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

  function mergeImportedTemplates(importedTemplates){
    var added = 0, replaced = 0;
    importedTemplates.forEach(function(raw){
      if(!raw || typeof raw !== 'object' || !raw.name || !Array.isArray(raw.slots)) return;
      var incoming = normalizeTemplate(JSON.parse(JSON.stringify(raw)));
      if(!incoming.id) incoming.id = uid();
      var index = templates.findIndex(function(existing){
        return existing.id === incoming.id || (existing.name === incoming.name && existing.canvasW === incoming.canvasW && existing.canvasH === incoming.canvasH);
      });
      if(index >= 0){
        incoming.id = templates[index].id;
        templates[index] = incoming;
        replaced++;
      } else {
        templates.push(incoming);
        added++;
      }
    });
    return { added:added, replaced:replaced };
  }

  exportTextPresetBtn.addEventListener('click', async function(){
    if(templates.length===0){ alert('Chưa có mẫu nào để xuất.'); return; }
    if(!window.kingImg.isNative){ alert('Xuất preset chỉ chạy trong bản app Windows.'); return; }
    var result = parseJsonSafe(await window.kingImg.exportTextTemplatePackage(JSON.stringify(templates)), null);
    if(!result || !result.path) return;
    alert('Đã xuất ' + result.templateCount + ' preset' + (result.fontCount ? ' và ' + result.fontCount + ' font riêng' : '') + '.');
  });

  importTextPresetBtn.addEventListener('click', async function(){
    if(!window.kingImg.isNative){ alert('Nhập preset chỉ chạy trong bản app Windows.'); return; }
    var packageData = parseJsonSafe(await window.kingImg.importTextTemplatePackage(), null);
    if(!packageData || !Array.isArray(packageData.templates)){
      alert('Không đọc được file preset King Img.');
      return;
    }
    var changes = mergeImportedTemplates(packageData.templates);
    if(changes.added + changes.replaced === 0){
      alert('File preset không có mẫu hợp lệ.');
      return;
    }
    await persistTemplates();
    await loadFontCatalog();
    renderAll2();
    alert('Đã nhập ' + changes.added + ' preset mới' + (changes.replaced ? ', cập nhật ' + changes.replaced + ' preset trùng' : '') + (packageData.fontCount ? ', kèm ' + packageData.fontCount + ' font riêng' : '') + '. Font hệ thống cần được cài trên máy mới để hiển thị giống hệt.');
  });

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
    if(!batchRunBtn || !batchOverwriteRunBtn) return;
    var ready = !!batchCsvText && templates.length>0 && window.kingImg.isNative && !!batchCsvPath;
    batchRunBtn.disabled = !ready;
    batchOverwriteRunBtn.disabled = !ready;
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

  function cloneBatchRecord(record){
    return {
      line: record.line,
      imageName: record.imageName,
      templateName: record.templateName,
      slotLabel: record.slotLabel,
      text: record.text
    };
  }

  function escapeCsvField(value){
    var text = String(value == null ? '' : value);
    if(/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function serializeBatchCsv(records){
    var rows = [['ten_anh', 'ten_mau', 'ten_vi_tri', 'noi_dung']];
    records.forEach(function(record){
      rows.push([record.imageName, record.templateName, record.slotLabel, record.text]);
    });
    return rows.map(function(row){
      return row.map(escapeCsvField).join(',');
    }).join('\r\n') + '\r\n';
  }

  function batchPreviewText(value){
    var text = String(value == null ? '' : value);
    return text ? text.replace(/\r\n|\r|\n/g, ' ↵ ') : '(trống)';
  }

  function updateBatchEditorCounter(value){
    var counter = document.getElementById('batchEditorCounter');
    if(!counter) return;
    var text = String(value == null ? '' : value);
    var lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;
    counter.textContent = text.length + ' ký tự, ' + lineCount + ' dòng';
  }

  function setBatchEditorFeedback(message, isError){
    var feedback = document.getElementById('batchEditorFeedback');
    if(!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.toggle('error', !!isError);
  }

  function hideBatchPreview(){
    batchPreviewRenderToken += 1;
    if(batchPreviewTimer){
      clearTimeout(batchPreviewTimer);
      batchPreviewTimer = null;
    }
    if(!batchPreview) return;
    batchPreview.classList.add('hidden');
    batchPreview.innerHTML = '';
  }

  function setBatchPreviewMessage(message, isError){
    if(!batchPreview) return;
    batchPreview.classList.remove('hidden');
    batchPreview.innerHTML = '<p class="batch-preview-message' + (isError ? ' error' : '') + '">' + escapeHtml(message) + '</p>';
  }

  function scheduleBatchPreviewRender(immediate){
    if(batchPreviewTimer){
      clearTimeout(batchPreviewTimer);
      batchPreviewTimer = null;
    }
    if(immediate){
      renderBatchPreview();
      return;
    }
    batchPreviewTimer = setTimeout(function(){
      batchPreviewTimer = null;
      renderBatchPreview();
    }, 90);
  }

  async function renderBatchPreview(){
    var token = ++batchPreviewRenderToken;
    if(!batchPreview || batchSelectedRow < 0 || !batchRecords[batchSelectedRow]){
      if(batchPreview){
        batchPreview.classList.add('hidden');
        batchPreview.innerHTML = '';
      }
      return;
    }

    var selectedRecord = batchRecords[batchSelectedRow];
    if(!batchCsvFolder || !window.kingImg.isNative){
      setBatchPreviewMessage('Preview ảnh trang chỉ có trong bản app Windows.', true);
      return;
    }

    var tpl = templates.find(function(t){ return t.name === selectedRecord.templateName; });
    if(!tpl){
      setBatchPreviewMessage('Chưa tìm thấy mẫu "' + selectedRecord.templateName + '" để dựng preview.', true);
      return;
    }

    setBatchPreviewMessage('Đang tải preview ảnh trang...', false);
    try {
      var imageKey = batchCsvFolder + '|' + selectedRecord.imageName.toLowerCase();
      var image = batchPreviewImageCache[imageKey];
      if(!image){
        var base64 = await window.kingImg.readImageFile(batchCsvFolder, selectedRecord.imageName);
        if(token !== batchPreviewRenderToken) return;
        var dataUrl = imageDataUrlFromBase64(selectedRecord.imageName, base64);
        if(!dataUrl) throw new Error('Không đọc được ảnh trang.');
        image = await loadImageDataUrl(selectedRecord.imageName, dataUrl);
        if(token !== batchPreviewRenderToken) return;
        batchPreviewImageCache[imageKey] = image;
      }

      var imageRows = batchRecords.filter(function(record){
        return record.imageName.toLowerCase() === selectedRecord.imageName.toLowerCase() && record.templateName === selectedRecord.templateName;
      });
      var texts = {};
      imageRows.forEach(function(record){
        var slot = (tpl.slots || []).find(function(item){ return item.label === record.slotLabel; });
        if(slot) texts[slot.id] = record.text;
      });
      var previewImage = Object.assign({}, image, { texts:texts, overrides:{} });
      var canvas = computeTextCanvas(previewImage, tpl);
      if(token !== batchPreviewRenderToken) return;

      var mismatch = isTemplateSizeMismatch(image.width, image.height, tpl);
      var note = mismatch
        ? 'Ảnh ' + image.width + '×' + image.height + ' px, mẫu yêu cầu ' + tpl.canvasW + '×' + tpl.canvasH + ' px. Preview chỉ để tham khảo vị trí.'
        : 'Ảnh gốc ' + image.width + '×' + image.height + ' px, đang hiển thị ' + imageRows.length + ' vùng text của ảnh này.';
      batchPreview.classList.remove('hidden');
      batchPreview.innerHTML =
        '<div class="batch-preview-head">' +
          '<div><b>Preview trang</b><div class="batch-preview-help">Ảnh đang chọn, kèm nội dung text theo mẫu hiện tại.</div></div>' +
          '<span class="batch-preview-count">' + imageRows.length + ' vùng text</span>' +
        '</div>' +
        '<div class="batch-preview-stage"><img class="batch-preview-image" src="' + canvas.toDataURL('image/png') + '" alt="Preview ' + escapeHtml(selectedRecord.imageName) + '"></div>' +
        '<p class="batch-preview-note' + (mismatch ? ' error' : '') + '">' + escapeHtml(note) + '</p>';
    } catch(e) {
      if(token !== batchPreviewRenderToken) return;
      setBatchPreviewMessage('Không tải được preview ảnh trang: ' + (e && e.message ? e.message : String(e)), true);
    }
  }

  function syncBatchEditorToRecord(){
    if(batchSelectedRow < 0 || !batchRecords[batchSelectedRow] || !batchEditor) return;
    var input = batchEditor.querySelector('.batch-large-text-input');
    if(!input) return;
    batchRecords[batchSelectedRow].text = input.value;
    updateBatchEditorCounter(input.value);
    var preview = batchReview && batchReview.querySelector('[data-batch-preview-row="' + batchSelectedRow + '"]');
    if(preview) preview.textContent = batchPreviewText(input.value);
    scheduleBatchPreviewRender(false);
  }

  function renderBatchEditor(shouldFocus){
    if(!batchEditor) return;
    if(batchSelectedRow < 0 || !batchRecords[batchSelectedRow]){
      batchEditor.classList.add('hidden');
      batchEditor.innerHTML = '';
      return;
    }
    var record = batchRecords[batchSelectedRow];
    var previousDisabled = batchSelectedRow <= 0 ? ' disabled' : '';
    var nextDisabled = batchSelectedRow >= batchRecords.length - 1 ? ' disabled' : '';
    batchEditor.classList.remove('hidden');
    batchEditor.innerHTML =
      '<div class="batch-editor-head">' +
        '<div>' +
          '<div class="batch-editor-title"><b>Chỉnh nội dung chèn</b></div>' +
          '<p class="batch-editor-sub">Dòng CSV ' + escapeHtml(String(record.line)) + ' đang được chọn</p>' +
        '</div>' +
        '<span class="batch-editor-counter" id="batchEditorCounter"></span>' +
      '</div>' +
      '<div class="batch-editor-meta">' +
        '<div class="batch-editor-meta-item"><span class="batch-editor-meta-label">Ảnh</span><span class="batch-editor-meta-value" title="' + escapeHtml(record.imageName) + '">' + escapeHtml(record.imageName) + '</span></div>' +
        '<div class="batch-editor-meta-item"><span class="batch-editor-meta-label">Mẫu</span><span class="batch-editor-meta-value" title="' + escapeHtml(record.templateName) + '">' + escapeHtml(record.templateName) + '</span></div>' +
        '<div class="batch-editor-meta-item"><span class="batch-editor-meta-label">Vị trí</span><span class="batch-editor-meta-value" title="' + escapeHtml(record.slotLabel) + '">' + escapeHtml(record.slotLabel) + '</span></div>' +
      '</div>' +
      '<label class="batch-editor-label" for="batchLargeTextInput">Nội dung chèn</label>' +
      '<textarea class="batch-large-text-input" id="batchLargeTextInput" spellcheck="true">' + escapeHtml(record.text) + '</textarea>' +
      '<div class="batch-editor-toolbar">' +
        '<div class="batch-editor-nav">' +
          '<button class="btn" type="button" data-batch-editor-action="previous"' + previousDisabled + '>Dòng trước</button>' +
          '<button class="btn" type="button" data-batch-editor-action="next"' + nextDisabled + '>Dòng sau</button>' +
        '</div>' +
        '<div class="batch-editor-save">' +
          '<span class="batch-editor-feedback" id="batchEditorFeedback">Nội dung đang được giữ trong phiên chỉnh sửa.</span>' +
          '<button class="btn primary" type="button" data-batch-editor-action="save">Lưu nội dung</button>' +
        '</div>' +
      '</div>';
    updateBatchEditorCounter(record.text);
    if(shouldFocus){
      var input = batchEditor.querySelector('.batch-large-text-input');
      if(input){
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  function renderBatchReview(records){
    if(!batchReview) return;
    if(!records || records.length===0){
      batchReview.classList.add('hidden');
      batchReview.innerHTML = '';
      renderBatchEditor(false);
      hideBatchPreview();
      return;
    }

    batchReview.classList.remove('hidden');
    batchReview.innerHTML =
      '<div class="batch-review-head">' +
        '<div><b>Nội dung CSV</b><div class="batch-review-help">Bảng xem nhanh. Bấm vào dòng hoặc nút Sửa để mở khung chỉnh sửa lớn.</div></div>' +
        '<span class="batch-review-count">' + records.length + ' dòng</span>' +
      '</div>' +
      '<div class="batch-table-wrap">' +
        '<table class="batch-table">' +
          '<thead><tr>' +
            '<th>Dòng</th><th>Ảnh</th><th>Mẫu</th><th>Vị trí</th><th>Nội dung chèn</th><th>Thao tác</th>' +
          '</tr></thead>' +
          '<tbody>' +
            records.map(function(r, idx){
              return '<tr class="' + (idx === batchSelectedRow ? 'batch-selected' : '') + '" data-batch-select-row="' + idx + '" title="Bấm để sửa dòng này">' +
                '<td class="batch-line">' + escapeHtml(String(r.line)) + '</td>' +
                '<td>' + escapeHtml(r.imageName) + '</td>' +
                '<td>' + escapeHtml(r.templateName) + '</td>' +
                '<td>' + escapeHtml(r.slotLabel) + '</td>' +
                '<td><span class="batch-content-preview" data-batch-preview-row="' + idx + '">' + escapeHtml(batchPreviewText(r.text)) + '</span></td>' +
                '<td><button class="btn batch-edit-row" type="button" data-batch-select-row="' + idx + '">Sửa</button></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    renderBatchEditor(false);
    scheduleBatchPreviewRender(true);
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
        text: normalizeUnicode((row.values[idx.text] || '').trim())
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
      if(r.imageName && !actualName) errors.push('Dòng ' + r.line + ': không tìm thấy ảnh "' + r.imageName + '" trong thư mục của file CSV.');
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

  if(batchReview){
    batchReview.addEventListener('click', function(e){
      var row = e.target.closest('tr[data-batch-select-row]');
      if(!row) return;
      var idx = parseInt(row.getAttribute('data-batch-select-row'), 10);
      if(Number.isNaN(idx) || !batchRecords[idx]) return;
      syncBatchEditorToRecord();
      batchSelectedRow = idx;
      renderBatchReview(batchRecords);
      renderBatchEditor(true);
    });
  }

  if(batchEditor){
    batchEditor.addEventListener('input', function(e){
      if(!e.target.matches('.batch-large-text-input')) return;
      syncBatchEditorToRecord();
      setBatchEditorFeedback('Đã cập nhật nội dung trong phiên chỉnh sửa. Bấm Lưu nội dung để xác nhận.', false);
    });
    batchEditor.addEventListener('click', function(e){
      var actionButton = e.target.closest('[data-batch-editor-action]');
      if(!actionButton) return;
      syncBatchEditorToRecord();
      var action = actionButton.getAttribute('data-batch-editor-action');
      if(action === 'save'){
        setBatchEditorFeedback('Đã lưu nội dung dòng ' + batchRecords[batchSelectedRow].line + ' vào phiên chỉnh sửa.', false);
        return;
      }
      if(action === 'previous' && batchSelectedRow > 0){
        batchSelectedRow -= 1;
      } else if(action === 'next' && batchSelectedRow < batchRecords.length - 1){
        batchSelectedRow += 1;
      } else {
        return;
      }
      renderBatchReview(batchRecords);
      renderBatchEditor(true);
    });
  }

  function loadBatchCsvSelection(name, text, folder, path){
    batchCsvText = text || '';
    batchCsvName = name || '';
    batchCsvPath = path || '';
    batchCsvFolder = folder || '';
    clearBatchStatus();
    var parsed = parseBatchCsv(batchCsvText);
    batchRecords = parsed.records.map(cloneBatchRecord);
    batchSelectedRow = batchRecords.length ? 0 : -1;
    batchPreviewImageCache = {};
    batchParseErrors = parsed.errors.slice();
    var rowCount = parsed.records.length;
    var folderHint = batchCsvFolder ? ' Ảnh sẽ được tìm trong cùng thư mục file CSV.' : '';
    batchFileInfo.textContent = 'Đã chọn: ' + batchCsvName + ' (' + rowCount + ' dòng dữ liệu).' + folderHint;
    renderBatchReview(batchRecords);
    if(parsed.errors.length) renderBatchErrors(parsed.errors);
    if(!window.kingImg.isNative) setBatchStatus('Batch CSV chỉ chạy trong bản app Windows.', true);
    updateBatchReady();
  }

  async function chooseBatchCsvNative(){
    batchCsvText = '';
    batchCsvName = '';
    batchCsvPath = '';
    batchCsvFolder = '';
    batchRecords = [];
    batchSelectedRow = -1;
    batchPreviewImageCache = {};
    batchParseErrors = [];
    renderBatchReview(batchRecords);
    clearBatchStatus();
    batchFileInfo.textContent = 'Đang chọn file CSV...';
    updateBatchReady();
    try {
      var resultJson = await window.kingImg.chooseBatchCsvFile();
      if(!resultJson){
        batchFileInfo.textContent = 'Chưa chọn file.';
        updateBatchReady();
        return;
      }
      var result = parseJsonSafe(resultJson, null);
      if(!result || typeof result.text !== 'string' || !result.folder){
        batchFileInfo.textContent = 'Không đọc được file CSV.';
        updateBatchReady();
        return;
      }
      loadBatchCsvSelection(result.fileName || 'batch.csv', result.text, result.folder, result.path || '');
    } catch(e) {
      batchFileInfo.textContent = 'Không đọc được file CSV.';
      setBatchStatus('Không đọc được file CSV: ' + escapeHtml(e && e.message ? e.message : String(e)), true);
      updateBatchReady();
    }
  }

  batchCsvInput.addEventListener('click', function(e){
    if(!window.kingImg.isNative) return;
    e.preventDefault();
    chooseBatchCsvNative();
  });

  batchCsvInput.addEventListener('change', function(e){
    if(window.kingImg.isNative) return;
    var f = e.target.files[0];
    batchCsvText = '';
    batchCsvName = '';
    batchCsvPath = '';
    batchCsvFolder = '';
    batchRecords = [];
    batchSelectedRow = -1;
    batchPreviewImageCache = {};
    batchParseErrors = [];
    renderBatchReview(batchRecords);
    clearBatchStatus();
    if(!f){
      batchFileInfo.textContent = 'Chưa chọn file.';
      updateBatchReady();
      return;
    }
    var reader = new FileReader();
    reader.onload = function(){
    loadBatchCsvSelection(f.name, reader.result || '', '', '');
    };
    reader.onerror = function(){
      batchFileInfo.textContent = 'Không đọc được file CSV.';
      updateBatchReady();
    };
    reader.readAsText(f);
  });

  batchRunBtn.addEventListener('click', function(){ runCurrentBatch(false).catch(function(){}); });

  batchOverwriteRunBtn.addEventListener('click', function(){
    if(!window.confirm('Batch sẽ chạy trước. Chỉ khi xuất ảnh thành công, CSV gốc mới được lưu đè và tạo file backup .csv.bak. Tiếp tục?')) return;
    runCurrentBatch(true).catch(function(){});
  });

  async function runCurrentBatch(overwriteCsv){
    if(!batchCsvText || !window.kingImg.isNative) return;
    clearBatchStatus();
    if(batchParseErrors.length){ renderBatchErrors(batchParseErrors); return; }
    syncBatchEditorToRecord();
    var records = batchRecords.map(cloneBatchRecord);
    if(records.length===0){ renderBatchErrors(['CSV chưa có dòng dữ liệu nào.']); return; }

    batchRunBtn.disabled = true;
    batchOverwriteRunBtn.disabled = true;
    batchRunBtn.textContent = 'Đang kiểm tra...';
    batchOverwriteRunBtn.textContent = overwriteCsv ? 'Đang kiểm tra...' : 'Chạy batch + lưu đè CSV';
    try {
      var sourceFolder = batchCsvFolder;
      if(!sourceFolder){
        setBatchStatus('Chưa xác định được thư mục của file CSV. Anh chọn lại file CSV trong app Windows giúp em.', true);
        return;
      }
      setBatchStatus('Đang kiểm tra ảnh và mẫu...', false);
      var validation = await validateBatchRecords(records, sourceFolder);
      if(validation.errors.length){
        renderBatchErrors(validation.errors);
        return;
      }

      var exportFolder = await window.kingImg.ensureTextOutputFolder(sourceFolder);
      if(!exportFolder){
        setBatchStatus('Không tạo được thư mục Text trong thư mục ảnh gốc.', true);
        return;
      }
      lastExportFolder2 = exportFolder;
      batchRunBtn.textContent = 'Đang xuất...';
      batchOverwriteRunBtn.textContent = overwriteCsv ? 'Đang xuất...' : 'Chạy batch + lưu đè CSV';
      setBatchStatus('Đang xuất ảnh batch vào thư mục Text...', false);
      var results = await exportBatchGroups(validation, exportFolder);
      renderResults2(results);
      zipBar2.classList.remove('hidden');
      zipBtn2.disabled = false;
      zipBtn2.textContent = 'Mở thư mục vừa lưu';

      var failedResults = results.filter(function(result){ return !result.saved; });
      if(overwriteCsv && (results.length===0 || failedResults.length>0)){
        setBatchStatus('Đã xuất chưa đủ ảnh nên CSV chưa được lưu đè. Anh kiểm tra phần kết quả rồi chạy lại.', true);
        return;
      }

      if(overwriteCsv){
        batchOverwriteRunBtn.textContent = 'Đang lưu CSV...';
        setBatchStatus('Batch đã xong. Đang tạo backup và lưu đè CSV...', false);
        var overwriteResult = parseJsonSafe(
          await window.kingImg.overwriteBatchCsv(batchCsvPath, serializeBatchCsv(records)),
          null
        );
        if(!overwriteResult || !overwriteResult.success){
          var overwriteError = overwriteResult && overwriteResult.error ? overwriteResult.error : 'Không ghi được CSV.';
          setBatchStatus('Đã xuất ảnh nhưng CSV chưa được lưu đè: ' + escapeHtml(overwriteError), true);
          return;
        }
        batchCsvText = serializeBatchCsv(records);
        setBatchStatus(
          'Đã xuất xong ' + results.length + ' file và lưu đè CSV. Backup: ' +
          escapeHtml(overwriteResult.backupPath || (batchCsvPath + '.bak')),
          false
        );
      } else {
        setBatchStatus('Đã xuất xong ' + results.length + ' file.', false);
      }
    } catch(e) {
      setBatchStatus('Batch chưa chạy được: ' + escapeHtml(e && e.message ? e.message : String(e)), true);
      throw e;
    } finally {
      batchRunBtn.textContent = 'Chạy batch';
      batchOverwriteRunBtn.textContent = 'Chạy batch + lưu đè CSV';
      updateBatchReady();
    }
  }

  async function runBatchFromPaths(csvPath, packagePath){
    if(!window.kingImg.isNative || !csvPath) return;
    if(packagePath){
      var packageData = parseJsonSafe(await window.kingImg.loadTextTemplatePackageFromPath(packagePath), null);
      if(!packageData || !Array.isArray(packageData.templates)) throw new Error('Không đọc được preset King Img.');
      var changes = mergeImportedTemplates(packageData.templates);
      if(changes.added + changes.replaced === 0) throw new Error('Preset King Img không có mẫu hợp lệ.');
      await persistTemplates();
      await loadFontCatalog();
      renderAll2();
    }

    var csvData = parseJsonSafe(await window.kingImg.loadBatchCsvFileFromPath(csvPath), null);
    if(!csvData || typeof csvData.text !== 'string' || !csvData.folder) throw new Error('Không đọc được CSV batch.');
    batchBody.classList.remove('hidden');
    loadBatchCsvSelection(csvData.fileName || 'batch.csv', csvData.text, csvData.folder, csvData.path || csvPath);
    await runCurrentBatch(false);
  }

  function renderAll2(){
    renderTemplateGrid();
    renderThumbs2();
    renderActiveEditor();
    updateExportHelper2();
    updateBatchReady();
  }

  /* ---------------- tab3: ghép PDF ---------------- */
  var imagesPdf = [];  // {id, file, name}
  var pdfDragId = null;

  var dropzone3 = document.getElementById('dropzone3');
  var fileInput3 = document.getElementById('fileInput3');
  var pickBtn3 = document.getElementById('pickBtn3');
  var pdfListHint = document.getElementById('pdfListHint');
  var pdfListEl = document.getElementById('pdfList');
  var exportBtn3 = document.getElementById('exportBtn3');
  var exportHelper3 = document.getElementById('exportHelper3');

  pickBtn3.addEventListener('click', function(){ fileInput3.click(); });
  dropzone3.addEventListener('click', function(e){ if(e.target===dropzone3) fileInput3.click(); });
  fileInput3.addEventListener('change', function(e){ handleFiles3(e.target.files); fileInput3.value=''; });

  ['dragenter','dragover'].forEach(function(ev){
    dropzone3.addEventListener(ev, function(e){ e.preventDefault(); dropzone3.classList.add('drag'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    dropzone3.addEventListener(ev, function(e){ e.preventDefault(); dropzone3.classList.remove('drag'); });
  });
  dropzone3.addEventListener('drop', function(e){
    if(e.dataTransfer && e.dataTransfer.files) handleFiles3(e.dataTransfer.files);
  });

  function handleFiles3(fileList){
    var files = Array.prototype.filter.call(fileList, function(f){ return f.type.indexOf('image/')===0; });
    if(files.length===0) return;
    imagesPdf = imagesPdf.concat(files.map(function(f){ return { id:uid(), file:f, name:f.name }; }));
    renderPdfList();
  }

  function removePdfImage(id){
    imagesPdf = imagesPdf.filter(function(it){ return it.id!==id; });
    renderPdfList();
  }

  function renderPdfList(){
    var hasItems = imagesPdf.length > 0;
    pdfListHint.classList.toggle('hidden', hasItems);
    pdfListEl.classList.toggle('hidden', !hasItems);
    pdfListEl.innerHTML = imagesPdf.map(function(it, idx){
      return '<li class="pdf-item" draggable="true" data-id="'+it.id+'">' +
        '<span class="pdf-handle">⠷</span>' +
        '<span class="pdf-index">'+(idx+1)+'</span>' +
        '<span class="pdf-name">'+escapeHtml(it.name)+'</span>' +
        '<button class="pdf-rm" type="button" data-id="'+it.id+'">×</button>' +
        '</li>';
    }).join('');
    exportBtn3.disabled = !hasItems;
    exportHelper3.textContent = hasItems ? (imagesPdf.length + ' ảnh · sẽ xuất theo đúng thứ tự đang hiển thị') : '';
  }

  pdfListEl.addEventListener('click', function(e){
    var btn = e.target.closest('.pdf-rm');
    if(btn) removePdfImage(btn.getAttribute('data-id'));
  });

  pdfListEl.addEventListener('dragstart', function(e){
    var li = e.target.closest('.pdf-item');
    if(!li) return;
    pdfDragId = li.getAttribute('data-id');
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pdfDragId);
  });

  pdfListEl.addEventListener('dragend', function(e){
    var li = e.target.closest('.pdf-item');
    if(li) li.classList.remove('dragging');
    pdfListEl.querySelectorAll('.pdf-item.drag-over').forEach(function(el){ el.classList.remove('drag-over'); });
    pdfDragId = null;
  });

  pdfListEl.addEventListener('dragover', function(e){
    var li = e.target.closest('.pdf-item');
    if(!li || !pdfDragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if(li.getAttribute('data-id') !== pdfDragId) li.classList.add('drag-over');
  });

  pdfListEl.addEventListener('dragleave', function(e){
    var li = e.target.closest('.pdf-item');
    if(li) li.classList.remove('drag-over');
  });

  pdfListEl.addEventListener('drop', function(e){
    var li = e.target.closest('.pdf-item');
    if(!li || !pdfDragId) return;
    e.preventDefault();
    var targetId = li.getAttribute('data-id');
    li.classList.remove('drag-over');
    if(targetId === pdfDragId) return;

    var fromIdx = imagesPdf.findIndex(function(it){ return it.id===pdfDragId; });
    var toIdx = imagesPdf.findIndex(function(it){ return it.id===targetId; });
    if(fromIdx===-1 || toIdx===-1) return;

    var rect = li.getBoundingClientRect();
    var before = (e.clientY - rect.top) < rect.height/2;
    var moved = imagesPdf.splice(fromIdx, 1)[0];
    var insertAt = imagesPdf.findIndex(function(it){ return it.id===targetId; });
    if(!before) insertAt += 1;
    imagesPdf.splice(insertAt, 0, moved);
    renderPdfList();
  });

  function fileToDataUrlRaw(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function rasterizeToPng(dataUrl){
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        // Xuất lại từ pixel để PDF không nhận kèm EXIF/XMP/IPTC/C2PA của file nguồn.
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  exportBtn3.addEventListener('click', function(){
    if(imagesPdf.length===0) return;
    if(!window.kingImg.isNative){
      exportHelper3.textContent = 'Ghép PDF chỉ chạy trong bản app Windows.';
      return;
    }

    exportBtn3.disabled = true;
    exportHelper3.textContent = 'Đang xử lý...';

    window.kingImg.chooseSavePdfFile().then(function(outputPath){
      if(!outputPath){
        exportHelper3.textContent = '';
        return;
      }

      var order = imagesPdf.slice();
      return Promise.all(order.map(function(it){
        return fileToDataUrlRaw(it.file).then(function(dataUrl){
          return rasterizeToPng(dataUrl);
        }).then(function(finalDataUrl){
          return { fileName: it.name, base64: finalDataUrl };
        });
      })).then(function(items){
        return window.kingImg.mergeImagesToPdf(JSON.stringify(items), outputPath);
      }).then(function(ok){
        exportHelper3.textContent = ok ? 'Đã lưu: ' + outputPath : 'Có lỗi khi xuất PDF.';
      });
    }).catch(function(e){
      exportHelper3.textContent = 'Lỗi: ' + (e && e.message ? e.message : String(e));
    }).finally(function(){
      exportBtn3.disabled = imagesPdf.length===0;
    });
  });

  renderPdfList();

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

  var initAppPromise = initApp();
  window.kingImgRunBatch = function(csvPath, packagePath){
    return initAppPromise.then(function(){ return runBatchFromPaths(csvPath, packagePath); }).then(function(){
      var result = { ok:true, outputFolder:lastExportFolder2 };
      return window.kingImg.writeRuntimeLog('batch result ' + JSON.stringify(result)).then(function(){ return result; });
    }).catch(function(error){
      var result = { ok:false, error:error && error.message ? error.message : String(error) };
      return window.kingImg.writeRuntimeLog('batch result ' + JSON.stringify(result)).then(function(){ return result; });
    });
  };
})();
