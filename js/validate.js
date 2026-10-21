// 輸入檢查。errors = 不能儲存；warnings = 可能打錯，跳出提醒後仍可儲存。
import { fmt, fmt1 } from './util.js';

function result() {
  return { errors: {}, warnings: [], ok() { return Object.keys(this.errors).length === 0; } };
}

function required(r, field, v, label) {
  if (v == null) r.errors[field] = `請輸入${label}`;
  else if (Number.isNaN(v)) r.errors[field] = `${label}要是數字`;
  else if (v < 0) r.errors[field] = `${label}不能是負數`;
  else return true;
  return false;
}

function optional(r, field, v, label) {
  if (v == null) return false;
  return required(r, field, v, label);
}

export function checkWeight(kg, prevKg) {
  const r = result();
  if (required(r, 'kg', kg, '體重')) {
    if (kg === 0) r.errors.kg = '體重不能是 0';
    else if (kg < 30 || kg > 200) r.warnings.push(`體重 ${fmt(kg, 1)} kg 不太尋常，是不是多打或少打了一位數？`);
    else if (prevKg && Math.abs(kg - prevKg) > 3) {
      r.warnings.push(`和上一次（${fmt(prevKg, 1)} kg）差了 ${fmt(Math.abs(kg - prevKg), 1)} kg。`);
    }
  }
  return r;
}

export function checkGrams(g) {
  const r = result();
  if (required(r, 'grams', g, '份量')) {
    if (g === 0) r.errors.grams = '份量不能是 0';
    else if (g > 1500) r.warnings.push(`份量 ${fmt(g)} 克很多，確定嗎？`);
  }
  return r;
}

export function checkNutrients({ kcal, protein, carb }) {
  const r = result();
  const okK = required(r, 'kcal', kcal, '熱量');
  const okP = optional(r, 'protein', protein, '蛋白質');
  const okC = optional(r, 'carb', carb, '碳水');
  if (okK && kcal > 2000) r.warnings.push(`單筆 ${fmt(kcal)} 大卡很多，確定嗎？`);
  if (okP && protein > 150) r.warnings.push(`單筆蛋白質 ${fmt1(protein)} g 很多，確定嗎？`);
  if (okC && carb > 300) r.warnings.push(`單筆碳水 ${fmt1(carb)} g 很多，確定嗎？`);
  if (okK && kcal > 0) {
    const fromMacros = ((okP ? protein : 0) + (okC ? carb : 0)) * 4;
    if (fromMacros > kcal + 30) {
      r.warnings.push(`蛋白質和碳水換算的熱量（${fmt(fromMacros)} 大卡）比總熱量還高，可能有欄位填錯。`);
    }
  }
  return r;
}

export function checkExercise({ minutes, kcal }) {
  const r = result();
  if (required(r, 'minutes', minutes, '時間')) {
    if (minutes === 0) r.errors.minutes = '時間不能是 0';
    else if (minutes > 240) r.warnings.push(`運動 ${fmt(minutes)} 分鐘（超過 4 小時），確定嗎？`);
  }
  if (required(r, 'kcal', kcal, '消耗熱量') && kcal > 1500) {
    r.warnings.push(`消耗 ${fmt(kcal)} 大卡很多，確定嗎？`);
  }
  return r;
}

export function checkBodyComp({ bodyFatPct, muscleKg }, kg) {
  const r = result();
  const okF = optional(r, 'bodyFatPct', bodyFatPct, '體脂率');
  const okM = optional(r, 'muscleKg', muscleKg, '肌肉量');
  if (bodyFatPct == null && muscleKg == null) r.errors.bodyFatPct = '體脂率和肌肉量至少填一項';
  if (okF && (bodyFatPct < 3 || bodyFatPct > 60)) r.warnings.push(`體脂率 ${fmt(bodyFatPct, 1)}% 不太尋常。`);
  if (okM && (muscleKg < 10 || muscleKg > 90)) r.warnings.push(`肌肉量 ${fmt(muscleKg, 1)} kg 不太尋常。`);
  if (okM && kg && muscleKg >= kg) r.warnings.push(`肌肉量（${fmt(muscleKg, 1)} kg）比體重還重。`);
  return r;
}

export function checkProfile({ heightCm, age, futureBirth }) {
  const r = result();
  if (futureBirth) r.errors.birthDate = '生日不能在未來';
  else if (age == null) r.errors.birthDate = '請選擇生日';
  else if (age < 13 || age > 90) r.warnings.push(`年齡 ${age} 歲：這些公式主要適用於 13～90 歲。`);
  if (required(r, 'heightCm', heightCm, '身高') && (heightCm < 120 || heightCm > 220)) {
    r.warnings.push(`身高 ${fmt1(heightCm)} 公分不太尋常，是不是多打或少打了一位數？`);
  }
  return r;
}

export function checkTargets({ kcalOffset, proteinG, carbG, activityFactor }, kg) {
  const r = result();
  if (kcalOffset == null) r.errors.kcalOffset = '請輸入每日熱量增減';
  else if (Number.isNaN(kcalOffset)) r.errors.kcalOffset = '要是數字';
  else if (Math.abs(kcalOffset) > 1000) r.warnings.push(`每天 ${kcalOffset > 0 ? '+' : '−'}${fmt(Math.abs(kcalOffset))} 大卡的幅度很大，確定嗎？`);
  if (required(r, 'proteinG', proteinG, '蛋白質目標') && kg) {
    if (proteinG > kg * 4) r.warnings.push(`蛋白質 ${fmt(proteinG)} g 約是每公斤體重 ${fmt(proteinG / kg, 1)} g，偏高。`);
    if (proteinG < kg * 0.8) r.warnings.push(`蛋白質 ${fmt(proteinG)} g 約是每公斤體重 ${fmt(proteinG / kg, 1)} g，偏低。`);
  }
  if (required(r, 'carbG', carbG, '碳水目標') && carbG > 800) r.warnings.push(`碳水 ${fmt(carbG)} g 很多，確定嗎？`);
  if (activityFactor != null && (Number.isNaN(activityFactor) || activityFactor < 1 || activityFactor > 2.5)) {
    r.errors.activityFactor = '活動係數要在 1.0～2.5 之間';
  }
  return r;
}
