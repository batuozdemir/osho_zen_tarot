const fs = require('fs');
const path = require('path');
const layoutTextFolder = 'LayoutText';
const outputFile = 'cardData.txt';


// Read layout text files
const layoutTextData = {};
for (let i = 1; i <= 9; i++) {
  const file = `Layout_ENG_${i}.txt`;
  const layoutText = fs.readFileSync(path.join(layoutTextFolder, file), 'utf8');
  layoutTextData[i] = layoutText.trim();
}

// Generate the card data code
const layoutTextDataCode = `<script id="layoutTextData" type="application/json">\n${JSON.stringify(layoutTextData, null, 2)}\n</script>`;

// Write the generated code to a new text file
fs.writeFileSync(outputFile, `${layoutTextDataCode}`);
console.log(`Card data exported to ${outputFile} successfully!`);