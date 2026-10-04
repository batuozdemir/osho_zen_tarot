// js/spreads.js
// Each spread has one or more variants; a variant is a list of positions.
// Coordinates are card centers in card units: a card is 1 wide and 1.5 tall.
// Positions are listed in drawing order (position 1 first).

function P(label, x, y, rot = 0) {
  return { label, x, y, rot };
}

function row(labels, gap = 1.15) {
  return labels.map((label, i) => P(label, (i - (labels.length - 1) / 2) * gap, 0));
}

function decisionPositions(options) {
  const positions = [];
  for (let i = 0; i < options; i++) {
    const x = (i - (options - 1) / 2) * 1.25;
    positions.push(P(`Option ${i + 1}: what this choice holds`, x, 0));
    positions.push(P(`Option ${i + 1}: where it leads`, x, 1.65));
  }
  return positions;
}

// Grouped as in the original spread text; the group is shown in the variation picker.
const threeCardVariants = [
  ['Problem solving', [
    ["Context: a general overview of the present situation", "Focus: the circumstances, and the lesson they hold (positive or negative, depending on the card)", "Outcome: a method of action"],
  ]],
  ['Timeline', [
    ["Past: the experiences that cast a light on the current situation", "Present: what you are feeling and experiencing at the moment", "Future: the course of action that serves your highest good, given the first two cards"],
  ]],
  ['Linear', [
    ['You', 'Your path', 'Your potential'],
    ['You', 'Relationship', 'Partner'],
    ['Situation', 'Action', 'Outcome'],
    ['Idea', 'Process', 'Aspiration'],
  ]],
  ['Balanced', [
    ['Mind', 'Body', 'Spirit'],
    ['Physical state', 'Emotional state', 'Spiritual state'],
    ['Subconscious', 'Conscious', 'Super conscious'],
    ['Option 1', 'Option 2', 'Option 3'],
    ['What I think', 'What I feel', 'What I do'],
  ]],
  // Read as one sentence: "Given your strengths and weaknesses, this is my advice."
  ['Foundational', [
    ['Your strengths', 'Your weaknesses', 'Advice'],
    ['What worked well', "What didn't work well", 'The key lesson'],
    ['What brings you together', 'What pulls you apart', 'What you must focus on'],
    ['What you want from the relationship', 'What your partner wants', 'Where the relationship is heading'],
    ['Option 1', 'Option 2', 'What you need to know to make a decision'],
  ]],
  ['Crossed', [
    ['Situation', 'Obstacle', 'Advice'],
    ['Aspiration', 'Obstacle', 'How to overcome it'],
    ['Opportunities', 'Challenges', 'Outcome'],
    ['Thesis', 'Antithesis', 'Synthesis'],
  ]],
].flatMap(([group, sets]) => sets.map(labels => ({
  name: `${group}: ${labels.map(l => l.split(':')[0]).join(', ')}`,
  positions: row(labels),
})));

