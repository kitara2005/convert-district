const app = document.getElementById('app');

app.innerHTML = `
  <div class="tab-pane fade show active" id="tab-before" role="tabpanel">
    <div class="card">
      <div class="row">
        <div>
          <label>Tỉnh/Thành (cũ)</label>
          <input id="provSearch" placeholder="Tìm tỉnh không dấu..." />
          <select id="prov"></select>
        </div>
        <div>
          <label>Quận/Huyện (cũ)</label>
          <input id="distSearch" placeholder="Tìm quận/huyện không dấu..." disabled />
          <select id="dist" disabled></select>
        </div>
        <div>
          <label>Phường/Xã (cũ)</label>
          <input id="wardSearch" placeholder="Tìm phường/xã không dấu..." disabled />
          <select id="ward" disabled></select>
        </div>
      </div>
      <div class="results" id="results"></div>
    </div>
  </div>
  <div class="tab-pane fade" id="tab-after" role="tabpanel">
    <div class="card">
      <div class="row">
        <div>
          <label>Tỉnh/Thành (mới)</label>
          <input id="newProvSearch" placeholder="Tìm tỉnh không dấu..." />
          <select id="newProv"></select>
        </div>
        <div>
          <label>Phường/Xã (mới)</label>
          <input id="newWardSearch" placeholder="Tìm phường/xã không dấu..." disabled />
          <select id="newWard" disabled></select>
        </div>
      </div>
      <div class="results" id="revResults"></div>
    </div>
  </div>
`;

const $prov = document.getElementById('prov');
const $provSearch = document.getElementById('provSearch');
const $dist = document.getElementById('dist');
const $distSearch = document.getElementById('distSearch');
const $ward = document.getElementById('ward');
const $wardSearch = document.getElementById('wardSearch');
const $results = document.getElementById('results');
// After-merge elements
const $newProv = document.getElementById('newProv');
const $newProvSearch = document.getElementById('newProvSearch');
const $newWard = document.getElementById('newWard');
const $newWardSearch = document.getElementById('newWardSearch');
const $revResults = document.getElementById('revResults');

const cache = new Map();

