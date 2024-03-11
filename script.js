const drawButton = document.getElementById('drawButton');
const cardSelect = document.getElementById('cardSelect');
const cardContainer = document.getElementById('cardContainer');
const cardImage = document.getElementById('cardImage');
const cardText = document.getElementById('cardText');
const cardCommentary = document.getElementById('cardCommentary');
const totalCards = 79;
const drawnCards = [];

// Populate the dropdown menu with card names
function populateCardSelect() {
  for (let i = 0; i < totalCards; i++) {
    const option = document.createElement('option');
    option.value = i + 1;
    option.textContent = cardNames[i];
    cardSelect.appendChild(option);
  }
}

// Function to draw a random card
function drawRandomCard() {
  const randomCard = Math.floor(Math.random() * totalCards) + 1;
  displayCard(randomCard);
  addToDrawnCards(randomCard);
}

// Function to display a specific card
function displayCard(cardNumber) {
  const imagePath = `CardPictures/card_${cardNumber}.jpg`;
  cardImage.src = imagePath;
  cardText.textContent = cardData[cardNumber].text;
  cardCommentary.textContent = cardData[cardNumber].commentary;
  cardContainer.style.display = 'block';
  highlightDrawnCard(cardNumber);
}

// Function to add the drawn card to the list
function addToDrawnCards(cardNumber) {
  const drawnCardsList = document.getElementById('drawnCardsList');
  const listItem = document.createElement('li');
  listItem.textContent = cardNames[cardNumber - 1];
  listItem.addEventListener('click', function() {
    displayCard(cardNumber);
  });
  drawnCardsList.appendChild(listItem);
  drawnCards.push(cardNumber);
}

// Function to highlight the clicked card in the list
function highlightDrawnCard(cardNumber) {
  const drawnCardsList = document.getElementById('drawnCardsList');
  const listItems = drawnCardsList.getElementsByTagName('li');
  for (let i = 0; i < listItems.length; i++) {
    if (drawnCards[i] === cardNumber) {
      listItems[i].classList.add('highlight');
    } else {
      listItems[i].classList.remove('highlight');
    }
  }
}

// Draw a random card when the button is clicked
drawButton.addEventListener('click', drawRandomCard);

// Display the selected card when the dropdown value changes
cardSelect.addEventListener('change', function() {
  const selectedCard = parseInt(cardSelect.value);
  if (selectedCard) {
    displayCard(selectedCard);
  } else {
    cardContainer.style.display = 'none';
  }
});

// Populate the dropdown menu and draw a random card when the page loads
window.addEventListener('load', function() {
  populateCardSelect();
  drawRandomCard();
});