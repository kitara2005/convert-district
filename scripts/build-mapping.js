#!/usr/bin/env node
/*
Builds mapping from old wards to new administrative units using rawApiData.json and old catalog.
Outputs per province code: dist/data/mapping-<provinceCode>.json
*/
const fs = require('fs');
const path = require('path');
const { ensureDirSync, normalizeVietnamese, stripAdminPrefix, normalizeProvinceName, stripDistrictPrefix } = require('./utils');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = ROOT;
const INPUT_API = path.resolve(WORKSPACE, 'rawApiData.json');
const INPUT_OLD_PROVINCES = path.resolve(WORKSPACE, 'web/data/provincesOld.json');
const INPUT_PROVINCE_MERGE = path.resolve(WORKSPACE, 'rawProvinceData.json');
const OUT_DIR = path.resolve(WORKSPACE, 'web/data');
const INPUT_OVERRIDES = path.resolve(WORKSPACE, 'scripts/overrides.json');

function parseSources(text) {
  if (!text) return [];
  const cleaned = String(text)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // split by commas
  const parts = cleaned.split(/,\s*/);
  const results = [];
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    const isPartial = /phần còn lại/i.test(p);
    // capture type prefix and optional parent context in parentheses
    // examples:
    //   "Phường 4 (thành phố Vĩnh Long)" => type=phuong, name="4", parent="thanh pho vinh long"
    //   "Xã Phước Hậu" => type=xa, name="Phước Hậu"
    let type = null;
    let remainder = p;
    const typeMatch = p.match(/^(Phường|Xã|Thị trấn)\s+(.+)$/i);
    if (typeMatch) {
      type = normalizeVietnamese(typeMatch[1]);
      remainder = typeMatch[2];
    }
    let parentDistrictName = null;
    let name = remainder;
    const paren = remainder.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (paren) {
      name = paren[1];
      parentDistrictName = paren[2];
    }
    results.push({ raw: p, name, type, parentDistrictName, isPartial });
  }
  return results;
}

function loadOldIndex(provinceCode) {
  const districts = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, `districtsOld-${provinceCode}.json`), 'utf8')
  );
  const wards = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, `wardsOld-${provinceCode}.json`), 'utf8')
  );
  // Build fast lookup by nameKey within each district and province
  const wardsByName = new Map(); // key: nameKey -> array of ward objects
  for (const w of wards) {
    const key = stripAdminPrefix(w.name);
    const list = wardsByName.get(key) || [];
    list.push(w);
    wardsByName.set(key, list);
  }
  const districtNameKeyToKeys = new Map(); // nameKey -> array of districtKey
  for (const d of districts) {
    const list = districtNameKeyToKeys.get(d.nameKey) || [];
    list.push(d.key);
    districtNameKeyToKeys.set(d.nameKey, list);
  }
  return { districts, wards, wardsByName, districtNameKeyToKeys };
}

