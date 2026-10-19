const assert = require('assert');
const { chooseStory } = require('../noir-story');

const files = [{ id: 'a', name: 'a.mp4' }, { id: 'b', name: 'b.mp4' }, { id: 'c', name: 'c.mp4' }];
const first = chooseStory(files, '2026-10-19', 'morning');
assert.ok(files.some((f) => f.id === first.file.id));
assert.equal(first.includeLink, false);
assert.equal(chooseStory(files, '2026-10-19', 'night').includeLink, true);
assert.notEqual(chooseStory(files, '2026-10-19', 'afternoon', first.file.id).file.id, first.file.id);
assert.throws(() => chooseStory([], '2026-10-19', 'morning'), /No MP4/);
console.log('noir story selection tests passed');
