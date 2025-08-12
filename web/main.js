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
  renderOptions($newWard, wards, x=>x.code, x=>x.name, '-- Chọn phường/xã (mới) --');
}

async function showReverse(newWardCode){
  $revResults.innerHTML='';
  if (!newWardCode) return;
  const newProvCode = $newProv.value;
  const rev = await fetchJson(`data/rev-${newProvCode}.json`).catch(()=>({}));
  const olds = rev[newWardCode] || [];
  if (olds.length===0){
    $revResults.innerHTML = '<div class="muted">Chưa có dữ liệu ánh xạ ngược cho đơn vị này.</div>';
    return;
  }
  $revResults.innerHTML = olds.map(o=>{
    return `
      <div class="result">
        <div><strong>Đơn vị cũ:</strong> ${o.oldName} (key: ${o.oldKey})</div>
        <div class="muted">Huyện/TX/Quận cũ: ${o.oldDistrictKey} • Mã tỉnh cũ: ${o.oldProvinceCode}</div>
      </div>
    `
  }).join('');
}

loadProvincesNew();
$newProv.addEventListener('change', (e)=> loadNewWards(e.target.value));
$newWard.addEventListener('change', (e)=> showReverse(e.target.value));