function main() {
  ensureDirSync(fs, OUT_DIR);
  const api = JSON.parse(fs.readFileSync(INPUT_API, 'utf8'));
  // Flatten rawApiData to row-level entries regardless of nesting shape
  const flatRows = [];
  (function collectRows(node){
    if (!node) return;
    if (Array.isArray(node)) { for (const it of node) collectRows(it); return; }
    if (typeof node === 'object') {
      const hasWard = (node.ma != null || node['2'] != null) && (node.tenhc != null || node['5'] != null);
      const hasProv = (node.tentinh != null || node['3'] != null || node.matinh != null || node['1'] != null);
      if (hasWard && hasProv) flatRows.push(node);
      for (const k of Object.keys(node)) collectRows(node[k]);
    }
  })(api);
  const excel = JSON.parse(fs.readFileSync(path.resolve(WORKSPACE, 'excelData.json'), 'utf8'));
  const excelRows = Array.isArray(excel?.data) ? excel.data : [];
  const excelIndexByProv = new Map(); // provCode -> Map(nameKey -> array of ward rows)
  for (const r of excelRows) {
    const prov = String(r['Mã TP'] || '').trim();
    const dist = String(r['Mã QH'] || '').trim();
    const ward = String(r['Mã PX'] || '').trim();
    const name = r['Phường Xã'];
    if (!prov || !dist || !ward || !name) continue;
    const nameKey = stripAdminPrefix(name);
    const map = excelIndexByProv.get(prov) || new Map();
    const arr = map.get(nameKey) || [];
    arr.push({ key: `${prov}-${dist}-${ward}`, code: ward, districtKey: `${prov}-${dist}`, name });
    map.set(nameKey, arr);
    excelIndexByProv.set(prov, map);
  }

  // Load old provinces to help resolve code mapping by name
  const oldProvinces = JSON.parse(fs.readFileSync(INPUT_OLD_PROVINCES, 'utf8'));
  const oldProvByNameKey = new Map(oldProvinces.map(p => [normalizeProvinceName(p.name), p]));
  const oldProvinceCodes = new Set(oldProvinces.map(p => String(p.code)));
  const oldProvNameByCode = new Map(oldProvinces.map(p => [String(p.code), p.name]));

  // Build province merge maps from rawProvinceData
  // - map old province nameKey -> { code: newCode, name: newName }
  // - map new province nameKey   -> [oldProvinceCodes...] (including itself)
  const provinceMergeRaw = JSON.parse(fs.readFileSync(INPUT_PROVINCE_MERGE, 'utf8'));
  const newProvByNameKey = new Map(); // newNameKey -> {code,name}
  const oldNameKeyToNew = new Map(); // oldNameKey -> {code,name}
  const newToOldCodes = new Map();   // newNameKey -> Set(oldCodes)
  const provMetaByCode = new Map();  // newCode -> {dientichkm2, dansonguoi, trungtamhc, con}
  const newWardsByProv = new Map();  // newCode -> Map(wardCode -> unit)
  const newSourcesByProv = new Map(); // newCode -> Map(wardCode -> truocsapnhap)
  for (const pr of provinceMergeRaw) {
    const newName = pr.tentinh;
    const newCode = String(pr.mahc);
    const newKey = normalizeProvinceName(newName);
    newProvByNameKey.set(newKey, { code: newCode, name: newName });
    provMetaByCode.set(newCode, {
      dientichkm2: pr.dientichkm2,
      dansonguoi: pr.dansonguoi,
      trungtamhc: pr.trungtamhc,
      con: pr.con,
    });
    // Default: include itself
    const set = newToOldCodes.get(newKey) || new Set();
    const selfOld = oldProvByNameKey.get(newKey);
    if (selfOld) set.add(String(selfOld.code));
    // Parse "truocsapnhap" for old province names
    const t = pr.truocsapnhap || '';
    // Split by comma or 'và/and'; also handle cases like 'TPHCM'
    const parts = String(t)
      .replace(/\s+và\s+/g, ',')
      .replace(/\s+and\s+/gi, ',')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      // items look like: "tỉnh Bà Rịa - Vũng Tàu", "thành phố Hồ Chí Minh", or "TPHCM"
      const cleaned = p.replace(/^tinh\s+|^thanh pho\s+|^thu do\s+/i, '');
      const oldKey = normalizeProvinceName(cleaned);
      if (!oldKey) continue;
      oldNameKeyToNew.set(oldKey, { code: newCode, name: newName });
      const oldProv = oldProvByNameKey.get(oldKey);
      if (oldProv) set.add(String(oldProv.code));
    }
    newToOldCodes.set(newKey, set);
  }

  // Build set of old province codes that are merged into some new province
  const oldMergedCodes = new Set();
  for (const p of oldProvinces) {
    const k = normalizeProvinceName(p.name);
    if (oldNameKeyToNew.has(k)) oldMergedCodes.add(String(p.code));
  }

  // Build per-record and write outputs grouped by OLD province code inferred by name
  const outByOldProvince = new Map(); // code -> Map(oldWardKey -> bestTarget)
  const revByNewProvince = new Map(); // newProvCode -> Map(newWardCode -> array of old refs)
  const oldIndexCache = new Map();
  function getOldIndex(code) {
    if (!oldIndexCache.has(code)) oldIndexCache.set(code, loadOldIndex(code));
    return oldIndexCache.get(code);
  }

  function getOutMap(oldProvCode) {
    const m = outByOldProvince.get(oldProvCode) || new Map();
    if (!outByOldProvince.has(oldProvCode)) outByOldProvince.set(oldProvCode, m);
    return m;
  }

  function getRevMap(newProvCode) {
    const m = revByNewProvince.get(newProvCode) || new Map();
    if (!revByNewProvince.has(newProvCode)) revByNewProvince.set(newProvCode, m);
    return m;
  }

  // Build flat index of rawApiData rows to recover truocsapnhap when missing on aggregated "unit" entries
  const flatByProvWardCode = new Map(); // key: `${matinh}|${ma}` -> rec
  const flatByNameType = new Map();     // key: `${provKey}|${normalize(loai)}|${nameKey}` -> rec
  for (const r of flatRows) {
    const matinh = r.matinh != null ? String(r.matinh) : null;
    const ma = r.ma != null ? String(r.ma) : null;
    const provKey = normalizeProvinceName(r.tentinh || r.province?.name || '');
    const loai = r.loai ? normalizeVietnamese(r.loai) : '';
    const nameKey = stripAdminPrefix(r.tenhc || '');
    if (matinh && ma) flatByProvWardCode.set(`${matinh}|${ma}`, r);
    if (provKey && loai && nameKey) flatByNameType.set(`${provKey}|${loai}|${nameKey}`, r);
  }

  for (const rec of flatRows) {
    // Treat each row as a new unit (flat rawApiData row)
    const provName = rec.tentinh || rec['3'];
    const newNameKey = normalizeProvinceName(provName || '');
    // New province info from province merges (authoritative)
    const newProvInfo = newProvByNameKey.get(newNameKey) || { code: String(rec.matinh || rec['1']), name: provName };
    // Set of old province codes that merged into this new province (including itself)
    const allowedOldCodes = Array.from(newToOldCodes.get(newNameKey) || []);
    if (allowedOldCodes.length === 0) {
      const fallbackOld = oldProvByNameKey.get(newNameKey);
      if (fallbackOld) allowedOldCodes.push(String(fallbackOld.code));
    }
    const oldIndexes = allowedOldCodes.map(code => ({ code, idx: (()=>{ try {return getOldIndex(code);} catch {return null;} })() })).filter(x => x.idx);
    if (oldIndexes.length === 0) continue;

    const unit = rec;
    const loai = unit.loai || unit['4'];
    const tenhc = unit.tenhc || unit['5'];
    const maNew = unit.ma || unit['2'];
    let truoc = unit.truocsapnhap || unit['12'];
    if (!maNew || !tenhc || !loai) continue;
    if (!truoc) {
      // Try recover from flat index by (matinh|ma), fallback by (prov|loai|name)
      const viaCode = flatByProvWardCode.get(`${String(newProvInfo.code)}|${String(maNew)}`);
      if (viaCode && viaCode.truocsapnhap) truoc = viaCode.truocsapnhap;
      if (!truoc) {
        const key = `${normalizeProvinceName(newProvInfo.name)}|${normalizeVietnamese(loai||'')}|${stripAdminPrefix(tenhc||'')}`;
        const viaName = flatByNameType.get(key);
        if (viaName && viaName.truocsapnhap) truoc = viaName.truocsapnhap;
      }
    }
    if (!truoc) continue;

      const sources = parseSources(truoc);
    // Track what old ward keys have already been assigned within this unit
    const assignedInThisUnit = new Set();
      const target = {
        provinceNew: { code: String(newProvInfo.code), name: newProvInfo.name },
        provinceStats: provMetaByCode.get(String(newProvInfo.code)) || null,
        wardNew: { code: maNew, type: loai, name: tenhc },
        wardStats: {
          dientichkm2: unit.dientichkm2 ?? null,
          dansonguoi: unit.dansonguoi ?? null,
          trungtamhc: unit.trungtamhc ?? null,
        },
        note: ''
      };

    // Collect catalog of new wards per province
    const col = newWardsByProv.get(String(newProvInfo.code)) || new Map();
    if (!col.has(maNew)) {
      let districtCode = null;
      if (typeof unit.cay === 'string') {
        const parts = unit.cay.split('.');
        districtCode = parts.length >= 1 ? parts[0] : null;
      }
      col.set(maNew, { code: maNew, type: loai, name: tenhc, districtCode });
      newWardsByProv.set(String(newProvInfo.code), col);
      // record source string for fallback
      const srcMap = newSourcesByProv.get(String(newProvInfo.code)) || new Map();
      if (truoc) srcMap.set(maNew, String(truoc));
      newSourcesByProv.set(String(newProvInfo.code), srcMap);
    }

    for (const s of sources) {
        const keyName = stripAdminPrefix(s.name);
      for (const { code: oc, idx } of oldIndexes) {
          let candidates = idx.wardsByName.get(keyName) || [];
          let parentMatched = false;
          if (s.parentDistrictName) {
            const parentKey = normalizeVietnamese(s.parentDistrictName);
            const districtKeys = idx.districtNameKeyToKeys.get(parentKey) || [];
            if (districtKeys.length === 0) {
              candidates = [];
            } else {
              const districtKeySet = new Set(districtKeys);
              const filtered = candidates.filter(w => districtKeySet.has(w.districtKey));
              if (filtered.length > 0) { candidates = filtered; parentMatched = true; } else { candidates = []; }
            }
          }
          // If this is a partial entry like "phần còn lại (huyện X)", expand to all wards in that parent district
          if (candidates.length === 0 && s.isPartial && s.parentDistrictName) {
            const parentKey = normalizeVietnamese(s.parentDistrictName);
            const districtKeys = idx.districtNameKeyToKeys.get(parentKey) || [];
            if (districtKeys.length > 0) {
              const districtKeySet = new Set(districtKeys);
              candidates = idx.wards.filter(w => districtKeySet.has(w.districtKey));
              parentMatched = true;
            }
          }
          if (candidates.length === 0) {
            // Không dùng fallback theo tỉnh cũ để trả kết quả.
            // Nhưng có thể dùng excel để khám phá khóa cũ (discover), vẫn bị ràng buộc theo tỉnh đích (oc in allowedOldCodes)
            const fb = excelIndexByProv.get(String(oc))?.get(keyName) || [];
            candidates = fb;
          }
        if (candidates.length === 0) continue;
        for (const oldWard of candidates) {
            if (assignedInThisUnit.has(oldWard.key)) continue;
            const outMap = getOutMap(String(oc));
            const prev = outMap.get(oldWard.key);
            const oldType = normalizeVietnamese(String(oldWard.name || '')).split(' ')[0];
            const newType = normalizeVietnamese(String(loai || ''));
            const typeMatch = (oldType === 'phuong' && newType === 'phuong') || (oldType === 'xa' && newType === 'xa');
            const score = (parentMatched ? 2 : 0) + (s.isPartial ? 0 : 1) + (typeMatch ? 1 : 0);
            const cand = { ...target, note: s.isPartial ? 'phần còn lại' : '', _score: score, _parent: parentMatched };
            if (!prev) { outMap.set(oldWard.key, cand); continue; }
            const prevScore = typeof prev._score === 'number' ? prev._score : ((prev.note ? 0 : 1));
            if (score > prevScore) outMap.set(oldWard.key, cand);

            // Build reverse index new -> old
            const rev = getRevMap(String(newProvInfo.code));
            const list = rev.get(maNew) || [];
            // resolve district name from current index
            let oldDistrictName = null;
            const drec = idx.districts.find(d => d.key === oldWard.districtKey);
            if (drec) oldDistrictName = drec.name;
            const oldProvinceName = oldProvNameByCode.get(String(oc)) || '';
            const oldWardType = oldType === 'phuong' ? 'phường' : (oldType === 'xa' ? 'xã' : null);
            list.push({
              oldKey: oldWard.key,
              oldWardCode: oldWard.code,
              oldWardType,
              oldName: oldWard.name,
              oldDistrictKey: oldWard.districtKey,
              oldDistrictName,
              oldProvinceCode: String(oc),
              oldProvinceName,
              note: s.isPartial ? 'phần còn lại' : ''
            });
          rev.set(maNew, list);
          assignedInThisUnit.add(oldWard.key);
        }
      }
    }
  }

  // Post-process: ensure reverse entries exist for all new wards using excel-only fallback if needed
  for (const [newProvCode, wardsMap] of newWardsByProv.entries()) {
    const rev = getRevMap(String(newProvCode));
    // allowed old province codes for this new province
    const newName = (Array.from(newProvByNameKey.values()).find(v => String(v.code) === String(newProvCode)) || {}).name || '';
    const newKey = normalizeProvinceName(newName);
    const allowedOldCodes = Array.from(newToOldCodes.get(newKey) || []);
    for (const [wardCode, w] of wardsMap.entries()) {
      if (rev.has(wardCode)) continue;
      const rec = flatByProvWardCode.get(`${String(newProvCode)}|${String(wardCode)}`);
      const truoc = rec?.truocsapnhap || rec?.['12'];
      if (!truoc) continue;
      const sources = parseSources(truoc);
      const list = [];
      for (const oc of allowedOldCodes) {
        const excelMap = excelIndexByProv.get(String(oc));
        if (!excelMap) continue;
        for (const s of sources) {
          const keyName = stripAdminPrefix(s.name);
          const arr = excelMap.get(keyName) || [];
          for (const oldWard of arr) {
            // resolve names
            let oldDistrictName = null;
            try {
              const idx = getOldIndex(String(oc));
              const drec = idx.districts.find(d => d.key === oldWard.districtKey);
              if (drec) oldDistrictName = drec.name;
            } catch {}
            const oldProvinceName = oldProvNameByCode.get(String(oc)) || '';
            list.push({
              oldKey: oldWard.key,
              oldWardCode: oldWard.code,
              oldWardType: null,
              oldName: oldWard.name,
              oldDistrictKey: oldWard.districtKey,
              oldDistrictName,
              oldProvinceCode: String(oc),
              oldProvinceName,
              note: s.isPartial ? 'phần còn lại' : ''
            });
          }
        }
      }
      if (list.length > 0) rev.set(wardCode, list);
    }
  }

  // Write out grouped results
  for (const [oldProvCode, map] of outByOldProvince.entries()) {
    const out = {};
    for (const [oldKey, best] of map.entries()) out[oldKey] = [best];
    const outFile = path.join(OUT_DIR, `mapping-${oldProvCode}.json`);
    fs.writeFileSync(outFile, JSON.stringify(out));
    console.log('Built mapping for province', oldProvCode, '→', outFile);

    // Fill identity for missing keys within this province to avoid gaps
    try {
      const oldIndex = getOldIndex(String(oldProvCode));
      let current = {};
      try { current = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
      const oldProv = oldProvinces.find(p => String(p.code) === String(oldProvCode));
      const oldProvNameKey = oldProv ? normalizeProvinceName(oldProv.name) : '';
      const mergedProv = oldNameKeyToNew.get(oldProvNameKey) || { code: String(oldProvCode), name: oldProv?.name || '' };
      for (const w of oldIndex.wards) {
        if (current[w.key]) continue;
        const original = w.name || '';
        const lower = original.toLowerCase();
        let type = 'xã';
        if (lower.startsWith('phường')) type = 'phường';
        else if (lower.startsWith('xã')) type = 'xã';
        else if (lower.startsWith('thị trấn')) type = 'thị trấn';
        const cleanName = original.replace(/^(Phường|Xã|Thị trấn)\s+/i, '').trim();
        current[w.key] = [{
          provinceNew: { code: String(mergedProv.code), name: mergedProv.name },
          wardNew: { code: w.code, type, name: cleanName },
          note: ''
        }];
      }
      fs.writeFileSync(outFile, JSON.stringify(current));
      console.log('Backfilled identity for missing keys in province', oldProvCode);
    } catch {}
  }

  // Serialize reverse mappings per NEW province
  for (const [newCode, m] of revByNewProvince.entries()) {
    const out = {};
    for (const [k, arr] of m.entries()) out[k] = arr;
    const outFile = path.join(OUT_DIR, `rev-${newCode}.json`);
    fs.writeFileSync(outFile, JSON.stringify(out));
    console.log('Built reverse mapping for new province', newCode, '→', outFile);
  }

  // Serialize new wards catalogs per NEW province and provinces list
  const provincesNew = [];
  for (const [newKey, info] of newProvByNameKey.entries()) {
    provincesNew.push({ code: String(info.code), name: info.name });
  }
  provincesNew.sort((a,b)=>a.code.localeCompare(b.code));
  fs.writeFileSync(path.join(OUT_DIR, 'provincesNew.json'), JSON.stringify(provincesNew));

  for (const [newCode, col] of newWardsByProv.entries()) {
    const list = Array.from(col.values()).sort((a,b)=>a.name.localeCompare(b.name, 'vi'));
    fs.writeFileSync(path.join(OUT_DIR, `new-wards-${newCode}.json`), JSON.stringify(list));
  }

  // Serialize sources per NEW province for client fallback
  for (const [newCode, srcMap] of newSourcesByProv.entries()) {
    const obj = {};
    for (const [k, v] of srcMap.entries()) obj[k] = v;
    fs.writeFileSync(path.join(OUT_DIR, `new-sources-${newCode}.json`), JSON.stringify(obj));
  }

  // Serialize new->old provinces mapping for client fallback
  const newToOldOut = {};
  for (const [newKey, info] of newProvByNameKey.entries()) {
    const olds = Array.from(newToOldCodes.get(newKey) || []);
    newToOldOut[String(info.code)] = olds;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'new-to-old-provs.json'), JSON.stringify(newToOldOut));

  // Build global indices for client-side old province inference
  const districtIndex = {}; // nameKey -> [{provinceCode, districtKey, name}]
  const wardIndex = {};     // nameKey -> [{provinceCode, wardKey, districtKey, name}]
  for (const p of oldProvinces) {
    const provCode = String(p.code);
    let idx;
    try { idx = loadOldIndex(provCode); } catch { continue; }
    for (const d of idx.districts) {
      const arr = districtIndex[d.nameKey] || [];
      arr.push({ provinceCode: provCode, districtKey: d.key, name: d.name });
      districtIndex[d.nameKey] = arr;
    }
    for (const w of idx.wards) {
      const arr = wardIndex[w.nameKey] || [];
      arr.push({ provinceCode: provCode, wardKey: w.key, districtKey: w.districtKey, name: w.name });
      wardIndex[w.nameKey] = arr;
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'district-index.json'), JSON.stringify(districtIndex));
  fs.writeFileSync(path.join(OUT_DIR, 'ward-index.json'), JSON.stringify(wardIndex));

  // Overrides disabled per user request (manual list kept for reference but not applied)

  // Ensure empty mapping files exist for provinces without mapping
  for (const code of oldProvinceCodes) {
    const outFile = path.join(OUT_DIR, `mapping-${code}.json`);
    if (!fs.existsSync(outFile)) {
      fs.writeFileSync(outFile, JSON.stringify({}));
      console.log('Created empty mapping for province', code, '→', outFile);
    }
  }

  // Identity backfill: ensure every old ward has at least one mapping (itself) without overwriting existing ones
  for (const code of oldProvinceCodes) {
    const outFile = path.join(OUT_DIR, `mapping-${code}.json`);
    let current = {};
    try { current = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
    // load old index and province name
    let oldIndex;
    try { oldIndex = loadOldIndex(code); } catch { continue; }
    const oldProv = oldProvinces.find(p => String(p.code) === String(code));
    const oldProvNameKey = oldProv ? normalizeProvinceName(oldProv.name) : '';
    const mergedProv = oldNameKeyToNew.get(oldProvNameKey) || { code: String(code), name: oldProv?.name || '' };
    if (!oldProv) continue;
    let changed = false;
    for (const w of oldIndex.wards) {
      if (current[w.key]) continue;
      const original = w.name || '';
      const lower = original.toLowerCase();
      let type = 'xã';
      if (lower.startsWith('phường')) type = 'phường';
      else if (lower.startsWith('xã')) type = 'xã';
      else if (lower.startsWith('thị trấn')) type = 'thị trấn';
      const cleanName = original.replace(/^(Phường|Xã|Thị trấn)\s+/i, '').trim();
      current[w.key] = [{
        provinceNew: { code: String(mergedProv.code), name: mergedProv.name },
        wardNew: { code: w.code, type, name: cleanName },
        note: ''
      }];
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(outFile, JSON.stringify(current));
      console.log('Ensured identity mappings for province', code);
    }
  }
}

if (require.main === module) {
  main();
}


