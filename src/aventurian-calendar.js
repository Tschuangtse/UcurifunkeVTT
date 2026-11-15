export const MONTHS = ["Praios", "Rondra", "Efferd", "Travia", "Boron", "Hesinde", "Firun", "Tsa", "Phex", "Peraine", "Ingerimm", "Rahja", "Namenlose Tage"];
export const WEEKDAYS = {
  aventurian: ["Windstag", "Erdstag", "Markttag", "Praiostag", "Rohalstag", "Feuertag", "Wassertag"],
  earthly: ["Donnerstag", "Freitag", "Samstag", "Sonntag", "Montag", "Dienstag", "Mittwoch"]
};
export const ERAS = { BF: 0, Hal: 993 };
export const daysInMonth = month => month === 12 ? 5 : 30;
// 1 Praios 1027 BF was an Erdstag.
export const weekday = ({ year, month, day }) => ((year - 1027 + month * 30 + day) % 7 + 7) % 7;
export const dateKey = ({ year, month, day }) => [year, month, day].join(":");
export const eraYear = (year, era) => year - (ERAS[era] ?? 0);
export const validDate = ({ year, month, day }) => Number.isSafeInteger(year) && Math.abs(year) <= 99999
  && Number.isInteger(month) && month >= 0 && month < MONTHS.length
  && Number.isInteger(day) && day >= 1 && day <= daysInMonth(month);
export const monthShift = ({ year, month }, step) => {
  const index = year * MONTHS.length + month + step;
  const nextYear = Math.floor(index / MONTHS.length);
  const nextMonth = index - nextYear * MONTHS.length;
  return { year: nextYear, month: nextMonth, day: 1 };
};
const fixedHolidays = {
  "0:1": ["Sommersonnenwende"], "0:10": ["Gedenktag der Ogerschlacht"],
  "1:5": ["Tag des Schwurs"], "3:12": ["Tag der Treue"],
  "4:2": ["Kastenfest (Garetien)"], "5:30": ["Ifirnslichterfest (Bornland und Festenland)"],
  "6:1": ["Wintersonnenwende", "Tag der Jagd"], "6:30": ["Tag der Ifirn"],
  "7:30": ["Ifirnstag (Riva und Angbar)"], "8:18": ["Basiliskentag"],
  "9:4": ["Tag der Heiligen Thalionmel"], "10:7": ["Tag der Abschwörung (Xorlosch)"],
  "11:7": ["Mohafest (Angbar)"]
};
export function holidays({ month, day }) {
  if (month === 12) return ["Namenlose Tage"];
  if (month === 2 && day <= 3) return ["Bunte Lichter von Perricum"];
  if (month === 3 && day <= 3) return ["Fest der eingebrachten Früchte"];
  return fixedHolidays[month + ":" + day] ?? [];
}
