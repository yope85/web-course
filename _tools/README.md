# _tools – בדיקות אוטומטיות של המדריך (לא חלק מהאתר)

התיקייה מתחילה בקו תחתון, ולכן GitHub Pages (Jekyll) **לא מפרסם אותה** באתר – היא רק שמורה במאגר.
הכלים בודקים את המדריך בדפדפן אמיתי (Playwright + Chromium) לפני כל פרסום.

## הכנה (בשיחה חדשה)
```
git clone https://github.com/yope85/web-course.git /home/claude/web-course
cp -r /home/claude/web-course/_tools /home/claude/tools && mkdir -p /home/claude/tools/look /home/claude/tools/dump
cd /home/claude/web-course && (python3 -m http.server 8812 >/dev/null 2>&1 &)   # השרת והבדיקה – באותה פקודה
NODE_PATH=$(npm root -g) node /home/claude/tools/sweep.js css razor
```

## הכלים
| כלי | מה הוא בודק |
|---|---|
| `sweep.js page…` | כל שלב × (1280 בהיר, 390 בהיר, 390 כהה): שגיאות Console, שגיאות דף, גלילה הצידה. `SHOTS=1` שומר צילומים |
| `links.js` | כל קישור פנימי (data-go, back, X.html#topic-N) מצביע לשלב שקיים |
| `dump.js page…` | הטקסט המלא של כל שלב (כולל חלקים מוסתרים) ל-dump/ – לקריאה ולבדיקת עובדות |
| `look.js page#topic-N[@w][!dark]` | צילום של אזור השלב |
| `elshot.js page#topic-N selector out.png [w] [js]` | צילום של רכיב אחד |
| `qitems.js` | רשימת שאלות הבוחן בכל דף |
| `eggtest.js` | מונה ביצים בכל דף, ביצת ה-404, סכום בדף הבית |
| `streak.js` | בועות הרצף (3/5/10/15/20) |
| `celtest.js`, `bidit.js` | חגיגות וכיוון טקסט |
| `sfxrender.js out.wav "ok*15,bad"` | מרנדר את הצלילים האמיתיים של המנוע ל-WAV ומודד בהירות |
| `stucktest.js` | כפתור "🤔 נתקעתי בשלב הזה": מה נשלח לטופס (עם כתובת בדיקה, לא הטופס האמיתי) |
