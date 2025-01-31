// We are scaling all results in the (75;100]% range
export const MIN_SCORE = 75;

export const BUDGET_RANGES: { [key: string]: number } = {
  LessThan20k: 20000,
  '20kTo50k': 50000,
  '50kTo100k': 100000,
  '100kTo500': 500000,
  '500kTo1m': 1000000,
  '1mTo2m': 2000000
};

export const PRIORITY_TYPES = {
  C: 'cost',
  D: 'design',
  T: 'time'
};

// prettier-ignore
export const PRO_TYPE_SCORES = [
  // 1    2    3
  [1000, 900, 800], // Must have
  [700,  600, 500], // Good to have
  [400,  300, 200]  // Optional
];
export const SPECIALTY_SCORES = [1000, 100, 10];
export const PRO_PERSONALITY_SCORE = 100;
export const PRO_QUALITIES_SCORE = 100;

export const PRO_TYPE_SCORE_MULTIPLIER = 50;
export const SPECIALTY_SCORE_MULTIPLIER = 25;
export const QUALITIES_SCORE_MULTIPLIER = 5;
export const PERSONALITY_SCORE_MULTIPLIER = 20;

const E = 'Outgoing';
const I = 'Reserved';
const S = 'Practical';
const N = 'Intuitive';
const F = 'Mindful';
const T = 'Direct';
const P = 'Spontaneous';
const J = 'Organized';

