// App 名稱與版本集中在這裡。
// 改名時：這裡、index.html 的 <title> 與 apple-mobile-web-app-title、manifest.webmanifest 的 name/short_name 一起改。
// 改版時：這裡的 VERSION 與 sw.js 的 VERSION 一起改，手機才會偵測到新版本。
export const APP_NAME = '熱量日誌';
export const VERSION = '1.1.0';

export const BACKUP_REMIND_DAYS = 7;
export const KCAL_PER_KG = 7700; // 每公斤體重約等於 7,700 大卡
export const BODYFAT_MAX_AGE_DAYS = 90; // 體脂資料超過這麼久就不拿來算基礎代謝
