const assert = require('assert');
const {
  buildPostText,
  choosePost,
  dailySchedule,
  shouldRunAt,
  wasPostedToday,
} = require('../noir-threads');

const posts = ['朝の投稿', '昼の投稿', '夜の投稿', '予備の投稿'];
const schedule = dailySchedule('2026-10-20');

assert.ok(schedule.morning >= 9 * 60 && schedule.morning <= 11 * 60);
assert.ok(schedule.afternoon >= 14 * 60 && schedule.afternoon <= 16 * 60);
assert.ok(schedule.night >= 19 * 60 && schedule.night <= 21 * 60);
assert.equal(schedule.morning % 30, 0);
assert.equal(schedule.afternoon % 30, 0);
assert.equal(schedule.night % 30, 0);
assert.equal(shouldRunAt(schedule, schedule.afternoon), 'afternoon');
assert.equal(shouldRunAt(schedule, 12 * 60), null);

const morning = choosePost(posts, '2026-10-20', 'morning');
const afternoon = choosePost(posts, '2026-10-20', 'afternoon');
assert.notEqual(morning, afternoon);
assert.equal(choosePost(posts, '2026-10-20', 'morning'), morning);

assert.equal(buildPostText('本文', '2026-10-20', 'morning'), '本文');
assert.equal(buildPostText('本文', '2026-10-21', 'night'), '本文\n\n眠れない夜に、話せる場所はこちら\nhttps://noir-lounge.com/');
assert.equal(buildPostText('本文', '2026-10-22', 'night'), '本文');

const recent = [
  { text: '本文', timestamp: '2026-10-20T03:15:00+0000' },
  { text: '別の本文', timestamp: '2026-10-20T01:00:00+0000' },
];
assert.equal(wasPostedToday(recent, '本文', '2026-10-20'), true);
assert.equal(wasPostedToday(recent, '本文', '2026-10-21'), false);

console.log('noir Threads tests passed');
