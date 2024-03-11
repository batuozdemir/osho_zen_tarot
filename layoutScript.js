const layoutContainer = document.getElementById('layoutContainer');

// Function to display layout details
function displayLayout(layoutNumber) {
  const layoutText = layoutData[layoutNumber];
  const imagePath = `ReadingLayouts/layout_${layoutNumber}.jpg`;

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

// Display all layouts when the page loads
window.addEventListener('load', function() {
  for (let i = 1; i <= Object.keys(layoutData).length; i++) {
    displayLayout(i.toString());
  }
});