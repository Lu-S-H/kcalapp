// 衛福部食品營養成分資料庫（data/foods.json，由 tools/build_foods.py 產生）
let loading = null;
let foods = null;

const SYNONYMS = [
  ['臺', '台'],
  ['吐司', '土司'],
];

function norm(s) {
  let out = s.toLowerCase().trim();
  for (const [a, b] of SYNONYMS) out = out.split(a).join(b);
  return out;
}

export function loadFoods() {
  if (!loading) {
    loading = fetch('data/foods.json')
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data) => {
        foods = data.foods.map(([name, alias, kcal, protein, carb, unitGrams, cat]) => ({
          name,
          alias,
          per100: { kcal, protein, carb },
          unitGrams: unitGrams || null,
          cat: data.cats[cat],
          key: norm(name),
          aliasKey: norm(alias),
        }));
        return foods;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

export function foodsReady() {
  return foods != null;
}

/** 名稱完全相符 > 開頭相符 > 名稱包含 > 俗名包含；同分時「平均值」與較短的名稱優先 */
export function searchFoods(query, limit = 60) {
  if (!foods) return [];
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results = [];
  for (const f of foods) {
    let score = 0;
    let ok = true;
    for (const t of terms) {
      if (f.key === t) score += 0;
      else if (f.key.startsWith(t)) score += 1;
      else if (f.key.includes(t)) score += 2;
      else if (f.aliasKey.includes(t)) score += 3;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const avgBonus = f.name.includes('平均值') ? -0.5 : 0;
    results.push({ f, s: score + avgBonus + f.name.length / 100 });
  }
  results.sort((a, b) => a.s - b.s);
  return results.slice(0, limit).map((r) => r.f);
}

export function scale(per100, grams) {
  const k = grams / 100;
  return {
    kcal: Math.round(per100.kcal * k),
    protein: Math.round(per100.protein * k * 10) / 10,
    carb: Math.round(per100.carb * k * 10) / 10,
  };
}