async function fetchJson(url) {
  if (cache.has(url)) return cache.get(url);
  const buster = `v=${Date.now()}`;
  const full = url.includes('?') ? `${url}&${buster}` : `${url}?${buster}`;
  const res = await fetch(full, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load ' + url);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

async function loadProvinces() {
  const provinces = await fetchJson('data/provincesOld.json');
  $prov.dataset.json = JSON.stringify(provinces);
  renderOptions($prov, provinces, p => p.code, p => p.name, '-- Chọn tỉnh --');
}

async function loadDistricts(provCode) {
  $dist.disabled = !provCode;
  $ward.disabled = true;
  $dist.innerHTML = '';
  $ward.innerHTML = '';
  $results.innerHTML = '';
  if (!provCode) return;
  const d = await fetchJson(`data/districtsOld-${provCode}.json`);
  $dist.dataset.json = JSON.stringify(d);
  $distSearch.disabled = false;
  renderOptions($dist, d, x => x.key, x => x.name, '-- Chọn quận/huyện --');
}

async function loadWards(districtKey) {
  $ward.disabled = !districtKey;
  $ward.innerHTML = '';
  $results.innerHTML = '';
  if (!districtKey) return;
  const provCode = districtKey.split('-')[0];
  const wards = await fetchJson(`data/wardsOld-${provCode}.json`);
  const filtered = wards.filter(w => w.districtKey === districtKey);
  $ward.dataset.json = JSON.stringify(filtered);
  $wardSearch.disabled = false;
  renderOptions($ward, filtered, x => x.key, x => x.name, '-- Chọn phường/xã --');
}

async function showMapping(oldWardKey) {
  $results.innerHTML = '';
  if (!oldWardKey) return;
  const provCode = oldWardKey.split('-')[0];
  const mapping = await fetchJson(`data/mapping-${provCode}.json`).catch(() => ({}));
  const targets = mapping[oldWardKey] || [];
  if (targets.length === 0) {
    $results.innerHTML = '<div class="muted">Chưa có dữ liệu ánh xạ cho đơn vị này.</div>';
    return;
  }
  $results.innerHTML = targets.map(t => `
    <div class="result">
      <div class="header">
        <div><strong>Tỉnh/Thành (mới):</strong> ${t.provinceNew.name} (mã: ${t.provinceNew.code})</div>
        <div class="copy" data-copy="${escapeHtml(JSON.stringify(t))}">Sao chép</div>
      </div>
      <div><strong>${t.wardNew.type === 'phường' ? 'Phường' : 'Xã/Thị trấn'} (mới):</strong> ${t.wardNew.name} ${t.wardNew.code ? `(mã: ${t.wardNew.code})` : ''} ${t.note ? `<span class=\"badge\">${t.note}</span>` : ''}</div>
      ${(t.provinceStats || t.wardStats) ? `
      <div class="meta-grid">
        ${t.provinceStats ? `
        <div>
          <div class="meta-title">Tổng quan tỉnh/thành</div>
          <dl class="kv">
            ${t.provinceStats.dientichkm2 ? `<div class="item"><dt>Diện tích</dt><dd>${t.provinceStats.dientichkm2} km²</dd></div>` : ''}
            ${t.provinceStats.dansonguoi ? `<div class="item"><dt>Dân số</dt><dd>${t.provinceStats.dansonguoi}</dd></div>` : ''}
            ${t.provinceStats.trungtamhc ? `<div class="item"><dt>Trung tâm HC</dt><dd>${t.provinceStats.trungtamhc}</dd></div>` : ''}
            ${t.provinceStats.con ? `<div class="item"><dt>Cơ cấu ĐVHC</dt><dd>${t.provinceStats.con}</dd></div>` : ''}
          </dl>
        </div>` : ''}
        ${t.wardStats && (t.wardStats.dientichkm2 || t.wardStats.dansonguoi || t.wardStats.trungtamhc) ? `
        <div>
          <div class="meta-title">Thông tin đơn vị mới</div>
          <dl class="kv">
            ${t.wardStats.dientichkm2 ? `<div class="item"><dt>Diện tích</dt><dd>${t.wardStats.dientichkm2} km²</dd></div>` : ''}
            ${t.wardStats.dansonguoi ? `<div class="item"><dt>Dân số</dt><dd>${t.wardStats.dansonguoi}</dd></div>` : ''}
            ${t.wardStats.trungtamhc ? `<div class="item"><dt>Trung tâm HC</dt><dd>${t.wardStats.trungtamhc}</dd></div>` : ''}
          </dl>
        </div>` : ''}
      </div>
      ` : ''}
    </div>
  `).join('');
  bindCopy();
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",
  ">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function bindCopy(){
  document.querySelectorAll('.copy').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const text = btn.getAttribute('data-copy');
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Đã sao chép'; setTimeout(()=>btn.textContent='Sao chép',1500);} catch(e){ btn.textContent='Lỗi'; }
    });
  })
}

function normalizeVN(s){
  return s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase();
}

function normalizeKey(s){
  return normalizeVN(s||'')
    .replace(/đ/g,'d')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function renderOptions(selectEl, items, getVal, getLabel, placeholder){
  const html = ['<option value="">'+placeholder+'</option>'].concat(items.map(it=>`<option value="${getVal(it)}">${getLabel(it)}</option>`));
  selectEl.innerHTML = html.join('');
}

function attachSearch(inputEl, selectEl, key){
  inputEl.addEventListener('input', ()=>{
    const all = JSON.parse(selectEl.dataset.json || '[]');
    const q = normalizeVN(inputEl.value || '');
    const filtered = q ? all.filter(it=> normalizeVN((it.name||'')).includes(q)) : all;
    if (key==='prov') renderOptions(selectEl, filtered, p=>p.code, p=>p.name, '-- Chọn tỉnh --');
    if (key==='dist') renderOptions(selectEl, filtered, x=>x.key, x=>x.name, '-- Chọn quận/huyện --');
    if (key==='ward') renderOptions(selectEl, filtered, x=>x.key, x=>x.name, '-- Chọn phường/xã --');
    if (key==='newProv') renderOptions(selectEl, filtered, p=>p.code, p=>p.name, '-- Chọn tỉnh (mới) --');
    if (key==='newWard') renderOptions(selectEl, filtered, x=>x.code, x=>x.name, '-- Chọn phường/xã (mới) --');
  });
}

$prov.addEventListener('change', (e) => loadDistricts(e.target.value));
$dist.addEventListener('change', (e) => loadWards(e.target.value));
$ward.addEventListener('change', (e) => showMapping(e.target.value));

loadProvinces();
attachSearch($provSearch, $prov, 'prov');
attachSearch($distSearch, $dist, 'dist');
attachSearch($wardSearch, $ward, 'ward');

// After-merge tab logic
async function loadProvincesNew(){
  const provinces = await fetchJson('data/provincesNew.json');
  $newProv.dataset.json = JSON.stringify(provinces);
  renderOptions($newProv, provinces, p=>p.code, p=>p.name, '-- Chọn tỉnh (mới) --');
}

async function loadNewWards(newProvCode){
  $newWard.disabled = !newProvCode; $newWard.innerHTML=''; $revResults.innerHTML='';
  if (!newProvCode) return;
  const wards = await fetchJson(`data/new-wards-${newProvCode}.json`);
  $newWard.dataset.json = JSON.stringify(wards);
  $newWardSearch.disabled = false;
  // Include district code to disambiguate wards trùng tên
  renderOptions($newWard, wards, x=>x.code, x=> `${x.name}${x.districtCode?` — ${x.districtCode}`:''}`, '-- Chọn phường/xã (mới) --');
}

async function showReverse(newWardCode){
  $revResults.innerHTML='';
  if (!newWardCode) return;
  const newProvCode = $newProv.value;
  // Simplified: use truocsapnhap as old wards string; determine old province from merges + excelData
  const [sourcesMap, newToOld, provincesOld] = await Promise.all([
    fetchJson(`data/new-sources-${newProvCode}.json`).catch(()=>({})),
    fetchJson('data/new-to-old-provs.json').catch(()=>({})),
    fetchJson('data/provincesOld.json').catch(()=>[])
  ]);
  const src = sourcesMap[newWardCode];
  if (!src){
    $revResults.innerHTML = '<div class="muted">Chưa có dữ liệu trước sáp nhập cho đơn vị này.</div>';
    return;
  }
  const oldsProvCodes = newToOld[String(newProvCode)] || [];
  const bestOld = await computeBestOldProvince(newProvCode, oldsProvCodes, src);
  const oldProvName = (provincesOld.find(p=> String(p.code)===String(bestOld))||{}).name || bestOld || '';
  $revResults.innerHTML = `
    <div class="result">
      <div><strong>Tỉnh/Thành (cũ):</strong> ${oldProvName}${bestOld?` (mã: ${bestOld})`:''}</div>
      <div><strong>Phường/Xã (cũ):</strong> ${src}</div>
    </div>
  `;
}

async function computeBestOldProvince(newProvCode, candidateOldProvCodes, sourcesText){
  // Expand candidate set by provinces discovered directly from sources via global indexes
  const discovered = await discoverProvincesByIndexes(sourcesText);
  const base = Array.isArray(candidateOldProvCodes) ? candidateOldProvCodes.map(String) : [];
  const unionSet = new Set([ ...base, ...discovered ]);
  const candidates = Array.from(unionSet);
  if (candidates.length===0){
    const byIndex = await computeBestOldProvinceByIndexes(sourcesText);
    if (byIndex) return byIndex;
    return newProvCode;
  }
  const entries = parseSourcesClient(sourcesText);
  let bestCode = candidates[0];
  let bestScore = -1;
  for (const oc of candidates){
    const [wards, dists] = await Promise.all([
      fetchJson(`data/wardsOld-${oc}.json`).catch(()=>[]),
      fetchJson(`data/districtsOld-${oc}.json`).catch(()=>[])
    ]);
    const byNameKey = new Map();
    for (const w of wards){
      const arr = byNameKey.get(w.nameKey) || []; arr.push(w); byNameKey.set(w.nameKey, arr);
    }
    const distNameKeyToKeys = new Map();
    for (const d of dists){
      const k = stripDistrictPrefixClient(d.name);
      const arr = distNameKeyToKeys.get(k) || []; arr.push(d.key); distNameKeyToKeys.set(k, arr);
    }
    let score = 0;
    for (const s of entries){
      const keyName = stripAdminPrefixClient(s.name);
      let candidates = byNameKey.get(keyName) || [];
      if (s.parentDistrictName){
        const parentKey = stripDistrictPrefixClient(s.parentDistrictName);
        const keys = distNameKeyToKeys.get(parentKey) || [];
        if (keys.length>0){
          const set = new Set(keys);
          candidates = candidates.filter(w=> set.has(w.districtKey));
        } else {
          candidates = [];
        }
      }
      if (candidates.length>0) score += 1;
    }
    if (score > bestScore){
      bestScore = score;
      bestCode = oc;
    }
  }
  return bestCode;
}

async function computeBestOldProvinceByIndexes(sourcesText){
  const [wardIdx, distIdx] = await Promise.all([
    fetchJson('data/ward-index.json').catch(()=>({})),
    fetchJson('data/district-index.json').catch(()=>({}))
  ]);
  const entries = parseSourcesClient(sourcesText);
  const score = new Map();
  function inc(p){ score.set(p, (score.get(p)||0)+1); }
  for (const s of entries){
    const raw = normalizeKey(s.name);
    if (/^(quan|huyen|thi xa|thanh pho|thu do|tp)\s+/.test(raw)){
      const dKey = stripDistrictPrefixClient(s.name);
      const arr = distIdx[dKey] || [];
      for (const it of arr) inc(String(it.provinceCode));
      continue;
    }
    const wKey = stripAdminPrefixClient(s.name);
    const arr = wardIdx[wKey] || [];
    let allowedProv = null;
    if (s.parentDistrictName){
      const parentKey = stripDistrictPrefixClient(s.parentDistrictName);
      const dArr = distIdx[parentKey] || [];
      allowedProv = new Set(dArr.map(it=>String(it.provinceCode)));
    }
    for (const it of arr){
      const p = String(it.provinceCode);
      if (allowedProv && !allowedProv.has(p)) continue;
      inc(p);
    }
  }
  let best = null, bestScore = -1;
  for (const [p, sc] of score.entries()){
    if (sc > bestScore){ bestScore = sc; best = p; }
  }
  return best;
}

async function discoverProvincesByIndexes(sourcesText){
  const [wardIdx, distIdx] = await Promise.all([
    fetchJson('data/ward-index.json').catch(()=>({})),
    fetchJson('data/district-index.json').catch(()=>({}))
  ]);
  const entries = parseSourcesClient(sourcesText);
  const provs = new Set();
  for (const s of entries){
    const raw = normalizeKey(s.name);
    if (/^(quan|huyen|thi xa|thanh pho|thu do|tp)\s+/.test(raw)){
      const dKey = stripDistrictPrefixClient(s.name);
      const arr = distIdx[dKey] || [];
      for (const it of arr) provs.add(String(it.provinceCode));
      continue;
    }
    const wKey = stripAdminPrefixClient(s.name);
    const arr = wardIdx[wKey] || [];
    for (const it of arr) provs.add(String(it.provinceCode));
  }
  return Array.from(provs);
}

function stripAdminPrefixClient(name){
  const n = normalizeKey(name||'');
  return n.replace(/^(phuong|xa|thi tran)\s+/, '').trim();
}

function stripDistrictPrefixClient(name){
  const n = normalizeKey(name||'');
  return n.replace(/^(quan|huyen|thi xa|thanh pho|thu do|tp)\s+/, '').trim();
}

function parseSourcesClient(text){
  if (!text) return [];
  const cleaned = String(text).replace(/\n/g,' ').replace(/\s+/g,' ').trim();
  const parts = cleaned.split(/,\s*/);
  const out = [];
  for (let p of parts){
    p = p.trim(); if (!p) continue;
    const isPartial = /phần còn lại/i.test(p);
    let name = p, parentDistrictName = null;
    const m = p.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (m){ name = m[1]; parentDistrictName = m[2]; }
    out.push({ raw: p, name, parentDistrictName, isPartial });
  }
  return out;
}

async function reverseFallback(newProvCode, newWardCode){
  const [sourcesMap, newToOld] = await Promise.all([
    fetchJson(`data/new-sources-${newProvCode}.json`).catch(()=>({})),
    fetchJson('data/new-to-old-provs.json').catch(()=>({}))
  ]);
  const src = sourcesMap[newWardCode];
  if (!src) return [];
  const oldsProvCodes = newToOld[String(newProvCode)] || [];
  if (!Array.isArray(oldsProvCodes) || oldsProvCodes.length===0) return [];
  const provincesOld = await fetchJson('data/provincesOld.json').catch(()=>[]);
  const provNameByCode = new Map((provincesOld||[]).map(p=>[String(p.code), p.name]));
  const entries = parseSourcesClient(src);
  const results = [];
  for (const oc of oldsProvCodes){
    const [wards, dists] = await Promise.all([
      fetchJson(`data/wardsOld-${oc}.json`).catch(()=>[]),
      fetchJson(`data/districtsOld-${oc}.json`).catch(()=>[])
    ]);
    const distNameKeyToKeys = new Map();
    for (const d of dists){
      const k = stripDistrictPrefixClient(d.name);
      const arr = distNameKeyToKeys.get(k) || []; arr.push(d.key); distNameKeyToKeys.set(k, arr);
    }
    for (const s of entries){
      const keyName = stripAdminPrefixClient(s.name);
      let candidates = wards.filter(w=> (w.nameKey===keyName));
      let parentMatched = false;
      if (s.parentDistrictName){
        const parentKey = stripDistrictPrefixClient(s.parentDistrictName);
        const keys = distNameKeyToKeys.get(parentKey) || [];
        if (keys.length>0){
          const set = new Set(keys);
          const filtered = candidates.filter(w=> set.has(w.districtKey));
          if (filtered.length>0){ candidates = filtered; parentMatched = true; } else { candidates = []; }
        } else {
          candidates = [];
        }
      }
      if (candidates.length===0 && s.isPartial && s.parentDistrictName){
        const parentKey = stripDistrictPrefixClient(s.parentDistrictName);
        const keys = distNameKeyToKeys.get(parentKey) || [];
        if (keys.length>0){
          const set = new Set(keys);
          candidates = wards.filter(w=> set.has(w.districtKey));
          parentMatched = true;
        }
      }
      for (const w of candidates){
        results.push({
          oldKey: w.key,
          oldWardCode: w.code,
          oldWardType: null,
          oldName: w.name,
          oldDistrictKey: w.districtKey,
          oldDistrictName: (dists.find(d=>d.key===w.districtKey)||{}).name || null,
          oldProvinceCode: String(oc),
          oldProvinceName: provNameByCode.get(String(oc)) || '',
          note: s.isPartial ? 'phần còn lại' : ''
        });
      }
    }
  }
  return results;
}

loadProvincesNew();
$newProv.addEventListener('change', (e)=> loadNewWards(e.target.value));
$newWard.addEventListener('change', (e)=> showReverse(e.target.value));


