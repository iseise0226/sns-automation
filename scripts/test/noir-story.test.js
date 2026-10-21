const assert = require('assert');
const {
  chooseStory,
  dueStorySlots,
  storyDailySchedule,
  storySlotsFromTimestamps,
  validateInstagramProfile,
  wrapCaption,
} = require('../noir-story');

const files = [{ id: 'a', name: 'a.mp4' }, { id: 'b', name: 'b.mp4' }, { id: 'c', name: 'c.mp4' }];
const first = chooseStory(files, '2026-10-19', 'morning');
assert.ok(files.some((f) => f.id === first.file.id));
assert.equal(first.includeLink, false);
assert.equal(chooseStory(files, '2026-10-19', 'night').includeLink, false);
assert.notEqual(chooseStory(files, '2026-10-19', 'afternoon', first.file.id).file.id, first.file.id);
assert.throws(() => chooseStory([], '2026-10-19', 'morning'), /No MP4/);

const wrapped = wrapCaption('言葉にできない気持ちも、ちゃんとここに置いていける。');
const lines = wrapped.split('\n');
assert.equal(lines.length, 3);
assert.ok(lines.every((line) => line.length <= 10));
assert.equal(lines.join(''), '言葉にできない気持ちも、ちゃんとここに置いていける。');

// Scheduled runs can start late; every overdue, unposted slot remains due.
const storySchedule = { morning: 10 * 60, afternoon: 15 * 60 + 30, night: 20 * 60 };
assert.deepEqual(dueStorySlots(storySchedule, 12 * 60 + 12, []), ['morning']);
assert.deepEqual(dueStorySlots(storySchedule, 18 * 60, ['morning']), ['afternoon']);
assert.deepEqual(dueStorySlots(storySchedule, 21 * 60, ['morning', 'afternoon']), ['night']);
assert.deepEqual(dueStorySlots(storySchedule, 9 * 60 + 30, []), []);

const generatedSchedule = storyDailySchedule('2026-10-21');
assert.ok(generatedSchedule.morning >= 9 * 60 && generatedSchedule.morning <= 11 * 60);
assert.ok(generatedSchedule.afternoon >= 14 * 60 && generatedSchedule.afternoon <= 16 * 60);
assert.ok(generatedSchedule.night >= 19 * 60 && generatedSchedule.night <= 21 * 60);
assert.deepEqual(storyDailySchedule('2026-10-21'), generatedSchedule);

assert.deepEqual(storySlotsFromTimestamps([
  { timestamp: '2026-10-21T01:15:00Z' },
  { timestamp: '2026-10-21T06:10:00Z' },
  { timestamp: '2026-10-21T11:30:00Z' },
], '2026-10-21'), ['morning', 'afternoon', 'night']);
assert.deepEqual(storySlotsFromTimestamps([
  { timestamp: '2026-10-20T11:30:00Z' },
], '2026-10-21'), []);
assert.deepEqual(
  validateInstagramProfile({ id: '28221014890910736', username: 'seira_noir_ai' }),
  { id: '28221014890910736', username: 'seira_noir_ai' },
);
assert.throws(
  () => validateInstagramProfile({ id: '28221014890910736', username: 'another_account' }),
  /unexpected Instagram account/,
);
console.log('noir story selection tests passed');
