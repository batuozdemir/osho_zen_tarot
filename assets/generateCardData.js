const fs = require('fs');
const path = require('path');

const cardTextFolder = 'CardText';
const cardCommentaryFolder = 'CardCommentary';
const outputFile = 'cardData.txt';

// Read card text files
const cardTextData = {};
fs.readdirSync(cardTextFolder).forEach(file => {
  const cardNumber = file.split('_')[0];
  const cardText = fs.readFileSync(path.join(cardTextFolder, file), 'utf8');
  cardTextData[cardNumber] = cardText.trim();
});

// Read card commentary files
const cardCommentaryData = {};
fs.readdirSync(cardCommentaryFolder).forEach(file => {
  const cardNumber = file.split('_')[0];
  const cardCommentary = fs.readFileSync(path.join(cardCommentaryFolder, file), 'utf8');
  cardCommentaryData[cardNumber] = cardCommentary.trim();
});

// Generate the card data code
const cardTextDataCode = `<script id="cardTextData" type="application/json">\n${JSON.stringify(cardTextData, null, 2)}\n</script>`;
const cardCommentaryDataCode = `<script id="cardCommentaryData" type="application/json">\n${JSON.stringify(cardCommentaryData, null, 2)}\n</script>`;

// Write the generated code to a new text file
fs.writeFileSync(outputFile, `${cardTextDataCode}\n\n${cardCommentaryDataCode}`);

console.log(`Card data exported to ${outputFile} successfully!`);