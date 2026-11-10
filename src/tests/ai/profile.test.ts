import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProfile } from '../../services/private/ai-profile.service';

const ultrasonic = {
  type: 'utrasonic_sensor',
  title: 'Ultrasonic Sensor',
  sections: [{ widgets: [{ type: 'dropdown', binding: 'port', options: [['[6,3]', 'Port 2'], ['[4,5]', 'Port 1']] as [string, string][] }] }]
};
const relay = { type: 'relay_module', sections: [{ widgets: [{ type: 'pin', binding: 'in1' }, { type: 'pin', binding: 'in2' }] }] };

test('a good proposal passes and keeps only known settings', () => {
  const { profile, errors } = checkProfile(ultrasonic, {
    is_hardware: true,
    part: { name: 'Ultrasonic sensor', art: 'ultrasonic', wirings: [{ kind: 'choice', binding: 'port', map: { '[4,5]': 'port1', '[6,3]': 'port2' } }] },
    in_kit: true,
    kit_name: 'Ultrasonic sensor',
    notes: 'distance is in cm; 0 means no echo.'
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(profile.part?.wirings[0].map, { '[4,5]': 'port1', '[6,3]': 'port2' });
  assert.equal(profile.inKit, true);
});

test('mistakes the AI could make come back as errors', () => {
  const { errors } = checkProfile(relay, {
    is_hardware: true,
    part: {
      name: 'Relay',
      art: 'toaster',
      wirings: [
        { kind: 'gpio', bindings: ['in1', 'in3'] },
        { kind: 'ports', binding: 'in1' },
        { kind: 'fixed', conn: 'port9' },
        { kind: 'wifi' }
      ]
    },
    in_kit: false,
    notes: ''
  });
  const all = errors.join('\n');
  assert.match(all, /art must be one of/);
  assert.match(all, /"in3" is not a setting/);
  assert.match(all, /has no ports set by an admin/);
  assert.match(all, /conn must be one of/);
  assert.match(all, /kind must be one of/);
});

test('a block that is not hardware has no part', () => {
  const { profile, errors } = checkProfile({ type: 'map_func' }, { is_hardware: false, in_kit: false, notes: 'Scales a number.' });
  assert.deepEqual(errors, []);
  assert.equal(profile.part, null);
  assert.equal(profile.notes, 'Scales a number.');
});
