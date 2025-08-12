#!/usr/bin/env node
/*
Builds old administrative catalogs (provinces, districts, wards) from excelData.json.
Outputs:
  dist/data/provincesOld.json
  dist/data/districtsOld-<provinceCode>.json
  dist/data/wardsOld-<provinceCode>.json
*/
const fs = require('fs');
const path = require('path');
const { ensureDirSync, normalizeVietnamese } = require('./utils');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = ROOT;
const INPUT = path.resolve(WORKSPACE, 'excelData.json');
const OUT_DIR = path.resolve(WORKSPACE, 'web/data');

function main() {
  ensureDirSync(fs, OUT_DIR);
  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const rows = raw.data || [];

  const provinceMap = new Map();
  const districtsByProvince = new Map();
  const wardsByProvince = new Map();

  for (const r of rows) {
    const provinceName = r['Tỉnh Thành Phố'];
    const provinceCode = r['Mã TP'];
    const districtName = r['Quận Huyện'];
    const districtCode = r['Mã QH'];
    const wardName = r['Phường Xã'];
    const wardCode = r['Mã PX'];

    if (!provinceCode || !provinceName) continue;

    if (!provinceMap.has(provinceCode)) {
      provinceMap.set(provinceCode, {
        code: String(provinceCode),
        name: String(provinceName),
        nameKey: normalizeVietnamese(provinceName),
      });
    }

    if (districtCode && districtName) {
      const dList = districtsByProvince.get(provinceCode) || [];
      const key = `${provinceCode}-${districtCode}`;
      if (!dList.some((d) => d.key === key)) {
        dList.push({
          key,
          code: String(districtCode),
          provinceCode: String(provinceCode),
          name: String(districtName),
          nameKey: normalizeVietnamese(districtName),
        });
        districtsByProvince.set(provinceCode, dList);
      }
    }

    if (wardCode && wardName && districtCode) {
      const wList = wardsByProvince.get(provinceCode) || [];
      const districtKey = `${provinceCode}-${districtCode}`;
      const key = `${districtKey}-${wardCode}`;
      wList.push({
        key,
        code: String(wardCode),
        districtKey,
        name: String(wardName),
        nameKey: normalizeVietnamese(wardName),
      });
      wardsByProvince.set(provinceCode, wList);
    }
  }

  // Write provinces
  const provincesOld = Array.from(provinceMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  fs.writeFileSync(path.join(OUT_DIR, 'provincesOld.json'), JSON.stringify(provincesOld));

  // Write districts and wards per province
  for (const p of provincesOld) {
    const dList = (districtsByProvince.get(p.code) || []).sort((a, b) => a.code.localeCompare(b.code));
    const wList = (wardsByProvince.get(p.code) || []).sort((a, b) => a.code.localeCompare(b.code));
    fs.writeFileSync(path.join(OUT_DIR, `districtsOld-${p.code}.json`), JSON.stringify(dList));
    fs.writeFileSync(path.join(OUT_DIR, `wardsOld-${p.code}.json`), JSON.stringify(wList));
  }

  console.log('Old catalogs built to', OUT_DIR);
}

if (require.main === module) {
  main();
}


