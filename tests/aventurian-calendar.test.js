import assert from "node:assert/strict";
import { test } from "node:test";
import { eraYear, holidays, monthShift, validDate, weekday } from "../src/aventurian-calendar.js";

test("the calendar follows the five nameless days and its historical weekday anchor", () => {
  assert.equal(weekday({ year: 1027, month: 0, day: 1 }), 1);
  assert.equal(weekday({ year: 1027, month: 1, day: 1 }), 3);
  assert.equal(validDate({ year: 1027, month: 12, day: 6 }), false);
  assert.deepEqual(monthShift({ year: 1027, month: 12 }, 1), { year: 1028, month: 0, day: 1 });
  assert.equal(eraYear(1027, "Hal"), 34);
  assert.deepEqual(holidays({ month: 2, day: 3 }), ["Bunte Lichter von Perricum"]);
  assert.deepEqual(holidays({ month: 2, day: 4 }), []);
});
