// js/spreads.js
// Each spread has one or more variants; a variant is a list of positions.
// Coordinates are card centers in card units: a card is 1 wide and 1.5 tall.
// Positions are listed in drawing order (position 1 first).
// `hint` is what the spread is and what to use it for, shown when hovering its tile.
// `decks` lists the decks a spread is offered with; without it, the Osho Zen deck only
// (most spreads here come from its guidebook).

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

const BOTH = ['osho', 'rws'];

const spreads = [
  {
    id: 'single',
    decks: BOTH,
    hint: ['One card, one insight.', 'Use it for a quick look at today, or something to sit with in meditation.'],
    name: 'A Single Card',
    intro: 'For insights into any situation that relates to your living today. Or as a basis for meditating now.',
    variants: [{ positions: [P('The insight', 0, 0)] }],
  },
  {
    id: 'three-card',
    decks: BOTH,
    hint: ['Three cards in a row, in many variations: past to future, problem to method, strengths to advice.', 'Use it for a clear question you want to see from three sides.'],
    name: 'Three Card Spread',
    intro: 'There are many variations of the three card spread. Choose the one that fits your question. Linear spreads follow a line from one card to the next; balanced spreads look at three sides of one thing; foundational spreads read as one sentence ("given your strengths and your weaknesses, this is my advice"); crossed spreads set a situation against what stands in its way.',
    variants: threeCardVariants,
  },
  {
    id: 'relating',
    hint: ['You, the other, what happens between you, and an insight.', 'Use it for a quick look at any relationship: partner, friend, family, boss.'],
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
    hint: ['The issue, what you can and cannot see around it, what is needed, and the resolution.', 'Use it for getting clarity on one specific problem.'],
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
    hint: ['Seven cards from resistance and fear, through support and acceptance, to a new level of awareness.', 'Use it for a situation where fear or resistance is holding you back.'],
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
    hint: ['What is repressed, your yin and yang, and insights into body, heart and being.', 'Use it for hidden, unconscious sides of an issue, or a general inner check-in.'],
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
    hint: ['The classic ten-card spread: the issue, conscious and unconscious influences, old and new patterns, the outcome.', 'Use it for a big question you want to look at in depth.'],
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
  // The same spread as Waite gives it for the Rider-Waite deck: the second card lies across
  // the first, and the staff of four rises beside the cross.
  {
    id: 'celtic-cross',
    decks: ['rws'],
    hint: ['The classic ten-card spread: the heart of the matter, what crosses it, past and near future, and where it is heading.', 'Use it for a big question you want to look at in depth.'],
    name: 'The Celtic Cross',
    intro: 'The traditional layout, in the form A.E. Waite gave it with this deck. The second card lies across the first; the cards around them show what crowns the matter, what lies beneath it, what is passing and what is coming. The four cards of the staff beside the cross show you, your surroundings, your hopes and fears, and where it all is heading.',
    variants: [{
      positions: [
        P('The present: what covers you, the heart of the matter', 0, 0),
        P('What crosses you: the challenge, for good or ill', 0, 0, 90),
        P('What crowns you: your conscious aim, the best that can come of it', 0, -1.65),
        P('What is beneath you: the foundation of the matter', 0, 1.65),
        P('What is behind you: the recent past, passing away', -1.4, 0),
        P('What is before you: the near future, coming into being', 1.4, 0),
        P('Yourself: your attitude and part in the matter', 2.75, 2.4),
        P('Your surroundings: the people and influences around you', 2.75, 0.8),
        P('Your hopes and fears', 2.75, -0.8),
        P('The outcome: where this is heading', 2.75, -2.4),
      ],
    }],
  },
  {
    id: 'mirror',
    hint: ['Twelve cards: you and your partner in body, heart and mind, and the outer and inner purpose of your togetherness.', 'Use it for an in-depth look at a close relationship.'],
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
    hint: ['A ritual of shuffling and cutting: here and now, past-life influences, and an insight into the paradox.', 'Use it for feeling stuck between two things that both seem true.'],
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
    hint: ['Two impulses, the reasons and excuses behind them, then the enlightenment, the next step and the result.', 'Use it for understanding the root cause of a recurring situation.'],
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
    hint: ['What a part of your shadow hides, how it shows up, and a next step toward bringing it to light.', 'Use it for a pattern in yourself you keep running into.'],
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
  // Not a layout but a sitting, the way a reader works: question after question, three
  // cards each from the same deck, never reshuffled. `session` makes script.js build the
  // positions as the reading goes; the positions here only draw the tile.
  {
    id: 'session',
    decks: BOTH,
    session: true,
    hint: ['Question after question from one deck: three cards each, a clarifier when they need one, then the next question.', 'Use it for a conversation with the cards, the way a reader works across a sitting.'],
    name: 'Question by Question',
    intro: 'A sitting rather than a fixed layout. Ask a question and draw three cards for it. If they need it, draw a clarifier: one more card that sheds light on the three. Readers often draw one when the three are all Major Arcana, to see how those big themes show up in daily life. Then ask the next question and draw three more from what is left of the same deck, without reshuffling. Finish when you have asked what you came to ask.',
    variants: [{
      positions: [
        P('', 0, 0), P('', 1.15, 0), P('', 2.3, 0), P('', 3.45, 0),
        P('', 0, 1.75), P('', 1.15, 1.75), P('', 2.3, 1.75),
      ],
    }],
  },
  {
    id: 'horseshoe',
    decks: BOTH,
    hint: ['Past, present and future, with your attitude, other influences and the obstacles on the way.', 'Use it for a strategy toward an outcome, not just a forecast.'],
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
    decks: BOTH,
    hint: ['Two cards per option: what the choice holds and where it leads.', 'Use it for choosing between two to four options; name them in your question.'],
    name: 'Decision Making',
    intro: 'For weighing options. Each option gets two cards: what the choice holds, and where it leads. Name your options in the question, in order, so the reading knows which is which.',
    variants: [2, 3, 4].map(n => ({ name: `${n} options`, positions: decisionPositions(n) })),
  },
];
