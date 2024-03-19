const fs = require('fs');
const path = require('path');

const cardTextFolder = 'CardText';
const cardCommentaryFolder = 'CardCommentary';
const totalCards = 79;

const cardData = {};

for (let i = 1; i <= totalCards; i++) {
  const cardTextPath = path.join(cardTextFolder, `${i}_ENG.txt`);
  const cardCommentaryPath = path.join(cardCommentaryFolder, `${i}_ENG_c.txt`);

  const cardText = fs.readFileSync(cardTextPath, 'utf8').trim();
  const cardCommentary = fs.readFileSync(cardCommentaryPath, 'utf8').trim();

  cardData[i] = {
    text: cardText,
    commentary: cardCommentary
  };
}

const cardDataCode = `const cardData = ${JSON.stringify(cardData, null, 2)};`;

fs.writeFileSync('cardData.js', cardDataCode);
console.log('Card data generated successfully!');