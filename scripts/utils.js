const NON_WORD_REGEX = /[^a-z0-9\s]/g;

function normalizeVietnamese(input) {
  if (input == null) return '';
  let str = String(input)
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(NON_WORD_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // normalize common administrative prefixes to comparable tokens
  str = str
    .replace(/\bphuong\b/g, 'phuong')
    .replace(/\bxã\b/g, 'xa')
    .replace(/\bxa\b/g, 'xa')
    .replace(/\bthi tran\b/g, 'thi tran')
    .replace(/\bquan\b/g, 'quan')
    .replace(/\bhuyen\b/g, 'huyen')
    .replace(/\bthanh pho\b/g, 'thanh pho')
    .replace(/\btp\.?\b/g, 'thanh pho')
    .replace(/\btinh\b/g, 'tinh');
  return str;
}

function stripAdminPrefix(name) {
  if (!name) return '';
  const n = normalizeVietnamese(name);
  return n
    .replace(/^(phuong|xa|thi tran)\s+/, '')
    .replace(/^(quan|huyen|thi xa|thanh pho|thu do)\s+/, '')
    .trim();
}

function stripDistrictPrefix(name) {
  if (!name) return '';
  const n = normalizeVietnamese(name);
  return n.replace(/^(quan|huyen|thi xa|thanh pho|tp)\s+/, '').trim();
}

function normalizeProvinceName(name) {
  const n = normalizeVietnamese(name);
  let out = n.replace(/^(tinh|thanh pho|thu do)\s+/, '').trim();
  // Handle common aliases/abbreviations
  if (out === 'tphcm' || out === 'tp hcm' || out === 'tp ho chi minh' || out === 'ho chi minh city' || out === 'hcm') {
    out = 'ho chi minh';
  }
  return out;
}

function ensureDirSync(fs, path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }
}

module.exports = {
  normalizeVietnamese,
  stripAdminPrefix,
  stripDistrictPrefix,
  normalizeProvinceName,
  ensureDirSync,
};


