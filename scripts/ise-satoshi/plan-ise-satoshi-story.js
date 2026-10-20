const fs = require('fs');

function jstParts(now = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}

function hash(value) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
  return result;
}

function plan(now = new Date(), manual = false, manualSlot = 0) {
  const { date, hour, minute } = jstParts(now);
  const slots = [0, 1, 2].map(index => {
    const tick = hash(`${date}:${index}`) % 16;
    return { index, hour: 9 + index * 4 + Math.floor(tick / 4), minute: (tick % 4) * 15 };
  });
  const due = slots.find(slot => slot.hour === hour && Math.floor(minute / 15) === slot.minute / 15);
  if (manual && ![0, 1, 2].includes(manualSlot)) throw new Error('Manual slot must be 0, 1 or 2');
  const slot = manual ? { index: manualSlot } : due;
  return { date, slots, shouldPost: Boolean(slot), slot: slot?.index ?? -1 };
}

if (require.main === module) {
  const result = plan(new Date(), process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', Number(process.env.MANUAL_SLOT || 0));
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `should_post=${result.shouldPost}\nslot=${result.slot}\n`);
}

module.exports = { plan };