const spreads = [
  {
    id: 'single',
    name: 'A Single Card',
    intro: 'For insights into any situation that relates to your living today. Or as a basis for meditating now.',
    variants: [{ positions: [P('The insight', 0, 0)] }],
  },
  {
    id: 'three-card',
    name: 'Three Card Spread',
    intro: 'There are many variations of the three card spread. Choose the one that fits your question. Linear spreads follow a line from one card to the next; balanced spreads look at three sides of one thing; foundational spreads read as one sentence ("given your strengths and your weaknesses, this is my advice"); crossed spreads set a situation against what stands in its way.',
    variants: threeCardVariants,
  },
  {
    id: 'relating',
    name: 'Relating: "A Quickie"',
    intro: 'This spread offers a spontaneous insight into your relating with the other, whether "the other" is the boss, the lover, the friend, the sister, the parent...',
    variants: [{
      positions: [
        P('You, and what you are contributing to the relating here and now', -0.65, 0),
        P("The other, the other's input to the relating", 0.65, 0),
        P('The composite energies', -0.65, 1.75),
        P('The insight', 0.65, 1.75),
      ],
    }],
  },
  {
    id: 'diamond',
    name: 'The Diamond',
    intro: 'This layout can be helpful in bringing more clarity to a specific issue.',
    variants: [{
      positions: [
        P('The issue', 0, 0),
        P('Internal influence that you are unable to see', -1.15, 0),
        P('External influence of which you are aware', 1.15, 0),
        P('What is needed for resolution', 0, 1.65),
        P('Resolution: the understanding', 0, -1.65),
      ],
    }],
  },
  {
    id: 'flying-bird',
    name: 'The Flying Bird',
    intro: 'This layout is designed in the shape of a bird taking flight. The cards in the left wing say something about our feminine, receptive energy, while the right wing symbolizes our masculine, active energy. The first card is the initiator of the flight and stems from the active side. Each card responds to the one before and lifts "the bird" higher, moving the questioner into greater clarity and inner understanding.',
    variants: [{
      positions: [
        P("Here and now: the lift-off card", 0, 0.9),
        P("The resistance: fear of flying", -1.15, 0.6),
        P('Response-ability to the fear', 1.15, 0.6),
        P('Inner support (intuition) of responsibility', -2.3, 0.3),
        P('External support: intelligent action responding to the intuition', 2.3, 0.3),
        P('Relaxation and acceptance', -3.45, 0),
        P('Arrival at a new level of awareness', 3.45, 0),
      ],
    }],
  },
  {
    id: 'key',
    name: 'The Key',
    intro: '"The Key" layout can open the door to insights regarding hidden, unconscious aspects of a particular issue. It may also be used as a general reading for an insight into your interiority here and now.',
    variants: [{
      positions: [
        P('What is repressed', 0, 6.4),
        P('The yin card: your female (passive) aspect', 0, 4.8),
        P('The yang card: your male (active) aspect', 1.1, 4.8),
        P('The meditation', 0, 3.2),
        P('Insight into the body', -1.1, 1.6),
        P('Insight into the heart', 0, 1.6),
        P('Insight into the being', 1.1, 1.6),
        P('Consciousness (understanding)', 0, 0),
      ],
    }],
  },
  {
    id: 'celtic-cross',
    name: 'The Celtic Cross',
    intro: 'This traditional layout is used for clarity on a specific issue as well as for general readings. In the Osho Zen Tarot the positions have the meanings below.',
    variants: [{
      positions: [
        P('The issue', -0.6, 0),
        P('Diminishing or enhancing the issue, clarifying or obscuring it', 0, 0),
        P('The unconscious influences', 0, 1.6),
        P('The conscious influences', 0, -1.6),
        P('Old patterns, the old way', -1.66, 0),
        P('New patterns, moving into the new', 1.08, 0),
        P('Self: your feelings and attitudes about the issue', 2.2, 1.6),
        P('What you are attracting from the outside', 2.2, 0),
        P('Your desires and denials', 2.2, -1.6),
        P('Outcome, the key', 2.2, -3.2),
      ],
    }],
  },
  {
    id: 'mirror',
    name: 'The Mirror',
    intro: 'A more in-depth approach to your relating with the other, whether the boss, the lover, the friend, the sister, the parent. It offers an understanding of the life processes of each of you, as well as insight into what is happening between you.',
    variants: [{
      positions: [
        P('You here and now: the body', -1.1, 6.4),
        P('You here and now: the heart', -1.1, 4.8),
        P('You here and now: the mind', -1.1, 3.2),
        P('Partner here and now: the body', 1.1, 6.4),
        P('Partner here and now: the heart', 1.1, 4.8),
        P('Partner here and now: the mind', 1.1, 3.2),
        P('Outer manifestation: melting and merging (intimacy)', 0, 9.6),
        P('Outer manifestation: the alchemy of togetherness (transformation)', 0, 8.0),
        P('Outer manifestation: the blessings (benefits and gifts)', 0, 6.4),
        P('Inner spiritual purpose: melting and merging (intimacy)', 0, 3.2),
        P('Inner spiritual purpose: the alchemy of togetherness (transformation)', 0, 1.6),
        P('Inner spiritual purpose: the blessings (benefits and gifts)', 0, 0),
      ],
    }],
  },
  {
    id: 'paradox',
    name: 'The Paradox',
    intro: 'Shuffle the deck for as long as you like, then cut it into three packs and choose one. The top card of that pack is the here and now, its bottom card the past-life influences. Then fan the rest of the pack and pick one more card: the insight into the paradox.',
    // The cut is part of this spread: choosing a pack places cards 1 and 2 itself.
    ritual: 'paradox',
    variants: [{
      positions: row(['Here and now', 'Past-life influences', 'Insight into the paradox']),
    }],
  },
  {
    id: 'ankh',
    name: 'The Ankh',
    intro: 'Based on the ancient Egyptian ankh, a symbol of life also known as the "mirror of Venus". Cards on the circle show the spiritual background and root cause of what is happening; cards on the cross show how it manifests in real life, what can be done, and what it will bring. Traditionally cards 7 to 9 are revealed only once the enlightenment (5) has been reached and the conclusions (6) drawn.',
    variants: [{
      positions: [
        P('First impulse: one of two opposite motives that seem to block each other', -1.05, 4.43),
        P('Second impulse: the opposite motive', 1.05, 4.43),
        P('Longtime reasons', -1.05, 1.44),
        P('The latest reason (an excuse)', 1.05, 1.44),
        P('Enlightenment: realizing the true meaning of events', 0, 0),
        P('Conclusions', 0, 2.88),
        P('The next step', 0, 4.43),
        P('An unexpected discovery', 0, 5.93),
        P('The result', 0, 7.42),
      ],
    }],
  },
  {
    id: 'shadow-work',
    name: 'Shadow Work',
    intro: 'For looking at a part of your shadow: what it hides, how it shows up, and how to bring it to light.',
    variants: [
      {
        name: 'Six cards',
        positions: [
          P('What do I need to know about this part of my shadow?', 0, 2.5),
          P('What is it preventing me from accessing?', 0, 0),
          P('How does this shadow manifest as a problem?', 0, 1.26, -65),
          P('What is a good next step to bring this shadow to light?', 1.7, 1.26),
          P('How can I most usefully approach this shadow work?', 2.97, 1.06),
          P('What can I expect to feel in the early phase of this process?', 4.23, 0.89),
        ],
      },
      {
        name: 'Three cards',
        positions: row([
          'Shadow aspect: what is hidden and needs to be acknowledged',
          'Root cause: what lies under the pattern or fear',
          'Resolution: the path toward healing and growth',
        ]),
      },
    ],
  },
  {
    id: 'horseshoe',
    name: 'The Horseshoe',
    intro: 'Looks at a situation from several angles: past influences, current challenges and future opportunities. Useful when you want a strategy for reaching the outcome. It is not just a case of "this is the outcome, good luck": it also shows the obstacles and how to overcome them.',
    variants: [{
      positions: [
        P('Past', -1.77, 4.4),
        P('Present', -1.48, 2.75),
        P('Future', -1.19, 1.05),
        P('Attitude toward the question', 0, 0.75),
        P('Other influences', 1.19, 1.05),
        P('Obstacles', 1.48, 2.75),
        P('Likely outcome', 1.77, 4.4),
      ],
    }],
  },
  {
    id: 'decision',
    name: 'Decision Making',
    intro: 'For weighing options. Each option gets two cards: what the choice holds, and where it leads. Name your options in the question, in order, so the reading knows which is which.',
    variants: [2, 3, 4].map(n => ({ name: `${n} options`, positions: decisionPositions(n) })),
  },
];
