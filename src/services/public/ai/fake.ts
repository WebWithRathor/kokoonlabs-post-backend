import type { Program } from './program';

// Canned answers for development (AI_FAKE=true): the whole flow works
// without an API key or any cost. Never used in production.

const night: Program = {
  title: 'Night Light',
  explanation:
    'A light that switches itself on when the room gets dark.',
  howItWorks: [
    'The Forever Loop runs the blocks inside it again and again.',
    'The LDR Sensor block reads how bright the room is and saves it in light.',
    'The If / Else block checks light < 1500: when it is dark the LED block turns the light on, otherwise it turns it off.',
  ],
  events: [],
  tryIt: ['Cover the LDR with your hand: the LED turns on.', 'Shine a torch on it: the LED turns off.'],
  steps: [
    {
      type: 'loop_forever',
      body: [
        { type: 'ldr_sensor', values: { ldr_out: 'light', print_3: 1 } },
        {
          type: 'logic_if_else',
          values: { condition: 'light < 1500' },
          then: [{ type: 'neopixel_led', values: { color: '(255, 200, 80)', brightness: 80 } }],
          else: [{ type: 'neopixel_led', values: { color: '(0, 0, 0)', brightness: 0 } }]
        },
        { type: 'general_sleep', values: { duration: 0.2, unit: 'sec' } }
      ]
    }
  ]
};

const parking: Program = {
  title: 'Parking Sensor',
  explanation:
    'Beeps when something gets closer than 15 cm.',
  howItWorks: [
    'The Ultrasonic Sensor block measures the distance in cm and saves it in distance.',
    'The Print block shows the distance in the terminal.',
    'The If block checks distance < 15 and makes the Buzzer beep.',
  ],
  events: [],
  tryIt: ['Move your hand towards the sensor: it beeps when you are closer than 15 cm.'],
  steps: [
    {
      type: 'loop_forever',
      body: [
        { type: 'utrasonic_sensor' },
        { type: 'general_print', values: { mode: 'var', content: 'distance' } },
        {
          type: 'logic_if_else',
          values: { condition: 'distance > 0 and distance < 15' },
          then: [{ type: 'buzzer', values: { buzzer_freq: '2000', buzzer_duty: '200' } }]
        },
        { type: 'servo_motor', values: { servo_angle: '90' } },
        { type: 'general_sleep', values: { duration: 0.1, unit: 'sec' } }
      ]
    }
  ]
};

export const fakeAnswer = (message: string): { text: string; program: Program | null } => {
  const m = message.toLowerCase();
  if (/\b(what|how|why)\b.*\?$/.test(m.trim())) {
    return { text: 'Good question! In this practice mode I can only build projects. Try "make a night light".', program: null };
  }
  if (/distance|ultrasonic|parking|close|near/.test(m)) {
    return { text: "Let's build a parking sensor that beeps when something gets close!", program: parking };
  }
  return { text: "Let's build a night light that turns on the LED when it gets dark!", program: night };
};
