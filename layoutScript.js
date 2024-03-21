const layoutDropdown = document.getElementById('layoutDropdown');
const layoutContainer = document.getElementById('layoutContainer');

// Function to display layout details
function displayLayout(layoutNumber) {
layoutContainer.innerHTML = ''; // Clear previous layout

const layoutText = layoutData[layoutNumber];
const imagePath = `assets/ReadingLayouts/layout_${layoutNumber}.png`;
const layoutElement = document.createElement('div');
layoutElement.classList.add('layout');

const imageElement = document.createElement('img');
imageElement.src = imagePath;
imageElement.alt = `Layout ${layoutNumber}`;
layoutElement.appendChild(imageElement);

// Split the layout text by newline characters
const lines = layoutText.split('\n');
// Extract the first line as the title
const titleElement = document.createElement('h2');
titleElement.textContent = lines[0];
layoutElement.appendChild(titleElement);

// Join the remaining lines as the description
const descriptionElement = document.createElement('p');
descriptionElement.innerHTML = lines.slice(1).join('<br>');
layoutElement.appendChild(descriptionElement);

// Add two line breaks after the layout text
const lineBreaks = document.createElement('div');
lineBreaks.innerHTML = '<br><br>';
layoutElement.appendChild(lineBreaks);

layoutContainer.appendChild(layoutElement);
}

// Populate the dropdown menu with layout options
function populateDropdown() {
  for (let i = 1; i <= Object.keys(layoutData).length; i++) {
    const layoutText = layoutData[i.toString()];
    const lines = layoutText.split('\n');
    const layoutName = lines[0];
    const option = document.createElement('option');
    option.value = i.toString();
    option.textContent = layoutName;
    layoutDropdown.appendChild(option);
  }
}

// Event listener for dropdown selection change
layoutDropdown.addEventListener('change', function() {
  const selectedLayout = layoutDropdown.value;
  displayLayout(selectedLayout);
});

// Populate the dropdown menu and display a random layout when the page loads
window.addEventListener('load', function() {
  populateDropdown();
  const randomLayoutNumber = getRandomLayoutNumber();
  displayLayout(randomLayoutNumber);
  layoutDropdown.value = randomLayoutNumber;
});

// Function to select a random layout number
function getRandomLayoutNumber() {
  const layoutCount = Object.keys(layoutData).length;
  return Math.floor(Math.random() * layoutCount) + 1;
}

// Event listener for dropdown selection change
layoutDropdown.addEventListener('change', function() {
  const selectedLayout = layoutDropdown.value;
  displayLayout(selectedLayout);
});

// Populate the dropdown menu and display a random layout when the page loads
window.addEventListener('load', function() {
  populateDropdown();
  const randomLayoutNumber = getRandomLayoutNumber();
  displayLayout(randomLayoutNumber);
  layoutDropdown.value = randomLayoutNumber;
});