export const PRO_PERSONALITY_MATRIX: [string[], string[][]][] = [
  [
    [E, N, T, J],
    [
      [I, S, F, P],
      [I, N, F, P],
      [E, S, F, P],
      [E, S, T, P],
      [I, S, T, P],
      [I, N, T, P],
      [E, N, F, P],
      [I, N, F, J],
      [I, N, T, J],
      [E, N, F, J],
      [I, S, T, J],
      [E, N, T, P],
      [E, S, T, J],
      [E, N, T, J],
      [E, S, F, J],
      [I, S, F, J]
    ]
  ],
  [
    [E, N, T, P],
    [
      [I, S, F, J],
      [I, S, T, J],
      [E, N, T, P],
      [E, S, T, J],
      [E, S, F, J],
      [I, N, F, J],
      [I, N, T, J],
      [I, N, F, P],
      [E, N, F, J],
      [I, N, T, P],
      [I, S, T, P],
      [E, N, F, P],
      [E, S, T, P],
      [E, N, F, P],
      [E, S, T, P],
      [E, N, T, J],
      [E, S, F, P],
      [I, S, F, P]
    ]
  ],
  [
    [I, N, T, J],
    [
      [E, S, F, P],
      [E, S, T, P],
      [I, S, F, P],
      [I, N, F, P],
      [I, N, F, J],
      [E, N, F, P],
      [E, N, T, P],
      [I, S, T, P],
      [E, N, F, J],
      [I, N, T, J],
      [I, S, T, J],
      [E, N, T, J],
      [I, N, T, P],
      [E, S, T, J],
      [I, S, F, J],
      [E, S, F, J]
    ]
  ],
  [
    [I, N, T, P],
    [
      [E, S, F, J],
      [E, N, F, J],
      [I, S, F, J],
      [I, N, F, J],
      [E, S, T, J],
      [I, S, T, J],
      [E, N, T, J],
      [E, N, F, P],
      [E, N, T, P],
      [I, N, T, P],
      [I, N, T, J],
      [I, S, T, P],
      [I, N, F, P],
      [E, S, T, P],
      [I, S, F, P],
      [E, S, P, P]
    ]
  ],
  [
    [E, S, T, J],
    [
      [I, N, F, P],
      [I, S, F, P],
      [I, N, T, P],
      [E, N, T, P],
      [I, S, T, P],
      [E, S, F, P],
      [E, N, F, P],
      [I, S, T, J],
      [I, S, F, J],
      [E, S, T, J],
      [E, S, F, J],
      [I, N, T, J],
      [E, N, T, J],
      [E, S, T, P],
      [E, N, F, J],
      [I, N, F, J]
    ]
  ],
  [
    [E, S, F, J],
    [
      [I, N, T, P],
      [I, S, T, P],
      [E, N, T, P],
      [E, N, F, P],
      [I, N, F, P],
      [I, S, T, J],
      [E, S, F, J],
      [E, S, T, P],
      [I, S, F, P],
      [E, N, F, J],
      [I, S, F, J],
      [I, N, F, J],
      [E, S, T, J],
      [E, S, F, P],
      [E, N, T, J],
      [I, N, T, T]
    ]
  ],
  [
    [I, S, T, J],
    [
      [E, N, F, P],
      [E, N, T, P],
      [I, S, F, P],
      [I, N, F, P],
      [E, S, T, P],
      [E, S, F, P],
      [I, N, T, P],
      [E, S, T, J],
      [E, S, F, J],
      [I, S, T, J],
      [I, N, T, J],
      [I, S, F, J],
      [I, S, T, P],
      [E, N, T, J],
      [I, N, F, J],
      [E, N, F, J]
    ]
  ],
  [
    [I, S, F, J],
    [
      [E, N, T, P],
      [E, N, F, P],
      [I, N, T, P],
      [I, S, T, P],
      [E, S, F, P],
      [E, S, T, P],
      [E, S, T, J],
      [I, N, F, P],
      [E, S, F, J],
      [I, S, T, J],
      [I, S, F, J],
      [E, N, F, J],
      [I, N, F, J],
      [I, S, F, P],
      [I, N, T, J],
      [E, N, T, J]
    ]
  ],
  [
    [E, N, F, J],
    [
      [I, S, T, P],
      [I, N, T, P],
      [E, S, T, P],
      [E, S, F, P],
      [E, N, F, J],
      [I, N, F, P],
      [I, S, F, P],
      [E, N, T, P],
      [I, N, T, J],
      [E, S, F, J],
      [I, N, F, J],
      [E, N, F, P],
      [E, N, T, J],
      [I, S, F, J],
      [E, S, T, J],
      [I, S, T, J]
    ]
  ],
  [
    [E, N, F, P],
    [
      [I, S, T, J],
      [I, S, F, J],
      [E, S, F, J],
      [E, S, T, J],
      [I, N, F, J],
      [I, N, T, J],
      [E, N, T, J],
      [I, S, F, P],
      [E, N, F, P],
      [I, N, T, P],
      [I, N, F, P],
      [E, N, F, J],
      [E, N, T, P],
      [E, S, F, P],
      [E, S, T, P],
      [I, S, T, P]
    ]
  ],
  [
    [I, N, F, J],
    [
      [E, S, T, P],
      [E, S, F, P],
      [I, S, T, P],
      [I, N, T, P],
      [E, N, F, P],
      [E, N, T, P],
      [I, N, T, J],
      [E, N, T, J],
      [I, N, F, J],
      [I, S, F, P],
      [E, N, F, J],
      [E, S, F, J],
      [I, S, F, J],
      [I, N, F, P],
      [I, S, T, J],
      [E, S, T, J]
    ]
  ],
  [
    [I, N, F, P],
    [
      [E, S, T, J],
      [E, N, T, J],
      [I, N, T, J],
      [I, S, T, J],
      [E, N, F, J],
      [E, S, F, J],
      [E, N, T, P],
      [I, N, F, P],
      [I, S, F, J],
      [I, N, T, P],
      [E, S, F, P],
      [E, N, F, P],
      [I, S, F, P],
      [I, N, F, J],
      [I, S, T, P],
      [E, S, T, P]
    ]
  ],
  [
    [E, S, T, P],
    [
      [I, N, F, J],
      [I, N, T, J],
      [E, N, F, J],
      [E, N, T, J],
      [I, S, F, J],
      [I, S, T, P],
      [I, S, T, J],
      [E, S, F, J],
      [E, S, T, P],
      [I, S, F, P],
      [E, S, F, P],
      [I, N, T, P],
      [E, N, T, P],
      [E, S, T, J],
      [E, N, F, P],
      [I, N, F, P]
    ]
  ],
  [
    [E, S, F, P],
    [
      [I, N, T, J],
      [I, N, F, J],
      [E, N, T, J],
      [E, N, F, J],
      [E, S, T, J],
      [I, S, T, J],
      [I, S, F, J],
      [I, S, F, P],
      [I, S, T, P],
      [I, N, F, P],
      [E, S, F, P],
      [E, S, T, P],
      [E, S, F, J],
      [E, N, F, P],
      [E, N, T, P],
      [I, N, T, P]
    ]
  ],
  [
    [I, S, T, P],
    [
      [E, N, F, J],
      [E, S, F, J],
      [I, N, F, J],
      [I, S, F, J],
      [E, N, T, J],
      [E, S, T, J],
      [E, S, F, P],
      [E, S, T, P],
      [I, N, T, J],
      [I, S, T, P],
      [I, N, T, P],
      [E, N, T, P],
      [I, S, T, J],
      [I, S, F, P],
      [I, N, F, P],
      [E, N, F, P]
    ]
  ],
  [
    [I, S, F, P],
    [
      [E, N, T, J],
      [E, S, T, J],
      [I, N, T, J],
      [I, S, T, J],
      [E, N, F, J],
      [E, S, F, J],
      [I, N, F, J],
      [E, S, F, P],
      [I, S, F, P],
      [E, S, T, P],
      [E, N, F, P],
      [I, N, F, P],
      [I, S, T, P],
      [I, S, F, J],
      [I, N, T, P],
      [E, N, T, P]
    ]
  ]
];
