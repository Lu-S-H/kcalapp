// 運動的 MET 值（參考 Compendium of Physical Activities）。
// 消耗熱量 = MET × 體重(kg) × 時間(小時)。只當作日誌，不加進每日消耗。
export const EXERCISE_GROUPS = [
  {
    name: '重量訓練',
    items: [
      { id: 'weights', name: '重訓（一般）', met: 3.5 },
      { id: 'weights-hard', name: '重訓（高強度）', met: 6.0 },
      { id: 'calisthenics', name: '徒手／核心訓練', met: 3.8 },
      { id: 'hiit', name: '循環訓練／HIIT', met: 8.0 },
    ],
  },
  {
    name: '有氧',
    items: [
      { id: 'walk', name: '快走', met: 4.3 },
      { id: 'jog', name: '慢跑（時速 8 公里）', met: 8.3 },
      { id: 'run', name: '跑步（時速 10 公里）', met: 9.8 },
      { id: 'run-fast', name: '快跑（時速 12 公里）', met: 11.8 },
      { id: 'bike-easy', name: '騎腳踏車（休閒）', met: 4.0 },
      { id: 'bike', name: '騎腳踏車（一般）', met: 7.5 },
      { id: 'spin', name: '飛輪', met: 8.5 },
      { id: 'elliptical', name: '橢圓機', met: 5.0 },
      { id: 'rower', name: '划船機', met: 7.0 },
      { id: 'stairs', name: '登階機／爬樓梯', met: 9.0 },
      { id: 'swim-easy', name: '游泳（輕鬆）', met: 6.0 },
      { id: 'swim-fast', name: '游泳（快速）', met: 9.8 },
      { id: 'rope', name: '跳繩', met: 11.8 },
      { id: 'hike', name: '健行／爬山', met: 6.0 },
      { id: 'aerobics', name: '有氧舞蹈', met: 7.3 },
    ],
  },
  {
    name: '球類',
    items: [
      { id: 'badminton', name: '羽球', met: 5.5 },
      { id: 'basketball', name: '籃球', met: 6.5 },
      { id: 'tabletennis', name: '桌球', met: 4.0 },
      { id: 'tennis', name: '網球', met: 7.3 },
      { id: 'volleyball', name: '排球', met: 4.0 },
      { id: 'soccer', name: '足球', met: 7.0 },
    ],
  },
  {
    name: '伸展',
    items: [
      { id: 'yoga', name: '瑜伽', met: 2.5 },
      { id: 'pilates', name: '皮拉提斯', met: 3.0 },
      { id: 'stretch', name: '伸展', met: 2.3 },
    ],
  },
  {
    name: '其他',
    items: [{ id: 'other', name: '其他（自己填熱量）', met: null }],
  },
];

const BY_ID = new Map(EXERCISE_GROUPS.flatMap((g) => g.items).map((it) => [it.id, it]));

export function exerciseType(id) {
  return BY_ID.get(id) || null;
}

export function estimateKcal(met, kg, minutes) {
  if (!met || !kg || !minutes) return null;
  return Math.round(met * kg * (minutes / 60));
}
